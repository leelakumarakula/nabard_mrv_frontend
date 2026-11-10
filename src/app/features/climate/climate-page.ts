/*
 * Climate & early warning – the platform's copy of FarmFuture's climate screens for one farm: the dashboard's crop-stage
 * card, "Your weather station" and "Rain from your station" cards and weather advice, Farm Insights' "Weather conditions"
 * cards, and the Missing Rain Report. Worked out with FarmFuture's own code (copied unchanged into ./ff) on FarmFuture's
 * data (GET only, through /farm-health/{plot}/climate), so the figures match the FarmFuture app.
 */
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Notice, PageHeader } from '../../shared/page-header';
import { CROP_THRESHOLDS, resolveCropThresholdKeyFromLabel } from './ff/core/constants/crop-thresholds.config';
import { buildFarmAdvice } from './ff/user/pages/dashboard/farm-today/farm-today-advice.util';
import { buildCropProfile, coffeeStage, coffeeWatchTopics } from './ff/user/pages/dashboard/farm-today/coffee-profile.util';
import { buildSeasonSummary } from './ff/user/pages/dashboard/farm-today/season-summary.util';
import {
  analysePeriod, buildMonthlyRows, buildSeasonalRows, dateKey, fmtDateLong, keyToDate, toNum,
} from './ff/user/pages/dashboard/rainfall-deficit/rainfall-deficit.calc';
import { MONTH_NAMES, SEASON_PRESETS } from './ff/user/pages/dashboard/rainfall-deficit/rainfall-deficit.config';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FarmOption { plot_id: string; label: string; crop: string | null }

// The Missing Rain Report's words and badge colours per status (rainfall-deficit component).
const STATUS: Record<string, { text: string; bg: string; fg: string }> = {
  above: { text: 'Extra rain', bg: '#e4f4e6', fg: '#10682a' },
  normal: { text: 'Usual rain', bg: '#eaf5ea', fg: '#008000' },
  mod: { text: 'Little less rain', bg: '#fff4e0', fg: '#a35c00' },
  sig: { text: 'Much less rain', bg: '#ffeadf', fg: '#b4531a' },
  severe: { text: 'Very much less rain', bg: '#fdeaea', fg: '#a51f14' },
  upcoming: { text: 'Upcoming', bg: '#f1f3f1', fg: '#696c79' },
  nodata: { text: 'No data', bg: '#f4f2ec', fg: '#7a6f52' },
};
// Farm Insights "Weather conditions" cards, in its order: (stats key, label, unit, crop threshold key)
const WEATHER_CARDS = [
  { key: 'rainfall_mm', label: 'Rainfall', unit: 'mm', threshold: null },
  { key: 'air_temperature_c', label: 'Temperature', unit: 'deg C', threshold: 'temperature' },
  { key: 'air_humidity_pct', label: 'Humidity', unit: '%', threshold: 'humidity' },
  { key: 'wind_speed_ms', label: 'Wind Speed', unit: 'km/h', threshold: null },  // FarmFuture labels the m/s series km/h
  { key: 'air_pressure_hpa', label: 'Air Pressure', unit: 'hPa', threshold: null },
  { key: 'leaf_wetness', label: 'Leaf Wetness', unit: '', threshold: null },
  { key: 'lux', label: 'Lux', unit: 'lx', threshold: 'lux' },
] as const;
const ICONS: Record<string, string> = { Clear: 'wb_sunny', Clouds: 'cloud', Rain: 'rainy', Drizzle: 'grain', Thunderstorm: 'thunderstorm' };
const LEVEL_TONE: Record<string, string> = { urgent: 'act', attention: 'watch', info: 'info', good: 'good' };

