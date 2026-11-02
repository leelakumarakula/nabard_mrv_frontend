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
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { confirmAction } from '../../shared/confirm-dialog';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const ADVISORY_FIELDS: FieldDef[] = [
  { name: 'advisory_type', label: 'Type', type: 'select', required: true, options: ['alert', 'advisory'] },
  { name: 'origin_module', label: 'Workstream', type: 'lookup', lookup: 'module', required: true },
  { name: 'title', label: 'Title', type: 'text', required: true, full: true },
  { name: 'message', label: 'Message', type: 'textarea', required: true },
  { name: 'recommendation', label: 'Recommendation', type: 'textarea' },
  { name: 'hazard_type', label: 'Hazard', type: 'select',
    options: ['drought', 'heat', 'excess_rainfall', 'cold', 'wind', 'pest', 'disease', 'other'] },
  { name: 'risk_level', label: 'Risk level', type: 'select', options: ['low', 'moderate', 'high', 'very_high'] },
  { name: 'recommended_activity_code', label: 'Recommended practice', type: 'lookup', lookup: 'activity' },
  { name: 'target_geo_unit_id', label: 'Target area', type: 'lookup', lookup: 'geo', required: true },
  { name: 'target_organisation_id', label: 'Target FPO / group', type: 'lookup', lookup: 'fpo' },
  { name: 'valid_until', label: 'Valid until', type: 'datetime' },
];

