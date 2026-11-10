/*
 * Suitability & planning – the platform's copy of FarmFuture's "Farm Profile" (land and slope, soil, 30-year weather and
 * field zones, in FarmFuture's own words and rounding) with its Estate Compliance (EUDR) screening and the latest
 * satellite canopy summary per zone. Read live from FarmFuture (GET only, through /farm-health/{plot}/profile); the farm's
 * location is not passed on.
 */
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { Notice, PageHeader } from '../../shared/page-header';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FarmOption { plot_id: string; label: string; crop: string | null }
interface Row { k: string; v: string }

const DIRS: Record<string, string> = { N: 'North', NE: 'North-East', E: 'East', SE: 'South-East', S: 'South', SW: 'South-West', W: 'West', NW: 'North-West' };
const ZONE_COLORS = ['#2f8f4e', '#c9772f', '#3a7bd5', '#9b59b6', '#d4a017', '#16a085', '#c0392b', '#7f8c8d'];
const MISSING: Record<string, string> = { BOUNDARY: 'Farm boundary not mapped', SCREENING: 'Deforestation screening not done', REPORT: 'Due-diligence report not issued' };
// FarmFuture's Farm Profile rounding (terrain-3d component): r0 whole, r1 one decimal (no forced zero), pc fraction → %.
const r0 = (v?: number | null) => (v == null ? '—' : `${Math.round(v)}`);
const r1 = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 10) / 10}`);
const pc = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const human = (v?: string | null) => { if (!v) return '—'; const t = v.replace(/_/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : '—'; };
const dir = (a?: string | null) => (a ? DIRS[a.toUpperCase()] ?? a : '—');

@Component({
  selector: 'app-suitability-page',
  imports: [PageHeader, Notice, DecimalPipe, RouterLink],
  template: `
    <app-page-header title="Suitability & planning" subtitle="The farm's land, soil and 30-year climate, its zones, its no-deforestation (EUDR) screening and canopy from satellite – FarmFuture's Farm Profile and Estate Compliance" />
    <div class="tabs">
      <span class="tab active">Farm profile</span>
      <a class="tab" routerLink="/modules/suitability">Suitability records</a>
    </div>
    <div class="head-row">
      <label class="pick"><span>Farm</span>
        <select (change)="pickFarm($any($event.target).value)">
          @for (f of farms(); track f.plot_id) {<option [value]="f.plot_id" [selected]="f.plot_id === plotId()">{{ f.label }}</option>}
        </select></label>
    </div>
    @if (loading()) {<p class="muted">Reading FarmFuture's farm profile…</p>}
    @if (error()) {<app-notice kind="warning">{{ error() }}</app-notice>}
    @if (data()) {
      <section class="card head"><div><h2>{{ data().label }}</h2><p class="muted">{{ zoneCards().length }} zones across the farm</p></div>
        <a class="btn" [routerLink]="['/climate']" [queryParams]="{ plot: plotId() }" fragment="rain-report">Missing Rain Report</a></section>
      @if (!data().profile) {<app-notice>FarmFuture has no farm profile for this farm yet.</app-notice>}
      <div class="grid3">
        @if (terrain().length) {<section class="card"><h3>Land &amp; Slope</h3><dl>@for (r of terrain(); track r.k) {<div><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></div>}</dl></section>}
        @if (soil().length) {<section class="card"><h3>Soil</h3><dl>@for (r of soil(); track r.k) {<div><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></div>}</dl></section>}
        @if (climate().length) {<section class="card"><h3>Weather <small>{{ climatePeriod() }}</small></h3><dl>@for (r of climate(); track r.k) {<div><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></div>}</dl>
          @if (climateNote()) {<p class="muted small">{{ climateNote() }}</p>}</section>}
      </div>
      @if (zoneCards().length) {
        <section class="card"><h3>Field Zones</h3>
          <div class="zones">@for (z of zoneCards(); track z.index) {
            <div class="zone" [style.border-left-color]="z.color"><b>{{ z.name }}</b><p>{{ z.line1 }}</p><p>{{ z.line2 }}</p><p>{{ z.line3 }}</p></div>}</div>
        </section>
      }
      <div class="grid2">
        <section class="card"><h3>Estate compliance &middot; EUDR</h3>
          @if (data().eudr; as e) {
            <dl>
              <div><dt>Farm boundary</dt><dd>{{ e.has_boundary ? 'Mapped' : 'Not mapped' }}</dd></div>
              <div><dt>Due-diligence report</dt><dd>{{ e.has_report ? 'Available in FarmFuture' : 'Not issued yet' }}</dd></div>
              @if (e.screening; as s) {
                <div><dt>Compliance</dt><dd><span class="flag" [class.ok]="compliant(s.complianceFlag)">{{ s.complianceFlag || '—' }}</span></dd></div>
                <div><dt>Why</dt><dd>{{ s.complianceReason || '—' }}</dd></div>
                <div><dt>Risk score</dt><dd>{{ s.riskScore ?? '—' }}</dd></div>
                <div><dt>Deforested since 2020</dt><dd>{{ s.deforestedSince2020Ha ?? '—' }} ha</dd></div>
                <div><dt>Screened on</dt><dd>{{ (s.screenedAt || '').slice(0, 10) || '—' }}</dd></div>
              } @else {<div><dt>Screening</dt><dd>Not done yet</dd></div>}
            </dl>
            @if (e.missing?.length) {<p class="muted small">Still missing: {{ missingText(e.missing) }}</p>}
          } @else {<p class="muted">No EUDR readiness from FarmFuture for this farm.</p>}
        </section>
        <section class="card"><h3>Canopy from satellite</h3>
          @if (data().satellite; as sat) {
            <p class="muted small">Latest clear Sentinel-2 pass {{ (sat.observedOn || '').slice(0, 10) }} &middot; NDVI = leaf cover greenness, NDMI = canopy moisture</p>
            <table class="tbl"><thead><tr><th>Zone</th><th>Cells</th><th>Mean NDVI</th><th>NDVI range</th><th>Mean NDMI</th><th>Declining cells</th></tr></thead>
              <tbody>@for (z of sat.zones; track $index) {<tr><td>Zone {{ $index + 1 }}</td><td>{{ z.cells }}</td><td>{{ z.avgNdvi | number: '1.2-2' }}</td>
                <td>{{ z.minNdvi | number: '1.2-2' }} – {{ z.maxNdvi | number: '1.2-2' }}</td><td>{{ z.avgNdmi | number: '1.2-2' }}</td><td>{{ z.decliningCells }}</td></tr>}</tbody></table>
          } @else {<p class="muted">No satellite zone summary yet.</p>}
        </section>
      </div>
      <p class="muted small">Read live from FarmFuture (GET only); the farm's position and outline are not shown here. Suitability assessments,
        site findings and the stored screening are under <a routerLink="/modules/suitability">Suitability records</a>.</p>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tab { padding: 8px 18px; border-radius: 999px; border: 1px solid #0f3d24; color: #0f3d24; text-decoration: none; font-weight: 500; }
    .tab.active { background: #0f3d24; color: #fff; }
    .head-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .pick { display: flex; align-items: center; gap: 6px; background: var(--surface-2, #f1f5f1); border-radius: 999px; padding: 6px 14px; }
    .pick span { color: var(--muted); font-size: .85rem; } .pick select { border: 0; background: transparent; font: inherit; font-weight: 600; }
    .card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 16px 20px; margin-bottom: 16px; }
    .head { display: flex; justify-content: space-between; align-items: center; } .head h2 { margin: 0; }
    .btn { border: 1px solid #0f3d24; color: #0f3d24; border-radius: 999px; padding: 6px 14px; text-decoration: none; font-weight: 500; }
    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    h3 small { font-weight: 400; color: var(--muted); font-size: .8rem; }
    dl { margin: 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    dt { color: var(--muted); } dd { margin: 0; font-weight: 600; text-align: right; }
    .zones { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
    .zone { border: 1px solid var(--border); border-left: 6px solid; border-radius: 12px; padding: 10px 14px; }
    .zone p { margin: 4px 0; font-size: .9rem; }
    .flag { border-radius: 999px; padding: 2px 10px; background: #fdeaea; color: #a51f14; } .flag.ok { background: #e4f4e6; color: #10682a; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .88rem; } .tbl th, .tbl td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .tbl th { color: var(--muted); font-weight: 600; }
    @media (max-width: 1100px) { .grid3, .grid2 { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class SuitabilityPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly farms = signal<FarmOption[]>([]);
  protected readonly plotId = signal<string | null>(null);
  protected readonly data = signal<any | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly summary = computed(() => this.data()?.profile?.summary ?? null);
  protected readonly terrain = computed((): Row[] => {
    const t = this.summary()?.terrain;
    return t ? [
      { k: 'Average height', v: `${r0(t.elevation_mean_m)} m above sea level` },
      { k: 'Height range', v: `${r0(t.elevation_min_m)}–${r0(t.elevation_max_m)} m (${r0(t.elevation_range_m)} m difference)` },
      { k: 'Slope', v: `${human(t.slope_class)} · ${r0(t.slope_mean_deg)}° on average, ${r0(t.slope_max_deg)}° steepest` },
      { k: 'Steep land', v: `${pc(t.steep_cell_pct)} of farm is steep (over 15°)` },
      { k: 'Slope faces', v: dir(t.aspect) },
      { k: 'Drainage', v: human(t.drainage) },
      ...(t.frost_risk ? [{ k: 'Frost risk', v: human(t.frost_risk) }] : []),
    ] : [];
  });
  protected readonly soil = computed((): Row[] => {
    const s = this.summary()?.soil;
    return s ? [
      { k: 'Soil pH', v: `${r1(s.ph)} · ${s.texture}` },
      { k: 'Soil texture', v: `Clay ${r0(s.clay)}% · Sand ${r0(s.sand)}% · Silt ${r0(s.silt)}%` },
      { k: 'Organic carbon', v: `${r1(s.oc_pct)}%` },
      { k: 'Soil compactness', v: `${r1(s.bulk_density)} g/cm³` },
      { k: 'Field water capacity', v: `${r0(s.field_capacity)}%` },
      { k: 'Water holding', v: `${human(s.whc_class)} · ${r0(s.whc_mm_per_m)} mm per metre` },
    ] : [];
  });
  protected readonly climatePeriod = computed(() => { const c = this.summary()?.climate; return c ? `${c.total_years}-year average` : ''; });
  protected readonly climate = computed((): Row[] => {
    const c = this.summary()?.climate, ds = c?.dry_spell;
    return c ? [
      { k: 'Yearly rainfall', v: `${r0(c.annual_rainfall_mm)} mm${c.rainfall_cv_pct != null ? ` · varies ±${r0(c.rainfall_cv_pct)}%` : ''}` },
      ...(c.sw_monsoon_pct != null ? [{ k: 'Monsoon (Jun–Sep)', v: `${r0(c.sw_monsoon_pct)}% of yearly rain` }] : []),
      { k: 'Temperature', v: `${r0(c.mean_temp_c)}°C average${c.tmin_c != null ? ` (${r0(c.tmin_c)}–${r0(c.tmax_c)}°C)` : ''}` },
      ...(ds ? [{ k: 'Longest dry spell', v: `${ds.longest_days} days${ds.longest_year ? ` (in ${ds.longest_year})` : ''}` }] : []),
      ...(ds?.mean_max_days != null ? [{ k: 'Usual longest dry spell', v: `${r0(ds.mean_max_days)} days a year` }] : []),
      ...(ds?.mean_dry_days != null ? [{ k: 'Dry days per year', v: `${r0(ds.mean_dry_days)} days` }] : []),
    ] : [];
  });
  protected readonly climateNote = computed(() => {
    const c = this.summary()?.climate, ds = c?.dry_spell;
    return ds ? `${c.total_years}-year averages (${c.period}). The worst dry spell on record was ${ds.longest_days} days in ${ds.longest_year ?? '—'}.` : '';
  });
  protected readonly zoneCards = computed(() => {
    const p = this.data()?.profile;
    return (p?.zone_profiles ?? []).map((z: any, i: number) => {
      const dev = p.devices?.[i], zt = z.terrain ?? {}, zs = z.soil ?? {};
      return {
        index: i, name: dev?.name || `Zone ${i + 1}`, color: ZONE_COLORS[i % ZONE_COLORS.length],
        line1: `⛰ ${r0(zt.elevation_min_m)}–${r0(zt.elevation_max_m)} m · ${human(zt.slope_class)} slope (${r0(zt.slope_mean_deg)}°) · faces ${dir(zt.aspect)}`,
        line2: `🌱 pH ${r1(zs.ph)} · ${zs.texture} · Organic carbon ${r1(zs.oc_pct)}% · Water holding ${human(zs.whc_class)}`,
        line3: `💧 ${human(zt.drainage)}${dev?.label ? ` · ${dev.label}` : ''}`,
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
  protected compliant(flag: string | null): boolean { return /compliant/i.test(flag ?? '') && !/non/i.test(flag ?? ''); }
  protected missingText(items: string[]): string { return items.map((m) => MISSING[m] ?? human(m.toLowerCase())).join(' · '); }

  private load(plotId: string): void {
    this.plotId.set(plotId);
    this.data.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.api.get<any>(`/farm-health/${plotId}/profile`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.error?.message ?? 'FarmFuture could not be read just now.'); },
    });
  }
}
