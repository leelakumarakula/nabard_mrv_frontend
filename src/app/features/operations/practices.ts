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
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-practices',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Practice adoption" subtitle="Recommended → farmer-reported → field-observed → independently verified">
      @if (auth.has('module.write')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New practice record</button>}
    </app-page-header>
    <app-notice>Only field-observed practices count towards adoption indicators. Advisory delivery or training attendance
      is never treated as adoption. Verification status is set by independent sample verification.</app-notice>
    <div class="filters">
      <mat-form-field><mat-label>Status</mat-label><mat-select [formControl]="status"><mat-option [value]="null">All</mat-option>
        @for (s of ['recommended', 'reported', 'observed', 'not_adopted']; track s) {<mat-option [value]="s">{{ s }}</mat-option>}
      </mat-select></mat-form-field>
      <mat-form-field><mat-label>Verification</mat-label><mat-select [formControl]="verification"><mat-option [value]="null">All</mat-option>
        @for (s of ['unverified', 'verified', 'not_verified']; track s) {<mat-option [value]="s">{{ s }}</mat-option>}
      </mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/practices', $event['id']])" />`,
})
export class PracticesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly status = new FormControl<string | null>(null);
  protected readonly verification = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'farmer', label: 'Farmer', kind: 'ref' }, { key: 'activity_code', label: 'Practice' },
    { key: 'module_code', label: 'Workstream', kind: 'label' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'evidence_basis', label: 'Basis', kind: 'label' }, { key: 'verification_status', label: 'Verification', kind: 'status' },
    { key: 'action_date', label: 'Action date', kind: 'date' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/practice-records', {
    page, page_size: size, status: this.status.value, verification_status: this.verification.value }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
    this.status.valueChanges.subscribe(() => this.list.reset());
    this.verification.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'New practice record',
      fields: [
        { name: 'farmer_id', label: 'Farmer', type: 'farmer', required: true },
        { name: 'farm_plot_id', label: 'Plot', type: 'plot' },
        { name: 'module_code', label: 'Workstream', type: 'lookup', lookup: 'module', required: true },
        { name: 'activity_code', label: 'Practice', type: 'lookup', lookup: 'activity', required: true },
        { name: 'demonstration_site_id', label: 'Related demonstration site', type: 'lookup', lookup: 'demo_site' },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['recommended', 'reported', 'not_adopted'] },
        { name: 'recommended_action', label: 'Recommended action', type: 'textarea' },
        { name: 'reported_action', label: 'Farmer-reported action', type: 'textarea', showIf: (v) => v['status'] === 'reported' },
        { name: 'action_date', label: 'Action date', type: 'date' },
      ],
      value: { status: 'recommended', module_code: 'water' },
      notice: 'Use "Record field observation" on the saved record when the practice is seen in the field.',
      submit: (v) => firstValueFrom(this.api.post('/practice-records', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/practices', saved['id']]);
  }
}

@Component({
  selector: 'app-practice-detail',
  imports: [PageHeader, DetailGrid, StatusBadge, DemoBadge, EvidencePanel, HistoryPanel, MatButtonModule, MatIconModule],
  template: `
    @if (rec(); as r) {
      <app-page-header [title]="r['activity_code'] + ' – ' + (r['farmer']?.label ?? '')" back="/practices">
        <ng-container badges><app-status [status]="r['status']" /><app-status prefix="Verification" [status]="r['verification_status']" />
          <app-demo [show]="r['is_demo']" /></ng-container>
        @if (auth.has('module.write') && r['evidence_basis'] !== 'observed' && r['verification_status'] === 'unverified') {
          <button mat-stroked-button (click)="edit(r)"><mat-icon>edit</mat-icon> Edit</button>
        }
        @if (auth.has('module.write') && r['verification_status'] === 'unverified') {
          <button mat-flat-button (click)="observe()"><mat-icon>visibility</mat-icon> Record field observation</button>
        }
      </app-page-header>
      <section class="panel">
        <app-details [items]="[
          { label: 'Plot', value: r['farm_plot']?.label }, { label: 'Workstream', value: r['module_code'], kind: 'label' },
          { label: 'Evidence basis', value: r['evidence_basis'], kind: 'label' }, { label: 'Action date', value: r['action_date'], kind: 'date' },
          { label: 'Recommended action', value: r['recommended_action'], full: true },
          { label: 'Farmer-reported action', value: r['reported_action'], full: true },
          { label: 'Field-observed action', value: r['observed_action'], full: true }]" />
      </section>
      <app-evidence-panel entityType="practice_record" [entityId]="r['id']" />
      <app-history entityType="practice_record" [entityId]="r['id']" />
    }`,
})
export class PracticeDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly id = input.required<string>();
  protected readonly rec = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>(`/practice-records/${this.id()}`).subscribe((r) => this.rec.set(r));
  }

  /** Recommended / farmer-reported records stay editable; field-observed and verified ones are locked by the API. */
  protected async edit(r: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit practice record', value: r,
      fields: [
        { name: 'farm_plot_id', label: 'Plot', type: 'plot' },
        { name: 'status', label: 'Status', type: 'select', options: ['recommended', 'reported', 'not_adopted'] },
        { name: 'recommended_action', label: 'Recommended action', type: 'textarea' },
        { name: 'reported_action', label: 'Farmer-reported action', type: 'textarea' },
        { name: 'action_date', label: 'Action date', type: 'date' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/practice-records/${r['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async observe(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Record field observation',
      fields: [
        { name: 'adopted', label: 'Practice observed in the field', type: 'boolean', default: true },
        { name: 'observed_action', label: 'What was observed', type: 'textarea', required: true },
        { name: 'action_date', label: 'Observation date', type: 'date', required: true },
      ],
      value: { adopted: true }, notice: 'Attach a photo or field form as evidence after saving.',
      submit: (v) => firstValueFrom(this.api.post(`/practice-records/${this.id()}/observe`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
