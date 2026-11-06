import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { isUnitField, labelize, observedLabel } from '../../core/format';
import { LookupsService } from '../../core/lookups.service';
import { RecordType, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DemoBadge, LifecycleBadges, NatureBadge } from '../../shared/badges';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid, DetailItem } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { confirmAction } from '../../shared/confirm-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { Notice, PageHeader } from '../../shared/page-header';
import { fromRecord, recordFields, toRecordPayload } from '../../shared/record-form';

@Component({
  selector: 'app-record-detail',
  imports: [PageHeader, DetailGrid, DataTable, NatureBadge, DemoBadge, LifecycleBadges, EvidencePanel, HistoryPanel, Notice,
    MatButtonModule, MatIconModule],
  template: `
    @if (record(); as r) {
      <app-page-header [title]="(rt()?.name ?? label(r['record_type'])) + (r['title'] ? ' – ' + r['title'] : '')"
                       [subtitle]="r['geo_unit']?.label" [back]="'/modules/' + r['module_code']">
        <ng-container badges><app-nature [nature]="r['data_nature']" /><app-demo [show]="r['is_demo']" /></ng-container>
        @if (canEdit()) {<button mat-stroked-button (click)="edit(r)"><mat-icon>edit</mat-icon> Edit</button>}
        @if (canSubmit()) {<button mat-flat-button (click)="submit()"><mat-icon>send</mat-icon> Submit & validate</button>}
      </app-page-header>
      <app-lifecycle [row]="r" />
      @if (r['data_nature'] === 'model_prediction') {
        <app-notice kind="warning">Model prediction – a risk estimate, not a confirmed field condition. Record observed events
          and field findings separately.</app-notice>
      }
      @if (r['validation_messages']?.length) {
        <section class="panel"><h3>Validation messages</h3>
          <ul>@for (m of r['validation_messages']; track $index) {<li>{{ m }}</li>}</ul></section>
      }
      <div class="grid-2">
        <section class="panel"><h3>Record</h3><app-details [items]="details()" /></section>
        <section class="panel"><h3>Recorded values</h3><app-details [items]="attributes()" /></section>
      </div>
      @if (rt()?.supports_participants) {
        <section class="panel">
          <div class="panel-head"><h3>Participants ({{ participants().length }})</h3>
            @if (canEdit()) {<button mat-stroked-button (click)="addParticipant()"><mat-icon>person_add</mat-icon> Add</button>}</div>
          @if (canEdit() && participants().length) {<p class="muted small">Select a participant to remove them. The list is locked once the record is validated.</p>}
          <app-table [columns]="participantCols" [rows]="participants()" [clickable]="canEdit()" (rowClick)="removeParticipant($event)" />
        </section>
      }
      <app-evidence-panel entityType="field_record" [entityId]="r['id']" />
      <app-history entityType="field_record" [entityId]="r['id']" />
    }`,
})
export class RecordDetailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly lookups = inject(LookupsService);
  protected readonly router = inject(Router);
  readonly id = input.required<string>();
  protected readonly record = signal<Row | null>(null);
  protected readonly types = signal<RecordType[]>([]);
  protected readonly participants = signal<Row[]>([]);
  protected readonly rt = computed(() => this.types().find((t) => t.code === this.record()?.['record_type']) ?? null);
  protected readonly participantCols: Column[] = [
    { key: 'farmer', label: 'Farmer', kind: 'ref' }, { key: 'role', label: 'Role', kind: 'label' },
    { key: 'attended', label: 'Attended', kind: 'bool' },
  ];
  protected readonly canEdit = computed(() => {
    const r = this.record();
    if (!r || !this.auth.has('module.write') || r['submission_status'] === 'imported') return false;
    if (!this.auth.me()?.all_scope && r['created_by_id'] !== this.auth.me()?.id) return false;
    return r['submission_status'] === 'draft' || ['rejected', 'exception', 'pending_validation'].includes(r['validation_status']);
  });
  protected readonly canSubmit = computed(() => {
    const r = this.record();
    return !!r && this.auth.has('module.write') && r['submission_status'] !== 'imported'
      && !(r['submission_status'] === 'submitted' && r['validation_status'] === 'valid');
  });
  protected readonly details = computed<DetailItem[]>(() => {
    const r = this.record();
    if (!r) return [];
    return [
      { label: 'Farmer', value: r['farmer']?.label }, { label: 'Plot', value: r['farm_plot']?.label },
      { label: 'FPO / group', value: r['organisation']?.label }, { label: 'Device', value: r['device']?.label },
      { label: 'Activity', value: r['activity_code'] }, { label: 'Observed at', value: observedLabel(r['observed_at']) },
      { label: 'Value', value: r['value'] != null ? `${Number(r['value'])} ${r['unit'] ?? ''}` : null },
      { label: 'Source', value: r['source_system_id'] ? `Imported (${r['source_record_id']})` : 'Manual entry' },
      { label: 'Source timestamp', value: r['source_timestamp'], kind: 'datetime' },
      { label: 'Received', value: r['received_at'], kind: 'datetime' },
      { label: 'Created', value: r['created_at'], kind: 'datetime' }, { label: 'Notes', value: r['notes'], full: true },
    ];
  });
  protected readonly attributes = computed<DetailItem[]>(() => {
    const r = this.record();
    const rt = this.rt();
    if (!r) return [];
    const attrs = r['attributes'] ?? {};
    const known = rt?.fields ?? [];
    const items: DetailItem[] = known.map((f) => ({
      label: f.label + (f.unit ? ` (${f.unit})` : ''), value: attrs[f.name],
      // units are shown exactly as recorded (a capitalised "µS/cm" would turn µ into the Greek capital Μ)
      kind: f.type === 'boolean' ? 'bool' : f.type === 'select' && !isUnitField(f.name) ? 'label' : 'text',
    }));
    for (const [k, v] of Object.entries(attrs)) {
      if (!known.some((f) => f.name === k)) items.push({ label: labelize(k) + ' (derived)', value: v });
    }
    return items;
  });

  ngOnInit(): void {
    this.lookups.recordTypes().subscribe((t) => this.types.set(t));
    this.load();
  }

  private load(): void {
    this.api.get<Row>(`/field-records/${this.id()}`).subscribe((r) => {
      this.record.set(r);
      this.api.get<Row[]>(`/field-records/${r['id']}/participants`).subscribe((p) => this.participants.set(p));
    });
  }

  protected label(v: string): string {
    return labelize(v);
  }

  protected async edit(r: Row): Promise<void> {
    const rt = this.rt();
    if (!rt) return;
    const saved = await openForm(this.dialog, {
      title: `Edit ${rt.name.toLowerCase()}`, fields: recordFields(rt, true), value: fromRecord(r),
      submit: (v) => firstValueFrom(this.api.patch(`/field-records/${r['id']}`, toRecordPayload(v))),
    });
    if (saved) this.load();
  }

  protected submit(): void {
    this.api.post<Row>(`/field-records/${this.id()}/submit`).subscribe((r) => {
      this.record.set(r);
      if (r['validation_status'] === 'valid') this.notify.success('Submitted and validated');
      else this.notify.error(`Validation: ${labelize(r['validation_status'])} – see messages`);
    });
  }

  protected async removeParticipant(p: Row): Promise<void> {
    if (!this.canEdit()) return;
    const ok = await confirmAction(this.dialog, { title: 'Remove participant', danger: true,
      message: `Remove ${p['farmer']?.label ?? 'this farmer'} from the participant list?` });
    if (!ok) return;
    this.api.delete(`/field-record-participants/${p['id']}`).subscribe(() => {
      this.notify.success('Participant removed');
      this.load();
    });
  }

  protected async addParticipant(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Add participant',
      fields: [{ name: 'farmer_id', label: 'Farmer', type: 'farmer', required: true },
        { name: 'role', label: 'Role', type: 'select', options: ['attendee', 'host', 'facilitator'] },
        { name: 'attended', label: 'Attended', type: 'boolean', default: true }],
      value: { role: 'attendee', attended: true },
      submit: (v) => firstValueFrom(this.api.post(`/field-records/${this.id()}/participants`, v)),
    });
    if (saved) this.load();
  }
}

