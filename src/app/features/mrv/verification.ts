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
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const counts = (r: Row) => Object.entries(r['result_counts'] ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '—';

@Component({
  selector: 'app-verification',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Independent verification" subtitle="Sample frame → reproducible selection → field visits → conclusion">
      @if (auth.has('verification.sample')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New sample</button>}
    </app-page-header>
    <app-notice>Separate from internal review. The sampling methodology and evidence checklist are pending appointment of the
      independent verifier and programme-owner approval. Confirmed visits mark practice adoption as verified.</app-notice>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/verification', $event['id']])" />`,
})
export class VerificationPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly columns: Column[] = [
    { key: 'title', label: 'Sample' }, { key: 'entity_type', label: 'Records', kind: 'label' },
    { key: 'selection_method', label: 'Method', kind: 'label' }, { key: 'frame_size', label: 'Frame', kind: 'number' },
    { key: 'sample_size', label: 'Sample', kind: 'number' }, { key: 'results', label: 'Results', value: counts },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'conclusion', label: 'Conclusion', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/verification-samples', { page, page_size: size }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
  }

  protected async create(): Promise<void> {
    const activities = await firstValueFrom(this.lookups.activities());
    const saved = await openForm<Row>(this.dialog, {
      title: 'New verification sample',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, full: true },
        { name: 'entity_type', label: 'Records to verify', type: 'select', required: true,
          options: ['practice_record', 'demonstration_site', 'field_record', 'monitoring_record'] },
        { name: 'frame_description', label: 'Sample frame description', type: 'textarea', required: true },
        { name: 'period_start', label: 'Frame period start', type: 'date' }, { name: 'period_end', label: 'Frame period end', type: 'date' },
        { name: 'geo_unit_id', label: 'Frame area (optional)', type: 'lookup', lookup: 'geo' },
        { name: 'activity_codes', label: 'Practices', type: 'multiselect', showIf: (v) => v['entity_type'] === 'practice_record',
          options: activities.map((a) => ({ value: a.activity_code, label: a.activity_code })) },
        { name: 'record_type', label: 'Record type', type: 'text', showIf: (v) => v['entity_type'] === 'field_record' },
        { name: 'category', label: 'Site category', type: 'select', options: ['plantation', 'soil_moisture'],
          showIf: (v) => v['entity_type'] === 'demonstration_site' },
        { name: 'selection_method', label: 'Selection method', type: 'select', required: true,
          options: ['simple_random', 'census', 'purposive'] },
        { name: 'sample_size', label: 'Sample size', type: 'integer', required: true, min: 1 },
        { name: 'random_seed', label: 'Random seed (optional)', type: 'integer', min: 0, hint: 'Recorded so the draw can be reproduced' },
        { name: 'verifier_id', label: 'Independent verifier', type: 'lookup', lookup: 'verifier' },
        { name: 'reporting_period_id', label: 'Reporting period', type: 'lookup', lookup: 'period' },
      ],
      value: { entity_type: 'practice_record', selection_method: 'simple_random', sample_size: 10 },
      submit: (v) => {
        const filter: Row = {};
        for (const k of ['period_start', 'period_end', 'geo_unit_id', 'activity_codes', 'record_type', 'category']) {
          if (v[k] !== null && v[k] !== undefined && !(Array.isArray(v[k]) && !v[k].length)) filter[k] = v[k];
        }
        return firstValueFrom(this.api.post('/verification-samples', {
          programme_id: this.lookups.currentProgramme()?.id, title: v['title'], entity_type: v['entity_type'],
          frame_description: v['frame_description'], frame_filter: filter, selection_method: v['selection_method'],
          sample_size: v['sample_size'], random_seed: v['random_seed'], verifier_id: v['verifier_id'],
          reporting_period_id: v['reporting_period_id'] }));
      },
    });
    if (saved?.['id']) this.router.navigate(['/verification', saved['id']]);
  }
}