@Component({
  selector: 'app-advisories',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Advisories & alerts" subtitle="Delivery and response are tracked separately from practice adoption">
      @if (auth.has('advisory.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New advisory</button>}
    </app-page-header>
    <div class="filters">
      <mat-form-field><mat-label>Type</mat-label><mat-select [formControl]="type"><mat-option [value]="null">All</mat-option>
        <mat-option value="alert">Alert</mat-option><mat-option value="advisory">Advisory</mat-option></mat-select></mat-form-field>
      <mat-form-field><mat-label>Status</mat-label><mat-select [formControl]="status"><mat-option [value]="null">All</mat-option>
        <mat-option value="draft">Draft</mat-option><mat-option value="issued">Issued</mat-option>
        <mat-option value="withdrawn">Withdrawn</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/advisories', $event['id']])" />`,
})
export class AdvisoriesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly type = new FormControl<string | null>(null);
  protected readonly status = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'title', label: 'Title' }, { key: 'advisory_type', label: 'Type', kind: 'label' },
    { key: 'origin_module', label: 'Workstream', kind: 'label' }, { key: 'hazard_type', label: 'Hazard', kind: 'label' },
    { key: 'risk_level', label: 'Risk', kind: 'status' }, { key: 'target_geo_unit', label: 'Area', kind: 'ref' },
    { key: 'issued_at', label: 'Issued', kind: 'datetime' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/advisories', {
    page, page_size: size, advisory_type: this.type.value, status: this.status.value }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
    this.type.valueChanges.subscribe(() => this.list.reset());
    this.status.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'New advisory (draft)', fields: ADVISORY_FIELDS, value: { advisory_type: 'advisory', origin_module: 'climate' },
      notice: 'Risk levels from models are estimates. Issuing an advisory does not count as farmer adoption.',
      submit: (v) => firstValueFrom(this.api.post('/advisories', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/advisories', saved['id']]);
  }
}

@Component({
  selector: 'app-advisory-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, HistoryPanel, Notice, MatButtonModule, MatIconModule],
  template: `
    @if (adv(); as a) {
      <app-page-header [title]="a['title']" [subtitle]="a['target_geo_unit']?.label" back="/advisories">
        <ng-container badges><app-status [status]="a['status']" /><app-demo [show]="a['is_demo']" /></ng-container>
        @if (auth.has('advisory.manage')) {
          @if (a['status'] === 'draft') {
            <button mat-stroked-button (click)="edit(a)"><mat-icon>edit</mat-icon> Edit</button>
            <button mat-flat-button (click)="act('issue')"><mat-icon>campaign</mat-icon> Issue</button>
          }
          @if (a['status'] === 'issued') {
            <button mat-stroked-button (click)="addDeliveries()"><mat-icon>group_add</mat-icon> Record deliveries</button>
            <button mat-stroked-button (click)="act('withdraw')"><mat-icon>block</mat-icon> Withdraw</button>
          }
        }
      </app-page-header>
      <app-notice>Delivery and farmer responses show reach and understanding only. Adoption is recorded as practice records
        observed in the field.</app-notice>
      <div class="stat-row">
        <div class="stat"><div class="value">{{ a['deliveries_total'] }}</div><div class="label">Deliveries recorded</div></div>
        <div class="stat"><div class="value">{{ a['deliveries_delivered'] }}</div><div class="label">Confirmed delivered</div></div>
        <div class="stat"><div class="value">{{ a['deliveries_responded'] }}</div><div class="label">With farmer response</div></div>
      </div>
      <section class="panel">
        <app-details [items]="[
          { label: 'Type', value: a['advisory_type'], kind: 'label' }, { label: 'Workstream', value: a['origin_module'], kind: 'label' },
          { label: 'Hazard', value: a['hazard_type'], kind: 'label' }, { label: 'Risk level', value: a['risk_level'], kind: 'status' },
          { label: 'Issued', value: a['issued_at'], kind: 'datetime' }, { label: 'Valid until', value: a['valid_until'], kind: 'datetime' },
          { label: 'Recommended practice', value: a['recommended_activity_code'] },
          { label: 'Source', value: a['source_system_id'] ? 'Imported: ' + a['source_record_id'] : 'Manual' },
          { label: 'Message', value: a['message'], full: true }, { label: 'Recommendation', value: a['recommendation'], full: true }]" />
      </section>
      <section class="panel">
        <h3>Recipients, delivery and response</h3>
        <app-table [columns]="deliveryCols" [rows]="deliveries()" (rowClick)="recordResponse($event)" />
      </section>
      <app-evidence-panel entityType="advisory" [entityId]="a['id']" />
      <app-history entityType="advisory" [entityId]="a['id']" />
    }`,
})
export class AdvisoryDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly id = input.required<string>();
  protected readonly adv = signal<Row | null>(null);
  protected readonly deliveries = signal<Row[]>([]);
  protected readonly deliveryCols: Column[] = [
    { key: 'farmer', label: 'Farmer', kind: 'ref' }, { key: 'channel', label: 'Channel', kind: 'label' },
    { key: 'sent_at', label: 'Sent', kind: 'datetime' }, { key: 'delivered_at', label: 'Delivered', kind: 'datetime' },
    { key: 'response', label: 'Response' }, { key: 'understood', label: 'Understood', kind: 'bool' },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.get<Row>(`/advisories/${this.id()}`).subscribe((a) => this.adv.set(a));
    this.api.get<Page<Row>>(`/advisories/${this.id()}/deliveries`, { page_size: 200 }).subscribe((p) => this.deliveries.set(p.items));
  }

  protected async edit(a: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit advisory', value: a,
      fields: ADVISORY_FIELDS.filter((f) => !['advisory_type', 'origin_module', 'target_geo_unit_id'].includes(f.name)),
      submit: (v) => firstValueFrom(this.api.patch(`/advisories/${a['id']}`, v)),
    });
    if (saved) this.load();
  }

  protected async act(action: 'issue' | 'withdraw'): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: action === 'issue' ? 'Issue advisory' : 'Withdraw advisory', danger: action === 'withdraw',
      message: action === 'issue' ? 'Issued advisories can no longer be edited.' : 'The advisory will be marked withdrawn.' });
    if (!ok) return;
    this.api.post(`/advisories/${this.id()}/${action}`).subscribe(() => {
      this.notify.success(action === 'issue' ? 'Advisory issued' : 'Advisory withdrawn');
      this.load();
    });
  }

  protected async addDeliveries(): Promise<void> {
    const farmers = await firstValueFrom(this.api.get<Page<Row>>('/farmers', { page_size: 200 }));
    const saved = await openForm(this.dialog, {
      title: 'Record deliveries',
      fields: [
        { name: 'channel', label: 'Channel', type: 'select', required: true,
          options: ['sms', 'whatsapp', 'ivr', 'app', 'fpo_meeting', 'field_visit'] },
        { name: 'farmer_ids', label: 'Recipients', type: 'multiselect', required: true,
          options: farmers.items.map((f) => ({ value: f['id'], label: `${f['farmer_code']} – ${f['full_name']}` })) },
        { name: 'sent_at', label: 'Sent at', type: 'datetime' },
        { name: 'delivered_at', label: 'Delivery confirmed at', type: 'datetime', hint: 'Leave empty if delivery is not confirmed' },
      ],
      value: { channel: 'sms' },
      submit: (v) => firstValueFrom(this.api.post(`/advisories/${this.id()}/deliveries/bulk`, v)),
    });
    if (saved) this.load();
  }

  protected async recordResponse(d: Row): Promise<void> {
    if (!this.auth.has('advisory.manage')) return;
    const saved = await openForm(this.dialog, {
      title: `Delivery to ${d['farmer']?.label ?? 'recipient'}`,
      fields: [
        { name: 'delivered_at', label: 'Delivery confirmed at', type: 'datetime' },
        { name: 'read_at', label: 'Read at', type: 'datetime' },
        { name: 'response', label: 'Farmer response', type: 'textarea' },
        { name: 'understood', label: 'Farmer confirmed understanding', type: 'boolean' },
      ],
      value: d, submit: (v) => firstValueFrom(this.api.patch(`/advisory-deliveries/${d['id']}`, v)),
    });
    if (saved) this.load();
  }
}
