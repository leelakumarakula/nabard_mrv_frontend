import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { confirmAction } from '../../shared/confirm-dialog';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const DEFINITION_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, full: true },
  { name: 'family', label: 'Family', type: 'text', required: true },
  { name: 'module_code', label: 'Workstream', type: 'lookup', lookup: 'module' },
  { name: 'unit', label: 'Unit', type: 'text', required: true },
  { name: 'method_code', label: 'Calculation method', type: 'lookup', lookup: 'method' },
  { name: 'definition', label: 'Definition', type: 'textarea', required: true },
  { name: 'numerator', label: 'Numerator', type: 'textarea' },
  { name: 'denominator', label: 'Denominator', type: 'textarea' },
  { name: 'eligibility', label: 'Eligibility', type: 'textarea' },
  { name: 'exclusions', label: 'Exclusions', type: 'textarea' },
  { name: 'method_reference', label: 'Method reference / version', type: 'textarea' },
  { name: 'method_parameters', label: 'Method parameters', type: 'json',
    hint: 'JSON. Formula example: {"components": {"a": {"method": "households_adopting"}, "b": {"method": "enrolled_farmers"}}, "expression": "a / b * 100"}' },
  { name: 'frequency', label: 'Frequency', type: 'text' },
  { name: 'aggregation_rule', label: 'Aggregation', type: 'text' },
  { name: 'disaggregation', label: 'Approved disaggregation', type: 'text' },
  { name: 'baseline_method', label: 'Baseline method', type: 'textarea' },
  { name: 'data_sources', label: 'Data sources', type: 'textarea' },
  { name: 'evidence_requirements', label: 'Evidence rules', type: 'textarea' },
  { name: 'verification_sample_approach', label: 'Verification sample approach', type: 'textarea' },
  { name: 'validation_rules', label: 'Plausibility rules', type: 'json', hint: 'JSON, e.g. {"min": 0, "max": 100}' },
  { name: 'limitations', label: 'Limitations', type: 'textarea' },
];

@Component({
  selector: 'app-indicators',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Indicator catalogue" subtitle="Versioned definitions, methods, evidence rules and approval status">
      @if (auth.has('indicator.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New indicator</button>}
    </app-page-header>
    <app-notice kind="warning">Calculations are enabled only for approved definitions. Definitions marked "Pending programme-owner
      approval" can only produce PROVISIONAL results where provisional mode is switched on (testing/demonstration).</app-notice>
    <div class="filters"><mat-form-field class="search"><mat-label>Search</mat-label><input matInput [formControl]="search" /></mat-form-field></div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/indicators', $event['id']])" />`,
})
export class IndicatorsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly search = new FormControl('');
  protected readonly columns: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'version', label: 'v' }, { key: 'name', label: 'Name' },
    { key: 'family', label: 'Family' }, { key: 'unit', label: 'Unit' }, { key: 'method_code', label: 'Method' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'requires_confirmation', label: 'Needs confirmation', kind: 'bool' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/indicators', {
    page, page_size: size, search: this.search.value }));

  ngOnInit(): void {
    this.list.load();
    this.search.valueChanges.pipe(debounceTime(300)).subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'New indicator (draft)',
      fields: [{ name: 'code', label: 'Code (UPPER_SNAKE)', type: 'text', required: true }, ...DEFINITION_FIELDS],
      submit: (v) => firstValueFrom(this.api.post('/indicators', v)),
    }, '860px');
    if (saved?.['id']) {
      this.lookups.refresh('indicators');
      this.router.navigate(['/indicators', saved['id']]);
    }
  }
}

