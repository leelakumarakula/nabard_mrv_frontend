import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Page, Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

const DEVICE_TYPES = ['soilsync_7in1', 'moisture_probe', 'microclime', 'rainsync', 'other'];

@Component({
  selector: 'app-devices',
  imports: [PageHeader, Notice, DataTable, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="IoT devices" subtitle="Targeted deployment: SoilSync, Moisture Probe, MicroClime, RainSync">
      @if (auth.has('module.write')) {<button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Register device</button>}
    </app-page-header>
    <app-notice>The programme planning ceiling is up to 1,200 devices; the final equipment schedule, models and protocols are
      pending confirmation. Each device type reports only the parameters it supports.</app-notice>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)"
               (rowClick)="router.navigate(['/devices', $event['id']])" />`,
})
export class DevicesPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly columns: Column[] = [
    { key: 'device_code', label: 'Device' }, { key: 'device_type', label: 'Type', kind: 'label' },
    { key: 'farm_plot', label: 'Plot', kind: 'ref' }, { key: 'geo_unit', label: 'Area', kind: 'ref' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'last_calibrated_on', label: 'Calibrated', kind: 'date' },
    { key: 'calibration_due_on', label: 'Calibration due', kind: 'date' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/devices', { page, page_size: size }));

  ngOnInit(): void {
    this.list.load();
  }

  protected async create(): Promise<void> {
    const saved = await openForm<Row>(this.dialog, {
      title: 'Register device',
      fields: [
        { name: 'device_code', label: 'Device code / serial', type: 'text', required: true },
        { name: 'device_type', label: 'Type', type: 'select', required: true, options: DEVICE_TYPES },
        { name: 'provider', label: 'Provider', type: 'text' },
        { name: 'farm_plot_id', label: 'Assigned plot', type: 'plot' },
        { name: 'geo_unit_id', label: 'Area (if no plot)', type: 'lookup', lookup: 'geo' },
        { name: 'installed_on', label: 'Installed on', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'faulty', 'removed'] },
        { name: 'deployment_justification', label: 'Data gap justifying deployment', type: 'textarea' },
      ],
      value: { status: 'planned' }, submit: (v) => firstValueFrom(this.api.post('/devices', v)),
    });
    if (saved?.['id']) this.router.navigate(['/devices', saved['id']]);
  }
}

@Component({
  selector: 'app-device-detail',
  imports: [PageHeader, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, MatButtonModule, MatIconModule],
  template: `
    @if (device(); as d) {
      <app-page-header [title]="d['device_code']" [subtitle]="d['provider']" back="/devices">
        <ng-container badges><app-status [status]="d['status']" /><app-demo [show]="d['is_demo']" /></ng-container>
        @if (auth.has('module.write')) {
          <button mat-stroked-button (click)="edit(d)"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-stroked-button (click)="calibrate()"><mat-icon>tune</mat-icon> Record calibration</button>
        }
      </app-page-header>
      <section class="panel">
        <app-details [items]="[
          { label: 'Type', value: d['device_type'], kind: 'label' }, { label: 'Plot', value: d['farm_plot']?.label },
          { label: 'Area', value: d['geo_unit']?.label }, { label: 'Installed', value: d['installed_on'], kind: 'date' },
          { label: 'Removed', value: d['removed_on'], kind: 'date' }, { label: 'Calibration due', value: d['calibration_due_on'], kind: 'date' },
          { label: 'Deployment justification', value: d['deployment_justification'], full: true }]" />
      </section>
      <section class="panel"><h3>Calibration history</h3><app-table [columns]="calCols" [rows]="calibrations()" [clickable]="false" /></section>
      <section class="panel"><h3>Recent readings</h3>
        <app-table [columns]="readingCols" [rows]="readings()" [clickable]="false" emptyText="No readings received" /></section>
      <app-evidence-panel entityType="device" [entityId]="d['id']" />
    }`,
})
export class DeviceDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly id = input.required<string>();
  protected readonly device = signal<Row | null>(null);
  protected readonly calibrations = signal<Row[]>([]);
  protected readonly readings = signal<Row[]>([]);
  protected readonly calCols: Column[] = [
    { key: 'calibrated_on', label: 'Date', kind: 'date' }, { key: 'result', label: 'Result', kind: 'status' },
    { key: 'method', label: 'Method' }, { key: 'performed_by', label: 'By' }, { key: 'next_due_on', label: 'Next due', kind: 'date' },
  ];
  protected readonly readingCols: Column[] = [
    { key: 'observed_at', label: 'Time', kind: 'datetime' }, { key: 'parameter', label: 'Parameter', value: (r) => r['attributes']?.parameter },
    { key: 'value', label: 'Value', value: (r) => `${r['attributes']?.value ?? ''} ${r['attributes']?.unit ?? ''}` },
    { key: 'quality', label: 'Quality flag', value: (r) => r['attributes']?.quality_flag },
    { key: 'validation_status', label: 'Validation', kind: 'status' },
    { key: 'source', label: 'Source', value: (r) => (r['source_system_id'] ? 'Gateway import' : 'Manual') },
  ];

  ngOnInit(): void {
    this.api.get<Row>(`/devices/${this.id()}`).subscribe((d) => this.device.set(d));
    this.api.get<Row[]>(`/devices/${this.id()}/calibrations`).subscribe((c) => this.calibrations.set(c));
    this.api.get<Page<Row>>('/field-records', { device_id: this.id(), page_size: 50 }).subscribe((p) => this.readings.set(p.items));
  }

  protected async edit(d: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Edit device', value: d,
      fields: [
        { name: 'provider', label: 'Provider', type: 'text' }, { name: 'farm_plot_id', label: 'Assigned plot', type: 'plot' },
        { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'faulty', 'removed'] },
        { name: 'installed_on', label: 'Installed on', type: 'date' }, { name: 'removed_on', label: 'Removed on', type: 'date' },
        { name: 'deployment_justification', label: 'Deployment justification', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/devices/${d['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async calibrate(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Record calibration',
      fields: [
        { name: 'calibrated_on', label: 'Date', type: 'date', required: true },
        { name: 'result', label: 'Result', type: 'select', required: true, options: ['pass', 'fail', 'adjusted'] },
        { name: 'method', label: 'Method', type: 'text' }, { name: 'performed_by', label: 'Performed by', type: 'text' },
        { name: 'next_due_on', label: 'Next due', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.post(`/devices/${this.id()}/calibrations`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
