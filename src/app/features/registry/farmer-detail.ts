import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatNumber } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { Notice, PageHeader } from '../../shared/page-header';
import { farmerFields, fromFarmer, toFarmerPayload } from './farmers';

const FARM_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Name', type: 'text' }, { name: 'village', label: 'Village', type: 'text' },
  { name: 'total_area', label: 'Total area', type: 'number', min: 0, hint: 'Should cover the areas of its plots' },
  { name: 'area_unit', label: 'Area unit', type: 'select', options: ['ha', 'acre'] },
  { name: 'area_source', label: 'Area source', type: 'select', options: ['declared', 'surveyed', 'gps_measured', 'records'] },
];

const PLOT_FIELDS: FieldDef[] = [
  { name: 'plot_code', label: 'Plot code', type: 'text', required: true },
  { name: 'area', label: 'Area', type: 'number', min: 0 },
  { name: 'area_unit', label: 'Area unit', type: 'select', options: ['ha', 'acre'] },
  { name: 'area_source', label: 'Area source', type: 'select', options: ['declared', 'surveyed', 'gps_measured', 'records'] },
  { name: 'crop', label: 'Crop', type: 'select', options: ['arabica', 'robusta', 'mixed', 'other'] },
  { name: 'variety', label: 'Variety', type: 'text' },
  { name: 'plantation_year', label: 'Plantation year', type: 'integer' },
  { name: 'shade_type', label: 'Shade type', type: 'text' },
  { name: 'irrigation_type', label: 'Irrigation type', type: 'text' },
  { name: 'latitude', label: 'Latitude (restricted)', type: 'number', min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude (restricted)', type: 'number', min: -180, max: 180 },
];

@Component({
  selector: 'app-farmer-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, Notice, MatTabsModule, MatButtonModule, MatIconModule],
  template: `
    @if (farmer(); as f) {
      <app-page-header [title]="f['full_name']" [subtitle]="f['farmer_code'] + ' · ' + (f['geo_unit']?.label ?? '')" back="/farmers">
        <ng-container badges><app-status [status]="f['consent_status']" prefix="Consent" /><app-demo [show]="f['is_demo']" /></ng-container>
        @if (auth.has('farmer.manage')) {
          <button mat-stroked-button (click)="edit(f)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="enrol(f)"><mat-icon>how_to_reg</mat-icon> Enrolment</button>
          <button mat-stroked-button (click)="addFarm()"><mat-icon>add_home</mat-icon> Add farm</button>
        }
      </app-page-header>
      @if (f['pii_masked']) {<app-notice>Contact and precise location details are hidden for your role.</app-notice>}
      <mat-tab-group>
        <mat-tab label="Profile">
          <section class="panel">
            <app-details [items]="[
              { label: 'Household', value: f['household_code'] },
              { label: 'Primary FPO / group', value: f['primary_fpo']?.label }, { label: 'Village', value: f['village'] },
              { label: 'Gender', value: f['gender'], kind: 'label' }, { label: 'Year of birth', value: f['year_of_birth'] },
              { label: 'Phone', value: f['phone'] }, { label: 'Status', value: f['status'], kind: 'status' },
              { label: 'Consent', value: f['consent_status'], kind: 'status' }, { label: 'Consent date', value: f['consent_date'], kind: 'date' },
              { label: 'Consent purpose', value: f['consent_purpose'], full: true },
              { label: 'Total plot area (ha)', value: f['total_plot_area_ha'], kind: 'number' },
              { label: 'Demographic data', value: f['demographics'], kind: 'json', full: true }]" />
            @if (f['sensitive_masked']) {<p class="muted small">Some sensitive attributes or categories are hidden for your role.</p>}
          </section>
          <section class="panel">
            <div class="panel-head"><h3>Beneficiary categories</h3>
              @if (auth.has('farmer.manage')) {<button mat-stroked-button (click)="assignCategory()"><mat-icon>add</mat-icon> Assign category</button>}</div>
            <p class="muted small">Assigned explicitly with a recorded basis – never inferred from other attributes. Category
              definitions marked "proposed" are pending programme-owner approval.</p>
            <app-table [columns]="categoryCols" [rows]="categories()" (rowClick)="editAssignment($event)" emptyText="No categories assigned" />
          </section>
          <section class="panel">
            <h3>Programme participation</h3>
            @for (p of f['participations']; track p.id) {
              <div class="evidence-row"><span class="grow">{{ programmeName(p.programme_id) }} · enrolled {{ p.enrolled_on ?? '—' }}</span>
                <app-status [status]="p.status" /></div>
            } @empty {<p class="muted">Not enrolled in any programme.</p>}
          </section>
        </mat-tab>
        <mat-tab label="Farms & plots ({{ plotCount(f) }})">
          @for (farm of f['farms']; track farm.id) {
            <section class="panel">
              <div class="panel-head">
                <h3>{{ farm.farm_code }} {{ farm.name ? '– ' + farm.name : '' }}
                  <span class="muted small">{{ n(farm.total_area) }} {{ farm.area_unit }} ({{ farm.area_source ?? 'source not recorded' }})</span></h3>
                @if (auth.has('farmer.manage')) {
                  <span><button mat-stroked-button (click)="editFarm(farm)"><mat-icon>edit</mat-icon> Edit farm</button>
                    <button mat-stroked-button (click)="addPlot(farm.id)"><mat-icon>add</mat-icon> Add plot</button></span>
                }
              </div>
              <app-table [columns]="plotCols" [rows]="farm.plots" (rowClick)="auth.has('farmer.manage') && editPlot($event)" />
            </section>
          } @empty {<p class="muted">No farms registered.</p>}
        </mat-tab>
        <mat-tab label="Advisories received">
          <app-table [columns]="deliveryCols" [rows]="deliveries()" (rowClick)="router.navigate(['/advisories', $event['advisory_id']])" />
        </mat-tab>
        <mat-tab label="Practices">
          <app-table [columns]="practiceCols" [rows]="practices()" (rowClick)="router.navigate(['/practices', $event['id']])" />
        </mat-tab>
        <mat-tab label="Workstream records">
          <app-table [columns]="recordCols" [rows]="records()" (rowClick)="router.navigate(['/records', $event['id']])" />
        </mat-tab>
        <mat-tab label="Evidence"><app-evidence-panel entityType="farmer" [entityId]="f['id']" /></mat-tab>
      </mat-tab-group>
    }`,
})
export class FarmerDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  readonly id = input.required<string>();
  protected readonly farmer = signal<Row | null>(null);
  protected readonly deliveries = signal<Row[]>([]);
  protected readonly practices = signal<Row[]>([]);
  protected readonly records = signal<Row[]>([]);
  protected readonly categories = signal<Row[]>([]);
  protected readonly categoryCols: Column[] = [
    { key: 'category_name', label: 'Category' }, { key: 'is_sensitive', label: 'Sensitive', kind: 'bool' },
    { key: 'basis', label: 'Basis', kind: 'label' }, { key: 'assigned_on', label: 'Assigned', kind: 'date' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'note', label: 'Note' },
  ];
  protected readonly plotCols: Column[] = [
    { key: 'plot_code', label: 'Plot' }, { key: 'area', label: 'Area', kind: 'number' }, { key: 'area_unit', label: 'Unit' },
    { key: 'area_source', label: 'Area source', kind: 'label' }, { key: 'crop', label: 'Crop', kind: 'label' },
    { key: 'irrigation_type', label: 'Irrigation' }, { key: 'latitude', label: 'Lat' }, { key: 'longitude', label: 'Lon' },
  ];
  protected readonly deliveryCols: Column[] = [
    { key: 'channel', label: 'Channel', kind: 'label' }, { key: 'sent_at', label: 'Sent', kind: 'datetime' },
    { key: 'delivered_at', label: 'Delivered', kind: 'datetime' }, { key: 'response', label: 'Response' },
    { key: 'understood', label: 'Understood', kind: 'bool' },
  ];
  protected readonly practiceCols: Column[] = [
    { key: 'activity_code', label: 'Activity' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'evidence_basis', label: 'Basis', kind: 'label' }, { key: 'verification_status', label: 'Verification', kind: 'status' },
    { key: 'action_date', label: 'Date', kind: 'date' },
  ];
  protected readonly recordCols: Column[] = [
    { key: 'record_type', label: 'Type', kind: 'label' }, { key: 'data_nature', label: 'Nature', kind: 'nature' },
    { key: 'observed_at', label: 'Observed', kind: 'datetime' }, { key: 'validation_status', label: 'Validation', kind: 'status' },
  ];

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.load();
  }

  private load(): void {
    const id = this.id();
    this.api.get<Row>(`/farmers/${id}`).subscribe((f) => this.farmer.set(f));
    this.api.get<Row[]>(`/farmers/${id}/categories`).subscribe((c) => this.categories.set(c));
    if (this.auth.has('advisory.read')) this.api.get<Row[]>(`/farmers/${id}/advisory-deliveries`).subscribe((d) => this.deliveries.set(d));
    if (this.auth.has('module.read')) {
      this.api.get<Page<Row>>('/practice-records', { farmer_id: id, page_size: 100 }).subscribe((p) => this.practices.set(p.items));
      this.api.get<Page<Row>>('/field-records', { farmer_id: id, page_size: 100 }).subscribe((p) => this.records.set(p.items));
    }
  }

  protected n(v: unknown): string {
    return formatNumber(v);
  }

  protected plotCount(f: Row): number {
    return (f['farms'] ?? []).reduce((s: number, farm: Row) => s + farm['plots'].length, 0);
  }

  protected programmeName(id: string): string {
    return this.lookups.programmes().find((p) => p.id === id)?.name ?? id;
  }

  protected async edit(f: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit farmer', fields: [...(await farmerFields(this.api, this.auth.has('farmer.read_sensitive'))).filter((x) => x.name !== 'farmer_code'),
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] }],
      value: fromFarmer(f), submit: (v) => firstValueFrom(this.api.patch(`/farmers/${f['id']}`, toFarmerPayload(v))),
    });
    if (saved) this.load();
  }

  protected async assignCategory(): Promise<void> {
    const categories = await firstValueFrom(this.api.get<Row[]>('/beneficiary-categories'));
    const saved = await openForm(this.dialog, {
      title: 'Assign beneficiary category',
      notice: 'Record only what the farmer declared or what is documented; do not infer categories.',
      fields: [
        { name: 'category_code', label: 'Category', type: 'select', required: true,
          options: categories.map((c) => ({ value: c['code'], label: c['name'] + (c['status'] !== 'approved' ? ' (definition proposed)' : '') })) },
        { name: 'basis', label: 'Basis', type: 'select', required: true, options: ['self_declared', 'document', 'field_verified', 'other'] },
        { name: 'assigned_on', label: 'Date', type: 'date' }, { name: 'note', label: 'Note', type: 'textarea' },
      ],
      value: { basis: 'self_declared' },
      submit: (v) => firstValueFrom(this.api.post(`/farmers/${this.id()}/categories`, v)),
    });
    if (saved) this.load();
  }

  protected async editAssignment(a: Row): Promise<void> {
    if (!this.auth.has('farmer.manage')) return;
    const saved = await openForm(this.dialog, {
      title: a['category_name'], value: a,
      fields: [{ name: 'status', label: 'Status', type: 'select', options: ['active', 'removed'] },
        { name: 'basis', label: 'Basis', type: 'select', options: ['self_declared', 'document', 'field_verified', 'other'] },
        { name: 'note', label: 'Note', type: 'textarea' }],
      submit: (v) => firstValueFrom(this.api.patch(`/farmer-category-assignments/${a['id']}`, v)),
    });
    if (saved) this.load();
  }

  protected async enrol(f: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Programme enrolment',
      notice: f['consent_status'] !== 'given' ? 'Consent must be recorded as given before enrolling.' : undefined,
      fields: [
        { name: 'programme_id', label: 'Programme', type: 'lookup', lookup: 'programme', required: true },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['enrolled', 'withdrawn', 'completed'] },
        { name: 'enrolled_on', label: 'Enrolment date', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      value: { programme_id: this.lookups.currentProgramme()?.id, status: 'enrolled' },
      submit: (v) => firstValueFrom(this.api.post(`/farmers/${f['id']}/participations`, v)),
    });
    if (saved) this.load();
  }

  protected async addFarm(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add farm',
      fields: [{ name: 'farm_code', label: 'Farm code', type: 'text', required: true }, ...FARM_FIELDS],
      value: { area_unit: 'ha' }, submit: (v) => firstValueFrom(this.api.post(`/farmers/${this.id()}/farms`, v)),
    });
    if (saved) this.load();
  }

  protected async editFarm(farm: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: `Edit farm ${farm['farm_code']}`, value: farm,
      fields: [...FARM_FIELDS, { name: 'is_archived', label: 'Archived (no longer part of the holding)', type: 'boolean' }],
      submit: (v) => firstValueFrom(this.api.patch(`/farms/${farm['id']}`, v)),
    });
    if (saved) this.load();
  }

  protected async addPlot(farmId: string): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add plot', fields: PLOT_FIELDS, value: { area_unit: 'ha' },
      submit: (v) => firstValueFrom(this.api.post(`/farms/${farmId}/plots`, v)),
    });
    if (saved) this.load();
  }

  protected async editPlot(plot: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: `Edit plot ${plot['plot_code']}`, fields: PLOT_FIELDS.filter((f) => f.name !== 'plot_code'), value: plot,
      submit: (v) => firstValueFrom(this.api.patch(`/plots/${plot['id']}`, v)),
    });
    if (saved) this.load();
  }
}
