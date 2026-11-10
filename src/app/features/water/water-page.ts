/*
 * Soil & water – the platform's copy of FarmFuture's "Irrigation Planning" screen for one farm: the watering advice, the
 * three tiles, each block's status and the 7-day watering outlook. FarmFuture's water engine plan (GET only, through
 * /farm-health/{plot}/irrigation) shown with FarmFuture's own words and helpers (copied into ./ff).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Notice, PageHeader } from '../../shared/page-header';
import { plainWords } from './ff/irrigation-plain-words.util';
import { IrrigationPlan } from './ff/irrigation.model';
import {
  STATUS_HEX, depthText, firstSentence, fmtDay, inches, isNum, nextIrrigation, num, pct, reserveText, shortDay,
} from './ff/irrigation.util';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FarmOption { plot_id: string; label: string; crop: string | null }

/** FarmFuture's engine sends "·" mis-encoded ("Â·"); shown as meant. */
const fix = (s: string | null | undefined): string => (s ?? '').replace(/Â·/g, '·').replace(/Â/g, '');
const fixDeep = (v: any): any => typeof v === 'string' ? fix(v) : Array.isArray(v) ? v.map(fixDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixDeep(x)])) : v;

@Component({
  selector: 'app-water-page',
  imports: [PageHeader, Notice, RouterLink],
  template: `
    <app-page-header title="Soil & water management" subtitle="Watering advice, soil water left and the 7-day outlook for each block – FarmFuture's Irrigation Planning for the farm" />
    <div class="tabs">
      <span class="tab active">Irrigation planning</span>
      <a class="tab" routerLink="/modules/water">Water &amp; conservation records</a>
    </div>
    <div class="head-row">
      <label class="pick"><span>Farm</span>
        <select (change)="pickFarm($any($event.target).value)">
          @for (f of farms(); track f.plot_id) {<option [value]="f.plot_id" [selected]="f.plot_id === plotId()">{{ f.label }}</option>}
        </select></label>
    </div>
    @if (loading()) {<p class="muted">Reading FarmFuture's watering plan…</p>}
    @if (error()) {<app-notice kind="warning">{{ error() }}</app-notice>}
    @if (notFound()) {
      <div class="empty"><p>There is no watering plan for this farm yet. It appears here once the farm has been set up for watering advice.</p></div>
    }
    @if (plan(); as p) {
      @if (p.data_quality?.estimated && p.data_quality?.soil_start) {
        <div class="estimate"><strong>Advice from your farm's forecast.</strong> Worked out from weather forecasts and the crop stage of each block.</div>
      }
      <div class="card hero" [attr.data-c]="p.headline.color">
        <div class="eyebrow">Watering advice</div>
        <h2>{{ pw(p.headline.title) }}</h2>
        <p class="why">{{ heroSummary() }}</p>
        @if (p.actions?.length) {<ul>@for (a of p.actions; track $index) {<li>{{ pw(a) }}</li>}</ul>}
        @if (sensorFlag()) {<div class="flag">{{ sensorFlag() }}</div>}
        @for (a of p.alerts ?? []; track $index) {<div class="flag">{{ pw(a.text) }}</div>}
        @if (p.season; as se) {<div class="season">&#x1F4C5; {{ pw(se.label) }}{{ se.months ? ' · ' + se.months : '' }}</div>}
      </div>
      <div class="tiles">
        @for (t of tiles(); track t.label) {<div class="tile"><div class="l">{{ t.label }}</div><div class="v">{{ t.value }}</div><div class="s">{{ pw(t.sub) }}</div></div>}
      </div>
      <div class="card"><h3>Each block</h3>
        @if (!blocks().length) {<p class="muted">No mapped blocks for this farm.</p>}
        @if (groups().length > 1) {
          <div class="crop-tabs">@for (g of groups(); track g.crop) {
            <button type="button" [class.active]="g.crop === active()?.crop" (click)="crop.set(g.crop)">{{ g.crop }} ({{ g.items.length }})@if (g.needing) {<i class="dot-red"></i>}</button>}</div>
        }
        @if (active(); as g) {
          @if (groups().length === 1) {<h4>{{ g.crop }}</h4>}
          @if (g.summary) {<div class="crop-summary">{{ g.summary }}</div>}
          @for (b of g.items; track $index) {
            <div class="blk"><div class="h"><b><span class="dot" [style.background]="b.dot"></span>{{ b.shortName }}</b>
              <span class="pill" [attr.data-t]="b.pillTone">{{ b.pillText }}</span></div>
              <div class="s">{{ b.title }}</div>
              @if (b.give; as gv) {<div class="s">Give {{ gv.depth }}@if (gv.perPlant) { · {{ gv.perPlant }} per plant}</div>}
            </div>
          }
        }
        <p class="muted">{{ blocksNote() }}</p>
      </div>
      <div class="card"><h3>Watering outlook: next 7 days</h3>
        @if (next(); as ni) {
          <div class="nextirr" [attr.data-t]="outlookTone()">
            @if (ni.hold) {Do not water yet <small>{{ pw(p.headline.message || ni.sub) }}</small>}
            @else if (ni.now) {Water now <small>{{ pw(ni.sub) }}</small>}
            @else if (outlookDry(); as dry) {Water by {{ fmtDay(dry.date) }} <small>The soil is expected to get too dry that day.</small>}
            @else {No watering needed in the next {{ p.days.length }} days <small>Next watering: {{ ni.value }}{{ ni.sub ? ' - ' + pw(ni.sub) : '' }}</small>}
          </div>
        }
        <p>{{ pw(weekNote()) }}</p>
        <div class="strip">
          @for (d of days(); track d.date) {
            <div class="od"><div class="n">{{ shortDay(d.date) }}</div><div class="pill2" [attr.data-t]="d.pillTone">{{ d.pillText }}</div>
              <div class="ob"><i [style.height.%]="d.fill"></i><u [style.bottom.%]="d.line"></u></div>
              <div class="lv">{{ d.level }}</div><div class="rs">{{ d.left }}</div>
              <div class="sm">Plants use {{ d.used }} mm<br /><b>{{ d.rain }}</b>@if (d.drains) {<br />{{ d.drains }}}</div></div>
          }
        </div>
        <p class="muted small">Each day shows how much water is left in the soil. The dashed line is where the plants start to get too dry. Rain and water use are shown small underneath.</p>
      </div>
      <p class="muted small">FarmFuture water engine plan ({{ $any(p).model_version || 'engine' }}, as of {{ $any(p).as_of_date }}), read live (GET only) – nothing is
        stored here. The daily water balance kept for MRV is under <a routerLink="/modules/water">Water &amp; conservation records</a>.</p>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tab { padding: 8px 18px; border-radius: 999px; border: 1px solid #0f3d24; color: #0f3d24; text-decoration: none; font-weight: 500; }
    .tab.active { background: #0f3d24; color: #fff; }
    .head-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .pick { display: flex; align-items: center; gap: 6px; background: var(--surface-2, #f1f5f1); border-radius: 999px; padding: 6px 14px; }
    .pick span { color: var(--muted); font-size: .85rem; } .pick select { border: 0; background: transparent; font: inherit; font-weight: 600; }
    .card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 18px 20px; margin-bottom: 16px; }
    .empty { border: 1px dashed #c9d4cc; border-radius: 14px; padding: 18px; }
    .estimate { background: #eef4fb; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; color: #1f4f78; }
    .hero { border-left: 6px solid #2e8b57; }
    .hero[data-c="amber"] { border-left-color: #d98e04; background: #fffaf0; } .hero[data-c="red"] { border-left-color: #b02a37; background: #fff5f5; }
    .hero[data-c="blue"] { border-left-color: #1f6fa8; background: #f3f8fd; }
    .eyebrow { text-transform: uppercase; letter-spacing: .06em; font-size: .72rem; color: var(--muted); font-weight: 600; }
    .hero h2 { margin: 4px 0; } .why { margin: 0 0 8px; }
    .flag { background: #fff3cd; border-radius: 10px; padding: 8px 12px; margin: 6px 0; font-size: .9rem; }
    .season { margin-top: 8px; color: #4b5b52; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 14px; }
    .tile .l { color: var(--muted); font-size: .85rem; } .tile .v { font-size: 1.6rem; font-weight: 700; } .tile .s { color: #5d6f64; font-size: .85rem; }
    .crop-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
    .crop-tabs button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
    .crop-tabs button.active { background: #0f3d24; color: #fff; }
    .dot-red { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #b02a37; margin-left: 5px; }
    .crop-summary { font-weight: 600; margin-bottom: 6px; }
    .blk { border-bottom: 1px solid var(--border); padding: 8px 0; }
    .blk .h { display: flex; justify-content: space-between; align-items: center; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
    .blk .s { color: #4b5b52; font-size: .9rem; }
    .pill, .pill2 { border-radius: 999px; padding: 2px 10px; font-size: .78rem; font-weight: 600; background: #e6f4ea; color: #1f6b43; }
    .pill[data-t="amber"], .pill2[data-t="amber"] { background: #fff1d6; color: #96680a; }
    .pill[data-t="red"], .pill2[data-t="red"] { background: #fbefed; color: #a63a32; }
    .pill[data-t="blue"], .pill2[data-t="blue"] { background: #e7f0fa; color: #1f6fa8; }
    .nextirr { font-size: 1.2rem; font-weight: 700; padding: 10px 14px; border-radius: 12px; background: #e6f4ea; color: #1f6b43; }
    .nextirr small { display: block; font-size: .85rem; font-weight: 400; color: #33473b; }
    .nextirr[data-t="amber"] { background: #fff1d6; color: #96680a; } .nextirr[data-t="red"] { background: #fbefed; color: #a63a32; }
    .nextirr[data-t="blue"] { background: #e7f0fa; color: #1f6fa8; }
    .strip { display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); gap: 8px; overflow-x: auto; }
    .od { border: 1px solid var(--border); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .od .n { font-weight: 600; }
    .ob { position: relative; width: 34px; height: 90px; background: #eef3ef; border-radius: 8px; overflow: hidden; }
    .ob i { position: absolute; bottom: 0; left: 0; right: 0; background: #5aa9e6; }
    .ob u { position: absolute; left: 0; right: 0; border-top: 2px dashed #b02a37; }
    .lv { font-weight: 700; } .rs, .sm { font-size: .78rem; color: #4b5b52; }
    @media (max-width: 900px) { .tiles { grid-template-columns: 1fr; } }
  `],
})
export class WaterPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly farms = signal<FarmOption[]>([]);
  protected readonly plotId = signal<string | null>(null);
  protected readonly plan = signal<IrrigationPlan | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly crop = signal('');
  protected readonly pw = (t: string | null | undefined) => plainWords(fix(t));
  protected readonly fmtDay = fmtDay;
  protected readonly shortDay = shortDay;

  protected readonly heroSummary = computed(() => {
    const p = this.plan();
    return p ? plainWords(firstSentence(p.summary || p.headline.message)) : '';
  });
  protected readonly sensorFlag = computed(() => {
    const sn = this.plan()?.today.sensor;
    return sn?.available && !sn.agrees ? plainWords(sn.note ?? '') : '';
  });
  protected readonly next = computed(() => { const p = this.plan(); return p ? nextIrrigation(p) : null; });
  private readonly needsWater = computed(() => {
    const p = this.plan();
    return !!(p?.water_needed && p.headline.status !== 'NO_IRRIGATION' && p.headline.status !== 'HOLD');
  });
  protected readonly outlookDry = computed(() => this.plan()?.days.find((d) => d.needs_water) ?? null);
  protected readonly outlookTone = computed(() => {
    const ni = this.next();
    if (!ni) return 'green';
    if (ni.hold) return 'blue';
    if (ni.now) return 'red';
    return this.outlookDry() ? 'amber' : 'green';
  });
  protected readonly weekNote = computed(() => {
    const p = this.plan(), ni = this.next();
    if (!p || !ni) return '';
    const days = p.days;
    const used = days.reduce((x, d) => x + (d.water_used_mm || 0), 0);
    const held = days.reduce((x, d) => x + (d.rain_held_mm ?? d.rain_mm), 0);
    const lost = days.reduce((x, d) => x + (d.rain_lost_mm || 0), 0);
    const lowest = Math.min(...days.map((d) => d.moisture_pct));
    const rainTxt = held < 1 ? 'no useful rain is expected'
      : `rain adds about ${num(held)} mm that the soil can hold` + (lost >= 5 ? ` (another ${num(lost)} mm drains away because the soil is full)` : '');
    const flow = `The plants will use about ${num(used)} mm of water this week and ${rainTxt}, `;
    const dry = this.outlookDry();
    if (ni.hold) return flow + 'so the soil may dry down. At this stage that is intended: the flower buds are still maturing and watering too early gives poor, uneven blossom. Next irrigation: ' + ni.value + '.';
    if (ni.now) return flow + 'and the soil is already at water stress, so irrigate now. Without irrigation it keeps drying every day.';
    if (dry) return flow + `but the soil is still expected to reach water stress on ${fmtDay(dry.date)}, so plan to irrigate by then.`;
    return flow + `so the soil stays above the stress line all week (lowest ${pct(lowest)}) and no irrigation is needed.`;
  });
  protected readonly tiles = computed(() => {
    const p = this.plan();
    if (!p) return [];
    const w = p.water_needed, rain = p.days.reduce((s, d) => s + d.rain_mm, 0), dry = p.today.soil_state?.word === 'Dry';
    const ni = nextIrrigation(p);
    return [
      { label: 'Soil water left', value: reserveText(p.today),
        sub: dry ? (p.headline.status === 'HOLD' ? 'dry on purpose at this stage' : 'water now')
          : `without rain, before the plants feel stress (about ${num(p.today.reserve_mm)} mm)` },
      { label: `Rain, next ${p.days.length} days`, value: `${num(rain)} mm`, sub: rain >= 1 ? 'from the forecast' : 'almost none expected' },
      this.needsWater() && w
        ? { label: 'Water to give', value: `${num(w.depth_mm, 1)} mm`, sub: `about ${inches(w.depth_mm)} · see the watering plan below for motor hours` }
        : { label: 'Next watering needed', value: ni.value, sub: ni.sub },
    ];
  });
  protected readonly blocks = computed(() => (this.plan()?.zones ?? []).map((z: any) => {
    const planned = z.headline.status === 'HOLD' && z.today.soil_state?.word === 'Dry';
    const w = z.water_needed, gives = w && z.headline.status !== 'NO_IRRIGATION' && z.headline.status !== 'HOLD';
    const sep = z.name.lastIndexOf(' · ');
    return {
      crop: sep >= 0 ? z.name.slice(sep + 3).trim() : '', shortName: sep >= 0 ? z.name.slice(0, sep).trim() : z.name,
      give: gives ? { mm: w.depth_mm, depth: depthText(w.depth_mm, 1), perPlant: w.litres_per_plant != null ? `${num(w.litres_per_plant, 1)} L` : '' } : null,
      dot: STATUS_HEX[z.headline.color] || STATUS_HEX['grey'],
      pillTone: planned ? 'blue' : z.today.soil_state?.tone || 'green',
      pillText: planned ? 'Dry (planned)' : z.today.soil_state?.word || '',
      title: plainWords(z.headline.title) + (isNum(z.today.reserve_days) && z.today.soil_state?.word !== 'Dry' ? ` · ${reserveText(z.today)} of soil water` : ''),
    };
  }));
  protected readonly groups = computed(() => {
    const groups = new Map<string, any[]>();
    for (const b of this.blocks()) { const k = b.crop || 'Other'; groups.set(k, [...(groups.get(k) ?? []), b]); }
    return [...groups].map(([crop, list]) => {
      const items = [...list].sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));
      const mms = items.flatMap((b) => (b.give && isNum(b.give.mm) ? [Number(b.give.mm)] : []));
      const lo = Math.min(...mms), hi = Math.max(...mms);
      const summary = mms.length ? `${crop}: give about ${num(lo, 0) === num(hi, 0) ? `${num(lo, 0)} mm` : `${num(lo, 0)}-${num(hi, 0)} mm`}` : '';
      return { crop, items, needing: mms.length, summary };
    });
  });
  protected readonly active = computed(() => this.groups().find((g) => g.crop === this.crop()) ?? this.groups()[0] ?? null);
  protected readonly blocksNote = computed(() => {
    const t = this.plan()?.zone_totals;
    if (!t) return '';
    return `${t.blocks_needing_water} of ${t.blocks} blocks need water.` + (t.first_block ? ` ${plainWords(`Start with ${t.first_block.name}: ${t.first_block.reason}.`)}` : '');
  });
  protected readonly days = computed(() => {
    const p = this.plan(), ni = this.next();
    if (!p || !ni) return [];
    return p.days.map((d) => {
      const st = d.soil_state ?? {}, tone = d.needs_water ? 'red' : (st as any).tone || 'green';
      const left = reserveText({ reserve_days: d.reserve_days, soil_state: st } as any);
      return {
        date: d.date, pillTone: ni.hold && d.needs_water ? 'blue' : tone,
        pillText: d.needs_water ? (ni.hold ? 'Dry (planned)' : 'Dry') : (st as any).word || '',
        fill: Math.max(0, Math.min(100, Number(d.moisture_pct) || 0)), line: Number(d.line_pct) || 0, level: pct(d.moisture_pct),
        left: left === 'Soil is dry' ? left : left + ' left', used: num(d.water_used_mm, 1),
        rain: d.rain_mm < 0.5 ? 'no rain' : '+' + num(d.rain_held_mm != null ? d.rain_held_mm : d.rain_mm, 1) + ' mm rain',
        drains: (d.rain_lost_mm || 0) >= 1 ? num(d.rain_lost_mm) + ' mm drains' : '',
      };
    });
  });

  constructor() {
    this.api.get<FarmOption[]>('/farm-health/farms').subscribe((farms) => {
      this.farms.set(farms);
      const asked = this.route.snapshot.queryParamMap.get('plot');
      const start = farms.find((f) => f.plot_id === asked) ?? farms.find((f) => /palthope estate/i.test(f.label)) ?? farms[0];
      if (start) this.load(start.plot_id);
    });
  }

  protected pickFarm(plotId: string): void {
    this.router.navigate([], { queryParams: { plot: plotId }, replaceUrl: true });
    this.load(plotId);
  }

  private load(plotId: string): void {
    this.plotId.set(plotId);
    this.plan.set(null);
    this.notFound.set(false);
    this.error.set(null);
    this.crop.set('');
    this.loading.set(true);
    this.api.get<any>(`/farm-health/${plotId}/irrigation`).subscribe({
      next: (d) => { this.loading.set(false); if (d.plan) this.plan.set(fixDeep(d.plan)); else this.notFound.set(true); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.error?.message ?? 'FarmFuture could not be read just now.'); },
    });
  }
}
