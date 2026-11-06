import { Component, OnInit, inject, input, signal, computed } from '@angular/core';
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

/** Workstream of the practices a calendar task can suggest (same as the activity catalogue). */
const ACTIVITY_MODULE: Record<string, string> = {
  PEST_PREVENTION: 'pest', MULCHING: 'water', WATER_MANAGEMENT: 'water', SOIL_CONSERVATION: 'soil', SOIL_HEALTH: 'soil',
  SHADE_CANOPY: 'suitability',
};

@Component({
  selector: 'app-practices',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Practice adoption" subtitle="Recommended → farmer-reported → field-observed → independently verified">
      @if (auth.has('module.write')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New practice record</button>}
    </app-page-header>
    <app-notice>Only field-observed practices count towards adoption indicators. Advisory delivery or training attendance
      is never treated as adoption. Verification status is set by independent sample verification.</app-notice>
    <section class="panel calendar-panel">
      <div class="panel-head">
        <h3><mat-icon>event_note</mat-icon>Coffee calendar – recommended this month</h3>
        <div class="calendar-controls">
          <mat-form-field subscriptSizing="dynamic"><mat-label>Month</mat-label><mat-select [formControl]="calMonth">
            @for (m of months; track m.value) {<mat-option [value]="m.value">{{ m.label }}</mat-option>}</mat-select></mat-form-field>
          <mat-form-field subscriptSizing="dynamic"><mat-label>Coffee</mat-label><mat-select [formControl]="calCrop">
            <mat-option value="robusta">Robusta</mat-option><mat-option value="arabica">Arabica</mat-option></mat-select></mat-form-field>
        </div>
      </div>
      <p class="muted small">Seasonal tasks from FarmFuture's coffee calendar (Coffee Board guidance), read live – suggestions only.
        A task becomes part of the adoption record only when you recommend it to a specific farmer.</p>
      @if (calError()) {<div class="muted">{{ calError() }}</div>}
      @for (t of shownTasks(); track t.id) {
        <div class="feed-row">
          <span class="feed-icon tone-info"><mat-icon>agriculture</mat-icon></span>
          <span class="grow">{{ t.task }}<br /><span class="muted small">{{ t.category }}{{ t.window ? ' · ' + t.window : '' }}
            · suggested practice: {{ t.suggested_activity_name ?? 'choose when recording' }}</span></span>
          @if (auth.has('module.write')) {<button mat-stroked-button (click)="recommend(t)"><mat-icon>person_add</mat-icon> Recommend to a farmer</button>}
        </div>
      } @empty {@if (!calError()) {<div class="empty-note"><mat-icon>event_available</mat-icon>No calendar tasks for this month</div>}}
      @if (calTasks().length > 4) {
        <button mat-button type="button" (click)="calAll.set(!calAll())"><mat-icon>{{ calAll() ? 'expand_less' : 'expand_more' }}</mat-icon>
          {{ calAll() ? 'Show fewer' : 'Show all ' + calTasks().length + ' tasks' }}</button>
      }
    </section>
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
  protected readonly calMonth = new FormControl<number>(new Date().getMonth() + 1, { nonNullable: true });
  protected readonly calCrop = new FormControl<string>('robusta', { nonNullable: true });
  protected readonly calTasks = signal<Row[]>([]);
  protected readonly calError = signal('');
  protected readonly calAll = signal(false);
  protected readonly shownTasks = computed(() => (this.calAll() ? this.calTasks() : this.calTasks().slice(0, 4)));
  protected readonly months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1,
    label: new Date(2026, i, 1).toLocaleString('en-IN', { month: 'long' }) }));
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
    this.loadCalendar();
    this.calMonth.valueChanges.subscribe(() => this.loadCalendar());
    this.calCrop.valueChanges.subscribe(() => this.loadCalendar());
    this.verification.valueChanges.subscribe(() => this.list.reset());
  }

  private loadCalendar(): void {
    this.calError.set('');
    this.api.get<Row>('/coffee-calendar', { month: this.calMonth.value, crop: this.calCrop.value }).subscribe({
      next: (r) => this.calTasks.set(r['tasks'] ?? []),
      error: (e) => { this.calTasks.set([]); this.calError.set(e?.error?.error?.message ?? 'The coffee calendar could not be read'); },
    });
  }

  protected recommend(task: Row): Promise<void> {
    const activity = task['suggested_activity_code'] as string | null;
    return this.create({ status: 'recommended', recommended_action: task['task'],
      ...(activity ? { activity_code: activity, module_code: ACTIVITY_MODULE[activity] ?? 'water' } : {}) });
  }

  protected async create(prefill: Row = {}): Promise<void> {
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
      value: { status: 'recommended', module_code: 'water', ...prefill },
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