@Component({
  selector: 'app-indicator-detail',
  imports: [PageHeader, Notice, DetailGrid, DataTable, StatusBadge, DemoBadge, HistoryPanel, MatTabsModule, MatButtonModule, MatIconModule],
  template: `
    @if (ind(); as i) {
      <app-page-header [title]="i['code'] + ' v' + i['version'] + ' – ' + i['name']" [subtitle]="i['family']" back="/indicators">
        <ng-container badges><app-status [status]="i['status']" /><app-demo [show]="i['is_demo']" /></ng-container>
        @if (auth.has('indicator.manage')) {
          @if (i['status'] === 'draft') {
            <button mat-stroked-button (click)="edit(i)"><mat-icon>edit</mat-icon> Edit draft</button>
            <button mat-stroked-button (click)="setStatus('submitted')"><mat-icon>send</mat-icon> Submit for approval</button>
          }
          @if (i['status'] === 'submitted') {
            <button mat-stroked-button (click)="setStatus('draft')">Return to draft</button>
            <button mat-flat-button (click)="setStatus('approved')"><mat-icon>verified</mat-icon> Approve definition</button>
          }
          <button mat-stroked-button (click)="preview(i)"><mat-icon>science</mat-icon> Preview calculation</button>
          @if (i['status'] !== 'draft') {<button mat-stroked-button (click)="newVersion()"><mat-icon>content_copy</mat-icon> New version</button>}
          @if (i['status'] !== 'retired') {<button mat-stroked-button (click)="setStatus('retired')">Retire</button>}
        }
      </app-page-header>
      @if (previewResult(); as p) {
        <section class="panel"><h3>Preview result <span class="badge tone-warning">PREVIEW – not stored</span></h3>
          <app-details [items]="[{ label: 'Value', value: (p['value'] ?? '—') + ' ' + p['unit'] }, { label: 'Method', value: p['method'] },
            { label: 'Inputs', value: p['input_count'] }, { label: 'Details', value: p['details'], kind: 'json', full: true }]" /></section>
      }
      @if (i['status'] !== 'approved') {
        <app-notice kind="warning">This definition is not approved. {{ i['approval_note'] ?? '' }}</app-notice>
      }
      <mat-tab-group>
        <mat-tab label="Definition">
          <section class="panel"><app-details [items]="[
            { label: 'Unit', value: i['unit'] }, { label: 'Workstream', value: i['module_code'], kind: 'label' },
            { label: 'Calculation method', value: i['method_code'] }, { label: 'Frequency', value: i['frequency'] },
            { label: 'Definition', value: i['definition'], full: true }, { label: 'Numerator', value: i['numerator'], full: true },
            { label: 'Denominator', value: i['denominator'], full: true }, { label: 'Eligibility', value: i['eligibility'], full: true },
            { label: 'Exclusions', value: i['exclusions'], full: true },
            { label: 'Method reference', value: i['method_reference'], full: true },
            { label: 'Method parameters', value: i['method_parameters'], kind: 'json', full: true },
            { label: 'Aggregation', value: i['aggregation_rule'] }, { label: 'Disaggregation', value: i['disaggregation'] },
            { label: 'Baseline method', value: i['baseline_method'], full: true },
            { label: 'Evidence rules', value: i['evidence_requirements'], full: true },
            { label: 'Verification sample approach', value: i['verification_sample_approach'], full: true },
            { label: 'Plausibility rules', value: i['validation_rules'], kind: 'json' }, { label: 'Data sources', value: i['data_sources'] },
            { label: 'Limitations', value: i['limitations'], full: true }]" /></section>
        </mat-tab>
        <mat-tab label="Targets">
          <div class="actions" style="margin: 8px 0">
            @if (auth.has('indicator.manage')) {<button mat-stroked-button (click)="addTarget(i)"><mat-icon>add</mat-icon> Add target</button>}
          </div>
          <app-table [columns]="targetCols" [rows]="targets()" (rowClick)="editTarget($event)" />
        </mat-tab>
        <mat-tab label="Versions"><app-table [columns]="versionCols" [rows]="versions()" (rowClick)="open($event)" /></mat-tab>
        <mat-tab label="History"><app-history entityType="indicator_definition" [entityId]="i['id']" /></mat-tab>
      </mat-tab-group>
    }`,
})
export class IndicatorDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly lookups = inject(LookupsService);
  readonly id = input.required<string>();
  protected readonly ind = signal<Row | null>(null);
  protected readonly targets = signal<Row[]>([]);
  protected readonly versions = signal<Row[]>([]);
  protected readonly previewResult = signal<Row | null>(null);
  protected readonly targetCols: Column[] = [
    { key: 'target_value', label: 'Target', kind: 'number' }, { key: 'unit', label: 'Unit' },
    { key: 'period_label', label: 'Period' }, { key: 'geo_unit', label: 'Area', kind: 'ref' },
    { key: 'target_version', label: 'Version' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'source_note', label: 'Source' },
  ];
  protected readonly versionCols: Column[] = [
    { key: 'version', label: 'Version' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'method_code', label: 'Method' }, { key: 'updated_at', label: 'Updated', kind: 'datetime' },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.get<Row>(`/indicators/${this.id()}`).subscribe((i) => this.ind.set(i));
    this.api.get<Row[]>('/indicator-targets', { indicator_id: this.id() }).subscribe((t) => this.targets.set(t));
    this.api.get<Row[]>(`/indicators/${this.id()}/versions`).subscribe((v) => this.versions.set(v));
  }

  protected open(row: Row): void {
    this.router.navigate(['/indicators', row['id']]).then(() => this.load());
  }

  protected async edit(i: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: `Edit ${i['code']} v${i['version']}`, fields: DEFINITION_FIELDS, value: i,
      submit: (v) => firstValueFrom(this.api.patch(`/indicators/${i['id']}`, v)),
    }, '860px');
    if (saved) this.load();
  }

  protected async setStatus(status: string): Promise<void> {
    const res = await confirmAction(this.dialog, {
      title: `Change status to ${status}`, noteLabel: 'Note',
      message: status === 'approved' ? 'Approval records that the programme owner has approved this definition and method.'
        : `The indicator will be marked ${status}.`,
    });
    if (!res) return;
    this.api.post(`/indicators/${this.id()}/status`, { status, note: res.note,
      requires_confirmation: status === 'approved' ? false : undefined }).subscribe(() => {
      this.lookups.refresh('indicators');
      this.load();
    });
  }

  protected async preview(i: Row): Promise<void> {
    const out = await openForm<Row>(this.dialog, {
      title: `Preview ${i['code']} (not stored)`,
      notice: 'A preview evaluates the current (possibly draft) definition and formula. It is never stored, reviewed or reported.',
      fields: [
        { name: 'period_start', label: 'Period start', type: 'date', required: true },
        { name: 'period_end', label: 'Period end', type: 'date', required: true },
        { name: 'scope_type', label: 'Scope', type: 'select', options: ['programme', 'state', 'district', 'cluster', 'fpo'] },
        { name: 'scope_geo_unit_id', label: 'Area', type: 'lookup', lookup: 'geo', showIf: (v) => ['state', 'district', 'cluster'].includes(v['scope_type']) },
        { name: 'scope_organisation_id', label: 'FPO / group', type: 'lookup', lookup: 'fpo', showIf: (v) => v['scope_type'] === 'fpo' },
        { name: 'parameters', label: 'Try other parameters (optional JSON)', type: 'json' },
      ],
      value: { scope_type: 'programme', period_start: '2026-07-01', period_end: '2026-12-31' },
      submitLabel: 'Run preview',
      submit: (v) => firstValueFrom(this.api.post(`/indicators/${i['id']}/preview`, {
        ...v, programme_id: this.lookups.currentProgramme()?.id, parameters: v['parameters'] ?? undefined })),
    });
    if (out) this.previewResult.set(out);
  }

  protected newVersion(): void {
    this.api.post<Row>(`/indicators/${this.id()}/new-version`).subscribe((v) => this.open(v));
  }

  protected async addTarget(i: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add indicator target',
      fields: [
        { name: 'target_value', label: 'Target value', type: 'number', required: true, unit: i['unit'] },
        { name: 'period_label', label: 'Period', type: 'text' },
        { name: 'geo_unit_id', label: 'Area (optional)', type: 'lookup', lookup: 'geo' },
        { name: 'organisation_id', label: 'FPO / group (optional)', type: 'lookup', lookup: 'fpo' },
        { name: 'target_version', label: 'Target version', type: 'integer', min: 1 },
        { name: 'source_note', label: 'Source', type: 'textarea' },
      ],
      value: { target_version: 1 },
      submit: (v) => firstValueFrom(this.api.post('/indicator-targets', {
        ...v, indicator_id: i['id'], unit: i['unit'], programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved) this.load();
  }

  protected async editTarget(t: Row): Promise<void> {
    if (!this.auth.has('indicator.manage')) return;
    const saved = await openForm(this.dialog, {
      title: 'Edit target', value: t,
      fields: [
        { name: 'target_value', label: 'Target value', type: 'number' }, { name: 'period_label', label: 'Period', type: 'text' },
        { name: 'status', label: 'Status', type: 'select', options: ['proposed', 'approved', 'revised'] },
        { name: 'approval_note', label: 'Approval note', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/indicator-targets/${t['id']}`, v)),
    });
    if (saved) this.load();
  }
}
