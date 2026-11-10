/*
 * Soil & microclimate – the platform's copy of FarmFuture's "Farm Insights" screen for one farm: the period picker, the
 * soil health cards per device, the weather condition cards and the field insights. FarmFuture's own data (GET only,
 * through /farm-health/{plot}/insights) and its own rules (crop thresholds, card statistics, field-insight stories copied
 * into ./ff and ../climate/ff), so the cards show what the FarmFuture app shows.
 */
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Notice, PageHeader } from '../../shared/page-header';
import { CROP_THRESHOLDS, resolveCropThresholdKeyFromLabel } from '../climate/ff/core/constants/crop-thresholds.config';
import { CORRELATION_STORIES, CorrelationStoryConfig, FarmInsightsEngineService } from './ff/farm-insights.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FarmOption { plot_id: string; label: string; crop: string | null }
interface Card { key: string; label: string; unit: string; mean: number; low: number; high: number; trend: string; optimal: string; status: string }

// Farm Insights soil cards: (GetFarmStats key, card key, label, unit, crop threshold key), in its order
const SOIL = [
  ['pH', 'ph', 'pH', '', 'ph'], ['nitrogen', 'nitrogen', 'Nitrogen', 'kg/ha', 'nitrogen'],
  ['phosphorous', 'phosphorous', 'Phosphorus', 'kg/ha', 'phosphorus'], ['potassium', 'potassium', 'Potassium', 'kg/ha', 'potassium'],
  ['soil_moisture_percentage_L1', 'soilMoisturePercentage1', 'Soil Moisture 1', '%', 'moisture'],
  ['soil_moisture_percentage_L2', 'soilMoisturePercentage2', 'Soil Moisture 2', '%', 'moisture'],
  ['temperature', 'temperature', 'Soil Temperature', 'deg C', 'temperature'], ['ec', 'electricalConductivity', 'EC', 'uS/cm', 'ec'],
] as const;
// Farm Insights weather cards (GetWeatherStats key, card key, label, unit, threshold key)
const WEATHER = [
  ['rainfall_mm', 'rainfall', 'Rainfall', 'mm', null], ['air_temperature_c', 'airTemperature', 'Temperature', 'deg C', 'temperature'],
  ['air_humidity_pct', 'airHumidity', 'Humidity', '%', 'humidity'], ['wind_speed_ms', 'windSpeed', 'Wind Speed', 'km/h', null],
  ['air_pressure_hpa', 'airPressure', 'Air Pressure', 'hPa', null], ['leaf_wetness', 'leafWetness', 'Leaf Wetness', '', null],
  ['lux', 'lux', 'Lux', 'lx', 'lux'],
] as const;
const PERIODS = [['7', 'Last 7 Days'], ['15', 'Last 15 Days'], ['30', 'Last 30 Days'], ['month', 'This Month'], ['last-month', 'Last Month']];
const COLOURS = ['#2196F3', '#0F5C3A', '#7ACB7C', '#FF9800', '#673AB7', '#EF5350'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(+v) ? +v : null);
const trendOf = (first: number, last: number): string => {
  const change = first !== 0 ? (last - first) / Math.abs(first) : last > 0 ? 1 : 0;
  return change > 0.02 ? 'Rising' : change < -0.02 ? 'Falling' : 'Stable';
};

