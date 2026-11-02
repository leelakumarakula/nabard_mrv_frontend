import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { Row } from '../../core/models';
import { DemoBadge } from '../../shared/badges';
import { openForm } from '../../shared/form-dialog';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-my-advisories',
  imports: [PageHeader, DemoBadge, DatePipe, MatButtonModule, MatIconModule],
  template: `
    <app-page-header title="My advisories" [subtitle]="profile()?.['farmer']?.full_name" />
    @for (a of advisories(); track a['delivery_id']) {
      <section class="panel">
        <div class="panel-head">
          <h3>@if (a['advisory_type'] === 'alert') {<mat-icon>warning_amber</mat-icon>} {{ a['title'] }} <app-demo [show]="a['is_demo']" /></h3>
          <span class="muted small">{{ a['issued_at'] | date: 'medium' }} · {{ a['channel'] }}</span>
        </div>
        <p>{{ a['message'] }}</p>
        @if (a['recommendation']) {<p><strong>Recommended:</strong> {{ a['recommendation'] }}</p>}
        @if (a['response']) {<p class="muted">Your response: {{ a['response'] }}</p>}
        @else {<button mat-stroked-button (click)="respond(a)"><mat-icon>reply</mat-icon> Respond</button>}
      </section>
    } @empty {<p class="muted">No advisories yet.</p>}`,
})
export class MyAdvisoriesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly advisories = signal<Row[]>([]);
  protected readonly profile = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>('/me/farmer').subscribe((p) => this.profile.set(p));
    this.api.get<Row[]>('/me/advisories').subscribe((a) => this.advisories.set(a));
  }

  protected async respond(a: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'Respond to advisory',
      fields: [{ name: 'response', label: 'Your response', type: 'textarea', required: true },
        { name: 'understood', label: 'I understood the advice', type: 'boolean' }],
      submit: (v) => firstValueFrom(this.api.post(`/me/advisories/${a['delivery_id']}/response`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
