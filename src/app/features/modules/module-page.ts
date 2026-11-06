import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { labelize, observedLabel } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Page, RecordType, Row, Workstream } from '../../core/models';
import { NatureBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';
import { recordFields, toRecordPayload } from '../../shared/record-form';

const LINKS: Record<string, { label: string; link: string; icon: string }[]> = {
  climate: [{ label: 'Alerts & advisories', link: '/advisories', icon: 'campaign' }],
  water: [{ label: 'Practice adoption', link: '/practices', icon: 'task_alt' },
    { label: 'Soil/moisture demo sites', link: '/demonstration-sites', icon: 'yard' },
    { label: 'Water monitoring records', link: '/monitoring', icon: 'monitoring' }],
  pest: [{ label: 'Surveillance clusters', link: '/surveillance-clusters', icon: 'pest_control' },
    { label: 'Pest advisories', link: '/advisories', icon: 'campaign' }],
  soil: [{ label: 'IoT device registry', link: '/devices', icon: 'sensors' }],
  suitability: [{ label: 'Plantation demo sites', link: '/demonstration-sites', icon: 'yard' }],
  farmer_fpo: [{ label: 'Farmers & households', link: '/farmers', icon: 'agriculture' },
    { label: 'Demonstration sites', link: '/demonstration-sites', icon: 'yard' },
    { label: 'Community resource persons', link: '/crps', icon: 'record_voice_over' },
    { label: 'Practice adoption', link: '/practices', icon: 'task_alt' }],
};

@Component({
  selector: 'app-module-page',
  imports: [PageHeader, Notice, DataTable, NatureBadge, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule,
    MatSelectModule, ReactiveFormsModule, RouterLink],
  template: `
    @if (module(); as m) {
      <app-page-header [title]="m.number + '. ' + m.name" [subtitle]="m.description">
        @for (l of links(); track l.link) {<a mat-stroked-button [routerLink]="l.link"><mat-icon>{{ l.icon }}</mat-icon> {{ l.label }}</a>}
        @if (auth.has('module.write') && m.record_types.length) {
          <button mat-flat-button [matMenuTriggerFor]="newMenu"><mat-icon>add</mat-icon> New record</button>
          <mat-menu #newMenu="matMenu">
            @for (rt of m.record_types; track rt.code) {<button mat-menu-item (click)="create(rt)">{{ rt.name }}</button>}
          </mat-menu>
        }
      </app-page-header>
      <div class="stat-row">
        @for (rt of m.record_types; track rt.code) {
          <button class="stat type-card" [class.selected]="type.value === rt.code" (click)="type.setValue(type.value === rt.code ? null : rt.code)">
            <div class="label"><strong>{{ rt.name }}</strong></div>
            <app-nature [nature]="rt.data_nature" />
            <div class="sub muted">{{ rt.description }}</div>
            @if (rt.caution) {<div class="sub caution">⚠ {{ rt.caution }}</div>}
          </button>
        }
      </div>
      <div class="filters">
        <mat-form-field><mat-label>Record type</mat-label>
          <mat-select [formControl]="type"><mat-option [value]="null">All</mat-option>
            @for (rt of m.record_types; track rt.code) {<mat-option [value]="rt.code">{{ rt.name }}</mat-option>}</mat-select></mat-form-field>
        <mat-form-field><mat-label>Validation</mat-label>
          <mat-select [formControl]="validation"><mat-option [value]="null">All</mat-option>
            @for (s of statuses; track s) {<mat-option [value]="s">{{ label(s) }}</mat-option>}</mat-select></mat-form-field>
      </div>
      <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
                 [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
                 (rowClick)="router.navigate(['/records', $event['id']])" />
    } @else if (notFound()) {
      <app-notice kind="warning">Unknown workstream.</app-notice>
    }`,
  styles: `.type-card { text-align: left; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 4px; }
    .type-card.selected { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
    .caution { color: var(--warning-fg); }`,
})
export class ModulePage {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  readonly code = input.required<string>();
  private readonly workstreams = signal<Workstream[]>([]);
  protected readonly module = computed(() => this.workstreams().find((w) => w.code === this.code()) ?? null);
  protected readonly notFound = computed(() => this.workstreams().length > 0 && !this.module());
  protected readonly links = computed(() => LINKS[this.code()] ?? []);
  protected readonly statuses = ['pending_validation', 'valid', 'exception', 'rejected'];
  protected readonly type = new FormControl<string | null>(null);
  protected readonly validation = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'record_type', label: 'Type', kind: 'label' }, { key: 'data_nature', label: 'Nature', kind: 'nature' },
    { key: 'observed_at', label: 'Observed', value: (r) => observedLabel(r['observed_at']) },
    { key: 'where', label: 'Farmer / plot / area', value: (r) => r['farm_plot']?.label ?? r['farmer']?.label ?? r['device']?.label ?? r['geo_unit']?.label },
    { key: 'value', label: 'Value', value: (r) => (r['value'] != null ? `${Number(r['value'])} ${r['unit'] ?? ''}` : '—') },
    { key: 'submission_status', label: 'Submission', kind: 'status' }, { key: 'validation_status', label: 'Validation', kind: 'status' },
    { key: 'source', label: 'Source', value: (r) => (r['source_system_id'] ? 'Imported' : 'Manual') },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/field-records', {
    page, page_size: size, module_code: this.code(), record_type: this.type.value, validation_status: this.validation.value }));

  constructor() {
    this.lookups.workstreams().subscribe((w) => this.workstreams.set(w));
    this.lookups.loadProgrammes().subscribe();
    effect(() => {
      this.code();
      this.type.setValue(null, { emitEvent: false });
      this.list.reset();
    });
    this.type.valueChanges.subscribe(() => this.list.reset());
    this.validation.valueChanges.subscribe(() => this.list.reset());
  }

  protected label(v: string): string {
    return labelize(v);
  }

  protected async create(rt: RecordType): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: `New ${rt.name.toLowerCase()}`, fields: recordFields(rt), submitLabel: 'Save draft',
      notice: rt.data_nature === 'model_prediction'
        ? 'This is a model prediction (risk estimate). It is never shown as a confirmed field condition.' : rt.caution ?? undefined,
      submit: (v) => firstValueFrom(this.api.post('/field-records', {
        ...toRecordPayload(v), record_type: rt.code, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/records', saved['id']]);
  }
}
