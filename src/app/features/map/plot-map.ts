import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { formatNumber, labelize } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Programme, Row } from '../../core/models';
import { Notice, PageHeader } from '../../shared/page-header';
import { COLOUR_MODES, ColourMode, markerColour } from './map-colours';
import { Basemap, MapView } from './map-view';

@Component({
  selector: 'app-plot-map',
  imports: [PageHeader, Notice, MapView, FormsModule, MatFormFieldModule, MatSelectModule, MatButtonToggleModule,
    MatButtonModule, MatIconModule, RouterLink, DatePipe],
  template: `
    <app-page-header title="Farm map" subtitle="Plots with GPS coordinates – weather, satellite greenness, risks, sensors and practice progress" />
    <div class="map-toolbar">
      <mat-form-field subscriptSizing="dynamic"><mat-label>Programme</mat-label>
        <mat-select [ngModel]="programmeId()" (ngModelChange)="programmeId.set($event); load()">
          <mat-option value="all">All programmes</mat-option>
          @for (p of programmes(); track p.id) {<mat-option [value]="p.id">{{ p.code }} – {{ p.name }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic"><mat-label>Colour by</mat-label>
        <mat-select [ngModel]="mode()" (ngModelChange)="mode.set($event)">
          @for (m of modes; track m.value) {<mat-option [value]="m.value">{{ m.label }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-button-toggle-group hideSingleSelectionIndicator [value]="threeD() ? '3d' : '2d'" (change)="threeD.set($event.value === '3d')" aria-label="2D or 3D view">
        <mat-button-toggle value="2d"><mat-icon>map</mat-icon> 2D</mat-button-toggle>
        <mat-button-toggle value="3d"><mat-icon>view_in_ar</mat-icon> 3D terrain</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-button-toggle-group hideSingleSelectionIndicator [value]="basemap()" (change)="basemap.set($event.value)" aria-label="Base map">
        <mat-button-toggle value="streets">Streets</mat-button-toggle>
        <mat-button-toggle value="satellite">Satellite</mat-button-toggle>
        <mat-button-toggle value="terrain">Relief</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (data(); as d) {
      @if (!d['precise_locations']) {<app-notice>Points are rounded to about 1 km because your role cannot see exact farm locations.</app-notice>}
      @if (!d['plots'].length) {<app-notice>No plots with GPS coordinates yet. Add a latitude and longitude to a plot (Farmers &amp; plots →
        farmer → plot) and it appears here.</app-notice>}
      <div class="map-kpis">
        <div class="map-kpi"><mat-icon>place</mat-icon><div><strong>{{ d['plots'].length }}</strong><span>of {{ d['total'] }} located plots</span></div></div>
        <div class="map-kpi"><mat-icon>verified</mat-icon><div><strong>{{ summary().practising }}</strong><span>with practice progress</span></div></div>
        <div class="map-kpi"><mat-icon>pest_control</mat-icon><div><strong>{{ summary().highRisk }}</strong><span>at high pest or climate risk</span></div></div>
        <div class="map-kpi"><mat-icon>satellite_alt</mat-icon><div><strong>{{ summary().ndvi }}</strong><span>with satellite greenness</span></div></div>
        <div class="map-kpi"><mat-icon>sensors</mat-icon><div><strong>{{ summary().sensors }}</strong><span>with a soil-moisture sensor</span></div></div>
      </div>
    }

    <div class="map-layout">
      <div class="map-stage">
        <app-map-view #mapView [plots]="plots()" [mode]="mode()" [threeD]="threeD()" [basemap]="basemap()" [columns]="columns()"
          [(autoRotate)]="rotating" [selectedId]="selected()?.['id'] ?? null" (plotClick)="select($event)" />
        <div class="map-float map-actions">
          <button mat-stroked-button type="button" [class.on]="rotating()" (click)="rotating.set(!rotating())"
            [attr.aria-pressed]="rotating()"><mat-icon>{{ rotating() ? 'pause_circle' : '360' }}</mat-icon>
            {{ rotating() ? 'Stop rotation' : 'Rotate' }}</button>
          @if (threeD()) {
            <button mat-stroked-button type="button" [class.on]="columns()" (click)="columns.set(!columns())"
              [attr.aria-pressed]="columns()"><mat-icon>bar_chart</mat-icon> 3D columns</button>
          }
          <button mat-stroked-button type="button" (click)="mapView.resetView()"><mat-icon>center_focus_strong</mat-icon> Reset view</button>
        </div>
        <div class="map-float map-legend">
          <div class="legend-title">{{ modeLabel() }}</div>
          @for (l of legend(); track l.key) {<div class="legend-row"><span class="dot" [style.background]="l.colour"></span>{{ l.label }}</div>}
          @if (threeD() && columns()) {<div class="legend-note">Column height follows the same scale</div>}
        </div>
      </div>

      <aside class="map-side">
        @if (selected(); as p) {
          <div class="plot-head" [style.--plot-colour]="colour(p)">
            <div class="plot-head-top">
              <span class="plot-dot"></span><h3>{{ p['plot_code'] }}</h3>
              @if (p['is_demo']) {<span class="badge tone-demo">DEMO</span>}
              <span class="spacer"></span>
              <button mat-icon-button type="button" (click)="mapView.flyTo(p)" aria-label="Zoom to plot"><mat-icon>my_location</mat-icon></button>
              <button mat-icon-button type="button" (click)="selected.set(null)" aria-label="Close"><mat-icon>close</mat-icon></button>
            </div>
            <a [routerLink]="['/farmers', p['farmer_id']]">{{ p['farmer_label'] }}</a>
            <div class="muted small">{{ p['village'] ?? '' }} {{ p['area_label'] ?? '' }}</div>
            <div class="plot-facts">
              <span><mat-icon>straighten</mat-icon>{{ num(p['area']) }} {{ p['area_unit'] }}</span>
              <span><mat-icon>local_cafe</mat-icon>{{ label(p['crop']) }}</span>
              <span><mat-icon>spa</mat-icon>{{ label(p['plantation_stage']) }}</span>
            </div>
          </div>
          <section class="info-card"><h5><mat-icon>task_alt</mat-icon>Practice progress</h5>
            <div>{{ label(p['practice_stage']) }} @for (c of counts(p); track c[0]) {<span class="muted"> · {{ label(c[0]) }} {{ c[1] }}</span>}</div>
          </section>
          <section class="info-card"><h5><mat-icon>partly_cloudy_day</mat-icon>Weather (latest estimate)</h5>
            @if (p['weather']; as w) {
              <div class="metric-trio">
                <div><strong>{{ num(w['rainfall_mm']) }}</strong><span>mm rain</span></div>
                <div><strong>{{ num(w['temp_min_c']) }}–{{ num(w['temp_max_c']) }}</strong><span>°C</span></div>
                <div><strong>{{ num(w['relative_humidity_pct']) }}</strong><span>% RH</span></div>
              </div>
              <div class="muted small">{{ w['observed_at'] | date: 'd MMM y' }} · {{ w['source_name'] }} @if (w['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>
            } @else {<div class="muted">No weather data – pull Open-Meteo or NASA POWER</div>}
          </section>
          <section class="info-card"><h5><mat-icon>umbrella</mat-icon>Forecast</h5>
            @if (p['forecast']; as f) {
              <div>Next {{ f['days'] }} days: rain {{ num(f['rainfall_mm']) }} mm, max {{ num(f['max_temp_c']) }} °C ({{ f['source_name'] }})</div>
            } @else {<div class="muted">No forecast – pull Open-Meteo</div>}
          </section>
          <section class="info-card"><h5><mat-icon>satellite_alt</mat-icon>Satellite greenness</h5>
            @if (p['ndvi']; as n) {
              <div class="ndvi"><strong>NDVI {{ num(n['index_value'], 2) }}</strong>
                <div class="ndvi-track"><span [style.width.%]="ndviPct(n['index_value'])"></span></div></div>
              <div class="muted small">{{ n['observed_at'] | date: 'd MMM y' }} · cloud {{ num(n['cloud_cover_pct'], 0) }} %</div>
            } @else {<div class="muted">No satellite data – pull Sentinel-2</div>}
          </section>
          <section class="info-card"><h5><mat-icon>warning_amber</mat-icon>Current risks</h5>
            @if (p['pest_risk']; as r) {<div>Pest: {{ label(r['pest_or_disease']) }} – <strong>{{ label(r['risk_level']) }}</strong> (to {{ r['valid_to'] }})
              @if (r['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>}
            @if (p['climate_risk']; as r) {<div>Climate: {{ label(r['hazard_type']) }} – <strong>{{ label(r['risk_level']) }}</strong> (to {{ r['valid_to'] }})
              @if (r['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>}
            @if (!p['pest_risk'] && !p['climate_risk']) {<div class="muted">No current risk estimate</div>}
          </section>
          <section class="info-card"><h5><mat-icon>water_drop</mat-icon>Soil moisture sensor</h5>
            @if (p['soil_moisture']; as s) {<div>{{ num(s['value']) }} {{ s['unit'] }} · {{ s['observed_at'] | date: 'd MMM, HH:mm' }}
              @if (s['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>
            } @else {<div class="muted">No sensor on this plot</div>}
          </section>
        } @else {
          <div class="side-empty">
            <mat-icon>touch_app</mat-icon>
            <h3>Click a point to see that plot</h3>
            <p class="muted small">Weather, satellite greenness, risks, sensor readings and practice progress appear here.</p>
            <ul class="tips">
              <li><mat-icon>view_in_ar</mat-icon><span><strong>3D terrain</strong> tilts the map over the hills</span></li>
              <li><mat-icon>3d_rotation</mat-icon><span><strong>Right-drag</strong> (or Ctrl + drag) to rotate and tilt; the compass resets north</span></li>
              <li><mat-icon>360</mat-icon><span><strong>Rotate</strong> orbits the camera – touch the map to stop</span></li>
              <li><mat-icon>bar_chart</mat-icon><span><strong>3D columns</strong> raise each plot by the colour scale</span></li>
            </ul>
          </div>
        }
      </aside>
    </div>`,
  styles: `
    .map-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    .map-toolbar mat-form-field { width: 260px; max-width: 100%; }
    .map-toolbar mat-button-toggle-group { border-radius: 10px; background: var(--surface); }
    .map-toolbar mat-button-toggle mat-icon { font-size: 18px; width: 18px; height: 18px; vertical-align: -4px; margin-right: 2px; }
    .map-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .map-kpi { display: flex; gap: 12px; align-items: center; padding: 12px 14px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 12px; }
    .map-kpi > mat-icon { flex: none; width: 38px; height: 38px; font-size: 22px; display: grid; place-items: center;
      border-radius: 10px; background: var(--mint); color: var(--brand); }
    .map-kpi strong { display: block; font-size: 1.3rem; font-weight: 600; color: var(--brand); line-height: 1.1; }
    .map-kpi span { font-size: 0.78rem; color: var(--muted); }
    .map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; }
    .map-stage { position: relative; height: clamp(520px, calc(100vh - 300px), 820px); border-radius: 16px; overflow: hidden;
      border: 1px solid var(--border); box-shadow: 0 18px 40px -24px rgba(0, 49, 27, 0.45); }
    .map-float { position: absolute; z-index: 2; background: rgba(255, 255, 255, 0.86); backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 12px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12); }
    .map-actions { top: 12px; left: 12px; display: flex; gap: 6px; flex-wrap: wrap; padding: 6px; max-width: calc(100% - 80px); }
    .map-actions button { background: var(--surface); }
    .map-actions button.on { background: var(--brand); color: #f3faf3; }
    .map-legend { left: 12px; bottom: 34px; padding: 10px 12px; min-width: 190px; }
    .legend-title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-text);
      margin-bottom: 6px; }
    .legend-row { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; padding: 1px 0; }
    .legend-note { margin-top: 6px; font-size: 0.74rem; color: var(--muted); }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex: none; box-shadow: 0 0 0 2px #fff; }
    .map-side { max-height: clamp(520px, calc(100vh - 300px), 820px); overflow: auto; display: flex; flex-direction: column; gap: 10px; }
    .side-empty { background: var(--surface); border: 1px dashed var(--border); border-radius: 14px; padding: 22px 18px; text-align: center; }
    .side-empty > mat-icon { width: 52px; height: 52px; font-size: 30px; display: grid; place-items: center; margin: 0 auto 8px;
      border-radius: 50%; background: var(--mint); color: var(--brand); }
    .side-empty h3 { margin-bottom: 4px; }
    .tips { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 10px; text-align: left; }
    .tips li { display: flex; gap: 10px; align-items: flex-start; font-size: 0.84rem; }
    .tips mat-icon { flex: none; color: var(--brand); font-size: 20px; width: 20px; height: 20px; }
    @media (max-width: 1000px) {
      .map-layout { grid-template-columns: minmax(0, 1fr); }
      .map-stage { height: 460px; }
      .map-side { max-height: none; }
      .map-toolbar mat-form-field { width: 100%; }
    }`,
})
export class PlotMapPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupsService);
  protected readonly view = viewChild.required(MapView);

  protected readonly modes = COLOUR_MODES;
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly programmeId = signal<string>('all');
  protected readonly mode = signal<ColourMode>('practice');
  protected readonly threeD = signal(false);
  protected readonly basemap = signal<Basemap>('streets');
  protected readonly columns = signal(true);
  protected readonly rotating = signal(false);
  protected readonly data = signal<Row | null>(null);
  protected readonly selected = signal<Row | null>(null);
  protected readonly plots = computed<Row[]>(() => this.data()?.['plots'] ?? []);
  protected readonly legend = computed(() => COLOUR_MODES.find((m) => m.value === this.mode())!.legend);
  protected readonly modeLabel = computed(() => COLOUR_MODES.find((m) => m.value === this.mode())!.label);
  protected readonly summary = computed(() => {
    const plots = this.plots();
    const high = (r: Row | undefined) => r?.['risk_level'] === 'high' || r?.['risk_level'] === 'very_high';
    return {
      practising: plots.filter((p) => p['practice_stage'] && p['practice_stage'] !== 'none').length,
      highRisk: plots.filter((p) => high(p['pest_risk']) || high(p['climate_risk'])).length,
      ndvi: plots.filter((p) => p['ndvi']).length,
      sensors: plots.filter((p) => p['soil_moisture']).length,
    };
  });
  protected readonly label = labelize;

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe((p) => this.programmes.set(p));
    this.load();
  }

  protected load(): void {
    const id = this.programmeId() === 'all' ? null : this.programmeId();
    this.selected.set(null);
    this.api.get<Row>('/map/plots', id ? { programme_id: id } : {}).subscribe((d) => this.data.set(d));
  }

  protected select(plot: Row): void {
    this.selected.set(plot);
    this.view().flyTo(plot);
  }

  protected colour(plot: Row): string {
    return markerColour(plot, this.mode());
  }

  protected ndviPct(value: unknown): number {
    const v = Number(value);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) * 100 : 0;
  }

  protected num(value: unknown, digits = 1): string {
    return value === null || value === undefined ? '–' : formatNumber(value, digits);
  }

  protected counts(plot: Row): [string, number][] {
    return Object.entries(plot['practices'] ?? {}) as [string, number][];
  }
}
