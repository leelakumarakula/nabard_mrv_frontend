import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { deviceId, sensorName } from '../../core/format';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';
import { LOCATION_NOTES, deviceKind, deviceState } from '../map/map-colours';
import { MapView } from '../map/map-view';

const DEVICE_TYPES = ['soilsync_7in1', 'moisture_probe', 'microclime', 'rainsync', 'analogue_weather', 'other'];

/** Installed position fields – only for roles that may see (and so set) exact locations. */
function positionFields(precise: boolean) {
  return precise ? [
    { name: 'latitude', label: 'Latitude (installed position)', type: 'number' as const },
    { name: 'longitude', label: 'Longitude (installed position)', type: 'number' as const },
  ] : [];
}

@Component({
  selector: 'app-devices',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="IoT devices" subtitle="Targeted deployment: SoilSync, Moisture Probe, MicroClime, RainSync">
      @if (auth.has('module.write')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Register device</button>}
    </app-page-header>
    <app-notice>The programme planning ceiling is up to 1,200 devices; the final equipment schedule, models and protocols are
      pending confirmation. Each device type reports only the parameters it supports. "Data days" counts the days with at
      least one stored reading in the last 30 days (since installation) – the basis for data-completeness reporting.</app-notice>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/devices', $event['id']])" />`,
})
export class DevicesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly columns: Column[] = [
    { key: 'device_code', label: 'Device (MAC ID)', value: (r) => deviceId(r['device_code']) },
    { key: 'device_type', label: 'Type', kind: 'label' }, { key: 'farm_plot', label: 'Farm', kind: 'ref' }, { key: 'geo_unit', label: 'Area', kind: 'ref' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'reporting_state', label: 'Data', value: (r) => deviceState(r['reporting_state']).label },
    { key: 'last_reading_at', label: 'Last reading', kind: 'datetime' },
    { key: 'completeness_pct', label: 'Data days (30 d)',
      value: (r) => (r['expected_days_30'] ? `${r['reporting_days_30']}/${r['expected_days_30']} (${Math.round(r['completeness_pct'])} %)` : '—') },
    { key: 'battery_pct', label: 'Battery', value: (r) => (r['battery_pct'] != null ? `${Math.round(r['battery_pct'])} %` : '—') },
    { key: 'signal_csq', label: 'Signal', value: (r) => (r['signal_csq'] != null ? `${r['signal_csq']} / 31` : '—') },
    { key: 'last_calibrated_on', label: 'Calibrated', kind: 'date' },
    { key: 'calibration_due_on', label: 'Calibration due', kind: 'date' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/devices', { page, page_size: size }));

  ngOnInit(): void {
    this.list.load();
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'Register device',
      fields: [
        { name: 'device_code', label: 'Device code / serial', type: 'text', required: true },
        { name: 'device_type', label: 'Type', type: 'select', required: true, options: DEVICE_TYPES },
        { name: 'provider', label: 'Provider', type: 'text' },
        { name: 'farm_plot_id', label: 'Assigned plot', type: 'plot' },
        { name: 'geo_unit_id', label: 'Area (if no plot)', type: 'lookup', lookup: 'geo' },
        { name: 'installed_on', label: 'Installed on', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'faulty', 'removed'] },
        ...positionFields(this.auth.has('farmer.read_pii')),
        { name: 'deployment_justification', label: 'Data gap justifying deployment', type: 'textarea' },
      ],
      value: { status: 'planned' }, submit: (v) => firstValueFrom(this.api.post('/devices', v)),
    });
    if (saved?.['id']) this.router.navigate(['/devices', saved['id']]);
  }
}

