import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Row } from '../../core/models';
import { Column, DataTable } from '../../shared/data-table';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { Notice, PageHeader } from '../../shared/page-header';

const CATEGORIES = ['scope', 'indicators', 'inclusion', 'field', 'verification', 'reporting', 'integration', 'privacy'];

@Component({
  selector: 'app-programme-status',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Programme status" subtitle="What is implemented, configurable or awaiting programme-owner approval">
      @if (auth.has('programme.manage')) {<button mat-flat-button (click)="add()"><mat-icon>add</mat-icon> Record a decision item</button>}
    </app-page-header>
    @if (status(); as s) {
      <div class="stat-row">
        <div class="stat"><div class="value">{{ s['summary'].pending_decisions }}</div><div class="label">Pending programme-owner decisions</div></div>
        <div class="stat"><div class="value">{{ s['summary'].indicators_approved }} / {{ s['summary'].indicators_total }}</div>
          <div class="label">Indicator definitions approved</div></div>
        <div class="stat"><div class="value">{{ count('implemented') }}</div><div class="label">Features implemented</div></div>
        <div class="stat"><div class="value">{{ count('awaiting_approval') }}</div><div class="label">Awaiting approval</div></div>
      </div>
      <section class="panel"><h3>Feature status</h3>
        <app-table [columns]="featureCols" [rows]="s['features']" [clickable]="false" /></section>
    }
    <section class="panel">
      <h3>Programme-owner decisions</h3>
      <app-notice>Development continues with the provisional treatment shown. When a decision is recorded, update the related
        configuration (geography, indicators, categories, checklists or report templates) – no code change is needed.</app-notice>
      <app-table [columns]="decisionCols" [rows]="decisions()" (rowClick)="edit($event)" />
    </section>`,
})
export class ProgrammeStatusPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly status = signal<Row | null>(null);
  protected readonly decisions = signal<Row[]>([]);
  private readonly features = computed<Row[]>(() => this.status()?.['features'] ?? []);
  protected readonly featureCols: Column[] = [
    { key: 'area', label: 'Area' }, { key: 'feature', label: 'Feature' }, { key: 'status', label: 'Status', kind: 'status' },
    { key: 'detail', label: 'Detail' },
  ];
  protected readonly decisionCols: Column[] = [
    { key: 'code', label: 'Item' }, { key: 'title', label: 'Decision needed' }, { key: 'category', label: 'Area', kind: 'label' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'provisional_treatment', label: 'Provisional treatment' },
    { key: 'affects', label: 'Affects', value: (r) => (r['affects'] ?? []).join(', ') },
    { key: 'decision', label: 'Decision' },
  ];

  ngOnInit(): void {
    this.api.get<Row>('/system/feature-status').subscribe((s) => this.status.set(s));
    this.api.get<Row[]>('/programme-decisions').subscribe((d) => this.decisions.set(d));
  }

  protected count(status: string): number {
    return this.features().filter((f) => f['status'] === status).length;
  }

  private fields(creating: boolean): FieldDef[] {
    const base: FieldDef[] = [
      { name: 'title', label: 'Title', type: 'text', required: true, full: true },
      { name: 'question', label: 'Question for the programme owner', type: 'textarea', required: true },
      { name: 'provisional_treatment', label: 'Provisional treatment in the platform', type: 'textarea' },
      { name: 'owner', label: 'Decision owner', type: 'text' },
      { name: 'affects', label: 'Affects (comma separated)', type: 'text' },
    ];
    return creating
      ? [{ name: 'code', label: 'Code', type: 'text', required: true },
        { name: 'category', label: 'Area', type: 'select', required: true, options: CATEGORIES }, ...base]
      : [...base, { name: 'status', label: 'Status', type: 'select', options: ['pending', 'decided', 'superseded'] },
        { name: 'decision', label: 'Decision', type: 'textarea', showIf: (v) => v['status'] !== 'pending' },
        { name: 'decided_by', label: 'Decided by', type: 'text', showIf: (v) => v['status'] !== 'pending' },
        { name: 'decided_on', label: 'Decided on', type: 'date', showIf: (v) => v['status'] !== 'pending' }];
  }

  private payload(v: Row): Row {
    return { ...v, affects: String(v['affects'] ?? '').split(',').map((x) => x.trim()).filter(Boolean) };
  }

  protected async add(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'New decision item', fields: this.fields(true), value: { category: 'scope' },
      submit: (v) => firstValueFrom(this.api.post('/programme-decisions', this.payload(v))),
    });
    if (saved) this.ngOnInit();
  }

  protected async edit(d: Row): Promise<void> {
    if (!this.auth.has('programme.manage')) return;
    const saved = await openForm(this.dialog, {
      title: d['title'], fields: this.fields(false), value: { ...d, affects: (d['affects'] ?? []).join(', ') },
      submit: (v) => firstValueFrom(this.api.patch(`/programme-decisions/${d['id']}`, this.payload(v))),
    });
    if (saved) this.ngOnInit();
  }
}
