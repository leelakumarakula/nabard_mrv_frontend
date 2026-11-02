import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
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
import { PageHeader } from '../../shared/page-header';
import { recordFields, toRecordPayload } from '../../shared/record-form';

const SITE_FIELDS: FieldDef[] = [
  { name: 'site_code', label: 'Site code', type: 'text', required: true },
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'category', label: 'Category', type: 'select', required: true, options: ['plantation', 'soil_moisture'] },
  { name: 'host_farmer_id', label: 'Host farmer', type: 'farmer' },
  { name: 'farm_plot_id', label: 'Site plot', type: 'plot' },
  { name: 'geo_unit_id', label: 'Area (if no host/plot)', type: 'lookup', lookup: 'geo' },
  { name: 'organisation_id', label: 'FPO / grower group', type: 'lookup', lookup: 'fpo' },
  { name: 'practices', label: 'Practices demonstrated', type: 'multiselect' },
  { name: 'status', label: 'Status', type: 'select', options: ['planned', 'established', 'active', 'closed'] },
  { name: 'established_on', label: 'Established on', type: 'date' },
  { name: 'selection_note', label: 'Selection criteria / note', type: 'textarea', hint: 'Selection criteria pending programme approval' },
];

async function withPracticeOptions(lookups: LookupsService, fields: FieldDef[]): Promise<FieldDef[]> {
  const activities = await firstValueFrom(lookups.activities());
  const options = activities.map((a) => ({ value: a.activity_code, label: `${a.activity_code} – ${a.name}` }));
  return fields.map((f) => (f.name === 'practices' ? { ...f, options } : f));
}

@Component({
  selector: 'app-demo-sites',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Demonstration sites" subtitle="Plantation and soil/moisture demonstration sites (proposal target: 60 + 60)">
      @if (auth.has('community.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New site</button>}
    </app-page-header>
    <div class="filters">
      <mat-form-field><mat-label>Category</mat-label><mat-select [formControl]="category"><mat-option [value]="null">All</mat-option>
        <mat-option value="plantation">Plantation</mat-option><mat-option value="soil_moisture">Soil & moisture</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/demonstration-sites', $event['id']])" />`,
})
export class DemoSitesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly category = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'site_code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category', kind: 'label' },
    { key: 'geo_unit', label: 'Area', kind: 'ref' }, { key: 'host_farmer', label: 'Host', kind: 'ref' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'visit_count', label: 'Visits', kind: 'number' },
    { key: 'last_visit_at', label: 'Last visit', kind: 'date' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/demonstration-sites', {
    page, page_size: size, category: this.category.value }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
    this.category.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const fields = await withPracticeOptions(this.lookups, SITE_FIELDS);
    const saved = await openForm<Row>(this.dialog, {
      title: 'New demonstration site', fields, value: { category: 'plantation', status: 'planned' },
      submit: (v) => firstValueFrom(this.api.post('/demonstration-sites', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/demonstration-sites', saved['id']]);
  }
}

@Component({
  selector: 'app-demo-site-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, MatButtonModule, MatIconModule],
  template: `
    @if (site(); as s) {
      <app-page-header [title]="s['name']" [subtitle]="s['site_code'] + ' · ' + s['category']" back="/demonstration-sites">
        <ng-container badges><app-status [status]="s['status']" /><app-demo [show]="s['is_demo']" /></ng-container>
        @if (auth.has('community.manage')) {<button mat-stroked-button (click)="edit(s)"><mat-icon>edit</mat-icon> Edit</button>}
        @if (auth.has('module.write')) {<button mat-flat-button (click)="addVisit()"><mat-icon>add</mat-icon> Record visit</button>}
      </app-page-header>
      <section class="panel">
        <app-details [items]="[
          { label: 'Area', value: s['geo_unit']?.label }, { label: 'FPO / group', value: s['organisation']?.label },
          { label: 'Host farmer', value: s['host_farmer']?.label }, { label: 'Plot', value: s['farm_plot']?.label },
          { label: 'Established', value: s['established_on'], kind: 'date' }, { label: 'Visits', value: s['visit_count'] },
          { label: 'Practices', value: s['practices']?.join(', '), full: true },
          { label: 'Selection note', value: s['selection_note'], full: true }]" />
      </section>

      @if (criteria().length) {
        <section class="panel">
          <div class="panel-head"><h3>Configured criteria</h3>
            @if (auth.has('community.manage')) {<button mat-stroked-button (click)="assess()"><mat-icon>checklist</mat-icon> Assess criteria</button>}</div>
          @for (c of criteria(); track c['code']) {
            <div class="evidence-row"><mat-icon>{{ s['criteria_assessment']?.[c['code']]?.met ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              <span class="grow">{{ c['label'] }} @if (c['required']) {<span class="badge tone-warning">required</span>}</span>
              <span class="muted small">{{ s['criteria_assessment']?.[c['code']]?.note ?? '' }}</span></div>
          }
        </section>
      }
      <section class="panel"><h3>Visits & observations</h3>
        <app-table [columns]="visitCols" [rows]="visits()" (rowClick)="router.navigate(['/records', $event['id']])" /></section>
      <app-evidence-panel entityType="demonstration_site" [entityId]="s['id']" />
    }`,
})
export class DemoSiteDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  readonly id = input.required<string>();
  protected readonly site = signal<Row | null>(null);
  protected readonly visits = signal<Row[]>([]);
  private visitType: RecordType | null = null;
  protected readonly criteria = signal<Row[]>([]);
  protected readonly visitCols: Column[] = [
    { key: 'observed_at', label: 'Date', kind: 'date' }, { key: 'visit_type', label: 'Visit', value: (r) => r['attributes']?.visit_type },
    { key: 'participants', label: 'Participants (women)',
      value: (r) => `${r['attributes']?.participants_count ?? '—'} (${r['attributes']?.women_participants_count ?? '—'})` },
    { key: 'observations', label: 'Observations', value: (r) => r['attributes']?.observations },
    { key: 'validation_status', label: 'Validation', kind: 'status' },
  ];

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.lookups.recordTypes().subscribe((t) => (this.visitType = t.find((x) => x.code === 'demonstration_visit') ?? null));
    this.api.get<Row>(`/demonstration-sites/${this.id()}`).subscribe((s) => this.site.set(s));
    this.api.get<Row>('/configuration/checklists').subscribe((c) => this.criteria.set(c['demonstration_site'].items));
    this.api.get<Page<Row>>('/field-records', { demonstration_site_id: this.id(), page_size: 100 }).subscribe((p) => this.visits.set(p.items));
  }

  protected async edit(s: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit demonstration site', value: s,
      fields: (await withPracticeOptions(this.lookups, SITE_FIELDS))
        .filter((f) => !['site_code', 'category', 'geo_unit_id', 'organisation_id'].includes(f.name)),
      submit: (v) => firstValueFrom(this.api.patch(`/demonstration-sites/${s['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

protected async assess(): Promise<void> {
    const current = this.site()?.['criteria_assessment'] ?? {};
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
        return firstValueFrom(this.api.patch(`/demonstration-sites/${this.id()}`, { criteria_assessment: assessment }));
      },
    });
    if (saved) this.ngOnInit();
  }

  protected async addVisit(): Promise<void> {
    if (!this.visitType) return;
    const saved = await openForm<Row>(this.dialog, {
      title: 'Record demonstration visit', fields: recordFields(this.visitType, true), submitLabel: 'Save draft',
      submit: (v) => firstValueFrom(this.api.post('/field-records', {
        ...toRecordPayload(v), record_type: 'demonstration_visit', demonstration_site_id: this.id(),
        programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/records', saved['id']]);
  }
}
