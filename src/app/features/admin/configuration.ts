import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { labelize } from '../../core/format';
import { Row } from '../../core/models';
import { Column, DataTable } from '../../shared/data-table';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { Notice, PageHeader } from '../../shared/page-header';

const APPROVAL = ['proposed', 'approved', 'retired'];
const CHECKLISTS = [
  { kind: 'demonstration_site', label: 'Demonstration-site selection criteria' },
  { kind: 'pest_surveillance_cluster', label: 'Pest-surveillance cluster criteria' },
  { kind: 'verification_visit', label: 'Independent verification visit checklist' },
];

@Component({
  selector: 'app-configuration',
  imports: [PageHeader, Notice, DataTable, MatTabsModule, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Programme configuration" subtitle="Categories, demographic fields, criteria, checklists and report templates" />
    <app-notice kind="warning">Configuration encodes programme-owner rules. Keep items "proposed" until approved; the platform never
      infers category membership and enforces checklists only for items marked required.</app-notice>
    <mat-tab-group>
      <mat-tab label="Beneficiary categories">
        <div class="actions" style="margin: 8px 0">
          @if (canEdit) {<button mat-stroked-button (click)="editCategory()"><mat-icon>add</mat-icon> New category</button>}</div>
        <app-table [columns]="categoryCols" [rows]="categories()" (rowClick)="editCategory($event)" />
      </mat-tab>
      <mat-tab label="Demographic fields">
        <div class="actions" style="margin: 8px 0">
          @if (canEdit) {<button mat-stroked-button (click)="editField()"><mat-icon>add</mat-icon> New field</button>}</div>
        <app-table [columns]="fieldCols" [rows]="fields()" (rowClick)="editField($event)" />
      </mat-tab>
      <mat-tab label="Criteria & checklists">
        @for (c of checklistKinds; track c.kind) {
          <section class="panel">
            <div class="panel-head"><h3>{{ c.label }}</h3>
              @if (canEdit) {<button mat-stroked-button (click)="editChecklist(c.kind)"><mat-icon>edit</mat-icon> Edit</button>}</div>
            <app-table [columns]="checklistCols" [rows]="checklists()[c.kind]?.items ?? []" [clickable]="false"
                       emptyText="Not configured – nothing is enforced until the programme owner defines criteria" />
          </section>
        }
      </mat-tab>
      <mat-tab label="Report templates">
        <div class="actions" style="margin: 8px 0">
          @if (canEdit) {<button mat-stroked-button (click)="editTemplate()"><mat-icon>add</mat-icon> New template</button>}</div>
        <app-table [columns]="templateCols" [rows]="templates()" (rowClick)="editTemplate($event)" />
      </mat-tab>
    </mat-tab-group>`,
})
export class ConfigurationPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly canEdit = inject(AuthService).has('programme.manage');
  protected readonly checklistKinds = CHECKLISTS;
  protected readonly categories = signal<Row[]>([]);
  protected readonly fields = signal<Row[]>([]);
  protected readonly templates = signal<Row[]>([]);
  protected readonly checklists = signal<Row>({});
  private sections: string[] = [];
  protected readonly categoryCols: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Definition', kind: 'status' },
    { key: 'is_sensitive', label: 'Sensitive', kind: 'bool' }, { key: 'requires_consent', label: 'Needs consent', kind: 'bool' },
    { key: 'definition', label: 'Definition text' },
  ];
  protected readonly fieldCols: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'label', label: 'Label' }, { key: 'field_type', label: 'Type', kind: 'label' },
    { key: 'options', label: 'Options', value: (r) => (r['options'] ?? []).join(', ') },
    { key: 'is_sensitive', label: 'Sensitive', kind: 'bool' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly checklistCols: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'label', label: 'Criterion' }, { key: 'required', label: 'Required', kind: 'bool' },
  ];
  protected readonly templateCols: Column[] = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'base_report_type', label: 'Base', kind: 'label' },
    { key: 'sections', label: 'Sections', value: (r) => r['sections'].map(labelize).join(', ') },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'is_official', label: 'Official', kind: 'bool' },
  ];

  ngOnInit(): void {
    this.api.get<Row[]>('/beneficiary-categories').subscribe((c) => this.categories.set(c));
    this.api.get<Row[]>('/demographic-fields', { include_retired: true }).subscribe((f) => this.fields.set(f));
    this.api.get<Row[]>('/report-templates').subscribe((t) => this.templates.set(t));
    this.api.get<string[]>('/report-templates/sections').subscribe((s) => (this.sections = s));
    this.api.get<Row>('/configuration/checklists').subscribe((c) => this.checklists.set(c));
  }

  protected async editCategory(row?: Row): Promise<void> {
    if (!this.canEdit) return;
    const fields: FieldDef[] = [
      ...(row ? [] : [{ name: 'code', label: 'Code (UPPER_SNAKE)', type: 'text', required: true } as FieldDef]),
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'status', label: 'Definition status', type: 'select', options: APPROVAL },
      { name: 'is_sensitive', label: 'Sensitive (restricted to farmer.read_sensitive)', type: 'boolean' },
      { name: 'requires_consent', label: 'Requires recorded consent', type: 'boolean' },
      { name: 'definition', label: 'Approved definition / eligibility', type: 'textarea' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'approval_note', label: 'Approval note', type: 'textarea' },
      { name: 'sort_order', label: 'Sort order', type: 'integer' },
    ];
    const saved = await openForm(this.dialog, {
      title: row ? `Category ${row['code']}` : 'New beneficiary category', fields,
      value: row ?? { status: 'proposed', requires_consent: true, sort_order: 0 },
      submit: (v) => firstValueFrom(row ? this.api.patch(`/beneficiary-categories/${row['id']}`, v) : this.api.post('/beneficiary-categories', v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async editField(row?: Row): Promise<void> {
    if (!this.canEdit) return;
    const fields: FieldDef[] = [
      ...(row ? [] : [{ name: 'code', label: 'Code (lower_snake)', type: 'text', required: true } as FieldDef,
        { name: 'field_type', label: 'Type', type: 'select', required: true, options: ['text', 'select', 'boolean', 'number', 'date'] } as FieldDef]),
      { name: 'label', label: 'Label', type: 'text', required: true },
      { name: 'options', label: 'Options (comma separated, for select)', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: APPROVAL },
      { name: 'is_sensitive', label: 'Sensitive', type: 'boolean' }, { name: 'requires_consent', label: 'Requires consent', type: 'boolean' },
      { name: 'help_text', label: 'Help text', type: 'textarea' }, { name: 'sort_order', label: 'Sort order', type: 'integer' },
    ];
    const toPayload = (v: Row) => ({ ...v, options: v['options'] ? String(v['options']).split(',').map((x) => x.trim()).filter(Boolean) : null });
    const saved = await openForm(this.dialog, {
      title: row ? `Field ${row['code']}` : 'New demographic field', fields,
      value: row ? { ...row, options: (row['options'] ?? []).join(', ') } : { status: 'proposed', requires_consent: true, field_type: 'text' },
      submit: (v) => firstValueFrom(row ? this.api.patch(`/demographic-fields/${row['id']}`, toPayload(v))
        : this.api.post('/demographic-fields', toPayload(v))),
    });
    if (saved) this.ngOnInit();
  }

  protected async editChecklist(kind: string): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: CHECKLISTS.find((c) => c.kind === kind)?.label ?? kind,
      notice: 'JSON list of {"code", "label", "required"}. Required items must be met before activation / confirmation.',
      fields: [{ name: 'items', label: 'Items', type: 'json', required: true }],
      value: { items: this.checklists()[kind]?.items ?? [] },
      submit: (v) => firstValueFrom(this.api.put(`/configuration/checklists/${kind}`, v['items'])),
    });
    if (saved) this.ngOnInit();
  }

  protected async editTemplate(row?: Row): Promise<void> {
    if (!this.canEdit) return;
    const options = this.sections.map((s) => ({ value: s, label: labelize(s) }));
    const fields: FieldDef[] = [
      ...(row ? [] : [{ name: 'code', label: 'Code (UPPER_SNAKE)', type: 'text', required: true } as FieldDef,
        { name: 'base_report_type', label: 'Base report type', type: 'select', required: true,
          options: ['programme', 'geography', 'fpo', 'quarterly', 'annual', 'demonstration', 'surveillance', 'inclusion', 'verification'] } as FieldDef]),
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'sections', label: 'Sections', type: 'multiselect', options },
      { name: 'status', label: 'Status', type: 'select', options: ['draft', 'approved', 'awaiting_official_template', 'retired'] },
      { name: 'description', label: 'Description', type: 'textarea' }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ];
    const saved = await openForm(this.dialog, {
      title: row ? `Template ${row['code']}` : 'New report template', fields, value: row ?? { status: 'draft', sections: [] },
      submit: (v) => firstValueFrom(row ? this.api.patch(`/report-templates/${row['id']}`, v) : this.api.post('/report-templates', v)),
    });
    if (saved) this.ngOnInit();
  }
}
