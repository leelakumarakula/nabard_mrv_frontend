import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { Column, DataTable } from '../../shared/data-table';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const STATUSES = ['nominated', 'in_training', 'trained', 'active', 'inactive'];
const CRP_FIELDS: FieldDef[] = [
  { name: 'crp_code', label: 'CRP code', type: 'text', required: true },
  { name: 'full_name', label: 'Full name', type: 'text', required: true },
  { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'not_stated'] },
  { name: 'phone', label: 'Phone (personal data)', type: 'text' },
  { name: 'farmer_id', label: 'Linked farmer (optional)', type: 'farmer' },
  { name: 'organisation_id', label: 'FPO / grower group', type: 'lookup', lookup: 'fpo' },
  { name: 'geo_unit_id', label: 'Area (if no FPO/farmer)', type: 'lookup', lookup: 'geo' },
  { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
  { name: 'training_started_on', label: 'Training started', type: 'date' },
  { name: 'training_completed_on', label: 'Training completed', type: 'date', hint: 'Required for trained/active' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

@Component({
  selector: 'app-crps',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Community resource persons" subtitle="Proposal target: 100 trained, including at least 50 women">
      @if (auth.has('community.manage')) {<button mat-flat-button (click)="create()"><mat-icon>person_add</mat-icon> Add CRP</button>}
    </app-page-header>
    <app-notice>Training completion and competency evidence rules are pending programme approval; attach attendance sheets or
      certificates as evidence.</app-notice>
    <div class="filters">
      <mat-form-field><mat-label>Status</mat-label><mat-select [formControl]="status"><mat-option [value]="null">All</mat-option>
        @for (s of statuses; track s) {<mat-option [value]="s">{{ s }}</mat-option>}</mat-select></mat-form-field>
      <mat-form-field><mat-label>Gender</mat-label><mat-select [formControl]="gender"><mat-option [value]="null">All</mat-option>
        <mat-option value="female">Female</mat-option><mat-option value="male">Male</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)" (rowClick)="edit($event)" />`,
})
export class CrpsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly statuses = STATUSES;
  protected readonly status = new FormControl<string | null>(null);
  protected readonly gender = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'crp_code', label: 'Code' }, { key: 'full_name', label: 'Name' }, { key: 'gender', label: 'Gender', kind: 'label' },
    { key: 'organisation', label: 'FPO / group', kind: 'ref' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'training_completed_on', label: 'Trained on', kind: 'date' }, { key: 'competency_result', label: 'Competency', kind: 'label' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/community-resource-persons', {
    page, page_size: size, status: this.status.value, gender: this.gender.value }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
    this.status.valueChanges.subscribe(() => this.list.reset());
    this.gender.valueChanges.subscribe(() => this.list.reset());
  }

  protected async create(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add community resource person', fields: CRP_FIELDS, value: { status: 'nominated' },
      submit: (v) => firstValueFrom(this.api.post('/community-resource-persons', { ...v, programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved) this.list.load();
  }

  protected async edit(row: Row): Promise<void> {
    if (!this.auth.has('community.manage')) return;
    const saved = await openForm(this.dialog, {
      title: `${row['crp_code']} – ${row['full_name']}`, value: row,
      fields: [...CRP_FIELDS.filter((f) => !['crp_code', 'farmer_id', 'geo_unit_id'].includes(f.name)),
        { name: 'competency_result', label: 'Competency result', type: 'select', options: ['not_assessed', 'competent', 'needs_support'] },
        { name: 'competency_assessed_on', label: 'Competency assessed on', type: 'date' }],
      submit: (v) => firstValueFrom(this.api.patch(`/community-resource-persons/${row['id']}`, v)),
    });
    if (saved) this.list.load();
  }
}
