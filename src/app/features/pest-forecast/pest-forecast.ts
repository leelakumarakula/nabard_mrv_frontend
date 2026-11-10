/*
 * Pest & Disease Forecast – the platform's copy of FarmFuture's Farm Health → "Pest & Disease Forecast" (its "Inspection
 * plan"). The numbers come from FarmFuture's own models, copied unchanged into ./ff (agricentral-web src/app/wsb), run on
 * FarmFuture's own inputs (GET only, passed through /farm-health), so the map, areas and alerts match the FarmFuture app.
 */
import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, NgZone, OnDestroy, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GeoJSONSource, LngLatBounds, Map as MapLibre, Marker, NavigationControl, StyleSpecification } from 'maplibre-gl';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Notice, PageHeader } from '../../shared/page-header';
import {
  normalizeCalendar, normalizeForecast, normalizeGeometry, normalizeSensors, normalizeWeather,
} from './ff/core/agricentral-normalise';
import { ExposureLike, farmAreaM2, guardedExposure } from './ff/core/guarded-exposure';
import { FARMER_CHECKS, PlanArea, PlanRecord, buildPlan, lifecycleMessage } from './ff/core/inspection-plan';
import { guidanceForTopic } from './ff/core/pest-guidance';
import { PEST_PHOTOS } from './ff/core/pest-photos';
import { recordsWithZones } from './ff/core/record-zones';
import { hasPestTopics, monthIST, seasonWatch } from './ff/core/season-watch';
import { sunDay } from './ff/core/solar';
import { EXPOSURE_TOPICS } from './ff/models/cwsb-model';
import { layerState } from './ff/models/field-layers';
import { drainageScreen } from './ff/models/hydrology';
import { topicGate } from './ff/models/season-variety';
import { MONTH_SHORT, stageName, varietyOf } from './ff/stage-names';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FarmOption { plot_id: string; label: string; crop: string | null }