@Component({
  selector: 'app-climate-page',
  imports: [PageHeader, Notice, DecimalPipe, RouterLink],
  template: `
    <app-page-header title="Climate & early warning"
      subtitle="The farm's weather station, forecast, rain against the 30-year usual and weather warnings – as the FarmFuture app shows them" />
    <div class="tabs">
      <span class="tab active">Farm weather &amp; rain</span>
      <a class="tab" routerLink="/modules/climate">Climate records</a>
    </div>
    <div class="head-row">
      <label class="pick"><span>Farm</span>
        <select (change)="pickFarm($any($event.target).value)">
          @for (f of farms(); track f.plot_id) {<option [value]="f.plot_id" [selected]="f.plot_id === plotId()">{{ f.label }}</option>}
        </select></label>
    </div>
    @if (loading()) {<p class="muted">Reading FarmFuture – weather stations, rain this year, the 30-year climate and the forecast…</p>}
    @if (error()) {<app-notice kind="warning">{{ error() }}</app-notice>}

    @if (data()) {
      <div class="grid2">
        <section class="card stage">
          <div class="row"><span class="eyebrow">{{ profile().label }} &middot; {{ monthName() }}</span></div>
          <h2>{{ stage().short }}</h2>
          <div class="row"><b>Watch for this month</b><a [routerLink]="['/pest-forecast']" [queryParams]="{ plot: plotId() }">Pest &amp; disease forecast &rarr;</a></div>
          <div class="watch">
            @for (w of watch(); track w.topic) {
              <a class="watch-item" [routerLink]="['/pest-forecast']" [queryParams]="{ plot: plotId() }"><b>{{ w.title }}</b><span>{{ w.message }}</span></a>
            }
          </div>
          @if (rain(); as r) {
            <div class="rain-card">
              <div class="row"><span class="eyebrow">Rain from your station</span><a href="#rain-report">Rain report &rarr;</a></div>
              <div class="big">{{ r.station.seasonMm | number: '1.0-0' }} <small>mm</small></div>
              @if (r.station.monthIsSeason) {<p>in {{ r.monthName }} &middot; this {{ r.name }} season, {{ r.monthsLabel }}</p>}
              @else {<p>this {{ r.name }} season &middot; {{ r.monthsLabel }}</p><p><b>{{ r.station.monthMm | number: '1.0-0' }} mm in {{ r.monthName }}</b></p>}
              <div class="tiles">
                <div><span>Last 7 days</span><b>{{ r.station.last7Mm | number: '1.0-0' }} <small>mm</small></b></div>
                <div><span>This year</span><b>{{ r.station.yearMm | number: '1.0-0' }} <small>mm</small></b></div>
              </div>
              <p>{{ r.station.rainyDays }} rainy day{{ r.station.rainyDays === 1 ? '' : 's' }}@if (r.station.wettest; as w) { &middot; wettest {{ w.label }}, {{ w.mm | number: '1.0-0' }} mm}</p>
              @if (r.station.missingDays) {<p class="muted small">Rain was not recorded on {{ r.station.missingDays }} day{{ r.station.missingDays === 1 ? '' : 's' }} this season. The total may be higher.</p>}
            </div>
          }
        </section>

        <section class="card wx">
          @if (wx(); as w) {
            <div class="row"><span class="eyebrow">{{ w.eyebrow }}</span><span class="src">{{ w.source }}</span></div>
            <div class="temp">{{ w.temp }}<small>°C</small></div>
            <p class="desc">{{ w.description }}</p>
            <div class="tiles">
              <div><span>Rain today</span><b>{{ w.pop }}%</b> <small>{{ w.pop >= 60 ? 'Likely' : 'Unlikely' }}</small><i class="bar"><i [style.width.%]="w.pop"></i></i></div>
              <div><span>Humidity</span><b>{{ w.humidity ?? '—' }}%</b> <small>{{ w.humidityWord }}</small><i class="bar"><i [style.width.%]="w.humidity ?? 0"></i></i></div>
            </div>
            <div class="facts">
              <div><span>High / low</span><b>{{ w.high }} / {{ w.low }} <small>°C</small></b></div>
              @if (w.wind) {<div><span>Wind</span><b>{{ w.wind }}</b></div>}
              @if (w.rainMm !== null) {<div><span>Rain</span><b>{{ w.rainMm }} <small>mm</small></b></div>}
              @if (w.leaves) {<div><span>Leaves</span><b>{{ w.leaves }}</b></div>}
            </div>
            <span class="eyebrow">Next 5 days</span>
            <div class="days">
              @for (d of days(); track d.label) {
                <div class="day"><span>{{ d.label }}</span><i class="material-icons">{{ d.icon }}</i><b>{{ d.max }}°</b><small>&#x1F4A7; {{ d.pop }}</small></div>
              }
            </div>
            @if (w.updated) {<p class="muted small">Station updated {{ w.updated }} IST</p>}
          } @else {<p class="muted">No weather station or forecast for this farm.</p>}
        </section>
      </div>

      <section class="card"><h3>Weather warnings today</h3>
        <div class="advice">
          @for (a of advice(); track a.id) {
            <div class="adv" [attr.data-tone]="tone[a.level]"><b>{{ a.title }}</b><p>{{ a.detail }}</p></div>
          }
        </div>
      </section>

      @if (weatherCards().length) {
        <section class="card"><h3>Weather conditions &middot; last 7 days</h3>
          <p class="muted small">Ambient conditions that can influence irrigation, crop stress, and field operations. {{ weekLabel() }} &middot; {{ stationName() }}</p>
          <div class="metrics">
            @for (m of weatherCards(); track m.label) {
              <div class="metric">
                <div class="row"><span class="badge" [attr.data-s]="m.status">{{ m.status }}</span><span class="trend" [attr.data-t]="m.trend">{{ m.trend }}</span></div>
                <div class="value">{{ m.mean | number: '1.0-2' }} <small>{{ m.unit }}</small></div>
                <div class="label">{{ m.label }}</div>
                <div class="range"><span>&#9889; Optimal: {{ m.optimal }}</span><span>Low: {{ m.min | number: '1.0-1' }} &middot; High: {{ m.max | number: '1.0-1' }}</span></div>
              </div>
            }
          </div>
        </section>
      }

      @if (report(); as rp) {
        <section class="card" id="rain-report"><h3>Missing Rain Report</h3>
          <div class="hero">
            <div><span class="eyebrow">{{ rp.ytd.diff !== null && rp.ytd.diff >= 0 ? 'Extra rain' : 'Missing rain' }}</span>
              <div class="big">{{ abs(rp.ytd.diff) | number: '1.0-0' }} <small>mm</small></div></div>
            <span class="status" [style.background]="st(rp.ytd.status.key).bg" [style.color]="st(rp.ytd.status.key).fg">{{ st(rp.ytd.status.key).text }}</span>
          </div>
          <p>{{ label() }} has received {{ rp.ytd.actual | number: '1.0-1' }} mm of the {{ rp.ytd.expected | number: '1.0-1' }} mm it usually receives over the
            same period — {{ abs(rp.ytd.diff) | number: '1.0-1' }} mm {{ (rp.ytd.diff ?? 0) < 0 ? 'less' : 'more' }} than the usual rain, or {{ rp.ytd.receivedPct | number: '1.0-1' }}% of the usual rain.</p>
          <p class="muted small">Period compared: {{ long(rp.ytd.start) }} → {{ long(rp.ytd.end) }} ({{ rp.ytd.days }} days) &middot; {{ rp.ytd.measuredDays }} days measured ({{ rp.ytd.coveragePct | number: '1.0-1' }}% data coverage)</p>
          <div class="kpis">
            <div><span>Usual yearly rain</span><b>{{ rp.annual | number: '1.0-0' }} mm</b><small>30-year average · varies ±{{ rp.cv | number: '1.0-0' }}%</small></div>
            <div><span>Actual rainfall ({{ rp.year }} to date)</span><b>{{ rp.ytd.actual | number: '1.0-1' }} mm</b><small>usual {{ rp.ytd.expected | number: '1.0-1' }} mm</small></div>
            <div><span>{{ (rp.ytd.diff ?? 0) < 0 ? 'Missing rain' : 'Extra rain' }}</span><b>{{ abs(rp.ytd.diff) | number: '1.0-1' }} mm</b>
              @if (rp.ytd.deficitPct) {<small>{{ rp.ytd.deficitPct | number: '1.0-1' }}% below the usual rain</small>}</div>
            <div><span>Rainfall received</span><b>{{ rp.ytd.receivedPct | number: '1.0-1' }}%</b><small>of the usual rain so far</small></div>
          </div>
          <div class="progress"><i [style.width.%]="min100(rp.ytd.receivedPct)"></i></div>
          <p class="muted small">Extra rain 110% or more · Usual rain 90–109.9% · Little less rain 75–89.9% · Much less rain 50–74.9% · Very much less rain under 50%.</p>

          <h4>Monthly Rainfall Analysis</h4>
          <table class="tbl"><thead><tr><th>Month</th><th>Usual rain (mm)</th><th>Actual (mm)</th><th>Difference (mm)</th><th>Received %</th><th>Data days</th><th>Status</th></tr></thead>
            <tbody>@for (m of rp.months; track m.month) {
              <tr><td>{{ m.name }}@if (m.partialMonth && !m.future) {<small> to {{ short(m.periodEnd) }}</small>}</td>
                <td>{{ m.future ? (m.fullNormal | number: '1.0-1') : (m.expected | number: '1.0-1') }}</td>
                <td>{{ m.future ? '—' : (m.actual | number: '1.0-1') }}</td><td>{{ m.future ? '—' : signed(m.diff) }}</td>
                <td>{{ m.future || m.receivedPct === null ? '—' : (m.receivedPct | number: '1.0-1') + '%' }}</td>
                <td>{{ m.future ? '—' : m.measuredDays + '/' + m.elapsed }}@if (!m.future && (m.coveragePct ?? 100) < 90) {<small> partial</small>}</td>
                <td><span class="status" [style.background]="st(m.exceedsRecord ? 'nodata' : m.status.key).bg" [style.color]="st(m.status.key).fg">{{ m.exceedsRecord ? 'Unusually high' : st(m.status.key).text }}</span></td></tr>}
            </tbody></table>

          <h4>Seasonal Rainfall Analysis</h4>
          <table class="tbl"><thead><tr><th>Season</th><th>Usual rain (mm)</th><th>Actual (mm)</th><th>Difference (mm)</th><th>Received %</th><th>Data days</th><th>Status</th></tr></thead>
            <tbody>@for (s of rp.seasons; track s.name) {
              <tr><td>{{ s.name }}@if (s.partial) {<small> elapsed part only</small>}</td><td>{{ s.expected | number: '1.0-1' }}</td>
                <td>{{ s.future ? '—' : (s.actual | number: '1.0-1') }}</td><td>{{ s.future ? '—' : signed(s.diff) }}</td>
                <td>{{ s.future || s.receivedPct === null ? '—' : (s.receivedPct | number: '1.0-1') + '%' }}</td>
                <td>{{ s.future ? '—' : s.measured + '/' + s.elapsed }}</td>
                <td><span class="status" [style.background]="st(s.status.key).bg" [style.color]="st(s.status.key).fg">{{ st(s.status.key).text }}</span></td></tr>}
            </tbody></table>
          <p class="muted small">Usual rain: the farm's 30-year monthly normals ({{ rp.source }}). Actual: the farm's weather station, days 8:30 → 8:30 IST;
            a day with no reading is missing, never 0 mm.</p>
        </section>
      }
      <p class="muted small">Read live from FarmFuture (GET only) and worked out with FarmFuture's own code; nothing is stored here. The daily
        records kept for MRV are under <a routerLink="/modules/climate">Climate records</a>.</p>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tab { padding: 8px 18px; border-radius: 999px; border: 1px solid #0f3d24; color: #0f3d24; text-decoration: none; font-weight: 500; }
    .tab.active { background: #0f3d24; color: #fff; }
    .head-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .pick { display: flex; align-items: center; gap: 6px; background: var(--surface-2, #f1f5f1); border-radius: 999px; padding: 6px 14px; }
    .pick span { color: var(--muted); font-size: .85rem; }
    .pick select { border: 0; background: transparent; font: inherit; font-weight: 600; }
    .grid2 { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; }
    .card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 18px 20px; margin-bottom: 16px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .eyebrow { text-transform: uppercase; letter-spacing: .06em; font-size: .72rem; color: var(--muted); font-weight: 600; }
    .stage h2 { color: #004225; margin: 6px 0 12px; }
    .watch { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0 14px; }
    .watch-item { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 4px; }
    .watch-item span { color: #5d6f64; font-size: .85rem; }
    .rain-card { border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; }
    .big { font-size: 2rem; font-weight: 700; } .big small { font-size: 1rem; font-weight: 500; }
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0; }
    .tiles > div { background: #f5f8f4; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; }
    .tiles span, .facts span, .kpis span { color: var(--muted); font-size: .8rem; }
    .tiles b { font-size: 1.4rem; }
    .bar { display: block; height: 5px; background: #e3e9e4; border-radius: 3px; margin-top: 6px; }
    .bar i { display: block; height: 5px; background: #2456a6; border-radius: 3px; }
    .wx .temp { font-size: 2.6rem; font-weight: 700; } .wx .temp small { font-size: 1rem; }
    .wx .desc { text-transform: capitalize; margin: 0 0 8px; color: #4b5b52; }
    .src { border: 1px solid #0f3d24; border-radius: 999px; padding: 3px 12px; font-size: .8rem; }
    .facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .facts > div { border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; }
    .days { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
    .day { border: 1px solid var(--border); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: .8rem; }
    .day span { text-transform: uppercase; color: var(--muted); font-size: .7rem; }
    .day i { color: #0f5034; }
    .advice { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .adv { border-radius: 12px; padding: 10px 14px; background: #e6f4ea; color: #1f6b43; }
    .adv[data-tone="watch"] { background: #fff1d6; color: #96680a; }
    .adv[data-tone="act"] { background: #fbefed; color: #a63a32; }
    .adv[data-tone="info"] { background: #eef1ee; color: #33473b; }
    .adv p { margin: 4px 0 0; color: #33473b; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .metric { border: 1px solid #e3e9e4; border-radius: 18px; padding: 14px; }
    .badge { border-radius: 12px; padding: 2px 8px; font-size: 10px; font-weight: 700; background: rgba(76,175,80,.1); color: #2E7D32; }
    .badge[data-s="LOW"] { background: rgba(255,152,0,.1); color: #F57C00; }
    .badge[data-s="HIGH"] { background: rgba(244,67,54,.1); color: #D32F2F; }
    .trend { font-size: .8rem; color: #757575; } .trend[data-t="Rising"] { color: #E53935; } .trend[data-t="Falling"] { color: #1E88E5; }
    .value { font-size: 28px; font-weight: 800; color: #111827; margin-top: 8px; } .value small { font-size: .9rem; color: #757575; font-weight: 500; }
    .label { font-weight: 700; color: #2c3e50; }
    .range { background: #f1f8e9; border-radius: 10px; padding: 6px 8px; margin-top: 8px; display: flex; flex-direction: column; font-size: .8rem; color: #33691E; }
    .range span:last-child { color: #999; }
    .hero { display: flex; justify-content: space-between; align-items: center; }
    .status { border-radius: 999px; padding: 3px 10px; font-size: .78rem; font-weight: 600; white-space: nowrap; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 10px 0; }
    .kpis > div { background: #f5f8f4; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; }
    .kpis b { font-size: 1.3rem; } .kpis small { color: var(--muted); }
    .progress { height: 10px; background: #e3e9e4; border-radius: 5px; } .progress i { display: block; height: 10px; background: #004225; border-radius: 5px; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .88rem; margin-bottom: 10px; }
    .tbl th, .tbl td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .tbl th { color: var(--muted); font-weight: 600; }
    @media (max-width: 1100px) { .grid2, .metrics, .kpis { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .facts { grid-template-columns: 1fr 1fr; } }
  `],
})
export class ClimatePage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly tone = LEVEL_TONE;
  protected readonly farms = signal<FarmOption[]>([]);
  protected readonly plotId = signal<string | null>(null);
  protected readonly data = signal<any | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly now = new Date();

  protected readonly label = computed(() => this.data()?.label ?? 'This farm');
  /** The farm's registered crop name, as FarmFuture's selected-farm crop ("Coffee-Robusta"). */
  private readonly cropName = computed(() => {
    const c = this.data()?.crop as string | null;
    return c === 'mixed' ? 'Coffee-Arabica Coffee-Robusta' : c ? `Coffee-${c[0].toUpperCase()}${c.slice(1)}` : 'Coffee';
  });
  protected readonly profile = computed(() => buildCropProfile(this.cropName().split(' '), this.now.getMonth() + 1));
  protected readonly monthName = computed(() => MONTH_NAMES[this.now.getMonth()]);
  protected readonly stage = computed(() => coffeeStage(this.now.getMonth() + 1, this.profile().variety));
  protected readonly watch = computed(() => coffeeWatchTopics(this.now.getMonth() + 1, this.profile().variety).slice(0, 4));

  /** The latest station reading (MicroClime and Analogue merged; latest updateAt), as the dashboard picks it. */
  private readonly station = computed(() => {
    const list = (this.data()?.stations ?? []) as any[];
    return [...list].sort((a, b) => String(b.updateAt ?? '').localeCompare(String(a.updateAt ?? '')))[0] ?? null;
  });
  protected readonly stationName = computed(() => (this.data()?.stations ?? [])[0]?.deviceName?.trim() ?? 'Weather station');
  /** FarmFuture's selectDailyWeather: the 3-hourly forecast grouped by day (pop from the day's first slot). */
  protected readonly days = computed(() => {
    const list = (this.data()?.forecast?.list ?? []) as any[];
    const today = new Date().toDateString(), tomorrow = new Date(Date.now() + 86400000).toDateString();
    const days = new Map<string, any>();
    for (const w of list) {
      const d = new Date(w.dt_txt).toDateString();
      const label = d === today ? 'Today' : d === tomorrow ? 'Tomorrow'
        : new Date(w.dt_txt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      const max = w.main.temp_max - 273.15, min = w.main.temp_min - 273.15;
      if (!days.has(d)) days.set(d, { date: label, temp_max: max, temp_min: min, pop: (w.pop * 100).toFixed(0) + '%',
        description: w.weather?.[0]?.description, main: w.weather?.[0]?.main, humidity: w.main.humidity, icon: '' });
      else { const e = days.get(d); e.temp_max = Math.max(e.temp_max, max); e.temp_min = Math.min(e.temp_min, min); }
    }
    return [...days.values()].slice(0, 5).map((d) => ({ ...d, temp_max: d.temp_max.toFixed(2), temp_min: d.temp_min.toFixed(2),
      label: d.date.split(',')[0], icon: ICONS[d.main] ?? 'foggy', max: Math.round(+d.temp_max), pop: d.pop }));
  });
  protected readonly wx = computed(() => {
    const s = this.station(), days = this.days(), f = this.data()?.forecast;
    if (!s && !days.length) return null;
    const ok = (v: any) => (typeof v === 'number' && v >= 0 ? v : null);  // FarmFuture hides negative (faulty) readings
    const temp = ok(s?.airTemperature) ?? (days[0] ? +days[0].temp_max : null);
    const humidity = ok(s?.airHumidity) ?? f?.list?.[0]?.main?.humidity ?? null;
    const analog = !!s?.isAnalogWeather, wet = ok(s?.leafWetness);
    return {
      eyebrow: `${f?.city?.name ?? ''}${f?.city?.name ? ' · ' : ''}${s && (ok(s.airTemperature) !== null || ok(s.airHumidity) !== null) ? 'Your weather station' : 'Weather'}`,
      source: s && (ok(s.airTemperature) !== null || ok(s.airHumidity) !== null) ? 'Your station' : 'Satellite',
      temp: temp === null ? '—' : Math.round(temp), description: f?.list?.[0]?.weather?.[0]?.description ?? '',
      pop: Math.round(parseFloat(days[0]?.pop ?? '0')), humidity: humidity === null ? null : Math.round(humidity),
      humidityWord: humidity === null ? '' : humidity >= 85 ? 'Very humid' : humidity >= 60 ? 'Humid' : 'Dry air',
      high: days[0] ? Math.round(+days[0].temp_max) : '—', low: days[0] ? Math.round(+days[0].temp_min) : '—',
      wind: ok(s?.windSpeed) !== null ? `${s.windDirection ?? ''} ${(+s.windSpeed).toFixed(1)} ${analog ? 'm/s' : 'km/h'}`.trim() : null,
      rainMm: ok(s?.rainfall) !== null ? (+s.rainfall).toFixed(1) : null,
      leaves: wet === null ? null : analog ? String(wet) : wet < 2 ? 'Dry' : wet < 3.9 ? 'A little wet' : 'Wet',
      updated: s?.updateAt ?? null,
    };
  });
  /** FarmFuture's weather advice (buildFarmAdvice, scope 'weather'); its "add a soil device" prompt is left out here. */
  protected readonly advice = computed(() => {
    const s = this.station();
    return buildFarmAdvice({ sensors: [], station: s, forecast: this.days().map((d) => ({ ...d, date: d.date, icon: d.icon })) as any,
      month: this.now.getMonth() + 1, profile: this.profile(), scope: 'weather' }).filter((a) => a.id !== 'add-device');
  });
  /** Monthly 30-year normals keyed 1–12 (all twelve, or none). */
  private readonly monthly = computed(() => {
    const out: Record<number, number> = {};
    for (const r of this.data()?.climate?.monthly_rainfall ?? []) {
      const m = Number(r.month), v = toNum(r.mean_mm);
      if (Number.isInteger(m) && m >= 1 && m <= 12 && v !== null && v >= 0) out[m] = v;
    }
    return Object.keys(out).length === 12 ? out : null;
  });
  /** Daily station rain this year, merged across stations (the one with most days leads). */
  private readonly daily = computed(() => {
    const maps = Object.values(this.data()?.rain ?? {}).map((res: any) => {
      const out = new Map<string, number>(), stats = res?.stats ?? {};
      for (const [date, day] of Object.entries<any>(stats)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const r = day?.rainfall_mm ?? day?.rainfall ?? day?.rain;
        const v = r && typeof r === 'object' ? toNum(r.last) ?? toNum(r.total) ?? toNum(r.avg) ?? toNum(r.max) : toNum(r);
        if (v !== null && v >= 0) out.set(date, v);
      }
      return out;
    });
    const merged = new Map<string, number>();
    maps.sort((a, b) => b.size - a.size).forEach((m) => m.forEach((mm, d) => { if (!merged.has(d)) merged.set(d, mm); }));
    return merged;
  });
  protected readonly rain = computed(() => {
    const monthly = this.monthly(), first = (this.data()?.stations ?? [])[0];
    if (!monthly || !first) return null;
    const summary = buildSeasonSummary({ monthly, daily: this.daily(), now: this.now });
    return summary?.station ? { ...summary, station: summary.station } : null;
  });
  protected readonly weekLabel = computed(() => {
    const t = new Date(this.now), s = new Date(this.now.getTime() - 6 * 86400000);
    return `${s.getDate()} ${s.toLocaleString('en-US', { month: 'short' })} - ${t.getDate()} ${t.toLocaleString('en-US', { month: 'short' })} ${t.getFullYear()}`;
  });
  /** Farm Insights "Weather conditions" cards for the first station, from its last 7 days of GetWeatherStats. */
  protected readonly weatherCards = computed(() => {
    const first = (this.data()?.stations ?? [])[0];
    const stats = first ? this.data()?.week?.[first.macId]?.stats ?? {} : {};
    const days = Object.keys(stats).sort();
    const ranges = (CROP_THRESHOLDS as any)[resolveCropThresholdKeyFromLabel(this.cropName())] ?? {};
    return WEATHER_CARDS.map((card) => {
      const avgs: number[] = [], mins: number[] = [], maxs: number[] = [], trend: number[] = [];
      for (const d of days) {
        const raw = stats[d]?.[card.key];
        if (raw === undefined || raw === null) continue;
        const v = typeof raw === 'number' ? { last: raw } : raw;
        const avg = toNum(v.avg ?? v.mean ?? v.average ?? v.last), mn = toNum(v.min ?? v.minimum ?? v.last), mx = toNum(v.max ?? v.maximum ?? v.last);
        if (avg !== null) avgs.push(avg);
        if (mn !== null) mins.push(mn);
        if (mx !== null) maxs.push(mx);
        const t = toNum(v.avg ?? v.mean ?? v.last ?? v.total);
        if (t !== null) trend.push(t);
      }
      if (!avgs.length) return null;
      const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      const range = card.threshold ? ranges[card.threshold] as [number, number] | undefined : undefined;
      let tr = 'Stable';
      if (trend.length > 1) {
        const a = trend[0], b = trend[trend.length - 1];
        const change = a !== 0 ? (b - a) / Math.abs(a) : b > 0 ? 1 : 0;
        tr = change > 0.02 ? 'Rising' : change < -0.02 ? 'Falling' : 'Stable';
      }
      return { label: card.label, unit: card.unit, mean, min: Math.min(...mins), max: Math.max(...maxs), trend: tr,
        optimal: range ? `${range[0]} - ${range[1]}` : 'N/A',
        status: range ? (mean < range[0] ? 'LOW' : mean > range[1] ? 'HIGH' : 'OPTIMAL') : 'OPTIMAL' };
    }).filter((c): c is NonNullable<typeof c> => !!c);
  });
  /** The Missing Rain Report: year to date against the 30-year normals, month by month and season by season. */
  protected readonly report = computed(() => {
    const monthly = this.monthly(), daily = this.daily(), d = this.data();
    if (!monthly || !daily.size) return null;
    const latestKey = [...daily.keys()].sort().pop()!;
    const latest = keyToDate(latestKey), year = this.now.getFullYear();
    const max: Record<number, number> = {}, min: Record<number, number> = {};
    for (const r of d?.climate?.monthly_rainfall ?? []) {
      const m = Number(r.month);
      if (toNum(r.max_mm) !== null) max[m] = toNum(r.max_mm)!;
      if (toNum(r.min_mm) !== null) min[m] = toNum(r.min_mm)!;
    }
    const summary = d?.profile?.summary?.climate ?? {};
    const ctx: any = { historicalRainfall: { unit: 'mm', monthly, monthlyMax: max, monthlyMin: min, seasonal: [],
      annualAverage: toNum(summary.annual_rainfall_mm) ?? toNum(d?.climate?.annual_rainfall?.mean_mm),
      cvPct: toNum(summary.rainfall_cv_pct) }, crops: [], soil: null, landSize: null };
    return {
      year, ytd: analysePeriod(monthly, daily, new Date(year, 0, 1), latest),
      months: buildMonthlyRows(ctx, daily, year, latest), seasons: buildSeasonalRows(ctx, daily, year, latest, SEASON_PRESETS[0].seasons),
      annual: ctx.historicalRainfall.annualAverage, cv: ctx.historicalRainfall.cvPct,
      source: summary.period ? `${summary.period}, ${summary.total_years ?? 30} years` : '30-year climate layer',
    };
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
  protected st(key: string) { return STATUS[key] ?? STATUS['nodata']; }
  protected abs(v: number | null | undefined): number | null { return v === null || v === undefined ? null : Math.abs(v); }
  protected min100(v: number | null): number { return Math.max(0, Math.min(100, v ?? 0)); }
  protected long(d: Date): string { return fmtDateLong(d); }
  protected short(d: Date): string { return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`; }
  protected signed(v: number | null): string { return v === null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}`; }
  protected readonly dateKey = dateKey;

  private load(plotId: string): void {
    this.plotId.set(plotId);
    this.data.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.api.get<any>(`/farm-health/${plotId}/climate`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.error?.message ?? 'FarmFuture could not be read just now.'); },
    });
  }
}
