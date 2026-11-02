import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { DemoBadge, LifecycleBadges } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';
import { submitForReview } from './baselines';

const value = (r: Row) => (r['value'] == null ? '—' : `${formatNumber(r['value'])} ${r['unit']}`);

@Component({
  selector: 'app-mrv-workspace',
  imports: [PageHeader, Notice, DataTable, MatTabsModule, MatButtonModule, MatIconModule, MatCheckboxModule, ReactiveFormsModule],
  template: `
    <app-page-header title="MRV & verification workspace" subtitle="Calculation → internal review → independent verification → reporting">
      @if (auth.has('mrv.calculate')) {<button mat-flat-button (click)="calculate()"><mat-icon>functions</mat-icon> Run calculation</button>}
    </app-page-header>
    <mat-tab-group>
      <mat-tab label="Indicator results">
        <app-notice>A calculated result is not a verified outcome. PROVISIONAL results use definitions pending programme-owner approval.</app-notice>
        <mat-checkbox [formControl]="superseded">Include superseded results</mat-checkbox>
        <app-table [columns]="resultCols" [rows]="results.rows()" [total]="results.total()" [pageIndex]="results.pageIndex()"
                   [pageSize]="results.pageSize()" [loading]="results.loading()" (page)="results.onPage($event)"
                   (rowClick)="router.navigate(['/mrv/results', $event['id']])" />
      </mat-tab>
      <mat-tab label="Review queue">
        <app-table [columns]="taskCols" [rows]="tasks.rows()" [total]="tasks.total()" [pageIndex]="tasks.pageIndex()"
                   [pageSize]="tasks.pageSize()" [loading]="tasks.loading()" (page)="tasks.onPage($event)"
                   (rowClick)="router.navigate(['/mrv/tasks', $event['id']])" />
      </mat-tab>
      <mat-tab label="Calculation runs">
        <app-table [columns]="runCols" [rows]="runs.rows()" [total]="runs.total()" [pageIndex]="runs.pageIndex()"
                   [pageSize]="runs.pageSize()" [loading]="runs.loading()" (page)="runs.onPage($event)" [clickable]="false" />
      </mat-tab>
    </mat-tab-group>`,
})
export class MrvWorkspacePage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly superseded = new FormControl(false);
  protected readonly resultCols: Column[] = [
    { key: 'indicator', label: 'Indicator', kind: 'ref' }, { key: 'scope_label', label: 'Scope' },
    { key: 'period', label: 'Period', value: (r) => `${r['period_start']} → ${r['period_end']}` },
    { key: 'value', label: 'Value', value }, { key: 'provisional', label: 'Provisional', value: (r) => (r['is_provisional'] ? 'PROVISIONAL' : '') },
    { key: 'review_status', label: 'Review', kind: 'status' }, { key: 'verification_status', label: 'Verification', kind: 'status' },
  ];
  protected readonly taskCols: Column[] = [
    { key: 'title', label: 'Item' }, { key: 'entity_type', label: 'Type', kind: 'label' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'submitted_by_name', label: 'Submitted by' }, { key: 'reviewer_name', label: 'Internal reviewer' },
    { key: 'due_date', label: 'Due', kind: 'date' },
  ];
  protected readonly runCols: Column[] = [
    { key: 'indicator', label: 'Indicator', kind: 'ref' }, { key: 'method', label: 'Method', value: (r) => `${r['method_code']} v${r['method_version']}` },
    { key: 'scope_type', label: 'Scope', kind: 'label' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'input_count', label: 'Inputs', kind: 'number' }, { key: 'started_at', label: 'Run at', kind: 'datetime' },
    { key: 'error', label: 'Error' },
  ];
  protected readonly results = new ListState((page, size) => this.api.get<Page<Row>>('/indicators/results', {
    page, page_size: size, include_superseded: !!this.superseded.value }));
  protected readonly tasks = new ListState((page, size) => this.api.get<Page<Row>>('/mrv/review-tasks', { page, page_size: size }));
  protected readonly runs = new ListState((page, size) => this.api.get<Page<Row>>('/mrv/calculation-runs', { page, page_size: size }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.results.load();
    this.tasks.load();
    this.runs.load();
    this.superseded.valueChanges.subscribe(() => this.results.reset());
  }

  protected async calculate(): Promise<void> {
    const out = await openForm<Row>(this.dialog, {
      title: 'Run indicator calculation',
      fields: [
        { name: 'indicator_id', label: 'Indicator', type: 'lookup', lookup: 'indicator', required: true },
        { name: 'reporting_period_id', label: 'Reporting period', type: 'lookup', lookup: 'period' },
        { name: 'period_start', label: 'Or period start', type: 'date' }, { name: 'period_end', label: 'Period end', type: 'date' },
        { name: 'scope_type', label: 'Scope', type: 'select', required: true, options: ['programme', 'state', 'district', 'cluster', 'fpo'] },
        { name: 'scope_geo_unit_id', label: 'Area', type: 'lookup', lookup: 'geo',
          showIf: (v) => ['state', 'district', 'cluster'].includes(v['scope_type']) },
        { name: 'scope_organisation_id', label: 'FPO / group', type: 'lookup', lookup: 'fpo', showIf: (v) => v['scope_type'] === 'fpo' },
        { name: 'parameters', label: 'Parameter overrides', type: 'json', hint: 'Optional JSON, e.g. {"require_verified": true}' },
      ],
      value: { scope_type: 'programme' },
      submit: (v) => firstValueFrom(this.api.post('/mrv/calculations', {
        ...v, parameters: v['parameters'] ?? {}, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (out?.['result']?.id) this.router.navigate(['/mrv/results', out['result'].id]);
    else this.runs.load();
  }
}

@Component({
  selector: 'app-result-detail',
  imports: [PageHeader, Notice, DetailGrid, DataTable, LifecycleBadges, DemoBadge, EvidencePanel, HistoryPanel, MatButtonModule, MatIconModule],
  template: `
    @if (result(); as r) {
      <app-page-header [title]="r['indicator']?.label ?? 'Result'" [subtitle]="r['scope_label'] + ' · ' + r['period_start'] + ' → ' + r['period_end']" back="/mrv">
        <ng-container badges><app-demo [show]="r['is_demo']" />
          @if (r['is_provisional']) {<span class="badge tone-warning">PROVISIONAL</span>}</ng-container>
        @if (auth.has('mrv.calculate') && !r['superseded_by_id'] && ['not_submitted', 'correction_requested'].includes(r['review_status'])) {
          <button mat-flat-button (click)="review()"><mat-icon>send</mat-icon> Submit for internal review</button>
        }
      </app-page-header>
      <app-lifecycle [row]="r" />
      @if (r['superseded_by_id']) {<app-notice kind="warning">Superseded by a newer calculation – kept for history.</app-notice>}
      @if (r['is_provisional']) {<app-notice kind="warning">Calculated from an indicator definition pending programme-owner approval.</app-notice>}
      <div class="stat-row">
        <div class="stat"><div class="value">{{ val(r) }}</div><div class="label">Calculated value</div></div>
        <div class="stat"><div class="value">{{ r['baseline_value'] != null ? n(r['baseline_value']) : '—' }}</div><div class="label">Baseline</div></div>
        <div class="stat"><div class="value">{{ r['change_from_baseline'] != null ? n(r['change_from_baseline']) : '—' }}</div><div class="label">Change from baseline</div></div>
      </div>
      <div class="grid-2">
        <section class="panel"><h3>Calculation lineage</h3><app-details [items]="[
          { label: 'Method', value: r['method_code'] + ' v' + r['method_version'] },
          { label: 'Indicator version', value: r['indicator_version'] },
          { label: 'Numerator', value: r['numerator'], kind: 'number' }, { label: 'Denominator', value: r['denominator'], kind: 'number' },
          { label: 'Parameters', value: run()?.['parameters'], kind: 'json', full: true },
          { label: 'Run output', value: run()?.['output'], kind: 'json', full: true }]" /></section>
        <section class="panel"><h3>Input records ({{ inputs().length }} shown)</h3>
          <app-table [columns]="inputCols" [rows]="inputs()" [clickable]="false" /></section>
      </div>
      <app-evidence-panel entityType="indicator_result" [entityId]="r['id']" />
      <app-history entityType="indicator_result" [entityId]="r['id']" />
    }`,
})
export class ResultDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly id = input.required<string>();
  protected readonly result = signal<Row | null>(null);
  protected readonly run = signal<Row | null>(null);
  protected readonly inputs = signal<Row[]>([]);
  protected readonly inputCols: Column[] = [{ key: 'entity_type', label: 'Type', kind: 'label' }, { key: 'entity_id', label: 'Record ID' }];

  ngOnInit(): void {
    this.api.get<Row>(`/mrv/results/${this.id()}`).subscribe((r) => {
      this.result.set(r);
      this.api.get<Row>(`/mrv/calculation-runs/${r['calculation_run_id']}`).subscribe((run) => this.run.set(run));
      this.api.get<Page<Row>>(`/mrv/calculation-runs/${r['calculation_run_id']}/inputs`, { page_size: 50 })
        .subscribe((p) => this.inputs.set(p.items));
    });
  }

  protected val(r: Row): string {
    return value(r);
  }

  protected n(v: unknown): string {
    return formatNumber(v);
  }

  protected async review(): Promise<void> {
    if (await submitForReview(this.dialog, this.api, `/mrv/results/${this.id()}/submit-for-review`)) this.ngOnInit();
  }
}