@Component({
  selector: 'app-sample-detail',
  imports: [PageHeader, Notice, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, HistoryPanel, MatButtonModule, MatIconModule],
  template: `
    @if (sample(); as s) {
      <app-page-header [title]="s['title']" [subtitle]="s['frame_description']" back="/verification">
        <ng-container badges><app-status [status]="s['status']" /><app-demo [show]="s['is_demo']" /></ng-container>
        @if (auth.has('verification.sample')) {
          @if (s['status'] === 'planned') {<button mat-flat-button (click)="draw(s)"><mat-icon>casino</mat-icon> Draw sample</button>}
          @if (['drawn', 'in_progress'].includes(s['status'])) {
            <button mat-stroked-button (click)="addFinding()"><mat-icon>flag</mat-icon> Add finding</button>
            <button mat-flat-button (click)="complete()"><mat-icon>task_alt</mat-icon> Complete with conclusion</button>
          }
        }
      </app-page-header>
      <section class="panel"><app-details [items]="[
        { label: 'Records', value: s['entity_type'], kind: 'label' }, { label: 'Selection method', value: s['selection_method'], kind: 'label' },
        { label: 'Frame size', value: s['frame_size'] }, { label: 'Sample size', value: s['sample_size'] },
        { label: 'Random seed', value: s['random_seed'] }, { label: 'Results', value: resultText(s) },
        { label: 'Frame filter', value: s['frame_filter'], kind: 'json', full: true },
        { label: 'Conclusion', value: s['conclusion'], kind: 'status' }, { label: 'Completed', value: s['completed_at'], kind: 'datetime' },
        { label: 'Conclusion note', value: s['conclusion_note'], full: true }]" /></section>
      @if (s['status'] === 'planned') {<app-notice>Drawing selects records from the frame; with a seed the same draw can be reproduced.</app-notice>}
      <section class="panel"><h3>Sampled records</h3>
        <app-table [columns]="itemCols" [rows]="s['items']" (rowClick)="record($event)" /></section>
      <section class="panel"><h3>Findings</h3><app-table [columns]="findingCols" [rows]="s['findings']" [clickable]="false" /></section>
      <app-evidence-panel entityType="verification_sample" [entityId]="s['id']" />
      <app-history entityType="verification_sample" [entityId]="s['id']" />
    }`,
})
export class SampleDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly id = input.required<string>();
  protected readonly sample = signal<Row | null>(null);
  protected readonly itemCols: Column[] = [
    { key: 'entity_label', label: 'Record' }, { key: 'result', label: 'Result', kind: 'status' },
    { key: 'visit_date', label: 'Visited', kind: 'date' }, { key: 'observation', label: 'Observation' },
    { key: 'discrepancy_note', label: 'Discrepancy' },
  ];
  protected readonly findingCols: Column[] = [
    { key: 'severity', label: 'Severity', kind: 'status' }, { key: 'description', label: 'Finding' },
    { key: 'corrective_action', label: 'Corrective action' }, { key: 'corrective_status', label: 'Status', kind: 'status' },
  ];

  ngOnInit(): void {
    this.api.get<Row>(`/verification-samples/${this.id()}`).subscribe((s) => this.sample.set(s));
  }

  protected resultText(s: Row): string {
    return counts(s);
  }

  protected async draw(s: Row): Promise<void> {
    if (s['selection_method'] === 'purposive') {
      const frame = await firstValueFrom(this.api.get<Page<Row>>(`/verification-samples/${this.id()}/frame`, { page_size: 200 }));
      const picked = await openForm<Row>(this.dialog, {
        title: `Choose records (frame: ${frame.total})`,
        fields: [{ name: 'entity_ids', label: 'Records to visit', type: 'multiselect', required: true,
          options: frame.items.map((e) => ({ value: e['id'], label: e['label'] })) }],
        notice: 'Purposive selection – record the reason in the sample frame description.',
        submitLabel: 'Draw sample',
        submit: (v) => firstValueFrom(this.api.post(`/verification-samples/${this.id()}/draw`, v)),
      });
      if (picked) this.ngOnInit();
      return;
    }
    this.api.post(`/verification-samples/${this.id()}/draw`, {}).subscribe(() => this.ngOnInit());
  }

  protected async record(item: Row): Promise<void> {
    if (!this.auth.has('verification.sample') || !['drawn', 'in_progress'].includes(this.sample()?.['status'])) return;
    const checks: Row[] = (await firstValueFrom(this.api.get<Row>('/configuration/checklists')))['verification_visit'].items;
    const value: Row = { ...item };
    for (const c of checks) value['check__' + c['code']] = !!item['checklist_results']?.[c['code']]?.ok;
    const saved = await openForm(this.dialog, {
      title: `Visit result – ${item['entity_label']}`, value,
      fields: [
        ...checks.map((c) => ({ name: 'check__' + c['code'], label: c['label'] + (c['required'] ? ' (required)' : ''), type: 'boolean' as const })),
        { name: 'result', label: 'Result', type: 'select', required: true, options: ['confirmed', 'discrepancy', 'not_found', 'not_visited'] },
        { name: 'visit_date', label: 'Visit date', type: 'date' },
        { name: 'observation', label: 'Observation', type: 'textarea' },
        { name: 'discrepancy_note', label: 'Discrepancy', type: 'textarea', showIf: (v) => v['result'] === 'discrepancy' },
      ],
      notice: 'You cannot verify a record you created or observed yourself.',
      submit: (v) => {
        const checklist: Row = {};
        const body: Row = {};
        for (const [k, val] of Object.entries(v)) {
          if (k.startsWith('check__')) checklist[k.slice(7)] = { ok: !!val };
          else body[k] = val;
        }
        return firstValueFrom(this.api.patch(`/verification-samples/items/${item['id']}`, { ...body, checklist_results: checks.length ? checklist : null }));
      },
    });
    if (saved) this.ngOnInit();
  }

  protected async addFinding(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Record sample finding',
      fields: [
        { name: 'severity', label: 'Severity', type: 'select', required: true, options: ['minor', 'major', 'critical'] },
        { name: 'finding_type', label: 'Type', type: 'select', required: true, options: ['data_quality', 'evidence_gap', 'method', 'other'] },
        { name: 'description', label: 'Finding', type: 'textarea', required: true },
        { name: 'corrective_action', label: 'Corrective action', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.post(`/verification-samples/${this.id()}/findings`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async complete(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Complete sample',
      fields: [{ name: 'conclusion', label: 'Conclusion', type: 'select', required: true,
        options: ['confirmed', 'discrepancies_found', 'inconclusive'] },
        { name: 'conclusion_note', label: 'Conclusion note', type: 'textarea', required: true }],
      submit: (v) => firstValueFrom(this.api.post(`/verification-samples/${this.id()}/complete`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
