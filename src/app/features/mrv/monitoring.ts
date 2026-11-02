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
import { Page, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DemoBadge, LifecycleBadges } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { PageHeader } from '../../shared/page-header';
import { submitForReview } from './baselines';

@Component({
  selector: 'app-monitoring',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Monitoring records" subtitle="Manual and imported measurements, normalised to the indicator unit">
      @if (auth.has('monitoring.write')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Manual entry</button>}
    </app-page-header>
    <div class="filters">
      <mat-form-field><mat-label>Validation</mat-label><mat-select [formControl]="validation"><mat-option [value]="null">All</mat-option>
        @for (s of ['pending_validation', 'valid', 'exception', 'rejected']; track s) {<mat-option [value]="s">{{ s }}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field><mat-label>Source</mat-label><mat-select [formControl]="source"><mat-option [value]="null">All</mat-option>
        <mat-option value="manual">Manual</mat-option><mat-option value="imported">Imported</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/monitoring', $event['id']])" />`,
})
export class MonitoringPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly validation = new FormControl<string | null>(null);
  protected readonly source = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'indicator', label: 'Indicator', kind: 'ref' }, { key: 'observed_at', label: 'Observed', kind: 'datetime' },
    { key: 'value', label: 'Value', value: (r) => `${Number(r['value'])} ${r['unit']}` },
    { key: 'original', label: 'Original', value: (r) => (r['original_value'] != null ? `${Number(r['original_value'])} ${r['original_unit']}` : '—') },
    { key: 'where', label: 'Plot / area', value: (r) => r['farm_plot']?.label ?? r['geo_unit']?.label },
    { key: 'source', label: 'Source', value: (r) => (r['source_system_id'] ? `Imported (${r['source_record_id']})` : 'Manual') },
    { key: 'validation_status', label: 'Validation', kind: 'status' }, { key: 'verification_status', label: 'Verification', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/monitoring-records', {
    page, page_size: size, validation_status: this.validation.value, source: this.source.value }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
    this.validation.valueChanges.subscribe(() => this.list.reset());
    this.source.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'Manual monitoring entry (draft)',
      fields: [
        { name: 'indicator_id', label: 'Indicator', type: 'lookup', lookup: 'indicator', required: true },
        { name: 'farm_plot_id', label: 'Plot', type: 'plot' },
        { name: 'geo_unit_id', label: 'Area (if no plot)', type: 'lookup', lookup: 'geo' },
        { name: 'value', label: 'Value', type: 'number', required: true },
        { name: 'unit', label: 'Unit', type: 'text', required: true, hint: 'Converted to the indicator unit only via approved conversions' },
        { name: 'observed_at', label: 'Observed at', type: 'datetime', required: true },
        { name: 'method', label: 'Method', type: 'text' }, { name: 'activity_code', label: 'Activity', type: 'lookup', lookup: 'activity' },
        { name: 'data_nature', label: 'Nature', type: 'select', options: ['observed', 'user_reported'] },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      value: { data_nature: 'observed' },
      submit: (v) => firstValueFrom(this.api.post('/monitoring-records', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/monitoring', saved['id']]);
  }
}

@Component({
  selector: 'app-monitoring-detail',
  imports: [PageHeader, DetailGrid, LifecycleBadges, DemoBadge, EvidencePanel, HistoryPanel, MatButtonModule, MatIconModule],
  template: `
    @if (rec(); as m) {
      <app-page-header [title]="m['indicator']?.label ?? 'Monitoring record'" [subtitle]="m['farm_plot']?.label ?? m['geo_unit']?.label" back="/monitoring">
        <ng-container badges><app-demo [show]="m['is_demo']" /></ng-container>
        @if (!m['source_system_id'] && auth.has('monitoring.write') && editable(m)) {
          <button mat-stroked-button (click)="edit(m)"><mat-icon>edit</mat-icon> {{ m['review_status'] === 'correction_requested' ? 'Correct' : 'Edit' }}</button>
          <button mat-stroked-button (click)="submit()"><mat-icon>rule</mat-icon> Submit & validate</button>
        }
        @if (m['validation_status'] === 'exception' && auth.has('mrv.calculate')) {
          <button mat-stroked-button (click)="resolve()"><mat-icon>gavel</mat-icon> Resolve exception</button>
        }
        @if (m['validation_status'] === 'valid' && auth.has('mrv.calculate') && ['not_submitted', 'correction_requested'].includes(m['review_status'])) {
          <button mat-flat-button (click)="review()"><mat-icon>send</mat-icon> Submit for review</button>
        }
      </app-page-header>
      <app-lifecycle [row]="m" />
      @if (m['validation_messages']?.length) {
        <section class="panel"><h3>Validation messages</h3><ul>@for (x of m['validation_messages']; track $index) {<li>{{ x }}</li>}</ul></section>
      }
      <div class="grid-2">
        <section class="panel"><h3>Measurement</h3><app-details [items]="[
          { label: 'Value (normalised)', value: m['value'] + ' ' + m['unit'] },
          { label: 'Original value', value: m['original_value'] != null ? m['original_value'] + ' ' + m['original_unit'] : null },
          { label: 'Observed at', value: m['observed_at'], kind: 'datetime' }, { label: 'Method', value: m['method'] },
          { label: 'Nature', value: m['data_nature'], kind: 'nature' }, { label: 'Activity', value: m['activity_code'] },
          { label: 'Farmer', value: m['farmer']?.label }, { label: 'Notes', value: m['notes'], full: true }]" /></section>
        <section class="panel"><h3>Provenance</h3><app-details [items]="[
          { label: 'Source', value: m['source_system_id'] ? 'Integration import' : 'Manual entry' },
          { label: 'Source record ID', value: m['source_record_id'], kind: 'mono' },
          { label: 'Source timestamp', value: m['source_timestamp'], kind: 'datetime' },
          { label: 'Received', value: m['received_at'], kind: 'datetime' },
          { label: 'Source evidence references', value: m['source_evidence_refs'], kind: 'json', full: true }]" /></section>
      </div>
      <app-evidence-panel entityType="monitoring_record" [entityId]="m['id']" />
      <app-history entityType="monitoring_record" [entityId]="m['id']" />
    }`,
})
export class MonitoringDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly id = input.required<string>();
  protected readonly rec = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>(`/monitoring-records/${this.id()}`).subscribe((m) => this.rec.set(m));
  }

  /** Same rule as the API: drafts and records returned for correction, before any verification decision. */
  protected editable(m: Row): boolean {
    return ['not_submitted', 'correction_requested'].includes(m['review_status']) && m['verification_status'] === 'unverified';
  }

  protected async edit(m: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: m['review_status'] === 'correction_requested' ? 'Correct monitoring record' : 'Edit monitoring record',
      fields: [
        { name: 'value', label: 'Value', type: 'number', required: true },
        { name: 'unit', label: 'Unit', type: 'text', required: true },
        { name: 'observed_at', label: 'Observed at', type: 'datetime', required: true },
        { name: 'method', label: 'Method', type: 'text' }, { name: 'activity_code', label: 'Activity', type: 'lookup', lookup: 'activity' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      value: { ...m, value: m['original_value'] ?? m['value'], unit: m['original_unit'] ?? m['unit'] },
      submit: (v) => firstValueFrom(this.api.patch(`/monitoring-records/${m['id']}`, v)),
    });
    if (saved) {
      this.notify.success('Saved – submit & validate again before resubmitting for review');
      this.ngOnInit();
    }
  }

  protected submit(): void {
    this.api.post<Row>(`/monitoring-records/${this.id()}/submit`).subscribe((m) => {
      this.rec.set(m);
      this.notify.success(`Validation: ${m['validation_status']}`);
    });
  }

  protected async resolve(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Resolve data-quality exception',
      fields: [{ name: 'decision', label: 'Decision', type: 'select', required: true,
        options: [{ value: 'accept', label: 'Accept as valid' }, { value: 'reject', label: 'Reject record' }] },
        { name: 'note', label: 'Reason', type: 'textarea', required: true }],
      submit: (v) => firstValueFrom(this.api.post(`/monitoring-records/${this.id()}/resolve-exception`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async review(): Promise<void> {
    if (await submitForReview(this.dialog, this.api, `/monitoring-records/${this.id()}/submit-for-review`)) this.ngOnInit();
  }
}
