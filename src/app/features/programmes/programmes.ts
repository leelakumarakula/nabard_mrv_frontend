import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Page, Programme, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const PROGRAMME_FIELDS: FieldDef[] = [
  { name: 'code', label: 'Code', type: 'text', required: true },
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'status', label: 'Status', type: 'select', required: true, options: ['draft', 'submitted', 'approved', 'active', 'inactive'] },
  { name: 'funding_framework', label: 'Funding framework', type: 'text' },
  { name: 'version_label', label: 'Programme version', type: 'text', hint: 'e.g. Proposal 29 Oct 2026' },
  { name: 'proposal_date', label: 'Proposal date', type: 'date' },
  { name: 'duration_months', label: 'Duration (months)', type: 'integer', min: 1, max: 240 },
  { name: 'proposal_title', label: 'Proposal title', type: 'text', full: true },
  { name: 'start_date', label: 'Start date', type: 'date' },
  { name: 'end_date', label: 'End date', type: 'date' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'funding_note', label: 'Funding note', type: 'textarea', hint: 'State clearly if amounts are proposals, not sanctions' },
];

@Component({
  selector: 'app-programmes',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Programmes">
      @if (auth.has('programme.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New programme</button>}
    </app-page-header>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/programmes', $event['id']])" />`,
})
export class ProgrammesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly columns: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'version_label', label: 'Version' }, { key: 'duration_months', label: 'Months' },
    { key: 'funding_framework', label: 'Funding framework' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/programmes', { page, page_size: size }));

  ngOnInit(): void {
    this.list.load();
  }

  protected async create(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'New programme', fields: PROGRAMME_FIELDS, value: { status: 'draft' },
      submit: (v) => firstValueFrom(this.api.post('/programmes', v)),
    });
    if (saved) this.list.load();
  }
}

