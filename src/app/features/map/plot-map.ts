import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';

import { ApiService } from '../../core/api.service';
import { formatNumber, labelize } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Programme, Row } from '../../core/models';
import { Notice, PageHeader } from '../../shared/page-header';

export type ColourMode = 'practice' | 'pest' | 'climate' | 'ndvi' | 'rain';

interface LegendItem { key: string; label: string; colour: string }

const NO_DATA: LegendItem = { key: 'none', label: 'No data', colour: '#9e9e9e' };
const RISK: LegendItem[] = [
  { key: 'low', label: 'Low', colour: '#43a047' }, { key: 'moderate', label: 'Moderate', colour: '#f9a825' },
  { key: 'high', label: 'High', colour: '#ef6c00' }, { key: 'very_high', label: 'Very high', colour: '#c62828' }, NO_DATA,
];

export const COLOUR_MODES: { value: ColourMode; label: string; legend: LegendItem[] }[] = [
  { value: 'practice', label: 'Practice progress (farmer)', legend: [
    { key: 'verified', label: 'Verified', colour: '#1b5e20' }, { key: 'observed', label: 'Observed', colour: '#43a047' },
    { key: 'reported', label: 'Reported', colour: '#f9a825' }, { key: 'recommended', label: 'Recommended', colour: '#fb8c00' },
    { key: 'none', label: 'No practice yet', colour: '#9e9e9e' }] },
  { value: 'pest', label: 'Current pest & disease risk', legend: RISK },
  { value: 'climate', label: 'Current climate risk', legend: RISK },
  { value: 'ndvi', label: 'Satellite greenness (NDVI)', legend: [
    { key: 'dense', label: '≥ 0.6 dense green canopy', colour: '#1b5e20' }, { key: 'moderate', label: '0.4 – 0.6', colour: '#7cb342' },
    { key: 'sparse', label: '0.2 – 0.4', colour: '#d4e157' }, { key: 'bare', label: '< 0.2 little vegetation', colour: '#a1887f' }, NO_DATA] },
  { value: 'rain', label: 'Forecast rain, next days (total)', legend: [
    { key: 'r100', label: '≥ 100 mm', colour: '#0d47a1' }, { key: 'r50', label: '50 – 100 mm', colour: '#1e88e5' },
    { key: 'r10', label: '10 – 50 mm', colour: '#64b5f6' }, { key: 'r0', label: '< 10 mm', colour: '#bbdefb' }, NO_DATA] },
];

/** Legend key a plot falls into for the chosen colour mode. */
export function legendKey(plot: Row, mode: ColourMode): string {
  switch (mode) {
    case 'practice': return plot['practice_stage'] ?? 'none';
    case 'pest': return plot['pest_risk']?.['risk_level'] ?? 'none';
    case 'climate': return plot['climate_risk']?.['risk_level'] ?? 'none';
    case 'ndvi': {
      const v = plot['ndvi']?.['index_value'];
      if (v === undefined || v === null) return 'none';
      return v >= 0.6 ? 'dense' : v >= 0.4 ? 'moderate' : v >= 0.2 ? 'sparse' : 'bare';
    }
    case 'rain': {
      const v = plot['forecast']?.['rainfall_mm'];
      if (v === undefined || v === null) return 'none';
      return v >= 100 ? 'r100' : v >= 50 ? 'r50' : v >= 10 ? 'r10' : 'r0';
    }
  }
}

export function markerColour(plot: Row, mode: ColourMode): string {
  const legend = COLOUR_MODES.find((m) => m.value === mode)!.legend;
  return (legend.find((l) => l.key === legendKey(plot, mode)) ?? NO_DATA).colour;
}

