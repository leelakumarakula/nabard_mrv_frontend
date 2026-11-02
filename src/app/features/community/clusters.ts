import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Page, RecordType, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';
import { recordFields, toRecordPayload } from '../../shared/record-form';

const CLUSTER_FIELDS: FieldDef[] = [
  { name: 'cluster_code', label: 'Cluster code', type: 'text', required: true },
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'geo_unit_id', label: 'Area', type: 'lookup', lookup: 'geo', required: true },
  { name: 'organisation_id', label: 'FPO / grower group', type: 'lookup', lookup: 'fpo' },
  { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'inactive'] },
  { name: 'established_on', label: 'Established on', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

@Component({
  selector: 'app-clusters',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Pest surveillance clusters" subtitle="Proposal target: 30 clusters; household participation and inspections">
      @if (auth.has('community.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New cluster</button>}
    </app-page-header>
    <app-notice>Pest predictions are risk estimates, not diagnoses. Inspections in a cluster record the observed incidence and
      severity; follow-up actions are recorded as practice records.</app-notice>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/surveillance-clusters', $event['id']])" />`,
})
export class ClustersPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly columns: Column[] = [
    { key: 'cluster_code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'geo_unit', label: 'Area', kind: 'ref' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'member_households', label: 'Households', kind: 'number' },
    { key: 'inspections', label: 'Inspections', kind: 'number' }, { key: 'last_inspection_at', label: 'Last inspection', kind: 'date' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/surveillance-clusters', { page, page_size: size }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'New pest surveillance cluster', fields: CLUSTER_FIELDS, value: { status: 'planned' },
      submit: (v) => firstValueFrom(this.api.post('/surveillance-clusters', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/surveillance-clusters', saved['id']]);
  }
}

@Component({
  selector: 'app-cluster-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, MatButtonModule, MatIconModule],
  template: `
    @if (cluster(); as c) {
      <app-page-header [title]="c['name']" [subtitle]="c['cluster_code'] + ' · ' + (c['geo_unit']?.label ?? '')" back="/surveillance-clusters">
        <ng-container badges><app-status [status]="c['status']" /><app-demo [show]="c['is_demo']" /></ng-container>
        @if (auth.has('community.manage')) {
          <button mat-stroked-button (click)="edit(c)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="addMember()"><mat-icon>group_add</mat-icon> Add household member</button>
        }
        @if (auth.has('module.write')) {<button mat-flat-button (click)="addInspection()"><mat-icon>search</mat-icon> Record inspection</button>}
      </app-page-header>
      <div class="stat-row">
        <div class="stat"><div class="value">{{ c['member_households'] }}</div><div class="label">Participating households</div></div>
        <div class="stat"><div class="value">{{ c['inspections'] }}</div><div class="label">Valid inspections</div></div>
      </div>
      <section class="panel"><app-details [items]="[
        { label: 'FPO / group', value: c['organisation']?.label }, { label: 'Established', value: c['established_on'], kind: 'date' },
        { label: 'Target pests', value: c['target_pests']?.join(', ') }, { label: 'Notes', value: c['notes'], full: true }]" /></section>

      @if (criteria().length) {
        <section class="panel">
          <div class="panel-head"><h3>Configured criteria</h3>
            @if (auth.has('community.manage')) {<button mat-stroked-button (click)="assess()"><mat-icon>checklist</mat-icon> Assess criteria</button>}</div>
          @for (c of criteria(); track c['code']) {
            <div class="evidence-row"><mat-icon>{{ c['criteria_assessment']?.[c['code']]?.met ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              <span class="grow">{{ c['label'] }} @if (c['required']) {<span class="badge tone-warning">required</span>}</span>
              <span class="muted small">{{ c['criteria_assessment']?.[c['code']]?.note ?? '' }}</span></div>
          }
        </section>
      }
      <section class="panel"><h3>Members</h3>
        <app-table [columns]="memberCols" [rows]="members()" (rowClick)="toggleMember($event)" /></section>
      <section class="panel"><h3>Inspections</h3>
        <app-table [columns]="inspectionCols" [rows]="inspections()" (rowClick)="router.navigate(['/records', $event['id']])" /></section>
      <app-evidence-panel entityType="pest_surveillance_cluster" [entityId]="c['id']" />
    }`,
})
export class ClusterDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  readonly id = input.required<string>();
  protected readonly cluster = signal<Row | null>(null);
  protected readonly members = signal<Row[]>([]);
  protected readonly inspections = signal<Row[]>([]);
  private inspectionType: RecordType | null = null;
  protected readonly criteria = signal<Row[]>([]);
  protected readonly memberCols: Column[] = [
    { key: 'farmer', label: 'Farmer', kind: 'ref' }, { key: 'role', label: 'Role', kind: 'label' },
    { key: 'joined_on', label: 'Joined', kind: 'date' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly inspectionCols: Column[] = [
    { key: 'observed_at', label: 'Date', kind: 'date' }, { key: 'farm_plot', label: 'Plot', kind: 'ref' },
    { key: 'pest', label: 'Pest/disease', value: (r) => r['attributes']?.pest_or_disease },
    { key: 'incidence', label: 'Incidence %', value: (r) => r['attributes']?.incidence_pct },
    { key: 'severity', label: 'Severity', value: (r) => r['attributes']?.severity_score },
    { key: 'validation_status', label: 'Validation', kind: 'status' },
  ];

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.lookups.recordTypes().subscribe((t) => (this.inspectionType = t.find((x) => x.code === 'pest_inspection') ?? null));
    this.api.get<Row>(`/surveillance-clusters/${this.id()}`).subscribe((c) => this.cluster.set(c));
    this.api.get<Row>('/configuration/checklists').subscribe((c) => this.criteria.set(c['pest_surveillance_cluster'].items));
    this.api.get<Row[]>(`/surveillance-clusters/${this.id()}/members`).subscribe((m) => this.members.set(m));
    this.api.get<Page<Row>>('/field-records', { surveillance_cluster_id: this.id(), page_size: 100 }).subscribe((p) => this.inspections.set(p.items));
  }

  protected async edit(c: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit cluster', value: c, fields: CLUSTER_FIELDS.filter((f) => !['cluster_code', 'geo_unit_id'].includes(f.name)),
      submit: (v) => firstValueFrom(this.api.patch(`/surveillance-clusters/${c['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async addMember(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add household member',
      fields: [{ name: 'farmer_id', label: 'Farmer', type: 'farmer', required: true },
        { name: 'role', label: 'Role', type: 'select', options: ['participant', 'lead_scout'] },
        { name: 'joined_on', label: 'Joined on', type: 'date' }],
      value: { role: 'participant' },
      submit: (v) => firstValueFrom(this.api.post(`/surveillance-clusters/${this.id()}/members`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async toggleMember(m: Row): Promise<void> {
    if (!this.auth.has('community.manage')) return;
    const saved = await openForm(this.dialog, {
      title: `Membership – ${m['farmer']?.label}`, value: m,
      fields: [{ name: 'status', label: 'Status', type: 'select', options: ['active', 'left'] },
        { name: 'role', label: 'Role', type: 'select', options: ['participant', 'lead_scout'] }],
      submit: (v) => firstValueFrom(this.api.patch(`/cluster-memberships/${m['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

protected async assess(): Promise<void> {
    const current = this.cluster()?.['criteria_assessment'] ?? {};
    const fields: FieldDef[] = this.criteria().flatMap((c) => [
      { name: 'met__' + c['code'], label: c['label'] + (c['required'] ? ' (required)' : ''), type: 'boolean' as const },
      { name: 'note__' + c['code'], label: 'Note', type: 'text' as const },
    ]);
    const value: Row = {};
    for (const c of this.criteria()) {
      value['met__' + c['code']] = !!current[c['code']]?.met;
      value['note__' + c['code']] = current[c['code']]?.note ?? null;
    }
    const saved = await openForm(this.dialog, {
      title: 'Assess configured criteria', fields, value,
      submit: (v) => {
        const assessment: Row = {};
        for (const c of this.criteria()) assessment[c['code']] = { met: !!v['met__' + c['code']], note: v['note__' + c['code']] };
        return firstValueFrom(this.api.patch(`/surveillance-clusters/${this.id()}`, { criteria_assessment: assessment }));
      },
    });
    if (saved) this.ngOnInit();
  }

  protected async addInspection(): Promise<void> {
    if (!this.inspectionType) return;
    const fields = recordFields(this.inspectionType).filter((f) => f.name !== 'surveillance_cluster_id');
    const saved = await openForm<Row>(this.dialog, {
      title: 'Record cluster inspection', fields, submitLabel: 'Save draft',
      submit: (v) => firstValueFrom(this.api.post('/field-records', {
        ...toRecordPayload(v), record_type: 'pest_inspection', surveillance_cluster_id: this.id(),
        programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/records', saved['id']]);
  }
}
