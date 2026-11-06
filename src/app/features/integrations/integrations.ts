import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Page, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { StatusBadge } from '../../shared/badges';
import { confirmAction } from '../../shared/confirm-dialog';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { openForm } from '../../shared/form-dialog';
import { Notice, PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-integrations',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Integration operations" subtitle="FarmFuture engines, IoT gateways, weather and external sources">
      @if (auth.has('integration.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Register source</button>}
    </app-page-header>
    <app-notice kind="warning">Live integrations are configured only after the source owner confirms availability, the API/data
      contract and access. Sources marked MOCK generate synthetic data; "not configured" sources never fabricate data.</app-notice>
    <app-table [columns]="columns" [rows]="sources()" (rowClick)="router.navigate(['/integrations', $event['source_code']])" />`,
})
export class IntegrationsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly sources = signal<Row[]>([]);
  protected readonly columns: Column[] = [
    { key: 'name', label: 'Source' }, { key: 'source_code', label: 'Code' }, { key: 'module_code', label: 'Workstream', kind: 'label' },
    { key: 'source_type', label: 'Type', kind: 'label' }, { key: 'connection_status', label: 'Connection' },
    { key: 'is_mock', label: 'Mock', kind: 'bool' }, { key: 'last_sync_at', label: 'Last sync', kind: 'datetime' },
    { key: 'last_sync_status', label: 'Last result', kind: 'status' }, { key: 'open_quarantine', label: 'Quarantined', kind: 'number' },
  ];

  ngOnInit(): void {
    this.api.get<Row[]>('/integrations/sources').subscribe((s) => this.sources.set(s));
  }

  protected async create(): Promise<void> {
    // Pull adapters from the catalogue bring their default config and mock flag; they need the programme code.
    const catalogue = await firstValueFrom(this.api.get<Row[]>('/integrations/catalogue'));
    const entry = (code: unknown) => catalogue.find((c) => c['adapter_code'] === code);
    const saved = await openForm<Row>(this.dialog, {
      title: 'Register integration source',
      fields: [
        { name: 'source_code', label: 'Code (lower_snake)', type: 'text', required: true },
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'module_code', label: 'Workstream', type: 'lookup', lookup: 'module' },
        { name: 'source_type', label: 'Type', type: 'select', required: true, options: ['rest_push', 'rest_pull', 'file_exchange'] },
        { name: 'adapter_code', label: 'Adapter', type: 'select', required: true,
          options: ['push_only', 'unconfigured_rest', 'mock_water_meter', 'mock_iot_gateway',
            ...catalogue.map((c) => c['adapter_code'] as string)] },
        { name: 'programme_code', label: 'Programme code (required for pull adapters)', type: 'text',
          hint: 'Programme the pulled records belong to, e.g. TEST-FF – the code on the Programmes page' },
        { name: 'is_mock', label: 'Mock / demo source', type: 'boolean', hint: 'Set automatically for catalogue adapters' },
        { name: 'auth_type', label: 'Authentication', type: 'select', options: ['api_key', 'oauth2', 'basic', 'none'] },
        { name: 'base_url_env_var', label: 'Base URL environment variable', type: 'text', hint: 'Secrets/URLs live in environment config' },
        { name: 'owner', label: 'Owner', type: 'text' },
        { name: 'availability_note', label: 'Availability / contract status', type: 'textarea' },
      ],
      value: { source_type: 'rest_push', adapter_code: 'push_only', auth_type: 'api_key' },
      submit: (v) => {
        const { programme_code, ...body } = v;
        const e = entry(body['adapter_code']);
        const payload = e
          ? { ...body, source_type: 'rest_pull', is_mock: e['is_mock'], config: { ...e['config'], programme_code } }
          : body;
        return firstValueFrom(this.api.post('/integrations/sources', payload));
      },
    });
    if (saved?.['source_code']) this.router.navigate(['/integrations', saved['source_code']]);
  }
}

@Component({
  selector: 'app-source-detail',
  imports: [PageHeader, Notice, DetailGrid, DataTable, StatusBadge, MatTabsModule, MatButtonModule, MatIconModule],
  template: `
    @if (source(); as s) {
      <app-page-header [title]="s['name']" [subtitle]="s['source_code'] + ' · ' + s['connection_status']" back="/integrations">
        <ng-container badges>@if (s['is_mock']) {<span class="badge tone-demo">MOCK</span>}<app-status [status]="s['enabled'] ? 'active' : 'inactive'" /></ng-container>
        @if (auth.has('integration.manage')) {
          @if (s['adapter_code'] === 'farmfuture_water_engine' && auth.has('farmer.manage')) {
            <button mat-stroked-button (click)="importFarms()"><mat-icon>download</mat-icon> Import farms from FarmFuture</button>
          }
          @if (s['adapter_code'] === 'farmfuture_soil_microclimate' && auth.has('module.write')) {
            <button mat-stroked-button (click)="importDevices()"><mat-icon>sensors</mat-icon> Import devices from FarmFuture</button>
          }
          @if (s['source_type'] === 'rest_pull') {<button mat-flat-button (click)="pull()"><mat-icon>sync</mat-icon> Run pull</button>}
          <button mat-stroked-button (click)="testPayload()"><mat-icon>science</mat-icon> Test payload</button>
          <button mat-stroked-button (click)="edit(s)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="rotateKey()"><mat-icon>key</mat-icon> Rotate inbound key</button>
        }
      </app-page-header>
      @if (newKey()) {<app-notice kind="warning">New inbound key (shown once – store it in the source system's secret store):
        <code>{{ newKey() }}</code></app-notice>}
      <mat-tab-group>
        <mat-tab label="Overview"><section class="panel"><app-details [items]="[
          { label: 'Type', value: s['source_type'], kind: 'label' }, { label: 'Adapter', value: s['adapter_code'] },
          { label: 'Authentication', value: s['auth_type'] }, { label: 'Base URL env var', value: s['base_url_env_var'], kind: 'mono' },
          { label: 'Owner', value: s['owner'] }, { label: 'Inbound key', value: s['inbound_key_hint'] ?? 'not issued' },
          { label: 'Inbound endpoints', value: '/api/v1/integrations/' + s['source_code'] + '/{measurements|observations|advisories}', kind: 'mono', full: true },
          { label: 'Availability', value: s['availability_note'], full: true }, { label: 'Config', value: s['config'], kind: 'json', full: true }]" /></section></mat-tab>
        <mat-tab label="Sync runs"><app-table [columns]="runCols" [rows]="runs()" (rowClick)="showQuarantine($event)" /></mat-tab>
        <mat-tab label="Quarantine ({{ quarantine().length }})">
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('integration.replay') && quarantine().length) {<button mat-flat-button (click)="replayAll()"><mat-icon>replay</mat-icon> Replay open records</button>}
          </div>
          <app-table [columns]="quarantineCols" [rows]="quarantine()" (rowClick)="discard($event)" />
        </mat-tab>
        <mat-tab label="Field mappings">
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('integration.manage')) {<button mat-stroked-button (click)="addMapping()"><mat-icon>add</mat-icon> Add mapping</button>}
          </div>
          <app-table [columns]="mappingCols" [rows]="mappings()" (rowClick)="removeMapping($event)" />
        </mat-tab>
        <mat-tab label="Identity maps">
          <app-notice>Reviewed mappings of the source's farmer, plot and device IDs to platform records. Ambiguous identities are never
            auto-merged.</app-notice>
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('integration.manage')) {<button mat-stroked-button (click)="addIdentity()"><mat-icon>add</mat-icon> Add identity map</button>}
          </div>
          <app-table [columns]="identityCols" [rows]="identities()" [clickable]="false" />
        </mat-tab>
      </mat-tab-group>
    }`,
})
export class SourceDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly code = input.required<string>();
  protected readonly source = signal<Row | null>(null);
  protected readonly runs = signal<Row[]>([]);
  protected readonly quarantine = signal<Row[]>([]);
  protected readonly mappings = signal<Row[]>([]);
  protected readonly identities = signal<Row[]>([]);
  protected readonly newKey = signal('');
  protected readonly runCols: Column[] = [
    { key: 'started_at', label: 'Started', kind: 'datetime' }, { key: 'trigger', label: 'Trigger', kind: 'label' },
    { key: 'payload_kind', label: 'Payload', kind: 'label' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'records_read', label: 'Read', kind: 'number' }, { key: 'records_accepted', label: 'Accepted', kind: 'number' },
    { key: 'records_duplicate', label: 'Duplicate', kind: 'number' }, { key: 'records_rejected', label: 'Rejected', kind: 'number' },
    { key: 'cursor', label: 'Cursor' },
  ];
  protected readonly quarantineCols: Column[] = [
    { key: 'source_record_id', label: 'Source record' }, { key: 'errors', label: 'Errors', value: (r) => r['errors']?.join('; ') },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'created_at', label: 'Received', kind: 'datetime' },
  ];
  protected readonly mappingCols: Column[] = [
    { key: 'payload_kind', label: 'Payload', kind: 'label' }, { key: 'source_field', label: 'Source field' },
    { key: 'target_field', label: 'Canonical field' }, { key: 'value_map', label: 'Value map', value: (r) => (r['value_map'] ? JSON.stringify(r['value_map']) : '') },
  ];
  protected readonly identityCols: Column[] = [
    { key: 'entity_type', label: 'Entity', kind: 'label' }, { key: 'source_record_id', label: 'Source ID' },
    { key: 'internal_record_id', label: 'Platform record' }, { key: 'review_note', label: 'Note' },
    { key: 'first_seen_at', label: 'Mapped', kind: 'datetime' },
  ];

  ngOnInit(): void {
    const code = this.code();
    this.api.get<Row>(`/integrations/sources/${code}`).subscribe((s) => this.source.set(s));
    this.api.get<Page<Row>>(`/integrations/${code}/sync-runs`, { page_size: 50 }).subscribe((p) => this.runs.set(p.items));
    this.api.get<Page<Row>>('/integrations/quarantine', { source_code: code, page_size: 100 }).subscribe((p) => this.quarantine.set(p.items));
    this.api.get<Row[]>(`/integrations/sources/${code}/mappings`).subscribe((m) => this.mappings.set(m));
    this.api.get<Row[]>(`/integrations/sources/${code}/identity-maps`).subscribe((m) => this.identities.set(m));
  }

  protected pull(): void {
    this.api.post<Row>(`/integrations/${this.code()}/pull`).subscribe((r) => {
      const run = r['sync_run'];
      this.notify.success(`Pull ${run.status}: ${run.records_accepted} accepted, ${run.records_duplicate} duplicate, ${run.records_rejected} quarantined`);
      this.ngOnInit();
    });
  }

  protected async importFarms(): Promise<void> {
    const out = await openForm<Row>(this.dialog, {
      title: 'Import farms from FarmFuture',
      submitLabel: 'Import',
      notice: 'Reads the estates and farms this token can see (read-only) and creates one farmer per estate and one farm ' +
        'with one plot per FarmFuture farm, linked by identity maps. FarmFuture has no consent, enrolment, household or ' +
        'programme geography: imported farmers have consent "not recorded" and no enrolment until programme staff record them.',
      fields: [
        { name: 'geo_unit_id', label: 'Place imported farmers in (cluster/district)', type: 'lookup', lookup: 'geo', required: true },
        { name: 'primary_fpo_id', label: 'Primary FPO (optional)', type: 'lookup', lookup: 'fpo' },
        { name: 'test_label', label: 'Mark as TEST (not programme beneficiaries)', type: 'boolean' },
      ],
      value: { test_label: true },
      submit: (v) => firstValueFrom(this.api.post<Row>(`/integrations/sources/${this.code()}/import-farms`, v)),
    });
    if (!out) return;
    const skipped = out['skipped']?.length ? `; ${out['skipped'].length} skipped` : '';
    this.notify.success(`Imported ${out['farmers_created']} farmers and ${out['farms_created']} farms ` +
      `(${out['already_imported']} already imported${skipped})`);
    this.ngOnInit();
  }

  protected async importDevices(): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: 'Import devices from FarmFuture',
      message: 'Reads the devices installed on the FarmFuture farms already linked to platform plots (read-only) and ' +
        'registers each SoilSync and MicroClime device on its plot, linked by an identity map. Hubs, air-quality and ' +
        'analogue weather devices have no platform device type and are skipped.',
      confirmLabel: 'Import' });
    if (!ok) return;
    this.api.post<Row>(`/integrations/sources/${this.code()}/import-devices`).subscribe((out) => {
      const skipped = out['skipped']?.length ? `; ${out['skipped'].length} skipped (${out['skipped'].join('; ')})` : '';
      this.notify.success(`Registered ${out['devices_created']} devices from ${out['farms']} farms ` +
        `(${out['already_imported']} already imported${skipped})`);
      this.ngOnInit();
    });
  }

  protected async testPayload(): Promise<void> {
    const out = await openForm<Row>(this.dialog, {
      title: 'Test sample payload (dry run – nothing is saved)',
      fields: [{ name: 'payload_kind', label: 'Payload kind', type: 'select', required: true, options: ['measurements', 'observations', 'advisories'] },
        { name: 'records', label: 'Records (JSON array)', type: 'json', required: true }],
      value: { payload_kind: 'measurements', records: [] },
      submit: (v) => firstValueFrom(this.api.post(`/integrations/${this.code()}/test-payload`, v)),
    });
    if (out) {
      const outcomes = out['outcomes'] as Row[];
      this.notify.success(outcomes.map((o) => `${o['source_record_id'] || '#' + o['index']}: ${o['result']}${o['errors'] ? ' – ' + o['errors'].join('; ') : ''}`).join(' | '));
    }
  }

  protected async edit(s: Row): Promise<void> {
    const catalogue = await firstValueFrom(this.api.get<Row[]>('/integrations/catalogue'));
    const saved = await openForm(this.dialog, {
      title: `Edit ${s['source_code']}`, value: { ...s, programme_code: s['config']?.['programme_code'] ?? '' },
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'programme_code', label: 'Programme code (pull adapters)', type: 'text',
          hint: 'Programme the pulled records belong to, e.g. TEST-FF – the code on the Programmes page' },
        { name: 'module_code', label: 'Workstream', type: 'lookup', lookup: 'module' },
        { name: 'source_type', label: 'Type', type: 'select', required: true, options: ['rest_push', 'rest_pull', 'file_exchange'],
          hint: 'Catalogue adapters fetch data themselves – use rest_pull' },
        { name: 'adapter_code', label: 'Adapter', type: 'select', required: true,
          options: ['push_only', 'unconfigured_rest', 'mock_water_meter', 'mock_iot_gateway',
            ...catalogue.map((c) => c['adapter_code'] as string)] },
        { name: 'enabled', label: 'Enabled (accepts data / runs pulls)', type: 'boolean' },
        { name: 'auth_type', label: 'Authentication', type: 'select', options: ['api_key', 'oauth2', 'basic', 'none'] },
        { name: 'base_url_env_var', label: 'Base URL environment variable', type: 'text', hint: 'Secrets/URLs live in environment config' },
        { name: 'owner', label: 'Owner', type: 'text' },
        { name: 'availability_note', label: 'Availability / contract status', type: 'textarea' },
      ],
      submit: (v) => {
        const { programme_code, ...body } = v;
        const pull = catalogue.some((c) => c['adapter_code'] === body['adapter_code']);
        const config = pull ? { ...(s['config'] ?? {}), programme_code: programme_code || null } : undefined;
        return firstValueFrom(this.api.patch(`/integrations/sources/${s['source_code']}`, config ? { ...body, config } : body));
      },
    });
    if (saved) this.ngOnInit();
  }

  protected async rotateKey(): Promise<void> {
    const ok = await confirmAction(this.dialog, { title: 'Rotate inbound key', message: 'The previous key stops working immediately.', danger: true });
    if (ok) this.api.post<Row>(`/integrations/sources/${this.code()}/rotate-key`).subscribe((r) => { this.newKey.set(r['inbound_key']); this.ngOnInit(); });
  }

  protected showQuarantine(run: Row): void {
    if (run['records_rejected']) this.api.get<Row[]>(`/integrations/sync-runs/${run['id']}/quarantine`)
      .subscribe((q) => this.notify.error(q.map((x) => `${x['source_record_id']}: ${x['errors'].join('; ')}`).join(' | ')));
  }

  protected replayAll(): void {
    const ids = this.quarantine().filter((q) => q['status'] === 'open').map((q) => q['id']);
    this.api.post<Row>(`/integrations/${this.code()}/replay`, { quarantine_ids: ids }).subscribe((r) => {
      this.notify.success(`Replay: ${r['sync_run'].records_accepted} accepted, ${r['sync_run'].records_rejected} still failing`);
      this.ngOnInit();
    });
  }

  protected async discard(q: Row): Promise<void> {
    if (!this.auth.has('integration.replay') || q['status'] !== 'open') return;
    const res = await confirmAction(this.dialog, { title: 'Discard quarantined record', message: q['errors'].join('; '),
      noteLabel: 'Reason', noteRequired: true, danger: true });
    if (res) this.api.post(`/integrations/quarantine/${q['id']}/discard`, { note: res.note }).subscribe(() => this.ngOnInit());
  }

  protected async addMapping(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add field mapping',
      fields: [{ name: 'payload_kind', label: 'Payload', type: 'select', required: true, options: ['measurements', 'observations', 'advisories'] },
        { name: 'source_field', label: 'Source field', type: 'text', required: true },
        { name: 'target_field', label: 'Canonical field', type: 'text', required: true, hint: 'Use attributes.x for nested attributes' },
        { name: 'value_map', label: 'Value map', type: 'json', hint: 'Optional, e.g. {"L": "litre"}' }],
      value: { payload_kind: 'measurements' },
      submit: (v) => firstValueFrom(this.api.post(`/integrations/sources/${this.code()}/mappings`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async removeMapping(m: Row): Promise<void> {
    if (!this.auth.has('integration.manage')) return;
    const ok = await confirmAction(this.dialog, { title: 'Remove mapping', message: `${m['source_field']} → ${m['target_field']}`, danger: true });
    if (ok) this.api.delete(`/integrations/mappings/${m['id']}`).subscribe(() => this.ngOnInit());
  }

  protected async addIdentity(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add reviewed identity map',
      fields: [{ name: 'entity_type', label: 'Entity', type: 'select', required: true, options: ['farm_plot', 'farmer', 'device'] },
        { name: 'source_id', label: 'Source system ID', type: 'text', required: true },
        { name: 'plot_id', label: 'Platform plot', type: 'plot', showIf: (v) => v['entity_type'] === 'farm_plot' },
        { name: 'farmer_id', label: 'Platform farmer', type: 'farmer', showIf: (v) => v['entity_type'] === 'farmer' },
        { name: 'device_id', label: 'Platform device', type: 'lookup', lookup: 'device', showIf: (v) => v['entity_type'] === 'device' },
        { name: 'review_note', label: 'Review note', type: 'textarea' }],
      value: { entity_type: 'farm_plot' },
      submit: (v) => firstValueFrom(this.api.post(`/integrations/sources/${this.code()}/identity-maps`, {
        entity_type: v['entity_type'], source_id: v['source_id'], review_note: v['review_note'],
        internal_id: v['plot_id'] ?? v['farmer_id'] ?? v['device_id'] })),
    });
    if (saved) this.ngOnInit();
  }
}