@Component({
  selector: 'app-plot-map',
  imports: [PageHeader, Notice, FormsModule, MatFormFieldModule, MatSelectModule, RouterLink, DatePipe],
  template: `
    <app-page-header title="Farm map" subtitle="Plots with GPS coordinates – weather, satellite greenness, risks, sensors and practice progress" />
    <div class="map-controls">
      <mat-form-field><mat-label>Programme</mat-label>
        <mat-select [ngModel]="programmeId()" (ngModelChange)="programmeId.set($event); load()">
          <mat-option value="all">All programmes</mat-option>
          @for (p of programmes(); track p.id) {<mat-option [value]="p.id">{{ p.code }} – {{ p.name }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-form-field><mat-label>Colour by</mat-label>
        <mat-select [ngModel]="mode()" (ngModelChange)="mode.set($event)">
          @for (m of modes; track m.value) {<mat-option [value]="m.value">{{ m.label }}</mat-option>}
        </mat-select>
      </mat-form-field>
      @if (data(); as d) {<span class="muted">{{ d['plots'].length }} of {{ d['total'] }} located plots</span>}
    </div>
    @if (data(); as d) {
      @if (!d['precise_locations']) {<app-notice>Points are rounded to about 1 km because your role cannot see exact farm locations.</app-notice>}
      @if (!d['plots'].length) {<app-notice>No plots with GPS coordinates yet. Add a latitude and longitude to a plot (Farmers &amp; plots →
        farmer → plot) and it appears here.</app-notice>}
    }
    <div class="map-layout">
      <div #mapEl class="map-canvas"></div>
      <aside class="panel map-side">
        <h4>Legend</h4>
        @for (l of legend(); track l.key) {<div class="legend-row"><span class="dot" [style.background]="l.colour"></span>{{ l.label }}</div>}
        @if (selected(); as p) {
          <h4>{{ p['plot_code'] }} @if (p['is_demo']) {<span class="badge tone-demo">DEMO</span>}</h4>
          <div><a [routerLink]="['/farmers', p['farmer_id']]">{{ p['farmer_label'] }}</a></div>
          <div class="muted">{{ p['village'] ?? '' }} {{ p['area_label'] ?? '' }}</div>
          <div class="muted">{{ num(p['area']) }} {{ p['area_unit'] }} · {{ label(p['crop']) }} · {{ label(p['plantation_stage']) }}</div>
          <h5>Practice progress</h5>
          <div>{{ label(p['practice_stage']) }} @for (c of counts(p); track c[0]) {<span class="muted"> · {{ label(c[0]) }} {{ c[1] }}</span>}</div>
          <h5>Weather (latest estimate)</h5>
          @if (p['weather']; as w) {
            <div>{{ w['observed_at'] | date: 'd MMM y' }} · {{ w['source_name'] }} @if (w['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>
            <div>Rain {{ num(w['rainfall_mm']) }} mm · {{ num(w['temp_min_c']) }}–{{ num(w['temp_max_c']) }} °C · RH {{ num(w['relative_humidity_pct']) }} %</div>
          } @else {<div class="muted">No weather data – pull Open-Meteo or NASA POWER</div>}
          <h5>Forecast</h5>
          @if (p['forecast']; as f) {
            <div>Next {{ f['days'] }} days: rain {{ num(f['rainfall_mm']) }} mm, max {{ num(f['max_temp_c']) }} °C ({{ f['source_name'] }})</div>
          } @else {<div class="muted">No forecast – pull Open-Meteo</div>}
          <h5>Satellite greenness</h5>
          @if (p['ndvi']; as n) {
            <div>NDVI {{ num(n['index_value'], 2) }} · {{ n['observed_at'] | date: 'd MMM y' }} · cloud {{ num(n['cloud_cover_pct'], 0) }} %</div>
          } @else {<div class="muted">No satellite data – pull Sentinel-2</div>}
          <h5>Current risks</h5>
          @if (p['pest_risk']; as r) {<div>Pest: {{ label(r['pest_or_disease']) }} – {{ label(r['risk_level']) }} (to {{ r['valid_to'] }})
            @if (r['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>}
          @if (p['climate_risk']; as r) {<div>Climate: {{ label(r['hazard_type']) }} – {{ label(r['risk_level']) }} (to {{ r['valid_to'] }})
            @if (r['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>}
          @if (!p['pest_risk'] && !p['climate_risk']) {<div class="muted">No current risk estimate</div>}
          <h5>Soil moisture sensor</h5>
          @if (p['soil_moisture']; as s) {<div>{{ num(s['value']) }} {{ s['unit'] }} · {{ s['observed_at'] | date: 'd MMM, HH:mm' }}
            @if (s['is_demo']) {<span class="badge tone-demo">DEMO</span>}</div>
          } @else {<div class="muted">No sensor on this plot</div>}
        } @else {<p class="muted">Click a point to see that plot.</p>}
      </aside>
    </div>`,
  styles: `
    .map-controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }
    .map-controls mat-form-field { width: 300px; max-width: 100%; }
    .map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; }
    .map-canvas { height: 600px; border-radius: 8px; z-index: 0; }
    .map-side { max-height: 600px; overflow: auto; }
    .map-side h4 { margin: 4px 0 8px; } .map-side h5 { margin: 12px 0 2px; }
    .legend-row { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid #0003; }
    .muted { opacity: 0.7; }
    @media (max-width: 900px) { .map-layout { grid-template-columns: 1fr; } .map-canvas { height: 420px; } }`,
})
export class PlotMapPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupsService);
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map: L.Map | null = null;
  private readonly layer = L.layerGroup();
  private fitted = false;

  protected readonly modes = COLOUR_MODES;
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly programmeId = signal<string>('all');
  protected readonly mode = signal<ColourMode>('practice');
  protected readonly data = signal<Row | null>(null);
  protected readonly selected = signal<Row | null>(null);
  protected readonly legend = () => COLOUR_MODES.find((m) => m.value === this.mode())!.legend;
  protected readonly label = labelize;

  constructor() {
    effect(() => this.draw(this.data(), this.mode()));
  }

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe((p) => this.programmes.set(p));
    this.load();
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement, { center: [21, 85], zoom: 5 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.layer.addTo(this.map);
    this.draw(this.data(), this.mode());
    setTimeout(() => this.map?.invalidateSize());
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  protected load(): void {
    const id = this.programmeId() === 'all' ? null : this.programmeId();
    this.fitted = false;
    this.selected.set(null);
    this.api.get<Row>('/map/plots', id ? { programme_id: id } : {}).subscribe((d) => this.data.set(d));
  }

  protected num(value: unknown, digits = 1): string {
    return value === null || value === undefined ? '–' : formatNumber(value, digits);
  }

  protected counts(plot: Row): [string, number][] {
    return Object.entries(plot['practices'] ?? {}) as [string, number][];
  }

  private draw(data: Row | null, mode: ColourMode): void {
    if (!this.map) return;
    this.layer.clearLayers();
    const plots: Row[] = data?.['plots'] ?? [];
    for (const plot of plots) {
      const marker = L.circleMarker([plot['latitude'], plot['longitude']], {
        radius: 8, weight: 1, color: '#263238', fillColor: markerColour(plot, mode), fillOpacity: 0.9,
      });
      const tip = document.createElement('span');
      tip.textContent = `${plot['plot_code']} – ${plot['farmer_label']}`;  // text only: names are user data
      marker.bindTooltip(tip);
      marker.on('click', () => this.selected.set(plot));
      marker.addTo(this.layer);
    }
    if (plots.length && !this.fitted) {
      this.map.fitBounds(L.latLngBounds(plots.map((p) => [p['latitude'], p['longitude']] as L.LatLngTuple)), { padding: [30, 30], maxZoom: 13 });
      this.fitted = true;
    }
  }
}