@Component({
  selector: 'app-device-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, MatButtonModule, MatIconModule, MapView,
    RouterLink, DatePipe, DecimalPipe, Notice],
  styles: `
    .device-location { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr); gap: 18px; align-items: start; }
    .device-location:has(.device-map) { min-height: 300px; }
    .device-location:not(:has(.device-map)) { grid-template-columns: minmax(0, 1fr); }
    .device-map { height: 320px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); }
    .device-where { display: flex; flex-direction: column; gap: 6px; }
    .device-where p { margin: 0; }
    .device-where a { align-self: flex-start; margin-top: 6px; }
    .where-head { display: flex; gap: 10px; align-items: center; margin-bottom: 4px; }
    .dev-badge { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: #fff;
      font-weight: 600; box-shadow: 0 0 0 2px #fff, 0 1px 4px rgba(0, 0, 0, 0.25); }
    .device-warn { display: flex; gap: 6px; align-items: flex-start; color: #8a5300; }
    .device-warn mat-icon { font-size: 18px; width: 18px; height: 18px; flex: none; }
    .ff-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 18px; align-items: start; }
    .ff-card { border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
    .ff-card h4 { margin: 0 0 4px; }
    .ff-card h5 { margin: 12px 0 4px; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .ff-rows { margin: 0; }
    .ff-rows div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--border); }
    .ff-rows dt { color: var(--muted); }
    .ff-rows dd { margin: 0; font-weight: 600; }
    .ff-note { background: var(--surface-2, #f3f7f3); border-radius: 8px; padding: 8px 10px; font-size: .85rem; }
    .ff-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .ff-table th, .ff-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .ff-table th { font-weight: 600; color: var(--muted); }
    .ff-api { margin-top: 10px; font-family: monospace; }
    .ff-device { display: flex; gap: 8px; align-items: center; margin: 6px 0 8px; font-size: .9rem; color: var(--muted); }
    .ff-device select { font: inherit; color: var(--text, inherit); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); }
    .ff-wide { grid-column: 1 / -1; overflow-x: auto; }
    @media (max-width: 900px) { .ff-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 800px) { .device-location { grid-template-columns: minmax(0, 1fr); } }`,
  template: `
    @if (device(); as d) {
      <app-page-header [title]="deviceId(d['device_code'])"[subtitle]="d['provider']" back="/devices">
        <ng-container badges><app-status [status]="d['status']" /><app-demo [show]="d['is_demo']" /></ng-container>
        @if (auth.has('module.write')) {
          <button mat-stroked-button (click)="edit(d)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="calibrate()"><mat-icon>tune</mat-icon> Record calibration</button>
        }
      </app-page-header>
      <section class="panel">
        <app-details [items]="[
          { label: 'Type', value: d['device_type'], kind: 'label' }, { label: 'Plot', value: d['farm_plot']?.label },
          { label: 'Area', value: d['geo_unit']?.label }, { label: 'Installed', value: d['installed_on'], kind: 'date' },
          { label: 'Removed', value: d['removed_on'], kind: 'date' }, { label: 'Calibration due', value: d['calibration_due_on'], kind: 'date' },
          { label: 'Data', value: state(d).label }, { label: 'Last reading', value: d['last_reading_at'], kind: 'datetime' },
          { label: 'Deployment justification', value: d['deployment_justification'], full: true }]" />
      </section>
      @if (fromFarmFuture(d)) {
        <section class="panel">
          <div class="panel-head"><h3>As shown in FarmFuture</h3>
            <button mat-stroked-button (click)="loadFarmFuture()" [disabled]="ffLoading()"><mat-icon>refresh</mat-icon> Refresh</button></div>
          @if (ffLoading()) {<p class="muted">Reading FarmFuture…</p>}
          @else if (ffError()) {<app-notice kind="warning">{{ ffError() }}</app-notice>}
          @else if (ff(); as f) {
            <div class="ff-grid">
              <div class="ff-card"><h4>Sensors page · latest reading</h4>
                @if (f['sensors_page']; as s) {
                  <p class="muted small">Last updated {{ s['updated_at'] | date: 'd MMM y, h:mm:ss a' }} IST
                    @if (s['battery_pct'] != null) { · battery {{ s['battery_pct'] }}%}</p>
                  @for (g of groups(s['rows']); track g.name) {
                    @if (g.name) {<h5>{{ g.name }}</h5>}
                    <dl class="ff-rows">@for (r of g.rows; track r.label) {<div><dt>{{ r.label }}</dt><dd>{{ r.text ?? '—' }}</dd></div>}</dl>
                  }
                  @if (s['npk_shown'] === false) {<p class="muted small">FarmFuture hides Nitrogen, Phosphorus and Potassium while the soil is too dry for a usable reading.</p>}
                  @if (s['note']) {<p class="ff-note"><strong>NOTE:</strong> {{ s['note'] }}</p>}
                  <p class="muted small ff-api">{{ s['api'] }}</p>
                } @else {<p class="muted">FarmFuture has no latest reading for this device.</p>}
              </div>
              @if (f['farm_insights']; as fi) {
                <div class="ff-card"><h4>Farm Insights · last 7 days</h4>
                  <p class="muted small">{{ fi['from'] | date: 'd MMM' }} – {{ fi['to'] | date: 'd MMM y' }} · average of the daily averages; Low / High are the lowest and highest day</p>
                  @if (fi['devices'].length > 1) {
                    <label class="ff-device">Device
                      <select (change)="insightMac.set($any($event.target).value)">
                        @for (o of fi['devices']; track o['mac_id']) {
                          <option [value]="o['mac_id']" [selected]="o['mac_id'] === insightMac()">{{ o['label'] }}{{ o['mac_id'] === f['mac_id'] ? ' (this device)' : '' }}</option>}
                      </select></label>
                    @if (opensOn(fi); as first) {
                      @if (first['mac_id'] !== insightMac()) {
                        <p class="ff-note">FarmFuture's Farm Insights opens on <strong>{{ first['label'] }}</strong>. To see these values
                          there, choose <strong>{{ insightDevice(fi)?.['label'] }}</strong> in its Device list.</p>}
                    }
                  }
                  @if (insightDevice(fi)?.['metrics']?.length) {
                    <table class="ff-table"><thead><tr><th>Metric</th><th>Average</th><th>Low</th><th>High</th><th>Trend</th></tr></thead>
                      <tbody>@for (m of insightDevice(fi)!['metrics']; track m['label']) {
                        <tr><td>{{ m['label'] }}</td><td><strong>{{ m['average_text'] }}</strong> {{ m['unit'] }}</td>
                          <td>{{ m['low_text'] }}</td><td>{{ m['high_text'] }}</td><td>{{ m['trend'] }}</td></tr>}</tbody></table>
                  } @else {<p class="muted">No daily statistics in these 7 days.</p>}
                  <p class="muted small ff-api">{{ fi['api'] }}</p>
                </div>
              }
              @if (f['device_statistics']; as ds) {
                <div class="ff-card ff-wide"><h4>Device Statistics · Weekly</h4>
                  <p class="muted small">{{ ds['from'] | date: 'dd MMM y' }} – {{ ds['to'] | date: 'dd MMM y' }} · the device's own
                    statistics screen in FarmFuture (device card → statistics). Minimum / Maximum are the lowest and highest reading
                    of any day, Average is the mean of the daily averages, Latest is the last day's average.</p>
                  @if (ds['metrics'].length) {
                    <table class="ff-table"><thead><tr><th>Reading</th><th>Minimum</th><th>Maximum</th><th>Average</th><th>Latest</th><th>Unit</th></tr></thead>
                      <tbody>@for (m of ds['metrics']; track m['label']) {
                        <tr><td>{{ m['label'] }}</td><td>{{ m['minimum_text'] }}</td><td>{{ m['maximum_text'] }}</td>
                          <td><strong>{{ m['average_text'] }}</strong></td><td>{{ m['latest_text'] }}</td><td>{{ m['unit'] }}</td></tr>}</tbody></table>
                  } @else {<p class="muted">No daily statistics in this week.</p>}
                  <p class="muted small ff-api">{{ ds['api'] }}</p>
                </div>
              }
            </div>
            <p class="muted small">Read live from FarmFuture just now; nothing is stored. FarmFuture's screens do not all use the
              same numbers: Farm Insights and this platform's records use FarmFuture's corrected daily values, while the Sensors
              page and Device Statistics show Nitrogen, Phosphorus, Potassium and pH before FarmFuture's correction – so those four
              differ between the screens (temperature, EC and moisture agree).</p>
          }
        </section>
      }
      <section class="panel"><h3>Location</h3>
        <div class="device-location">
          @if (d['latitude'] != null) {
            <div class="device-map"><app-map-view [devices]="[d]" [outline]="outline()" /></div>
          }
          <div class="device-where">
            <div class="where-head"><span class="dev-badge" [style.background]="state(d).colour">{{ kind(d).letter }}</span>
              <div><strong>{{ kind(d).label }}</strong><div class="muted small">{{ d['farm_plot']?.label ?? 'No plot assigned' }}</div></div></div>
            @if (d['location_check'] === 'ok') {
              <p>{{ d['distance_from_plot_km'] < 1 ? (d['distance_from_plot_km'] * 1000 | number: '1.0-0') + ' m' : (d['distance_from_plot_km'] | number: '1.0-1') + ' km' }}
                from the plot's GPS point.</p>
            } @else if (locationNote(d); as note) {<p class="device-warn"><mat-icon>info</mat-icon><span>{{ note }}
              @if (d['distance_from_plot_km'] != null) {({{ d['distance_from_plot_km'] | number: '1.0-0' }} km from the plot)}</span></p>}
            @if (d['latitude'] == null && d['location_check'] !== 'no_position') {
              <p class="muted small">Exact device positions are shown only to roles that may see precise locations.</p>}
            @if (d['location_source']) {<p class="muted small">Position {{ d['location_source'] === 'entered' ? 'entered in the platform' : 'from ' + d['location_source'] }}
              @if (d['location_updated_at']) {· updated {{ d['location_updated_at'] | date: 'd MMM y' }}}</p>}
            @if (d['farm_plot_id']) {<a mat-stroked-button [routerLink]="['/map']" [queryParams]="{ device: d['id'] }"><mat-icon>map</mat-icon> Show on farm map</a>}
          </div>
        </div>
      </section>
      <section class="panel"><h3>Calibration history</h3><app-table [columns]="calCols" [rows]="calibrations()" [clickable]="false" /></section>
      <section class="panel"><h3>Recent readings</h3>
        <app-table [columns]="readingCols" [rows]="readings()" [clickable]="false" emptyText="No readings received" /></section>
      <app-evidence-panel entityType="device" [entityId]="d['id']" />
    }`,
})
export class DeviceDetailPage implements OnInit {
  protected readonly deviceId = deviceId;
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly id = input.required<string>();
  protected readonly device = signal<Row | null>(null);
  protected readonly calibrations = signal<Row[]>([]);
  protected readonly readings = signal<Row[]>([]);
  protected readonly outline = signal<Row | null>(null);
  protected readonly ff = signal<Row | null>(null);
  protected readonly ffLoading = signal(false);
  protected readonly ffError = signal<string | null>(null);
  protected readonly insightMac = signal<string | null>(null);
  protected readonly kind = (d: Row) => deviceKind(d['device_type']);
  protected readonly state = (d: Row) => deviceState(d['reporting_state']);
  protected readonly locationNote = (d: Row) => LOCATION_NOTES[d['location_check']] ?? null;
  protected readonly calCols: Column[] = [
    { key: 'calibrated_on', label: 'Date', kind: 'date' }, { key: 'result', label: 'Result', kind: 'status' },
    { key: 'method', label: 'Method' }, { key: 'performed_by', label: 'By' }, { key: 'next_due_on', label: 'Next due', kind: 'date' },
  ];
  protected readonly readingCols: Column[] = [
    { key: 'observed_at', label: 'Time', kind: 'datetime' }, { key: 'parameter', label: 'Parameter', value: (r) => sensorName(r['attributes']?.parameter, r['attributes']?.layer) },
    { key: 'value', label: 'Value', value: (r) => `${r['attributes']?.value ?? ''} ${r['attributes']?.unit ?? ''}` },
    { key: 'quality', label: 'Quality flag', value: (r) => r['attributes']?.quality_flag },
    { key: 'validation_status', label: 'Validation', kind: 'status' },
    { key: 'source', label: 'Source', value: (r) => (r['source_system_id'] ? 'Gateway import' : 'Manual') },
  ];