@Component({
  selector: 'app-programme-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, MatTabsModule, MatButtonModule, MatIconModule, Notice],
  template: `
    @if (programme(); as p) {
      <app-page-header [title]="p.name" [subtitle]="p.code" back="/programmes">
        <ng-container badges><app-status [status]="p.status" /><app-demo [show]="p.is_demo" /></ng-container>
        @if (auth.has('programme.manage')) {<button mat-stroked-button (click)="edit(p)"><mat-icon>edit</mat-icon> Edit</button>}
      </app-page-header>
      <mat-tab-group>
        <mat-tab label="Overview">
          <section class="panel">
            <app-details [items]="[
              { label: 'Programme version', value: p.version_label },
              { label: 'Proposal date', value: p.proposal_date, kind: 'date' },
              { label: 'Duration (months)', value: p.duration_months },
              { label: 'Funding framework', value: p.funding_framework },
              { label: 'Status', value: p.status, kind: 'status' },
              { label: 'Start date', value: p.start_date, kind: 'date' },
              { label: 'End date', value: p.end_date, kind: 'date' },
              { label: 'Description', value: p.description, full: true },
              { label: 'Funding note', value: p.funding_note, full: true }]" />
          </section>
        </mat-tab>
        <mat-tab label="Targets">
          <app-notice>Programme targets are planning figures. Their status (proposed / approved / revised) is always shown;
            proposed targets are not achievements.</app-notice>
          <div class="actions" style="margin-bottom:8px">
            @if (auth.has('programme.manage')) {<button mat-stroked-button (click)="editTarget()"><mat-icon>add</mat-icon> Add target</button>}
          </div>
          <app-table [columns]="targetCols" [rows]="targets()" (rowClick)="auth.has('programme.manage') && editTarget($event)" />
        </mat-tab>
        <mat-tab label="Reporting periods">
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('programme.manage')) {<button mat-stroked-button (click)="editPeriod()"><mat-icon>add</mat-icon> Add period</button>}
          </div>
          <app-table [columns]="periodCols" [rows]="periods()" (rowClick)="auth.has('programme.manage') && editPeriod($event)" />
        </mat-tab>
        <mat-tab label="Organisations">
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('programme.manage')) {<button mat-stroked-button (click)="addOrg()"><mat-icon>add</mat-icon> Link organisation</button>}
          </div>
          <app-table [columns]="orgCols" [rows]="orgs()" [clickable]="false" />
        </mat-tab>
      </mat-tab-group>
    }`,
})
export class ProgrammeDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly lookups = inject(LookupsService);
  readonly id = input.required<string>();
  protected readonly programme = signal<Programme | null>(null);
  protected readonly targets = signal<Row[]>([]);
  private readonly geoNames = signal<Record<string, string>>({});
  protected readonly periods = signal<Row[]>([]);
  protected readonly orgs = signal<Row[]>([]);
  protected readonly targetCols: Column[] = [
    { key: 'metric_name', label: 'Metric' },
    { key: 'area', label: 'Area', value: (r) => (r['geo_unit_id'] ? this.geoNames()[r['geo_unit_id']] ?? '…' : 'Whole programme') },
    { key: 'target_value', label: 'Target', kind: 'number' }, { key: 'unit', label: 'Unit' },
    { key: 'period_label', label: 'Period' }, { key: 'target_version', label: 'Version' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'indicator_code', label: 'Indicator' },
    { key: 'source_note', label: 'Source' },
  ];
  protected readonly periodCols: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'start_date', label: 'Start', kind: 'date' },
    { key: 'end_date', label: 'End', kind: 'date' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly orgCols: Column[] = [
    { key: 'organisation_name', label: 'Organisation' }, { key: 'role', label: 'Role', kind: 'label' },
    { key: 'start_date', label: 'From', kind: 'date' }, { key: 'end_date', label: 'To', kind: 'date' },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const id = this.id();
    this.api.get<Programme>(`/programmes/${id}`).subscribe((p) => this.programme.set(p));
    this.api.get<Row[]>(`/programmes/${id}/targets`).subscribe((t) => this.targets.set(t));
    this.lookups.geoUnits().subscribe((g) => this.geoNames.set(Object.fromEntries(g.map((u) => [u.id, u.name]))));
    this.api.get<Row[]>(`/programmes/${id}/reporting-periods`).subscribe((t) => this.periods.set(t));
    this.api.get<Row[]>(`/programmes/${id}/organisations`).subscribe((t) => this.orgs.set(t));
  }

  protected async edit(p: Programme): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit programme', fields: PROGRAMME_FIELDS.filter((f) => f.name !== 'code'), value: p,
      submit: (v) => firstValueFrom(this.api.patch(`/programmes/${p.id}`, v)),
    });
    if (saved) {
      this.lookups.refresh('programmes');
      this.load();
    }
  }

  protected async editTarget(row?: Row): Promise<void> {
    if (row) return this.changeTarget(row);
    const fields: FieldDef[] = [
      { name: 'metric_code', label: 'Metric code', type: 'text', required: true },
      { name: 'metric_name', label: 'Metric name', type: 'text', required: true },
      { name: 'target_value', label: 'Target value', type: 'number', required: true },
      { name: 'unit', label: 'Unit', type: 'text', required: true },
      { name: 'period_label', label: 'Period', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ['proposed', 'approved', 'revised'] },
      { name: 'target_version', label: 'Target version', type: 'integer', min: 1,
        hint: 'Record a revision as a new version; earlier versions are kept' },
      { name: 'indicator_code', label: 'Linked indicator code', type: 'text' },
      { name: 'source_note', label: 'Source / approval note', type: 'textarea' },
    ];
    const saved = await openForm(this.dialog, {
      title: 'Add target', fields, value: { status: 'proposed', target_version: 1 },
      submit: (v) => firstValueFrom(this.api.post(`/programmes/${this.id()}/targets`, v)),
    });
    if (saved) this.load();
  }

  /** Existing target: edit its description/status, or record a changed figure as a new version (never overwritten). */
  private async changeTarget(row: Row): Promise<void> {
    const revising = (v: Record<string, any>) => !!v['revise'];
    const fields: FieldDef[] = [
      { name: 'metric_name', label: 'Metric name', type: 'text', required: true },
      { name: 'indicator_code', label: 'Linked indicator code', type: 'text', showIf: (v) => !revising(v) },
      { name: 'revise', label: 'Change the target figure (saved as a new version; this version is kept)', type: 'boolean',
        full: true },
      { name: 'target_value', label: 'New target value', type: 'number', required: true, showIf: revising },
      { name: 'unit', label: 'Unit', type: 'text', required: true, showIf: revising },
      { name: 'period_label', label: 'Period', type: 'text', showIf: revising },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ['proposed', 'approved', 'revised'] },
      { name: 'source_note', label: 'Source / approval note', type: 'textarea',
        hint: 'For a new version, say why the figure changed and who approved it' },
    ];
    const saved = await openForm(this.dialog, {
      title: `Target: ${row['metric_name']} (version ${row['target_version']})`, fields,
      value: { ...row, revise: false },
      submit: (v) => {
        if (!revising(v)) {
          const { revise, ...changes } = v;
          return firstValueFrom(this.api.patch(`/programme-targets/${row['id']}`, changes));
        }
        return firstValueFrom(this.api.post(`/programme-targets/${row['id']}/revise`, {
          target_value: v['target_value'], unit: v['unit'], period_label: v['period_label'],
          status: v['status'] === 'proposed' ? 'revised' : v['status'], source_note: v['source_note'] ?? '',
        }));
      },
    });
    if (saved) this.load();
  }

  protected async editPeriod(row?: Row): Promise<void> {
    const fields: FieldDef[] = [
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'period_type', label: 'Type', type: 'select', options: ['month', 'quarter', 'half_year', 'year', 'custom'] },
      { name: 'status', label: 'Status', type: 'select', options: ['open', 'closed'] },
      { name: 'start_date', label: 'Start', type: 'date', required: true },
      { name: 'end_date', label: 'End', type: 'date', required: true },
    ];
    const saved = await openForm(this.dialog, {
      title: row ? 'Edit reporting period' : 'Add reporting period',
      fields: row ? fields.filter((f) => !['code', 'period_type'].includes(f.name)) : fields,
      value: row ?? { period_type: 'quarter', status: 'open' },
      submit: (v) => firstValueFrom(row ? this.api.patch(`/reporting-periods/${row['id']}`, v)
        : this.api.post(`/programmes/${this.id()}/reporting-periods`, v)),
    });
    if (saved) {
      this.lookups.refresh(`periods:${this.id()}`);
      this.load();
    }
  }

  protected async addOrg(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Link organisation',
      fields: [
        { name: 'organisation_id', label: 'Organisation', type: 'lookup', lookup: 'organisation', required: true },
        { name: 'role', label: 'Role', type: 'select', required: true,
          options: ['implementing_fpo', 'implementing_agency', 'technical_partner', 'funder', 'government_department'] },
        { name: 'start_date', label: 'From', type: 'date' }, { name: 'end_date', label: 'To', type: 'date' },
      ],
      submit: (v) => firstValueFrom(this.api.post(`/programmes/${this.id()}/organisations`, v)),
    });
    if (saved) {
      this.notify.success('Organisation linked');
      this.load();
    }
  }
}