@Component({
  selector: 'app-soil-page',
  imports: [PageHeader, Notice, DecimalPipe, RouterLink],
  template: `
    <app-page-header title="Soil & microclimate" subtitle="Soil and weather conditions at a glance – FarmFuture's Farm Insights for the farm" />
    <div class="tabs">
      <span class="tab active">Farm Insights</span>
      <a class="tab" routerLink="/devices">Sensors &amp; devices</a>
      <a class="tab" routerLink="/modules/soil">Soil records</a>
    </div>
    <div class="head-row">
      <label class="pick"><span>Farm</span>
        <select (change)="pickFarm($any($event.target).value)">
          @for (f of farms(); track f.plot_id) {<option [value]="f.plot_id" [selected]="f.plot_id === plotId()">{{ f.label }}</option>}
        </select></label>
    </div>

    <section class="hero">
      <div class="hero-text"><span class="eyebrow">Farm Insights</span><h2>{{ heroTitle() }}</h2><p>{{ heroText() }}</p></div>
      <div class="period">
        <span class="muted-light">Selected period</span><b>{{ periodLabel() }}</b>
        <select (change)="pickPeriod($any($event.target).value)">
          @for (p of periods; track p[0]) {<option [value]="p[0]" [selected]="p[0] === period()">{{ p[1] }}</option>}
          <option value="custom" [selected]="period() === 'custom'">Custom date range</option>
        </select>
        @if (period() === 'custom') {
          <div class="custom"><input type="date" [max]="today" [value]="start()" (change)="start.set($any($event.target).value)" />
            <input type="date" [max]="today" [value]="end()" (change)="end.set($any($event.target).value)" />
            <button type="button" (click)="apply()">Apply</button></div>
        }
      </div>
      <div class="counters">
        <div><b>{{ daysOfData() }}</b><span>Days of data</span></div>
        @if (soilDevices().length) {<div><b>{{ soilMetricCount() }}</b><span>Soil metrics</span></div>}
        @if (weatherDevices().length) {<div><b>{{ weatherMetricCount() }}</b><span>Weather metrics</span></div>}
      </div>
    </section>
    @if (loading()) {<p class="muted">Reading FarmFuture…</p>}
    @if (error()) {<app-notice kind="warning">{{ error() }}</app-notice>}

    @if (data()) {
      @if (soilDevices().length) {
        <section class="block">
          <div class="block-head"><div><h3>Soil health</h3><p class="muted">Core nutrient and soil condition metrics for the selected period.</p></div>
            @if (soilDevices().length > 1) {
              <label class="pick"><span>Device</span><select (change)="soilMac.set($any($event.target).value)">
                @for (d of soilDevices(); track d.macAddress; let i = $index) {<option [value]="d.macAddress" [selected]="d.macAddress === soilDevice()?.macAddress">{{ d.deviceName }} - {{ i + 1 }}</option>}
              </select></label>
            }</div>
          @if (soilCards().length) {
            <div class="metrics">
              @for (m of soilCards(); track m.key) {
                <div class="metric">
                  <div class="row"><span class="badge" [attr.data-s]="m.status">{{ m.status }}</span><span class="trend" [attr.data-t]="m.trend">{{ m.trend }}</span></div>
                  <div class="value">{{ m.mean | number: '1.0-2' }} <small>{{ m.unit }}</small></div>
                  <div class="label">{{ m.label }}</div>
                  <div class="range"><span>&#9889; Optimal: {{ m.optimal }}</span><span>Low: {{ m.low | number: '1.0-1' }} &middot; High: {{ m.high | number: '1.0-1' }}</span></div>
                </div>
              }</div>
          } @else {<p class="empty">No soil readings available for this device in the selected period.</p>}
        </section>
      }
      @if (weatherDevices().length) {
        <section class="block">
          <div class="block-head"><div><h3>Weather conditions</h3><p class="muted">Ambient conditions that can influence irrigation, crop stress, and field operations.</p></div>
            @if (weatherDevices().length > 1) {
              <label class="pick"><span>Device</span><select (change)="weatherMac.set($any($event.target).value)">
                @for (d of weatherDevices(); track d.macAddress; let i = $index) {<option [value]="d.macAddress" [selected]="d.macAddress === weatherDevice()?.macAddress">{{ d.deviceName }} -  {{ i + 1 }} - {{ d.macAddress }}</option>}
              </select></label>
            }</div>
          @if (weatherCards().length) {
            <div class="metrics">@for (m of weatherCards(); track m.key) {
              <div class="metric">
                <div class="row"><span class="badge" [attr.data-s]="m.status">{{ m.status }}</span><span class="trend" [attr.data-t]="m.trend">{{ m.trend }}</span></div>
                <div class="value">{{ m.mean | number: '1.0-2' }} <small>{{ m.unit }}</small></div>
                <div class="label">{{ m.label }}</div>
                <div class="range"><span>&#9889; Optimal: {{ m.optimal }}</span><span>Low: {{ m.low | number: '1.0-1' }} &middot; High: {{ m.high | number: '1.0-1' }}</span></div>
              </div>}</div>
          } @else {<p class="empty">No weather readings available for this device in the selected period.</p>}
        </section>
      }
      @if (stories().length) {
        <section class="block"><h3>Field insights</h3>
          <p class="muted">Plain-language prompts to help connect sensor readings with likely field outcomes.</p>
          <div class="stories">
            @for (s of stories(); track s.type) {
              <button type="button" class="story" [class.on]="story()?.type === s.type" (click)="story.set(story()?.type === s.type ? null : s)">
                <span class="ic" [style.color]="s.color"><i class="material-icons">{{ s.icon }}</i></span>
                <span><small>{{ s.question }}</small><b>{{ s.title }}</b></span></button>
            }
          </div>
          @if (detail(); as d) {
            <div class="insight">
              <span class="eyebrow">Field insight</span><h3>{{ d.story.title }}</h3><p class="muted">{{ d.story.question }} &middot; Selected period : {{ periodLabel() }}</p>
              <div class="note" [style.border-color]="d.story.color + '33'" [style.background]="d.story.color + '12'">
                <i class="material-icons" [style.color]="d.story.color">{{ d.story.icon }}</i> {{ d.story.impactStatement }}</div>
              <div class="cols">
                <div class="chart-card"><b>Parameter relationships</b>
                  <p class="muted small">Relative trends are normalized to a 0-100 scale so different parameters can be compared on one chart.</p>
                  @if (d.dates.length) {
                    <svg viewBox="0 0 600 240" class="chart">
                      @for (t of [0, 25, 50, 75, 100]; track t) {
                        <line x1="40" [attr.y1]="210 - t * 1.9" x2="590" [attr.y2]="210 - t * 1.9" class="grid" />
                        <text x="34" [attr.y]="214 - t * 1.9" text-anchor="end">{{ t }}%</text>}
                      @for (s of d.series; track s.key) {<polyline [attr.points]="s.points" fill="none" [attr.stroke]="s.colour" stroke-width="2" />}
                      @for (x of d.labels; track x.i) {<text [attr.x]="x.x" y="232" text-anchor="middle">{{ x.text }}</text>}
                    </svg>
                    <div class="keys">@for (s of d.series; track s.key) {<span><i [style.background]="s.colour"></i>{{ s.label }}</span>}</div>
                  } @else {<p class="muted">Not enough data is available for the selected relationship in this period.</p>}
                </div>
                <div class="chart-card"><b>Average values</b><p class="muted small">Average period values for the parameters involved in this relationship.</p>
                  @for (s of d.series; track s.key) {<div class="avg"><i [style.background]="s.colour"></i><span>{{ s.label }}</span>
                    <b>{{ s.avg === null ? '—' : (s.avg | number: '1.0-2') }} {{ s.unit }}</b></div>}
                </div>
              </div>
            </div>
          }
        </section>
      }
    }
    <p class="muted small">Read live from FarmFuture (GET only), worked out with FarmFuture's own Farm Insights rules (crop: {{ cropName() }});
      nothing is stored here. Optimal ranges are FarmFuture's crop thresholds.</p>
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tab { padding: 8px 18px; border-radius: 999px; border: 1px solid #0f3d24; color: #0f3d24; text-decoration: none; font-weight: 500; }
    .tab.active { background: #0f3d24; color: #fff; }
    .head-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .pick { display: flex; align-items: center; gap: 6px; background: var(--surface-2, #f1f5f1); border-radius: 999px; padding: 6px 14px; }
    .pick span { color: var(--muted); font-size: .85rem; }
    .pick select { border: 0; background: transparent; font: inherit; font-weight: 600; }
    .hero { background: linear-gradient(135deg, #103c28, #175738); color: #fff; border-radius: 24px; padding: 22px 26px; display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; margin-bottom: 18px; }
    .hero .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; opacity: .8; }
    .hero h2 { margin: 6px 0; } .hero p { opacity: .85; margin: 0; }
    .period { background: rgba(255,255,255,.1); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
    .period select, .custom input, .custom button { font: inherit; border-radius: 999px; border: 0; padding: 4px 12px; }
    .custom { display: flex; gap: 6px; flex-wrap: wrap; }
    .muted-light { opacity: .75; font-size: .85rem; }
    .counters { grid-column: 1 / -1; display: flex; gap: 12px; }
    .counters div { background: rgba(255,255,255,.1); border-radius: 14px; padding: 10px 16px; display: flex; flex-direction: column; }
    .counters b { font-size: 1.5rem; }
    .block { margin-bottom: 18px; }
    .block-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
    .block h3 { color: #183727; margin: 0; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }
    .metric { background: #fff; border: 1px solid #e3e9e4; border-radius: 18px; padding: 14px; }
    .row { display: flex; justify-content: space-between; align-items: center; }
    .badge { border-radius: 12px; padding: 2px 8px; font-size: 10px; font-weight: 700; background: rgba(76,175,80,.1); color: #2E7D32; }
    .badge[data-s="LOW"] { background: rgba(255,152,0,.1); color: #F57C00; }
    .badge[data-s="HIGH"] { background: rgba(244,67,54,.1); color: #D32F2F; }
    .trend { font-size: .8rem; color: #757575; } .trend[data-t="Rising"] { color: #E53935; } .trend[data-t="Falling"] { color: #1E88E5; }
    .value { font-size: 30px; font-weight: 800; color: #111827; margin-top: 8px; } .value small { font-size: .9rem; color: #757575; font-weight: 500; }
    .label { font-weight: 700; color: #2c3e50; font-size: 15px; }
    .range { background: #f1f8e9; border-radius: 10px; padding: 6px 8px; margin-top: 8px; display: flex; flex-direction: column; font-size: .8rem; color: #33691E; }
    .range span:last-child { color: #999; }
    .empty { border: 1px dashed #c9d4cc; border-radius: 14px; padding: 16px; color: var(--muted); }
    .stories { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
    .story { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid #e3e9e4; border-radius: 18px; padding: 12px; cursor: pointer; text-align: left; }
    .story.on { border-color: #0f3d24; box-shadow: 0 0 0 2px #0f3d2422; }
    .story .ic { width: 48px; height: 48px; border-radius: 12px; background: #f4f7f3; display: grid; place-items: center; flex: none; }
    .story small { display: block; text-transform: uppercase; font-size: .72rem; color: #6b7d72; letter-spacing: .03em; }
    .story b { color: #1f3428; }
    .insight { margin-top: 14px; background: #fff; border: 1px solid #e3e9e4; border-radius: 18px; padding: 16px 18px; }
    .insight .eyebrow { text-transform: uppercase; font-size: .72rem; color: var(--muted); letter-spacing: .06em; }
    .insight h3 { margin: 4px 0; }
    .note { border: 1px solid; border-radius: 14px; padding: 10px 14px; display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; }
    .cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; }
    .chart-card { border: 1px solid #e3e9e4; border-radius: 14px; padding: 12px; }
    .chart { width: 100%; height: auto; }
    .chart .grid { stroke: #e8eee9; } .chart text { font-size: 10px; fill: #6b7c72; }
    .keys { display: flex; flex-wrap: wrap; gap: 12px; font-size: .8rem; }
    .keys i, .avg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
    .avg { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .avg span { flex: 1; }
    @media (max-width: 1100px) { .metrics, .stories { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero, .cols { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class SoilPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engine = inject(FarmInsightsEngineService);
  protected readonly periods = PERIODS;
  protected readonly today = iso(new Date());
  protected readonly farms = signal<FarmOption[]>([]);
  protected readonly plotId = signal<string | null>(null);
  protected readonly data = signal<any | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly period = signal('7');
  protected readonly start = signal(iso(new Date(Date.now() - 6 * 86400000)));
  protected readonly end = signal(this.today);
  protected readonly soilMac = signal<string | null>(null);
  protected readonly weatherMac = signal<string | null>(null);
  protected readonly story = signal<CorrelationStoryConfig | null>(null);

  protected readonly cropName = computed(() => {
    const c = this.data()?.crop as string | null;
    return c === 'mixed' ? 'Coffee-Arabica' : c ? `Coffee-${c[0].toUpperCase()}${c.slice(1)}` : 'Coffee';
  });
  private readonly ranges = computed(() => (CROP_THRESHOLDS as any)[resolveCropThresholdKeyFromLabel(this.cropName())] ?? {});
  protected readonly soilDevices = computed(() => (this.data()?.sensor_devices ?? []) as any[]);
  protected readonly weatherDevices = computed(() => (this.data()?.weather_devices ?? []) as any[]);
  protected readonly soilDevice = computed(() => this.soilDevices().find((d) => d.macAddress === this.soilMac()) ?? this.soilDevices()[0] ?? null);
  protected readonly weatherDevice = computed(() => this.weatherDevices().find((d) => d.macAddress === this.weatherMac()) ?? this.weatherDevices()[0] ?? null);
  private readonly weatherStats = computed(() => {
    const mac = this.weatherDevice()?.macAddress;
    return (mac ? this.data()?.weather_stats?.[mac]?.stats : null) ?? {};
  });
  protected readonly heroTitle = computed(() => {
    const s = this.soilDevices().length > 0, w = this.weatherDevices().length > 0;
    return s && w ? 'Monitor soil and weather conditions at a glance.' : s ? 'Monitor soil conditions at a glance.'
      : w ? 'Monitor weather conditions at a glance.' : 'Monitor available farm insights at a glance.';
  });
  protected readonly heroText = computed(() => this.soilDevices().length || this.weatherDevices().length
    ? 'Review the latest field metrics, spot unusual values early, and open any metric for a deeper trend analysis.'
    : 'This farm does not have active soil or weather devices yet.');
  protected readonly periodLabel = computed(() => {
    const s = new Date(this.data()?.start ?? this.start()), e = new Date(this.data()?.end ?? this.end());
    const m = (d: Date) => d.toLocaleString('en-US', { month: 'short' });
    return `${s.getDate()} ${m(s)} - ${e.getDate()} ${m(e)} ${e.getFullYear()}`;
  });
  protected readonly daysOfData = computed(() => {
    const days = new Set<string>();
    for (const d of [...this.soilDevices(), ...this.weatherDevices()]) Object.keys(d.stats ?? {}).forEach((k) => days.add(k));
    return days.size;
  });
  protected readonly soilMetricCount = computed(() => {
    const keys = new Set<string>();
    Object.values<any>(this.soilDevice()?.stats ?? {}).forEach((day) => Object.keys(day ?? {}).forEach((k) => keys.add(k)));
    return keys.size;
  });
  protected readonly weatherMetricCount = computed(() => {
    const keys = new Set<string>();
    Object.values<any>(this.weatherStats()).forEach((day) => Object.keys(day ?? {}).forEach((k) => keys.add(k)));
    return keys.size;
  });
  /** Soil cards: mean of the daily means; Low / High the lowest and highest daily mean; ±2 % trend. */
  protected readonly soilCards = computed((): Card[] => {
    const stats = this.soilDevice()?.stats ?? {}, days = Object.keys(stats).sort();
    return SOIL.map(([apiKey, key, label, unit, threshold]) => {
      const means = days.map((d) => { const s = stats[d]?.[apiKey]; return num(s?.mean ?? s?.avg); }).filter((v): v is number => v !== null);
      return means.length ? this.card(key, label, unit, threshold, means, Math.min(...means), Math.max(...means), means) : null;
    }).filter((c): c is Card => !!c);
  });
  /** Weather cards: mean of the daily averages (rainfall too); Low / High the lowest daily min and highest daily max. */
  protected readonly weatherCards = computed((): Card[] => {
    const stats = this.weatherStats(), days = Object.keys(stats).sort();
    return WEATHER.map(([apiKey, key, label, unit, threshold]) => {
      const avgs: number[] = [], mins: number[] = [], maxs: number[] = [], trend: number[] = [];
      for (const d of days) {
        const raw = stats[d]?.[apiKey];
        if (raw === undefined || raw === null) continue;
        const v = typeof raw === 'number' ? { last: raw } : raw;
        const a = num(v.avg ?? v.mean ?? v.average ?? v.last), lo = num(v.min ?? v.minimum ?? v.last), hi = num(v.max ?? v.maximum ?? v.last);
        const t = num(v.avg ?? v.mean ?? v.last ?? v.total);
        if (a !== null) avgs.push(a);
        if (lo !== null) mins.push(lo);
        if (hi !== null) maxs.push(hi);
        if (t !== null) trend.push(t);
      }
      return avgs.length ? this.card(key, label, unit, threshold, avgs, Math.min(...mins), Math.max(...maxs), trend) : null;
    }).filter((c): c is Card => !!c);
  });
  /** The field-insight tiles this farm's devices can answer (soil, weather or both), in FarmFuture's order. */
  protected readonly stories = computed(() => {
    const soil = this.soilDevices().length > 0, weather = this.weatherDevices().length > 0;
    return CORRELATION_STORIES.filter((s) => {
      const needSoil = !!s.soilParams?.length, needWeather = !!s.weatherParams?.length;
      return (!needSoil || soil) && (!needWeather || weather);
    });
  });
  /** A field insight: every related parameter's daily series, min–max normalised to 0–100, and its period average. */
  protected readonly detail = computed(() => {
    const story = this.story();
    if (!story) return null;
    const weatherDevice = this.weatherDevice();
    const merged: Record<string, any> = { ...(weatherDevice?.stats ?? {}) };
    for (const [day, values] of Object.entries<any>(this.weatherStats())) merged[day] = { ...(merged[day] ?? {}), ...values };
    const series = this.engine.buildDailyMetricSeries({ sensorDevices: this.soilDevices(),
      weatherDevices: weatherDevice ? [{ ...weatherDevice, stats: merged }] : [] });
    const params = [...new Set([...(story.weatherParams ?? []), ...(story.soilParams ?? [])])];
    const dates = series.dates;
    const step = dates.length > 1 ? 520 / (dates.length - 1) : 0;
    const lines = params.map((key, i) => {
      const values = dates.map((d) => series.metrics[key]?.[d] ?? null);
      const real = values.filter((v): v is number => v !== null);
      const lo = Math.min(...real), hi = Math.max(...real);
      const norm = values.map((v) => (v === null ? null : hi === lo ? 50 : Math.round(((v - lo) / (hi - lo)) * 10000) / 100));
      const info = this.engine.getDisplayInfo(key);
      return { key, label: info.label, unit: info.unit, colour: COLOURS[i % COLOURS.length],
        avg: real.length ? real.reduce((a, b) => a + b, 0) / real.length : null,
        points: norm.map((v, j) => (v === null ? null : `${40 + j * step},${210 - v * 1.9}`)).filter(Boolean).join(' ') };
    }).filter((l) => l.avg !== null || l.points);
    const every = Math.max(1, Math.ceil(dates.length / 8));
    const labels = dates.map((d, i) => ({ i, x: 40 + i * step, text: new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) }))
      .filter((l) => l.i % every === 0);
    return { story, dates, series: lines, labels };
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
    this.soilMac.set(null);
    this.weatherMac.set(null);
    this.load(plotId);
  }

  /** FarmFuture's period choices: the last N days end today; this month from the 1st; last month in full. */
  protected pickPeriod(value: string): void {
    this.period.set(value);
    if (value === 'custom') return;
    const now = new Date();
    if (value === 'month') { this.start.set(iso(new Date(now.getFullYear(), now.getMonth(), 1))); this.end.set(iso(now)); }
    else if (value === 'last-month') {
      this.start.set(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      this.end.set(iso(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else { this.start.set(iso(new Date(now.getTime() - (+value - 1) * 86400000))); this.end.set(iso(now)); }
    this.apply();
  }

  protected apply(): void {
    if (this.start() > this.end()) { this.error.set('Start date must be before or equal to End date.'); return; }
    const plot = this.plotId();
    if (plot) this.load(plot);
  }

  private card(key: string, label: string, unit: string, threshold: string | null, values: number[], low: number, high: number,
               trend: number[]): Card {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const range = threshold ? this.ranges()[threshold] as [number, number] | undefined : undefined;
    return { key, label, unit, mean, low, high, trend: trend.length > 1 ? trendOf(trend[0], trend[trend.length - 1]) : 'Stable',
      optimal: range ? `${range[0]} - ${range[1]}` : 'N/A',
      status: range ? (mean < range[0] ? 'LOW' : mean > range[1] ? 'HIGH' : 'OPTIMAL') : 'OPTIMAL' };
  }

  private load(plotId: string): void {
    this.plotId.set(plotId);
    this.data.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.api.get<any>(`/farm-health/${plotId}/insights`, { start: this.start(), end: this.end() }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.error?.message ?? 'FarmFuture could not be read just now.'); },
    });
  }
}
