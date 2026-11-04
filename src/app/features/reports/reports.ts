import { KeyValuePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, saveBlob } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatNumber, labelize } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const REPORT_TYPES = [
  { value: 'quarterly', label: 'Quarterly progress report' }, { value: 'annual', label: 'Annual progress report' },
  { value: 'nabard_ccf_id', label: 'NABARD CCF-ID report (template pending)' }, { value: 'programme', label: 'Programme report' },
  { value: 'geography', label: 'State / district report' }, { value: 'fpo', label: 'FPO / grower group report' },
  { value: 'module', label: 'Workstream report' }, { value: 'indicator', label: 'Indicator report' },
  { value: 'demonstration', label: 'Demonstration-site report' }, { value: 'surveillance', label: 'Pest-surveillance report' },
  { value: 'inclusion', label: 'Beneficiary & inclusion report' }, { value: 'verification', label: 'Monitoring & verification report' },
  { value: 'endline', label: 'Endline / impact assessment (methodology pending)' },
];

@Component({
  selector: 'app-reports',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="Reports" subtitle="Quarterly/annual, NABARD CCF-ID and thematic reports with status-labelled figures">
      @if (auth.has('report.generate')) {<button mat-flat-button (click)="generate()"><mat-icon>add</mat-icon> Generate report</button>}
    </app-page-header>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/reports', $event['id']])" />`,
})
export class ReportsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly columns: Column[] = [
    { key: 'title', label: 'Report' }, { key: 'report_type', label: 'Type', kind: 'label' }, { key: 'version', label: 'v' },
    { key: 'period', label: 'Period', value: (r) => `${r['period_start']} → ${r['period_end']}` },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'generated_at', label: 'Generated', kind: 'datetime' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/reports', { page, page_size: size }));

  ngOnInit(): void {
    this.lookups.loadProgrammes().subscribe();
    this.list.load();
  }

  protected async generate(): Promise<void> {
    const templates = await firstValueFrom(this.api.get<Row[]>('/report-templates'));
    const saved = await openForm<Row>(this.dialog, {
      title: 'Generate report',
      fields: [
        { name: 'template_code', label: 'Report template', type: 'select', options: templates.map((t) => ({
          value: t['code'], label: t['name'] + (t['status'] === 'awaiting_official_template' ? ' – awaiting official template' : '') })),
          hint: 'A template decides the sections; leave empty to choose a report type' },
        { name: 'report_type', label: 'Report type', type: 'select', required: true, options: REPORT_TYPES, showIf: (v) => !v['template_code'] },
        { name: 'reporting_period_id', label: 'Reporting period', type: 'lookup', lookup: 'period' },
        { name: 'period_start', label: 'Or period start', type: 'date' }, { name: 'period_end', label: 'Period end', type: 'date' },
        { name: 'scope_type', label: 'Scope', type: 'select', required: true, options: ['programme', 'state', 'district', 'cluster', 'fpo'] },
        { name: 'scope_geo_unit_id', label: 'Area', type: 'lookup', lookup: 'geo', showIf: (v) => ['state', 'district', 'cluster'].includes(v['scope_type']) },
        { name: 'scope_organisation_id', label: 'FPO / group', type: 'lookup', lookup: 'fpo', showIf: (v) => v['scope_type'] === 'fpo' },
        { name: 'module_code', label: 'Workstream', type: 'lookup', lookup: 'module', showIf: (v) => v['report_type'] === 'module' },
        { name: 'indicator_id', label: 'Indicator', type: 'lookup', lookup: 'indicator', showIf: (v) => v['report_type'] === 'indicator' },
        { name: 'title', label: 'Title (optional)', type: 'text' },
      ],
      value: { template_code: 'QUARTERLY_INTERNAL', report_type: 'quarterly', scope_type: 'programme' },
      submit: (v) => firstValueFrom(this.api.post('/reports', { ...v, report_type: v['report_type'] ?? 'programme',
        programme_id: this.lookups.currentProgramme()?.id })),
    });
    if (saved?.['id']) this.router.navigate(['/reports', saved['id']]);
  }
}

