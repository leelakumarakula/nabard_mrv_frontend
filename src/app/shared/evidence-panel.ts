import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { ApiService, saveBlob } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { localDateTimeToIso } from '../core/format';
import { Page, Row } from '../core/models';
import { NotifyService } from '../core/notify.service';
import { DemoBadge, StatusBadge } from './badges';
import { confirmAction } from './confirm-dialog';

/** Evidence linked to a record: list, upload (validated server-side), private download and review. */
@Component({
  selector: 'app-evidence-panel',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, DatePipe, DecimalPipe, StatusBadge, DemoBadge],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h3>Evidence</h3>
        @if (auth.has('evidence.upload') && !showUpload()) {
          <button mat-stroked-button (click)="showUpload.set(true)"><mat-icon>upload_file</mat-icon> Add evidence</button>
        }
      </div>
      @if (showUpload()) {
        <form [formGroup]="form" class="form-grid upload-form" (ngSubmit)="upload()">
          <div class="span-2">
            <input type="file" accept=".jpg,.jpeg,.png,.pdf,.csv" (change)="pick($event)" aria-label="Evidence file" />
            <div class="hint">JPEG, PNG, PDF or CSV. Files are stored privately and checksummed.</div>
          </div>
          <mat-form-field><mat-label>Purpose</mat-label><input matInput formControlName="purpose" /></mat-form-field>
          <mat-form-field><mat-label>Access</mat-label>
            <mat-select formControlName="access_classification">
              <mat-option value="internal">Internal</mat-option>
              <mat-option value="restricted">Restricted</mat-option>
              <mat-option value="personal">Personal data</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field><mat-label>Captured at</mat-label><input matInput type="datetime-local" formControlName="captured_at" /></mat-form-field>
          <mat-form-field><mat-label>Description</mat-label><input matInput formControlName="description" /></mat-form-field>
          <mat-checkbox formControlName="location_consent" class="span-2">Farmer consented to storing GPS location</mat-checkbox>
          @if (form.value.location_consent) {
            <mat-form-field><mat-label>Latitude</mat-label><input matInput type="number" formControlName="latitude" /></mat-form-field>
            <mat-form-field><mat-label>Longitude</mat-label><input matInput type="number" formControlName="longitude" /></mat-form-field>
          }
          <div class="span-2 actions">
            <button mat-button type="button" (click)="showUpload.set(false)">Cancel</button>
            <button mat-flat-button type="submit" [disabled]="!file() || busy()">Upload</button>
          </div>
        </form>
      }
      @for (e of items(); track e.id) {
        <div class="evidence-row">
          <mat-icon>{{ e.mime_type.startsWith('image') ? 'image' : (e.mime_type === 'application/pdf' ? 'picture_as_pdf' : 'description') }}</mat-icon>
          <div class="grow">
            <strong>{{ e.filename }}</strong> <app-demo [show]="e.is_demo" />
            <div class="muted small">{{ e.size_bytes / 1024 | number: '1.0-1' }} KB · {{ e.captured_at || e.created_at | date: 'medium' }}
              · {{ e.access_classification }} · {{ purpose(e) }}</div>
          </div>
          <app-status [status]="e.review_status" />
          <button mat-icon-button (click)="download(e)" aria-label="Download"><mat-icon>download</mat-icon></button>
          @if (auth.has('evidence.review') && e.review_status === 'pending') {
            <button mat-icon-button (click)="review(e, 'accepted')" aria-label="Accept"><mat-icon>check_circle</mat-icon></button>
            <button mat-icon-button (click)="review(e, 'rejected')" aria-label="Reject"><mat-icon>cancel</mat-icon></button>
          }
        </div>
      } @empty {
        <p class="muted">No evidence linked yet.</p>
      }
    </section>`,
})
export class EvidencePanel implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  protected readonly auth = inject(AuthService);
  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();

  protected readonly items = signal<Row[]>([]);
  protected readonly showUpload = signal(false);
  protected readonly file = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly form = new FormGroup({
    purpose: new FormControl('supporting_evidence'),
    access_classification: new FormControl('internal'),
    captured_at: new FormControl(''),
    description: new FormControl(''),
    location_consent: new FormControl(false),
    latitude: new FormControl<number | null>(null),
    longitude: new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.api.get<Page<Row>>('/evidence', { entity_type: this.entityType(), entity_id: this.entityId(), page_size: 100 })
      .subscribe((p) => this.items.set(p.items));
  }

  protected purpose(e: Row): string {
    return e['links']?.find((l: Row) => l['entity_id'] === this.entityId())?.purpose ?? '';
  }

  protected pick(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected upload(): void {
    const file = this.file();
    if (!file) return;
    const v = this.form.getRawValue();
    const data = new FormData();
    data.append('file', file);
    data.append('entity_type', this.entityType());
    data.append('entity_id', this.entityId());
    data.append('purpose', v.purpose || 'supporting_evidence');
    data.append('access_classification', v.access_classification || 'internal');
    if (v.description) data.append('description', v.description);
    const captured = localDateTimeToIso(v.captured_at);
    if (captured) data.append('captured_at', captured);
    data.append('location_consent', String(!!v.location_consent));
    if (v.location_consent && v.latitude != null) data.append('latitude', String(v.latitude));
    if (v.location_consent && v.longitude != null) data.append('longitude', String(v.longitude));
    this.busy.set(true);
    this.api.upload('/evidence', data).subscribe({
      next: () => {
        this.notify.success('Evidence uploaded');
        this.showUpload.set(false);
        this.file.set(null);
        this.busy.set(false);
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }

  protected download(e: Row): void {
    this.api.blob(`/evidence/${e['id']}/download`).subscribe((blob) => saveBlob(blob, e['filename']));
  }

  protected async review(e: Row, status: 'accepted' | 'rejected'): Promise<void> {
    const res = await confirmAction(this.dialog, {
      title: status === 'accepted' ? 'Accept evidence' : 'Reject evidence',
      message: `Mark "${e['filename']}" as ${status}?`, noteLabel: 'Review note', noteRequired: status === 'rejected',
      danger: status === 'rejected',
    });
    if (!res) return;
    this.api.post(`/evidence/${e['id']}/review`, { review_status: status, review_note: res.note }).subscribe(() => this.load());
  }
}
