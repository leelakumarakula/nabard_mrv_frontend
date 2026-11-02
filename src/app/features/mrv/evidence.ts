import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime } from 'rxjs';

import { ApiService, saveBlob } from '../../core/api.service';
import { Page, Row } from '../../core/models';
import { Column, DataTable } from '../../shared/data-table';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-evidence',
  imports: [PageHeader, Notice, DataTable, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Evidence repository" subtitle="Photos, documents and field forms linked to records" />
    <app-notice>Evidence is uploaded from the record it supports (farmer, plot, practice, demonstration site, monitoring record…).
      Files are private: downloads are permission-checked and audited. Click a row to download.</app-notice>
    <div class="filters">
      <mat-form-field class="search"><mat-label>Search</mat-label><input matInput [formControl]="search" /></mat-form-field>
      <mat-form-field><mat-label>Review</mat-label><mat-select [formControl]="review"><mat-option [value]="null">All</mat-option>
        <mat-option value="pending">Pending</mat-option><mat-option value="accepted">Accepted</mat-option>
        <mat-option value="rejected">Rejected</mat-option></mat-select></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)" (rowClick)="download($event)" />`,
})
export class EvidencePage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly search = new FormControl('');
  protected readonly review = new FormControl<string | null>(null);
  protected readonly columns: Column[] = [
    { key: 'filename', label: 'File' }, { key: 'evidence_type', label: 'Type', kind: 'label' },
    { key: 'linked', label: 'Linked to', value: (r) => (r['links'] ?? []).map((l: Row) => `${l['entity_type']} (${l['purpose']})`).join(', ') || 'Not linked' },
    { key: 'access_classification', label: 'Access', kind: 'label' }, { key: 'captured_at', label: 'Captured', kind: 'datetime' },
    { key: 'review_status', label: 'Review', kind: 'status' }, { key: 'created_at', label: 'Uploaded', kind: 'datetime' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/evidence', {
    page, page_size: size, search: this.search.value, review_status: this.review.value }));

  ngOnInit(): void {
    this.list.load();
    this.search.valueChanges.pipe(debounceTime(300)).subscribe(() => this.list.reset());
    this.review.valueChanges.subscribe(() => this.list.reset());
  }

  protected download(e: Row): void {
    this.api.blob(`/evidence/${e['id']}/download`).subscribe((blob) => saveBlob(blob, e['filename']));
  }
}
