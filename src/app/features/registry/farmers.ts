import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Organisation, Page, Row } from '../../core/models';
import { Column, DataTable } from '../../shared/data-table';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { PageHeader } from '../../shared/page-header';

const DEMO_PREFIX = 'demographic__';

/** Farmer form fields plus the configured demographic fields (sensitive ones only for permitted roles). */
export async function farmerFields(api: ApiService, canSeeSensitive: boolean): Promise<FieldDef[]> {
  const defs = await firstValueFrom(api.get<Row[]>('/demographic-fields'));
  const types: Record<string, FieldDef['type']> = { select: 'select', boolean: 'boolean', number: 'number', date: 'date' };
  const extra: FieldDef[] = defs.filter((d) => canSeeSensitive || !d['is_sensitive']).map((d) => ({
    name: DEMO_PREFIX + d['code'],
    label: d['label'] + (d['is_sensitive'] ? ' (sensitive)' : '') + (d['status'] !== 'approved' ? ' – proposed field' : ''),
    type: types[d['field_type']] ?? 'text',
    options: d['options'] ?? undefined,
    hint: d['help_text'] ?? (d['requires_consent'] ? 'Requires recorded consent' : undefined),
  }));
  return [...FARMER_FIELDS, ...extra];
}

/** Form value → API payload: demographic fields are collected into the demographics object. */
export function toFarmerPayload(value: Row): Row {
  const out: Row = {};
  const demographics: Row = {};
  let hasDemographics = false;
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith(DEMO_PREFIX)) {
      hasDemographics = true;
      demographics[k.slice(DEMO_PREFIX.length)] = v;
    } else {
      out[k] = v;
    }
  }
  if (hasDemographics) out['demographics'] = demographics;
  return out;
}

export function fromFarmer(farmer: Row): Row {
  const value: Row = { ...farmer };
  for (const [k, v] of Object.entries(farmer['demographics'] ?? {})) value[DEMO_PREFIX + k] = v;
  return value;
}

export const FARMER_FIELDS: FieldDef[] = [
  { name: 'farmer_code', label: 'Farmer code', type: 'text', required: true },
  { name: 'household_code', label: 'Household code', type: 'text', hint: 'Stable household ID – targets count households' },
  { name: 'full_name', label: 'Full name', type: 'text', required: true },
  { name: 'geo_unit_id', label: 'Geography (cluster/district)', type: 'lookup', lookup: 'geo', required: true },
  { name: 'primary_fpo_id', label: 'Primary FPO', type: 'lookup', lookup: 'fpo' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'not_stated'] },
  { name: 'year_of_birth', label: 'Year of birth', type: 'integer', min: 1900, max: 2100 },
  { name: 'phone', label: 'Phone (personal data)', type: 'text' },
  { name: 'village', label: 'Village', type: 'text' },
  { name: 'consent_status', label: 'Consent', type: 'select', required: true, options: ['not_recorded', 'given', 'withdrawn'],
    hint: 'Consent and lawful purpose must be recorded before collecting personal data' },
  { name: 'consent_date', label: 'Consent date', type: 'date', showIf: (v) => v['consent_status'] === 'given' },
  { name: 'consent_purpose', label: 'Consent purpose', type: 'textarea', showIf: (v) => v['consent_status'] === 'given' },
];

@Component({
  selector: 'app-farmers',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Farmers & plots" subtitle="Registry within your assigned geography">
      @if (auth.has('farmer.manage')) {<button mat-flat-button (click)="create()"><mat-icon>person_add</mat-icon> Register farmer</button>}
    </app-page-header>
    <div class="filters">
      <mat-form-field class="search"><mat-label>Search code, name or village</mat-label><input matInput [formControl]="search" /></mat-form-field>
      <mat-form-field><mat-label>FPO</mat-label>
        <mat-select [formControl]="fpo"><mat-option [value]="null">All</mat-option>
          @for (o of fpos(); track o.id) {<mat-option [value]="o.id">{{ o.name }}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field><mat-label>Consent</mat-label>
        <mat-select [formControl]="consent"><mat-option [value]="null">All</mat-option>
          <mat-option value="given">Given</mat-option><mat-option value="not_recorded">Not recorded</mat-option>
          <mat-option value="withdrawn">Withdrawn</mat-option></mat-select></mat-form-field>
      <mat-form-field><mat-label>Beneficiary category</mat-label>
        <mat-select [formControl]="category"><mat-option [value]="null">All</mat-option>
          @for (c of categories(); track c['code']) {<mat-option [value]="c['code']">{{ c['name'] }}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field><mat-label>Enrolment</mat-label>
        <mat-select [formControl]="enrolment"><mat-option [value]="null">All</mat-option>
          <mat-option value="enrolled">Enrolled</mat-option><mat-option value="withdrawn">Withdrawn</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/farmers', $event['id']])" />`,
})
export class FarmersPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  readonly geo_unit_id = input<string>();
  readonly fpo_id = input<string>();
  protected readonly fpos = signal<Organisation[]>([]);
  protected readonly search = new FormControl('');
  protected readonly fpo = new FormControl<string | null>(null);
  protected readonly consent = new FormControl<string | null>(null);
  protected readonly enrolment = new FormControl<string | null>(null);
  protected readonly category = new FormControl<string | null>(null);
  protected readonly categories = signal<Row[]>([]);
  protected readonly columns: Column[] = [
    { key: 'farmer_code', label: 'Code' }, { key: 'household_code', label: 'Household' }, { key: 'full_name', label: 'Name' },
    { key: 'categories', label: 'Beneficiary categories',
      value: (r) => (r['categories'] ?? []).map((c: Row) => c['name']).join(', ') || '—' },
    { key: 'village', label: 'Village' },
    { key: 'geo_unit', label: 'Geography', kind: 'ref' }, { key: 'primary_fpo', label: 'FPO', kind: 'ref' },
    { key: 'consent_status', label: 'Consent', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/farmers', {
    page, page_size: size, search: this.search.value, fpo_id: this.fpo.value, consent_status: this.consent.value,
    enrolment_status: this.enrolment.value, geo_unit_id: this.geo_unit_id(), category_code: this.category.value,
    programme_id: this.enrolment.value ? this.lookups.currentProgramme()?.id : null }));

  ngOnInit(): void {
    if (this.fpo_id()) this.fpo.setValue(this.fpo_id()!, { emitEvent: false });
    this.lookups.organisations('fpo').subscribe((o) => this.fpos.set(o));
    this.list.load();
    this.search.valueChanges.pipe(debounceTime(300)).subscribe(() => this.list.reset());
    this.api.get<Row[]>('/beneficiary-categories').subscribe((c) => this.categories.set(c));
    for (const c of [this.fpo, this.consent, this.enrolment, this.category]) c.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'Register farmer', fields: await farmerFields(this.api, this.auth.has('farmer.read_sensitive')),
      value: { consent_status: 'not_recorded' },
      notice: 'Beneficiary categories are assigned explicitly on the farmer page after registration.',
      submit: (v) => firstValueFrom(this.api.post('/farmers', toFarmerPayload(v))),
    });
    if (saved?.['id']) this.router.navigate(['/farmers', saved['id']]);
  }
}
