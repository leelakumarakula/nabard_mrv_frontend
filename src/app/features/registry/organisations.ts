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
import { formatNumber } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { PageHeader } from '../../shared/page-header';

const ORG_FIELDS: FieldDef[] = [
  { name: 'org_type', label: 'Type', type: 'select', required: true, options: ['fpo', 'partner', 'department', 'implementing_agency'] },
  { name: 'code', label: 'Code', type: 'text', required: true },
  { name: 'name', label: 'Name', type: 'text', required: true, full: true },
  { name: 'geo_unit_id', label: 'Geography', type: 'lookup', lookup: 'geo' },
  { name: 'registration_ref', label: 'Registration reference', type: 'text' },
  { name: 'contact_name', label: 'Contact name', type: 'text' },
  { name: 'contact_phone', label: 'Contact phone', type: 'text' },
  { name: 'contact_email', label: 'Contact email', type: 'email' },
  { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
];

@Component({
  selector: 'app-organisations',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="FPOs & organisations">
      @if (auth.has('org.manage')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New organisation</button>}
    </app-page-header>
    <div class="filters">
      <mat-form-field class="search"><mat-label>Search</mat-label><input matInput [formControl]="search" /></mat-form-field>
      <mat-form-field><mat-label>Type</mat-label>
        <mat-select [formControl]="type"><mat-option [value]="null">All</mat-option>
          @for (t of types; track t) {<mat-option [value]="t">{{ t }}</mat-option>}</mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/organisations', $event['id']])" />`,
})
export class OrganisationsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly types = ['fpo', 'partner', 'department', 'implementing_agency'];
  protected readonly search = new FormControl('');
  protected readonly type = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'org_type', label: 'Type', kind: 'label' },
    { key: 'geo_unit', label: 'Geography', kind: 'ref' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/organisations', {
    page, page_size: size, search: this.search.value, org_type: this.type.value }));

  ngOnInit(): void {
    this.list.load();
    this.search.valueChanges.pipe(debounceTime(300)).subscribe(() => this.list.reset());
    this.type.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'New organisation', fields: ORG_FIELDS, value: { org_type: 'fpo', status: 'active' },
      submit: (v) => firstValueFrom(this.api.post('/organisations', v)),
    });
    if (saved) {
      this.lookups.refresh();
      this.list.load();
    }
  }
}

@Component({
  selector: 'app-organisation-detail',
  imports: [PageHeader, DetailGrid, StatusBadge, DemoBadge, MatButtonModule, MatIconModule],
  template: `
    @if (org(); as o) {
      <app-page-header [title]="o['name']" [subtitle]="o['code'] + ' · ' + o['org_type']" back="/organisations">
        <ng-container badges><app-status [status]="o['status']" /><app-demo [show]="o['is_demo']" /></ng-container>
        @if (auth.has('farmer.read')) {
          <button mat-stroked-button (click)="router.navigate(['/farmers'], { queryParams: { fpo_id: o['id'] } })">
            <mat-icon>agriculture</mat-icon> Farmers</button>}
        @if (auth.has('org.manage')) {<button mat-stroked-button (click)="edit(o)"><mat-icon>edit</mat-icon> Edit</button>}
      </app-page-header>
      <div class="stat-row">
        <div class="stat"><div class="value">{{ n(o['farmer_count']) }}</div><div class="label">Farmers (primary FPO)</div></div>
        <div class="stat"><div class="value">{{ n(o['enrolled_farmer_count']) }}</div><div class="label">Enrolled</div></div>
        <div class="stat"><div class="value">{{ n(o['plot_area_ha']) }}</div><div class="label">Recorded plot area (ha)</div></div>
      </div>
      <section class="panel">
        <app-details [items]="[
          { label: 'Geography', value: o['geo_unit']?.label }, { label: 'Registration ref', value: o['registration_ref'] },
          { label: 'Contact', value: o['contact_name'] }, { label: 'Phone', value: o['contact_phone'] },
          { label: 'Email', value: o['contact_email'] }, { label: 'Status', value: o['status'], kind: 'status' }]" />
      </section>
    }`,
})
export class OrganisationDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly id = input.required<string>();
  protected readonly org = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>(`/organisations/${this.id()}`).subscribe((o) => this.org.set(o));
  }

  protected n(v: unknown): string {
    return formatNumber(v);
  }

  protected async edit(o: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit organisation', fields: ORG_FIELDS.filter((f) => !['org_type', 'code'].includes(f.name)), value: o,
      submit: (v) => firstValueFrom(this.api.patch(`/organisations/${o['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
