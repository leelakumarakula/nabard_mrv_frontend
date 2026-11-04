import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatNumber } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { confirmAction } from '../../shared/confirm-dialog';
import { Column, DataTable } from '../../shared/data-table';
import { DetailGrid } from '../../shared/detail-grid';
import { EvidencePanel } from '../../shared/evidence-panel';
import { openForm } from '../../shared/form-dialog';
import { HistoryPanel } from '../../shared/history-panel';
import { Notice, PageHeader } from '../../shared/page-header';
import { Row } from '../../core/models';

@Component({
  selector: 'app-review-task',
  imports: [PageHeader, Notice, DetailGrid, DataTable, StatusBadge, DemoBadge, EvidencePanel, HistoryPanel, DatePipe,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    @if (task(); as t) {
      <app-page-header [title]="t['title']" [subtitle]="'Submitted by ' + (t['submitted_by_name'] ?? '') + (t['reviewer_name'] ? ' · Internal reviewer: ' + t['reviewer_name'] : '')" back="/mrv">
        <ng-container badges><app-status [status]="t['status']" /><app-demo [show]="t['is_demo']" /></ng-container>
        @if (t['can_review']) {
          <button mat-stroked-button (click)="addFinding()"><mat-icon>flag</mat-icon> Add finding</button>
          <button mat-stroked-button (click)="correction()"><mat-icon>undo</mat-icon> Request correction</button>
          <button mat-flat-button (click)="markReviewed()"><mat-icon>done</mat-icon> Complete internal review</button>
        }
        @if (t['status'] === 'correction_requested' && t['submitted_by_id'] === auth.me()?.id) {
          <button mat-flat-button (click)="resubmit()"><mat-icon>redo</mat-icon> Resubmit</button>
        }
        @if (t['can_decide']) {<button mat-flat-button (click)="decide()"><mat-icon>verified</mat-icon> Independent decision</button>}
      </app-page-header>
      <app-notice>Internal review and independent verification are separate steps. The independent verifier cannot be the
        submitter or the internal reviewer. A record cannot be verified before internal review is complete
        @if (t['open_blocking_findings']) {<strong> – {{ t['open_blocking_findings'] }} major/critical finding(s) still open</strong>}.</app-notice>
      <section class="panel"><h3>Item under review</h3>
        <app-details [items]="entityItems(t['entity'])" /></section>
      <section class="panel"><h3>Findings & corrective actions</h3>
        <app-table [columns]="findingCols" [rows]="t['findings']" (rowClick)="updateFinding($event)" /></section>
      <section class="panel"><h3>Decisions</h3><app-table [columns]="decisionCols" [rows]="t['decisions']" [clickable]="false" /></section>
      <section class="panel">
        <h3>Comments</h3>
        @for (c of t['comments']; track c.id) {
          <div class="evidence-row"><span class="grow"><strong>{{ c.author_name }}</strong>&ngsp;<span class="muted small">{{ c.created_at | date: 'medium' }}</span><br />{{ c.comment }}</span></div>
        } @empty {<p class="muted">No comments.</p>}
        <div class="actions" style="align-items: center"><mat-form-field class="grow"><mat-label>Add comment</mat-label><input matInput [formControl]="comment" /></mat-form-field>
          <button mat-stroked-button (click)="addComment()" [disabled]="!comment.value">Post</button></div>
      </section>
      <app-evidence-panel [entityType]="t['entity_type']" [entityId]="t['entity_id']" />
      <app-history [entityType]="t['entity_type']" [entityId]="t['entity_id']" />
    }`,
})
export class ReviewTaskPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly id = input.required<string>();
  protected readonly task = signal<Row | null>(null);
  protected readonly comment = new FormControl('');
  protected readonly findingCols: Column[] = [
    { key: 'severity', label: 'Severity', kind: 'status' }, { key: 'finding_type', label: 'Type', kind: 'label' },
    { key: 'description', label: 'Finding' }, { key: 'corrective_action', label: 'Corrective action' },
    { key: 'corrective_status', label: 'Status', kind: 'status' }, { key: 'resolution_note', label: 'Resolution' },
  ];
  protected readonly decisionCols: Column[] = [
    { key: 'version', label: 'v' }, { key: 'decision', label: 'Decision', kind: 'status' }, { key: 'decider_name', label: 'Verifier' },
    { key: 'decided_at', label: 'Date', kind: 'datetime' }, { key: 'rationale', label: 'Rationale' },
  ];

  ngOnInit(): void {
    this.api.get<Row>(`/mrv/review-tasks/${this.id()}`).subscribe((t) => this.task.set(t));
  }

  protected entityItems(e: Row) {
    const keys = ['indicator_label', 'value', 'unit', 'period_start', 'period_end', 'scope_type', 'method_code', 'observed_at',
      'validation_status', 'review_status', 'verification_status', 'indicator_requires_confirmation', 'is_provisional'];
    return keys.filter((k) => e?.[k] !== undefined).map((k) => ({
      label: k.replace(/_/g, ' '), value: k === 'value' ? formatNumber(e[k], 6) : e[k],
      kind: (k.endsWith('_status') ? 'status' : typeof e[k] === 'boolean' ? 'bool' : 'text') as 'status' | 'bool' | 'text',
    }));
  }

  private post(path: string, body: unknown, message: string): void {
    this.api.post(`/mrv/review-tasks/${this.id()}/${path}`, body).subscribe(() => {
      this.notify.success(message);
      this.ngOnInit();
    });
  }

  protected async addFinding(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Record finding',
      fields: [
        { name: 'severity', label: 'Severity', type: 'select', required: true, options: ['minor', 'major', 'critical'] },
        { name: 'finding_type', label: 'Type', type: 'select', required: true,
          options: ['data_quality', 'evidence_gap', 'method', 'calculation', 'other'] },
        { name: 'description', label: 'Finding', type: 'textarea', required: true },
        { name: 'corrective_action', label: 'Corrective action required', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.post(`/mrv/review-tasks/${this.id()}/findings`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async updateFinding(f: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Update corrective action', value: f,
      fields: [
        { name: 'corrective_status', label: 'Status', type: 'select', options: ['open', 'in_progress', 'resolved', 'accepted'] },
        { name: 'corrective_action', label: 'Corrective action', type: 'textarea' },
        { name: 'resolution_note', label: 'Resolution note', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/mrv/findings/${f['id']}`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected async correction(): Promise<void> {
    const res = await confirmAction(this.dialog, { title: 'Request correction', message: 'The submitter will be asked to correct the item.',
      noteLabel: 'What must be corrected', noteRequired: true });
    if (res) this.post('request-correction', { note: res.note }, 'Correction requested');
  }

  protected async markReviewed(): Promise<void> {
    const res = await confirmAction(this.dialog, { title: 'Complete internal review',
      message: 'The item will be passed to an independent verifier for a decision.', noteLabel: 'Review note' });
    if (res) this.post('mark-reviewed', { note: res.note }, 'Internal review completed');
  }

  protected async resubmit(): Promise<void> {
    const res = await confirmAction(this.dialog, { title: 'Resubmit', message: 'Resubmit after correction.', noteLabel: 'What changed' });
    if (res) this.post('resubmit', { note: res.note }, 'Resubmitted');
  }

  protected async decide(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Independent verification decision',
      fields: [{ name: 'decision', label: 'Decision', type: 'select', required: true,
        options: ['verified', 'not_verified', 'rejected', 'conditional'] },
        { name: 'rationale', label: 'Rationale', type: 'textarea', required: true }],
      notice: 'Conditional decisions are only available if programme policy allows them.',
      submit: (v) => firstValueFrom(this.api.post(`/mrv/review-tasks/${this.id()}/decision`, v)),
    });
    if (saved) this.ngOnInit();
  }

  protected addComment(): void {
    this.api.post(`/mrv/review-tasks/${this.id()}/comments`, { comment: this.comment.value }).subscribe(() => {
      this.comment.setValue('');
      this.ngOnInit();
    });
  }
}