  /** FarmFuture devices (coded FF-<MAC ID>) can be shown as the FarmFuture app shows them. */
  protected readonly fromFarmFuture = (d: Row) => String(d['device_code'] ?? '').startsWith('FF-')
    && ['soilsync_7in1', 'microclime', 'analogue_weather'].includes(d['device_type']);

  protected groups(rows: Row[]): { name: string | null; rows: Row[] }[] {
    const out: { name: string | null; rows: Row[] }[] = [];
    for (const r of rows ?? []) {
      const last = out[out.length - 1];
      if (last && last.name === (r['section'] ?? null)) last.rows.push(r);
      else out.push({ name: r['section'] ?? null, rows: [r] });
    }
    return out;
  }

  /** The device shown in the Farm Insights card (this device unless another is picked). */
  protected insightDevice(fi: Row): Row | undefined {
    return (fi['devices'] as Row[]).find((d) => d['mac_id'] === this.insightMac());
  }

  protected opensOn(fi: Row): Row | undefined {
    return (fi['devices'] as Row[]).find((d) => d['mac_id'] === fi['farmfuture_opens_on']);
  }

  protected loadFarmFuture(): void {
    this.ffLoading.set(true);
    this.ffError.set(null);
    this.api.get<Row>(`/devices/${this.id()}/farmfuture`).subscribe({
      next: (f) => {
        this.ff.set(f);
        if (!this.insightMac()) this.insightMac.set(f['mac_id']);
        this.ffLoading.set(false);
      },
      error: (e) => {
        this.ffError.set(e?.error?.message ?? e?.error?.detail ?? 'FarmFuture could not be read just now.');
        this.ffLoading.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.api.get<Row>(`/devices/${this.id()}`).subscribe((d) => {
      this.device.set(d);
      if (this.fromFarmFuture(d)) this.loadFarmFuture();
      // the farm outline (FarmFuture, read live) frames the device – only for roles that see exact positions
      if (d['latitude'] != null && d['farm_plot_id']) {
        this.api.get<Row>(`/map/plots/${d['farm_plot_id']}/boundary`).subscribe({
          next: (b) => this.outline.set(b['available'] ? b : null), error: () => this.outline.set(null) });
      }
    });
    this.api.get<Row[]>(`/devices/${this.id()}/calibrations`).subscribe((c) => this.calibrations.set(c));
    this.api.get<Page<Row>>('/field-records', { device_id: this.id(), page_size: 50 }).subscribe((p) => this.readings.set(p.items));
  }

  protected async edit(d: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit device', value: d,
      fields: [
        { name: 'provider', label: 'Provider', type: 'text' }, { name: 'farm_plot_id', label: 'Assigned plot', type: 'plot' },
        { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'faulty', 'removed'] },
        { name: 'installed_on', label: 'Installed on', type: 'date' }, { name: 'removed_on', label: 'Removed on', type: 'date' },
        ...positionFields(this.auth.has('farmer.read_pii')),
        { name: 'deployment_justification', label: 'Deployment justification', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/devices/${d['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async calibrate(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Record calibration',
      fields: [
        { name: 'calibrated_on', label: 'Date', type: 'date', required: true },
        { name: 'result', label: 'Result', type: 'select', required: true, options: ['pass', 'fail', 'adjusted'] },
        { name: 'method', label: 'Method', type: 'text' }, { name: 'performed_by', label: 'Performed by', type: 'text' },
        { name: 'next_due_on', label: 'Next due', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.post(`/devices/${this.id()}/calibrations`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