@Component({
  selector: 'app-report-detail',
  imports: [PageHeader, Notice, StatusBadge, DemoBadge, KeyValuePipe, MatButtonModule, MatIconModule],
  template: `
    @if (report(); as r) {
      @let c = r['content'];
      <app-page-header [title]="r['title']" [subtitle]="c.meta.report_type_label + ' · v' + r['version']" back="/reports">
        <ng-container badges><app-status [status]="r['status']" /><app-demo [show]="c.meta.contains_demo_data" /></ng-container>
        <button mat-flat-button (click)="export('xlsx')"><mat-icon>grid_on</mat-icon> Excel</button>
        <button mat-flat-button (click)="export('pdf')"><mat-icon>picture_as_pdf</mat-icon> PDF</button>
        <button mat-stroked-button (click)="export('csv')"><mat-icon>table_view</mat-icon> CSV</button>
        <button mat-stroked-button (click)="export('json')"><mat-icon>data_object</mat-icon> JSON</button>
        @if (auth.has('report.approve') && r['status'] === 'generated') {<button mat-flat-button (click)="act('approve')">Approve</button>}
        @if (auth.has('report.approve') && r['status'] === 'approved') {<button mat-flat-button (click)="act('publish')">Publish</button>}
      </app-page-header>
      <app-notice kind="warning">{{ c.meta.disclaimer }}</app-notice>
      @if (c.meta.template_note) {<app-notice kind="warning">{{ c.meta.template_note }}</app-notice>}
      <p class="muted small">{{ c.meta.programme_name }} · {{ c.meta.programme_version }} · {{ c.meta.scope_label }} ·
        {{ c.meta.period_start }} → {{ c.meta.period_end }}</p>

      @if (c.progress_vs_targets?.length) {
        <section class="panel"><h3>Progress against targets</h3>
          <table class="simple"><thead><tr><th>Target</th><th class="num">Planned</th><th class="num">Latest value</th><th>Verification</th></tr></thead>
            <tbody>@for (p of c.progress_vs_targets; track p.metric_code) {
              <tr><td>{{ p.metric_name }}@if (p.target_area && p.target_area !== 'Whole programme') {<span class="muted small"> · {{ p.target_area }}</span>}</td><td class="num">{{ n(p.target_value) }} {{ p.unit }} <app-status [status]="p.target_status" /></td>
                <td class="num">{{ p.latest_result ? n(p.latest_result.value) : '—' }} @if (p.latest_result?.provisional) {<span class="badge tone-warning">PROVISIONAL</span>}</td>
                <td>@if (p.latest_result) {<app-status [status]="p.latest_result.verification_status" />} @else {—}</td></tr>
            }</tbody></table></section>
      }
      @if (c.funnel) {
        <section class="panel"><h3>Planned → enrolled → reached → participating → adopted → verified ({{ c.funnel.unit }})</h3>
          <table class="simple"><tbody>@for (s of c.funnel.stages | keyvalue: keep; track s.key) {
            <tr><td>{{ label(s.key) }}</td><td class="num"><strong>{{ s.value }}</strong></td><td class="muted small">{{ c.funnel.definitions[s.key] }}</td></tr>
          }</tbody></table></section>
      }
      @if (c.inclusion) {
        <section class="panel"><h3>Inclusion (aggregate)</h3>
          <table class="simple"><tbody>
            <tr><th>Category</th><th>Definition</th><th class="num">Enrolled</th><th class="num">Households</th>
              <th class="num">Observed adoption</th><th class="num">Verified adoption</th></tr>
            @for (cat of c.inclusion.categories; track cat.code) {
              <tr><td>{{ cat.name }} @if (cat.sensitive) {<span class="badge tone-warning">sensitive</span>}</td>
                <td><app-status [status]="cat.definition_status" /></td><td class="num">{{ cat.enrolled_members }}</td>
                <td class="num">{{ cat.enrolled_households }}</td><td class="num">{{ cat.members_with_observed_adoption }}</td>
                <td class="num">{{ cat.members_with_verified_adoption }}</td></tr>
            }
            <tr><td colspan="5">Community resource persons trained (women)</td><td class="num">{{ c.inclusion.community_resource_persons.trained }} ({{ c.inclusion.community_resource_persons.women_trained }})</td></tr>
          </tbody></table><p class="muted small">{{ c.inclusion.note }}</p></section>
      }
      @if (c.demonstrations) {
        <section class="panel"><h3>Demonstration sites</h3>
          <table class="simple"><thead><tr><th>Site</th><th>Category</th><th>Area</th><th>Status</th><th class="num">Visits in period</th></tr></thead>
            <tbody>@for (s of c.demonstrations.sites; track s.site_code) {
              <tr><td>{{ s.site_code }} {{ s.name }} <app-demo [show]="s.is_demo" /></td><td>{{ label(s.category) }}</td><td>{{ s.area }}</td>
                <td><app-status [status]="s.status" /></td><td class="num">{{ s.visits_in_period }}</td></tr>
            }</tbody></table></section>
      }
      @if (c.surveillance) {
        <section class="panel"><h3>Pest surveillance</h3>
          <p>{{ c.surveillance.participating_households }} participating households · {{ c.surveillance.inspections_in_period }} inspections
            ({{ c.surveillance.inspections_with_incidence }} with incidence) · {{ c.surveillance.follow_up_actions_in_period }} follow-up actions</p>
          <p class="muted small">{{ c.surveillance.note }}</p></section>
      }
      @if (c.indicator_results?.length) {
        <section class="panel"><h3>Indicator results</h3>
          <table class="simple"><thead><tr><th>Indicator</th><th>Period</th><th class="num">Value</th><th class="num">Baseline</th><th>Review</th><th>Verification</th></tr></thead>
            <tbody>@for (x of c.indicator_results; track x.result_id) {
              <tr><td>{{ x.indicator_code }} v{{ x.indicator_version }}</td><td>{{ x.period_start }} → {{ x.period_end }}</td>
                <td class="num">{{ n(x.value) }} {{ x.unit }} @if (x.is_provisional) {<span class="badge tone-warning">PROVISIONAL</span>}</td><td class="num">{{ n(x.baseline_value) }}</td>
                <td><app-status [status]="x.review_status" /></td><td><app-status [status]="x.verification_status" /></td></tr>
            }</tbody></table></section>
      }
      @if (c.verification?.samples?.length) {
        <section class="panel"><h3>Independent verification samples</h3>
          <table class="simple"><thead><tr><th>Sample</th><th>Method</th><th class="num">Frame / sample</th><th>Results</th><th>Conclusion</th></tr></thead>
            <tbody>@for (s of c.verification.samples; track s.title) {
              <tr><td>{{ s.title }}</td><td>{{ label(s.selection_method) }}</td><td class="num">{{ s.frame_size }} / {{ s.sample_size }}</td>
                <td>@for (k of s.results | keyvalue; track k.key) {<span class="badge tone-neutral">{{ k.key }}: {{ k.value }}</span>}</td>
                <td><app-status [status]="s.conclusion" /></td></tr>
            }</tbody></table></section>
      }
      @if (c.coverage) {
        <section class="panel"><h3>Registry coverage</h3>
          <p>{{ c.coverage.fpos_registered }} FPOs/groups · {{ c.coverage.farmers_registered }} farmers registered ·
            {{ c.coverage.farmers_enrolled_with_consent }} enrolled with consent · {{ c.coverage.plot_area_of_enrolled_farmers_ha }} ha recorded</p>
          <p class="muted small">{{ c.coverage.note }}</p></section>
      }
    }`,
})
export class ReportDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly id = input.required<string>();
  protected readonly report = signal<Row | null>(null);
  protected readonly keep = () => 0;

  ngOnInit(): void {
    this.api.get<Row>(`/reports/${this.id()}`).subscribe((r) => this.report.set(r));
  }

  protected n(v: unknown): string {
    return formatNumber(v);
  }

  protected label(v: unknown): string {
    return labelize(v);
  }

  protected export(format: 'csv' | 'json' | 'xlsx' | 'pdf'): void {
    const r = this.report();
    this.api.blob(`/reports/${this.id()}/export`, { format }).subscribe((b) =>
      saveBlob(b, `report-${r?.['report_type']}-${r?.['period_start']}-v${r?.['version']}.${format}`));
  }

  protected act(action: 'approve' | 'publish'): void {
    this.api.post(`/reports/${this.id()}/${action}`).subscribe(() => this.ngOnInit());
  }
}
