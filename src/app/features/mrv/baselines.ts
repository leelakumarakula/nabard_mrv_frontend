import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DemoBadge, LifecycleBadges } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { PageHeader } from '../../shared/page-header';

const BASELINE_FIELDS: FieldDef[] = [
  { name: 'value', label: 'Baseline value', type: 'number', required: true },
  { name: 'unit', label: 'Unit', type: 'text', required: true, hint: 'Must match or be convertible to the indicator unit' },
  { name: 'period_label', label: 'Baseline period', type: 'text' },
  { name: 'period_start', label: 'Period start', type: 'date' }, { name: 'period_end', label: 'Period end', type: 'date' },
  { name: 'method', label: 'Method', type: 'textarea', required: true },
  { name: 'source', label: 'Data source', type: 'textarea', required: true },
  { name: 'data_nature', label: 'Nature', type: 'select', options: ['observed', 'user_reported', 'calculated', 'assessment'] },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

export async function submitForReview(dialog: MatDialog, api: ApiService, path: string): Promise<unknown> {
  return openForm(dialog, {
    title: 'Submit for internal review',
    fields: [{ name: 'reviewer_id', label: 'Internal reviewer', type: 'lookup', lookup: 'reviewer' },
      { name: 'due_date', label: 'Due date', type: 'date' }, { name: 'note', label: 'Note for reviewer', type: 'textarea' }],
    submitLabel: 'Submit', submit: (v) => firstValueFrom(api.post(path, v)),
  });
}

@Component({
  selector: 'app-baselines',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Baselines" subtitle="Baseline value, period, method, source, evidence and review status">
      @if (auth.has('baseline.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New baseline</button>}
    </app-page-header>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/baselines', $event['id']])" />`,
})
export class BaselinesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly columns: Column[] = [
    { key: 'indicator', label: 'Indicator', kind: 'ref' }, { key: 'scope_type', label: 'Scope', kind: 'label' },
    { key: 'value', label: 'Value', value: (r) => `${Number(r['value'])} ${r['unit']}` }, { key: 'period_label', label: 'Period' },
    { key: 'validation_status', label: 'Validation', kind: 'status' }, { key: 'review_status', label: 'Review', kind: 'status' },
    { key: 'verification_status', label: 'Verification', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/baselines', { page, page_size: size }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'New baseline (draft)',
      fields: [
        { name: 'indicator_id', label: 'Indicator', type: 'lookup', lookup: 'indicator', required: true },
        { name: 'scope_type', label: 'Scope', type: 'select', required: true,
          options: ['programme', 'state', 'district', 'cluster', 'fpo', 'farmer', 'plot'] },
        { name: 'geo_unit_id', label: 'Area', type: 'lookup', lookup: 'geo',
          showIf: (v) => ['state', 'district', 'cluster'].includes(v['scope_type']) },
        { name: 'organisation_id', label: 'FPO / group', type: 'lookup', lookup: 'fpo', showIf: (v) => v['scope_type'] === 'fpo' },
        { name: 'farmer_id', label: 'Farmer', type: 'farmer', showIf: (v) => v['scope_type'] === 'farmer' },
        { name: 'farm_plot_id', label: 'Plot', type: 'plot', showIf: (v) => v['scope_type'] === 'plot' },
        ...BASELINE_FIELDS,
      ],
      value: { scope_type: 'programme', data_nature: 'observed' },
      submit: (v) => firstValueFrom(this.api.post('/baselines', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/baselines', saved['id']]);
  }
}

@Component({
  selector: 'app-baseline-detail',
  imports: [PageHeader, DetailGrid, LifecycleBadges, DemoBadge, EvidencePanel, HistoryPanel, MatButtonModule, MatIconModule],
  template: `
    @if (rec(); as b) {
      <app-page-header [title]="'Baseline – ' + (b['indicator']?.label ?? '')" [subtitle]="b['period_label']" back="/baselines">
        <ng-container badges><app-demo [show]="b['is_demo']" /></ng-container>
        @if (auth.has('baseline.manage') && editable(b)) {
          <button mat-stroked-button (click)="edit(b)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="submit()"><mat-icon>rule</mat-icon> Validate</button>
        }
        @if (auth.has('baseline.manage') && b['validation_status'] === 'valid' && editable(b)) {
          <button mat-flat-button (click)="review()"><mat-icon>send</mat-icon> Submit for review</button>
        }
      </app-page-header>
      <app-lifecycle [row]="b" />
      @if (b['validation_messages']?.length) {
        <section class="panel"><h3>Validation messages</h3><ul>@for (m of b['validation_messages']; track $index) {<li>{{ m }}</li>}</ul></section>
      }
      <section class="panel"><app-details [items]="[
        { label: 'Value', value: b['value'] + ' ' + b['unit'] }, { label: 'Scope', value: b['scope_type'], kind: 'label' },
        { label: 'Area / FPO / farmer / plot', value: b['geo_unit']?.label ?? b['organisation']?.label ?? b['farmer']?.label ?? b['farm_plot']?.label },
        { label: 'Nature', value: b['data_nature'], kind: 'nature' },
        { label: 'Period start', value: b['period_start'], kind: 'date' }, { label: 'Period end', value: b['period_end'], kind: 'date' },
        { label: 'Method', value: b['method'], full: true }, { label: 'Source', value: b['source'], full: true },
        { label: 'Notes', value: b['notes'], full: true }]" /></section>
      <app-evidence-panel entityType="baseline_record" [entityId]="b['id']" />
      <app-history entityType="baseline_record" [entityId]="b['id']" />
    }`,
})
export class BaselineDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly id = input.required<string>();
  protected readonly rec = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>(`/baselines/${this.id()}`).subscribe((b) => this.rec.set(b));
  }

  protected editable(b: Row): boolean {
    return ['not_submitted', 'correction_requested'].includes(b['review_status']) && b['verification_status'] === 'unverified';
  }

  protected async edit(b: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit baseline', fields: BASELINE_FIELDS, value: b,
      submit: (v) => firstValueFrom(this.api.patch(`/baselines/${b['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected submit(): void {
    this.api.post<Row>(`/baselines/${this.id()}/submit`).subscribe((b) => {
      this.rec.set(b);
      this.notify.success(`Validation: ${b['validation_status']}`);
    });
  }

  protected async review(): Promise<void> {
    if (await submitForReview(this.dialog, this.api, `/baselines/${this.id()}/submit-for-review`)) this.ngOnInit();
  }
}