const LEVEL_COLOUR: Record<string, string> = { watch: '#f2c14e', inspect: '#ef8a3c', confirmed: '#d64545' };
const LEGEND = [
  { label: 'Low', colour: '#f2c14e', text: 'Weather and field conditions favour it; keep an eye out' },
  { label: 'Medium', colour: '#ef8a3c', text: 'Conditions are building up; walk the area and check the plants' },
  { label: 'High', colour: '#d64545', text: 'Conditions strongly favour it; check these plants first' },
];
const PRIORITY = ['Not enough evidence', 'Routine check', 'Inspect now', 'Signs found'];
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: { type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Esri World Imagery' },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};
const empty = { type: 'FeatureCollection', features: [] } as any;

@Component({
  selector: 'app-pest-forecast',
  imports: [PageHeader, Notice, DecimalPipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Pest & disease forecast"
      subtitle="Where on the estate to look, how urgent it is and what to do there – FarmFuture's Farm Health forecast, worked out with FarmFuture's own models on FarmFuture's data" />
    <div class="tabs">
      <span class="tab active">Pest &amp; Disease Forecast</span>
      <a class="tab" routerLink="/modules/pest">Scouting &amp; risk records</a>
    </div>

    <section class="panel">
      <div class="head-row">
        <label class="pick"><span>Farm</span>
          <select (change)="pickFarm($any($event.target).value)">
            @for (f of farms(); track f.plot_id) {<option [value]="f.plot_id" [selected]="f.plot_id === plotId()">{{ f.label }}</option>}
          </select></label>
        @if (coffeeCrops().length) {
          <label class="pick"><span>Crop</span>
            <select (change)="crop.set($any($event.target).value)">
              @for (c of coffeeCrops(); track c) {<option [value]="c" [selected]="c === plantedCrops()">{{ c.replace('-', ' ') }}</option>}
            </select></label>
        }
        <label class="pick"><span>Season</span>
          <select (change)="month.set(+$any($event.target).value)">
            @for (o of seasonOptions(); track o.month) {<option [value]="o.month" [selected]="o.month === month()">{{ o.label }}</option>}
          </select></label>
        <div class="topic-picker">
          <button type="button" class="topic-current" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()">
            <span class="thumb">@if (photos()[0]; as ph) {<img [src]="ph.src" alt="" />} @else {<span>&#x1F33F;</span>}</span>
            <span class="topic-text"><span class="eyebrow">Select pest / disease</span><strong>{{ title() }}</strong>
              <small>{{ message().title }} &middot; {{ inSeasonCount() }} of {{ rows().length }} topics in season</small></span>
            <span aria-hidden="true">&#9662;</span>
          </button>
          @if (menu()) {
            <div class="topic-menu" role="listbox">
              @if (!rows().length) {<p class="muted small">No pest or disease forecast for {{ plantedCrops() || 'this crop' }} yet. Pick another crop.</p>}
              <span class="group">In season &middot; {{ seasonOptions()[month() - 1].label }}</span>
              @for (t of rows(); track t.topic) {
                @if (t.inSeason) {
                  <button type="button" role="option" [class.active]="t.topic === topic()" (click)="pickTopic(t.topic)">
                    <span class="dot"></span><span><strong>{{ t.title }}</strong><small>{{ t.phaseLabel }}</small></span></button>
                }
              }
            </div>
          }
        </div>
      </div>

      @if (!precise) {
        <app-notice kind="warning">The forecast map shows exact farm outlines and positions, so it needs permission to see precise
          locations. The daily pest and disease risk estimates are under <a routerLink="/modules/pest">Scouting &amp; risk records</a>.</app-notice>
      } @else if (loading()) {
        <p class="muted">Reading FarmFuture – the farm outline, satellite season maps, weather station and forecast…</p>
      } @else if (error()) {
        <app-notice kind="warning">{{ error() }}</app-notice>
      }

      <div class="map-card" [hidden]="!precise || !farm()">
        <div class="map-wrap">
          <div #mapEl class="map"></div>
          <div class="scene-label"><span>Inspection plan &middot; {{ title() }}</span><strong>{{ headline() }}</strong></div>
          @if (atmosphere(); as a) {
            <div class="atmosphere">
              @if (a.strong) {<strong>{{ a.strong }}</strong>}
              @for (l of a.lines; track l) {<span>{{ l }}</span>}
              @if (sun(); as s) {
                <svg viewBox="0 0 120 64" class="sun-arc" [class.night]="s.altitudeDeg <= 0" aria-hidden="true">
                  <path d="M10 52 A50 50 0 0 1 110 52" class="arc" /><line x1="4" y1="52" x2="116" y2="52" class="horizon" />
                  <circle [attr.cx]="sunX()" [attr.cy]="sunY()" r="5" class="disc" />
                  <text x="10" y="62">{{ s.sunrise }}</text><text x="110" y="62" text-anchor="end">{{ s.sunset }}</text>
                </svg>
              }
            </div>
          }
        </div>
        <aside class="gallery">
          @if (photos().length) {
            <span class="eyebrow">What {{ title() }} looks like</span>
            @if (photos()[photo()]; as ph) {
              <div class="photo" (mouseenter)="hover = true" (mouseleave)="hover = false">
                <img [src]="ph.src" [alt]="ph.caption" />
                <span class="count">{{ photo() + 1 }} / {{ photos().length }}</span>
                <button type="button" class="nav prev" (click)="step(-1)" aria-label="Previous">&#8249;</button>
                <button type="button" class="nav next" (click)="step(1)" aria-label="Next">&#8250;</button>
              </div>
              <p class="caption">{{ ph.caption }}<small>{{ ph.credit }}</small></p>
            }
            <div class="thumbs">
              <button type="button" mat-stroked-button (click)="playing.set(!playing())">{{ playing() ? '❚❚ Pause' : '▶ Play' }}</button>
              @for (p of photos(); track p.src; let i = $index) {
                <button type="button" class="thumb-btn" [class.on]="i === photo()" (click)="photo.set(i)"><img [src]="p.src" alt="" /></button>
              }
            </div>
          } @else {
            <span class="eyebrow">Signs to look for</span>
            <ol class="checks">@for (c of checks(); track c) {<li>{{ c }}</li>}</ol>
          }
        </aside>
        <div class="map-foot">
          @for (l of legend; track l.label) {<span class="legend"><i [style.background]="l.colour"></i><b>{{ l.label }}</b> {{ l.text }}</span>}
          @if (note()) {<p class="muted small">{{ note() }}</p>}
        </div>
      </div>
    </section>

    @if (precise && farm()) {
      @if (guidance(); as g) {
        <section class="panel what-to-do"><h3>What to do</h3>
          <div class="cols">
            <div><h4>&#x1F50D; Spot it — {{ g.symptoms.length }} signs to check</h4><ol>@for (s of g.symptoms; track s) {<li>{{ s }}</li>}</ol></div>
            <div><h4>&#x26A1; Act now — {{ g.immediate_actions.length }} steps</h4>
              @for (s of g.immediate_actions; track s; let i = $index) {<p><b>Step {{ i + 1 }}</b> {{ s }}</p>}</div>
          </div>
        </section>
      }

      <section class="panel"><h3>Areas to inspect</h3>
        @if (!areas().length) {
          <p class="muted">Nothing on the estate stands out for {{ title() }} right now. The map stays natural; areas appear here when conditions coincide.</p>
        }
        <div class="areas">
          @for (a of areas(); track a.n) {
            <div class="area" [class.open]="openArea() === a.n">
              <div class="area-head">
                <span class="badge" [style.background]="levelColour[a.level]">{{ a.n }}</span>
                <strong>Area {{ a.n }} &middot; {{ a.name }}</strong>
                <span class="pill" [style.background]="levelColour[a.level]">{{ a.levelText }}</span>
                <span class="muted small">{{ a.acresText }} &middot; {{ a.points.length }} points &middot; &#10003; {{ a.inspectedCount }} of {{ a.points.length }} checked</span>
              </div>
              <button mat-stroked-button type="button" (click)="toggleArea(a.n)">{{ openArea() === a.n ? 'Hide points' : 'Show points' }}</button>
              @if (openArea() === a.n) {
                <div class="points"><span class="eyebrow">Suggested inspection points</span>
                  @for (p of a.points; track p.id) {
                    <div class="point"><b>{{ p.label }}</b><span>{{ p.statusText }}</span>
                      <a [href]="'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '&travelmode=walking'" target="_blank" rel="noopener">&#10148; Navigate</a></div>
                  }
                  <span class="eyebrow">What to look for</span>
                  <ul>@for (c of checks(); track c) {<li>{{ c }}</li>}</ul>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <section class="panel"><h3>Why FarmFuture flags it · by zone</h3>
        <p class="muted small">FarmFuture's screening rules ({{ modelVersion() }}): weather forecast, weather station, crop stage and the farm's
          scouting – "inspect now" means go and check, not that the pest is present.</p>
        <div class="alerts">
          @for (z of zoneAlerts(); track z.zone) {
            <details class="alert" [attr.data-p]="z.alert.priority" [open]="z.alert.priority >= 2">
              <summary><b>{{ z.zone }}</b><span class="status">{{ z.alert.overdue ? 'Follow-up overdue' : z.alert.status }}</span>
                <span class="prio">{{ priorityText[z.alert.priority] }}</span></summary>
              @if (z.alert.mechanism) {<p class="muted small">{{ z.alert.mechanism }}</p>}
              <table class="facts"><tbody>@for (f of z.alert.factors; track $index) {
                <tr><td><span class="ev">{{ f.evidence }}</span></td><td>{{ f.name }}</td><td>{{ f.value }}</td></tr>}</tbody></table>
              @if (z.alert.gaps.length) {<p class="small"><b>{{ z.alert.gaps.length }} evidence gaps to resolve:</b> {{ z.alert.gaps.join(' · ') }}</p>}
              <p class="small"><b>Do:</b> {{ z.alert.action }}</p>
              <p class="small"><b>Where:</b> {{ z.alert.where }}</p>
              <p class="small"><b>When:</b> {{ z.alert.when }} · Review by {{ z.alert.due }}</p>
              @if (z.alert.limit) {<p class="muted small">{{ z.alert.limit }}</p>}
            </details>
          }
        </div>
      </section>
      <p class="muted small">Read live from FarmFuture (GET only) and worked out in your browser with FarmFuture's own models
        ({{ modelVersion() }}, coffee-exposure-2026-09-v1); nothing is stored. Satellite season maps: Sentinel-2 canopy, Landsat surface
        heat and the Copernicus 30 m surface. Photos: Wikimedia Commons and CCRI, credited on each photo.</p>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tab { padding: 8px 18px; border-radius: 999px; border: 1px solid #0f3d24; color: #0f3d24; text-decoration: none; font-weight: 500; }
    .tab.active { background: #0f3d24; color: #fff; }
    .head-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; margin-bottom: 12px; }
    .pick { display: flex; align-items: center; gap: 6px; background: var(--surface-2, #f1f5f1); border-radius: 999px; padding: 6px 14px; }
    .pick span { color: var(--muted); font-size: .85rem; }
    .pick select { border: 0; background: transparent; font: inherit; font-weight: 600; max-width: 260px; }
    .topic-picker { position: relative; }
    .topic-current { display: flex; gap: 10px; align-items: center; border: 1px solid #0f3d24; border-radius: 10px; background: #fff;
      padding: 6px 12px; cursor: pointer; text-align: left; min-width: 300px; }
    .thumb { width: 40px; height: 40px; border-radius: 6px; overflow: hidden; display: grid; place-items: center; background: #eef3ee; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .topic-text { display: flex; flex-direction: column; flex: 1; }
    .topic-text strong { font-size: 1.05rem; color: #0f3d24; }
    .topic-text small { color: var(--muted); }
    .eyebrow { text-transform: uppercase; letter-spacing: .06em; font-size: .7rem; color: var(--muted); font-weight: 600; }
    .topic-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; background: #fff; border-radius: 12px; min-width: 320px;
      box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 8px; display: flex; flex-direction: column; }
    .topic-menu .group { font-size: .75rem; color: var(--muted); padding: 6px 8px; text-transform: uppercase; letter-spacing: .05em; }
    .topic-menu button { display: flex; gap: 10px; align-items: center; border: 0; background: transparent; padding: 8px; border-radius: 8px;
      cursor: pointer; text-align: left; }
    .topic-menu button.active, .topic-menu button:hover { background: #eef5f0; }
    .topic-menu button span:last-child { display: flex; flex-direction: column; }
    .topic-menu small { color: var(--muted); font-size: .72rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #2f7d4f; flex: none; }
    .map-card { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; }
    .map-wrap { position: relative; min-height: 560px; border-radius: 14px; overflow: hidden; }
    .map { position: absolute; inset: 0; }
    .scene-label { position: absolute; left: 12px; top: 12px; background: rgba(15, 61, 36, .82); color: #fff; padding: 8px 12px;
      border-radius: 10px; display: flex; flex-direction: column; max-width: 60%; }
    .scene-label span { font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; opacity: .85; }
    .atmosphere { position: absolute; right: 12px; top: 12px; background: rgba(240, 244, 240, .88); border-radius: 12px; padding: 10px 14px;
      display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 220px; }
    .atmosphere strong { font-size: 1rem; }
    .atmosphere span { font-size: .7rem; letter-spacing: .05em; color: #4b5b52; }
    .sun-arc { width: 150px; margin-top: 6px; }
    .sun-arc .arc { fill: none; stroke: #8a9a90; stroke-dasharray: 3 3; }
    .sun-arc .horizon { stroke: #b5c2b9; }
    .sun-arc .disc { fill: #f0b429; }
    .sun-arc.night .disc { fill: #9fb3c8; }
    .sun-arc text { font-size: 8px; fill: #6b7c72; }
    .gallery { display: flex; flex-direction: column; gap: 8px; }
    .photo { position: relative; border-radius: 12px; overflow: hidden; aspect-ratio: 4 / 3; background: #eef3ee; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .count { position: absolute; left: 8px; top: 8px; background: rgba(0,0,0,.55); color: #fff; padding: 2px 8px; border-radius: 999px; font-size: .75rem; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; border-radius: 50%; border: 0;
      background: rgba(255,255,255,.85); font-size: 1.3rem; cursor: pointer; }
    .nav.prev { left: 8px; } .nav.next { right: 8px; }
    .caption { margin: 0; text-align: center; }
    .caption small { display: block; color: var(--muted); }
    .thumbs { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .thumb-btn { width: 44px; height: 34px; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; cursor: pointer; }
    .thumb-btn.on { border-color: #0f3d24; }
    .thumb-btn img { width: 100%; height: 100%; object-fit: cover; }
    .checks { margin: 0; padding-left: 18px; }
    .map-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 14px; font-size: .82rem; color: #4b5b52; }
    .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; margin-right: 4px; }
    .what-to-do .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .what-to-do h4 { margin: 0 0 6px; }
    .areas { display: grid; gap: 10px; }
    .area { border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 10px;
      align-items: center; justify-content: space-between; }
    .area-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .badge { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.3); }
    .pill { color: #fff; border-radius: 999px; padding: 2px 10px; font-size: .78rem; font-weight: 600; }
    .points { flex-basis: 100%; display: flex; flex-direction: column; gap: 6px; }
    .point { display: flex; gap: 12px; align-items: center; }
    .alerts { display: grid; gap: 10px; }
    .alert { border: 1px solid var(--border); border-left: 5px solid #b5c2b9; border-radius: 10px; padding: 8px 12px; }
    .alert[data-p="2"] { border-left-color: #ef8a3c; }
    .alert[data-p="3"] { border-left-color: #d64545; }
    .alert summary { display: flex; gap: 12px; align-items: center; cursor: pointer; }
    .alert .status { flex: 1; }
    .alert .prio { font-size: .78rem; color: var(--muted); }
    .facts { width: 100%; font-size: .85rem; border-collapse: collapse; margin: 6px 0; }
    .facts td { padding: 3px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .ev { font-size: .7rem; text-transform: uppercase; color: var(--muted); }
    @media (max-width: 1000px) { .map-card { grid-template-columns: minmax(0, 1fr); } .what-to-do .cols { grid-template-columns: 1fr; } }
  `],
})
export class PestForecastPage implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  protected readonly precise = inject(AuthService).has('farmer.read_pii');
  protected readonly legend = LEGEND;
  protected readonly levelColour = LEVEL_COLOUR;
  protected readonly priorityText = PRIORITY;
  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  protected readonly farms = signal<FarmOption[]>([]);
  protected readonly plotId = signal<string | null>(null);
  private readonly src = signal<any | null>(null);
  private readonly forecastRaw = signal<{ body: any; at: string } | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly month = signal(monthIST());
  protected readonly topic = signal<string | null>(null);
  protected readonly crop = signal<string | null>(null);
  protected readonly menu = signal(false);
  protected readonly photo = signal(0);
  protected readonly playing = signal(true);
  protected readonly openArea = signal<number | null>(null);
  protected hover = false;
  private map?: MapLibre;
  private readonly ready = signal(false);
  private markers: Marker[] = [];
  private timer?: ReturnType<typeof setInterval>;

  /** FarmFuture's farm snapshot, normalised by FarmFuture's own normaliser. */
  protected readonly farm = computed(() => {
    const s = this.src();
    if (!s?.coordinates) return null;
    const geometry = normalizeGeometry(s.coordinates);
    const attempt = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };
    const f = this.forecastRaw();
    return {
      farm: { id: s.farm_id, name: '', estate: null, crops: [], plantsPerHectare: null },
      geometry,
      sensors: attempt(() => normalizeSensors(s.sensors, geometry)) ?? [],
      calendar: attempt(() => normalizeCalendar(s.calendar)),
      weather: attempt(() => normalizeWeather(s.weather)),
      forecast: f ? attempt(() => normalizeForecast(f.body, geometry.center)) : null,
      fetchedAt: { geometry: new Date().toISOString(), ...(f ? { forecast: f.at } : {}) },
      errors: {}, staleResources: [], notes: [],
    } as any;
  });
  private readonly sources = computed(() => {
    const s = this.src(), farm = this.farm();
    if (!s || !farm) return null;
    const attempt = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };
    return { satellite: s.satellite ?? null, drainage: s.drainage ? attempt(() => drainageScreen(s.drainage)) : null,
      thermal: s.thermal ?? null, cwsb: s.cwsb ?? null, records: recordsWithZones(s.records ?? [], farm) };
  });

  /** The farm's registered coffee crop (FarmFuture's Crop picker lists the farm's crops), else its devices' crops. */
  protected readonly coffeeCrops = computed(() => {
    const plot = this.src()?.crop as string | null;
    if (plot) return plot === 'mixed' ? ['Coffee-Arabica', 'Coffee-Robusta'] : [`Coffee-${plot[0].toUpperCase()}${plot.slice(1)}`];
    const names = (this.farm()?.sensors ?? []).flatMap((s: any) => s.crops ?? []) as string[];
    return [...new Set(names.filter((n) => /coffee/i.test(n)))];
  });
  protected readonly plantedCrops = computed(() => {
    const crops = this.coffeeCrops(), picked = this.crop();
    return picked && crops.includes(picked) ? picked : crops[0] ?? '';
  });
  protected readonly seasonOptions = computed(() => {
    const variety = varietyOf(this.plantedCrops());
    return MONTH_SHORT.map((m, i) => ({ month: i + 1, label: `${stageName(i + 1, variety)} · ${m}` }));
  });
  /** FarmFuture's topic list: the season's watch rows for the month, kept to the planted host. */
  protected readonly rows = computed(() => {
    const crops = this.plantedCrops(), month = this.month();
    if (crops && !hasPestTopics(crops)) return [];
    return seasonWatch(month).filter((r) => (topicGate as any)(r.topic, { month, species: crops }).hostMatch);
  });
  protected readonly inSeasonCount = computed(() => this.rows().filter((r) => r.inSeason).length);
  protected readonly topicKey = computed(() => {
    const rows = this.rows(), t = this.topic();
    return rows.some((r) => r.topic === t) ? t! : rows[0]?.topic ?? 'cwsb';
  });
  protected readonly title = computed(() => (EXPOSURE_TOPICS as any)[this.topicKey()]?.title ?? 'Estate');
  protected readonly message = computed(() => lifecycleMessage(this.topicKey(), this.month()));
  protected readonly photos = computed(() => (PEST_PHOTOS[this.topicKey()] ?? [])
    .map((p) => ({ ...p, src: p.src.replace(/^wsb\/pests\//, 'pests/') })));
  protected readonly checks = computed(() => FARMER_CHECKS[this.topicKey() === 'cwsb' ? 'wsb' : this.topicKey()] ?? []);
  protected readonly guidance = computed(() => guidanceForTopic(this.topicKey()));

  /** FarmFuture's inspection plan for the topic: exposure layer, guarded view and areas (as its page renders it). */
  protected readonly plan = computed(() => {
    const farm = this.farm(), src = this.sources();
    if (!farm || !src) return null;
    const topic = this.topicKey();
    try {
      const zones = farm.geometry.zones;
      const stateFor = (zoneId: string) => layerState({
        layer: 'exposure', farm, satellite: src.satellite, drainage: src.drainage, thermal: src.thermal,
        records: src.records as never[], zoneId, floweringDate: null, includeScoutingPlan: false, cwsb: src.cwsb,
        exposureTopic: topic, radar: null,
      } as any) as any;
      const state = stateFor(zones[0]?.id);
      const candidates = zones.flatMap((z: any) => { try { return stateFor(z.id).candidates; } catch { return []; } });
      const cwsb = src.cwsb as any;
      const guarded = state.exposure ? guardedExposure({
        exposure: state.exposure as ExposureLike, farmM2: farmAreaM2(zones, farm.geometry.center.lat),
        lstResolution: cwsb?.lst?.resolution ?? cwsb?.lst?.grid?.resolution,
      }) : null;
      const areas = buildPlan({
        topic, alertTopic: state.exposure?.alertTopic ?? topic, grid: state.grid as never, candidates,
        zones: zones.map((z: any) => ({ id: z.id, name: z.name })), farmCentre: farm.geometry.center,
        records: src.records as PlanRecord[], guarded,
      } as any);
      return { state, guarded, areas, ready: !!state.grid };
    } catch (e) {
      console.error('inspection plan failed', e);
      return { state: null, guarded: null, areas: [] as PlanArea[], ready: false };
    }
  });
  protected readonly areas = computed(() => this.plan()?.areas ?? []);
  protected readonly note = computed(() => this.plan() && !this.plan()!.ready ? 'The seasonal composites for this estate are still loading.' : '');
  protected readonly headline = computed(() => {
    const plan = this.plan(), n = this.areas().length;
    if (!plan?.ready) return 'Working out where to look…';
    if (!n) return 'No part of the estate stands out right now';
    const confirmed = this.areas().filter((a) => a.level === 'confirmed').length;
    if (confirmed) return `${confirmed} area${confirmed === 1 ? '' : 's'} at high risk · ${n} to inspect`;
    return n === 1 ? '1 area needs attention' : `${n} areas need attention`;
  });
  /** FarmFuture's screening alert for the topic in every zone (its "Actions & follow-ups" cards). */
  protected readonly zoneAlerts = computed(() => {
    const models = this.plan()?.state?.models ?? [];
    const alertTopic = (EXPOSURE_TOPICS as any)[this.topicKey()]?.alertTopic ?? this.topicKey();
    return models.map((m: any) => ({ zone: m.zone?.name || 'Farm', alert: m.alerts.find((a: any) => a.topic === alertTopic) }))
      .filter((z: any) => z.alert);
  });
  protected readonly modelVersion = computed(() => this.zoneAlerts()[0]?.alert?.modelVersion ?? 'coffee-screen-2026-09-v2');
  protected readonly sun = computed(() => {
    const c = this.farm()?.geometry?.center;
    return c ? sunDay(c.lat, c.lon) : null;
  });
  protected readonly atmosphere = computed(() => {
    const farm = this.farm();
    if (!farm) return null;
    const w = farm.weather, fmt = (v: number | null | undefined, d = 1) => (Number.isFinite(v) ? (v as number).toFixed(d) : '—');
    const now = Date.now();
    const slot = (farm.forecast?.slots ?? []).find((s: any) => s.time - 3 * 3600_000 <= now && now <= s.time);
    const wet = !!slot && (slot.rainMm >= 1 || (/rain|drizzle|shower|storm/i.test(slot.condition ?? '') && (slot.rainProbability ?? 0) >= 60));
    const rainLine = wet ? `RAIN NOW · ${fmt(slot.rainMm)} MM IN 3 H${Number.isFinite(slot.rainProbability) ? ` · ${fmt(slot.rainProbability, 0)}% CHANCE` : ''} · FORECAST` : null;
    const sunLine = [...(this.sun() ? [this.sun()!.text.toUpperCase()] : []), ...(rainLine ? [rainLine] : [])];
    return w ? { strong: `${fmt(w.temperatureC)} °C · ${fmt(w.humidity, 0)}% humidity`, lines: ['WEATHER STATION · OBSERVED', ...sunLine] }
      : { strong: null, lines: ['WEATHER OBSERVATION UNAVAILABLE', ...sunLine] };
  });
  protected sunX(): number { return 60 + 50 * Math.cos(Math.PI * (1 - Math.max(0, Math.min(1, this.sun()?.fraction ?? 0)))); }
  protected sunY(): number { return 52 - 50 * Math.sin(Math.PI * (1 - Math.max(0, Math.min(1, this.sun()?.fraction ?? 0)))); }

  constructor() {
    this.api.get<FarmOption[]>('/farm-health/farms').subscribe((farms) => {
      this.farms.set(farms);
      const asked = this.route.snapshot.queryParamMap.get('plot');
      const start = farms.find((f) => f.plot_id === asked) ?? farms.find((f) => /palthope estate/i.test(f.label)) ?? farms[0];
      if (start) this.load(start.plot_id);
    });
    effect(() => this.draw(this.plan(), this.farm(), this.openArea(), this.ready()));
    effect(() => { this.topicKey(); this.photo.set(0); this.openArea.set(null); });
    this.timer = setInterval(() => {
      if (this.playing() && !this.hover && this.photos().length > 1) this.photo.set((this.photo() + 1) % this.photos().length);
    }, 4000);
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const el = this.mapEl()?.nativeElement;
      if (!el) return;
      this.map = new MapLibre({ container: el, style: STYLE, center: [75.6, 13.2], zoom: 12, attributionControl: { compact: true } });
      this.map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
      this.map.on('load', () => {
        const m = this.map!;
        m.addSource('zones', { type: 'geojson', data: empty });
        m.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#0f6b3a', 'fill-opacity': 0.08 } });
        m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#d9f0c4', 'line-width': 2 } });
        this.zone.run(() => this.ready.set(true));
      });
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.map?.remove();
  }

  protected pickFarm(plotId: string): void {
    this.router.navigate([], { queryParams: { plot: plotId }, replaceUrl: true });
    this.load(plotId);
  }

  protected pickTopic(topic: string): void {
    this.topic.set(topic);
    this.menu.set(false);
  }

  protected step(delta: number): void {
    const n = this.photos().length;
    if (n) this.photo.set((this.photo() + delta + n) % n);
  }

  protected toggleArea(n: number): void {
    this.openArea.set(this.openArea() === n ? null : n);
  }

  private load(plotId: string): void {
    this.plotId.set(plotId);
    this.src.set(null);
    this.forecastRaw.set(null);
    this.crop.set(null);
    this.error.set(null);
    this.fitted = false;
    if (!this.precise) return;
    this.loading.set(true);
    this.api.get<any>(`/farm-health/${plotId}/sources`).subscribe({
      next: (s) => {
        this.src.set(s);
        this.loading.set(false);
        const c = this.farm()?.geometry?.center;
        if (c) this.api.get<any>(`/farm-health/${plotId}/forecast`, { lat: c.lat, lon: c.lon }, { silent: true }).subscribe({
          next: (body) => this.plotId() === plotId && this.forecastRaw.set({ body, at: new Date().toISOString() }),
          error: () => undefined,
        });
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error?.error?.message ?? e?.error?.message ?? 'FarmFuture could not be read just now.');
      },
    });
  }

  /** Draws FarmFuture's 2D plan: zones, the guarded exposure cells, numbered areas and, for an open area, its points. */
  private draw(plan: any, farm: any, open: number | null, ready: boolean): void {
    const map = this.map;
    if (!map || !ready) return;
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    const zones = farm?.geometry?.zones ?? [];
    (map.getSource('zones') as GeoJSONSource).setData({ type: 'FeatureCollection', features: zones.map((z: any) => ({
      type: 'Feature', properties: { name: z.name }, geometry: { type: 'Polygon', coordinates: z.rings } })) });
    this.drawCells(map, plan, zones, open);
    for (const z of zones) {
      const ring = z.rings?.[0] ?? [];
      if (!ring.length) continue;
      const cx = ring.reduce((s: number, p: number[]) => s + p[0], 0) / ring.length, cy = ring.reduce((s: number, p: number[]) => s + p[1], 0) / ring.length;
      const el = document.createElement('div');
      el.className = 'pf-zone-label';
      el.textContent = z.name;
      this.markers.push(new Marker({ element: el }).setLngLat([cx, cy]).addTo(map));
    }
    for (const a of plan?.areas ?? []) {
      const el = document.createElement('button');
      el.className = 'pf-area';
      el.style.background = LEVEL_COLOUR[a.level];
      el.textContent = String(a.n);
      el.title = `Area ${a.n} · ${a.name} · ${a.levelText} · ${a.acresText}`;
      el.addEventListener('click', () => this.zone.run(() => this.toggleArea(a.n)));
      this.markers.push(new Marker({ element: el }).setLngLat([a.centre.lon, a.centre.lat]).addTo(map));
    }
    const area = open ? plan?.areas?.find((a: PlanArea) => a.n === open) : null;
    for (const p of area?.points ?? []) {
      const el = document.createElement('div');
      el.className = 'pf-point';
      el.textContent = p.label;
      this.markers.push(new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
    }
    const b = farm?.geometry?.bounds;
    if (b && !this.fitted) {
      map.resize();  // the map was hidden while the farm loaded
      map.fitBounds(new LngLatBounds([b.west, b.south], [b.east, b.north]), { padding: 40, duration: 0 });
      this.fitted = true;
    }
  }
  private fitted = false;  // fitted to the farm once per farm

  /**
   * FarmFuture's 2D overlay: the shown cells painted on an image at 8 px per cell, cut to the zone shapes
   * ('destination-in', even-odd) so the colour stops at the boundary, and laid over the photo at ~0.8 opacity.
   * Cells outside an opened area turn pale (#f7e3b8), as on FarmFuture's map.
   */
  private drawCells(map: MapLibre, plan: any, zones: any[], open: number | null): void {
    if (map.getLayer('cells')) map.removeLayer('cells');
    if (map.getSource('cells')) map.removeSource('cells');
    const grid = plan?.state?.grid, shown = plan?.guarded?.shown ?? [];
    if (!grid?.cells?.length || !grid.width || !grid.height || !zones.length || !shown.length) return;
    const area = open ? plan.areas?.find((a: PlanArea) => a.n === open) : null;
    const inArea = new Set<number>(area?.cellIds ?? []);
    const colors: Record<number, string> = {};
    for (const c of shown) colors[c.i] = area && !inArea.has(c.i) ? '#f7e3b8' : c.colour;
    const { west, east, south, north } = grid.bounds;
    const halfLon = (east - west) / grid.width / 2, halfLat = (north - south) / grid.height / 2, px = 8;
    const w = Math.min(2048, Math.max(64, Math.round(grid.width * px))), h = Math.min(2048, Math.max(64, Math.round(grid.height * px)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const x = (lon: number) => ((lon - west) / (east - west)) * w, y = (lat: number) => ((north - lat) / (north - south)) * h;
    for (const c of grid.cells) {
      const color = colors[c.i];
      if (!color || !Number.isFinite(c.lon) || !Number.isFinite(c.lat)) continue;
      ctx.fillStyle = color;
      const x0 = Math.floor(x(c.lon - halfLon)), y0 = Math.floor(y(c.lat + halfLat));
      ctx.fillRect(x0, y0, Math.ceil(x(c.lon + halfLon)) - x0, Math.ceil(y(c.lat - halfLat)) - y0);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (const z of zones) {
      for (const ring of z.rings) {
        ring.forEach(([lon, lat]: number[], k: number) => (k ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat))));
        ctx.closePath();
      }
    }
    ctx.fill('evenodd');
    map.addSource('cells', { type: 'image', url: canvas.toDataURL('image/png'),
      coordinates: [[west, north], [east, north], [east, south], [west, south]] });
    map.addLayer({ id: 'cells', type: 'raster', source: 'cells', paint: { 'raster-opacity': Math.min(0.85, (area ? 0.5 : 0.55) * 1.45),
      'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, 'zones-fill');
  }
}
