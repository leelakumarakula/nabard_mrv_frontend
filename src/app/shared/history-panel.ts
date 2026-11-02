import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';

import { ApiService } from '../core/api.service';
import { labelize } from '../core/format';
import { Row } from '../core/models';

/** Status and change history of a record, read from the immutable audit log. */
@Component({
  selector: 'app-history',
  imports: [DatePipe],
  template: `
    <section class="panel">
      <h3>History</h3>
      @if (unavailable()) {
        <p class="muted">History is not available for your role.</p>
      } @else {
        <ol class="timeline">
          @for (e of events(); track $index) {
            <li>
              <div class="tl-head"><strong>{{ label(e.action) }}</strong>
                <span class="muted small">{{ e.occurred_at | date: 'medium' }} · {{ e.actor_email ?? 'system / source' }}</span></div>
              @if (e.summary) {<div>{{ e.summary }}</div>}
              @if (changes(e); as c) {<div class="muted small mono">{{ c }}</div>}
            </li>
          } @empty {<li class="muted">No history recorded.</li>}
        </ol>
      }
    </section>`,
})
export class HistoryPanel implements OnInit {
  private readonly api = inject(ApiService);
  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  protected readonly events = signal<Row[]>([]);
  protected readonly unavailable = signal(false);

  ngOnInit(): void {
    // 403 is expected for roles without history access, so errors are handled here, not toasted.
    this.api.get<Row[]>(`/mrv/entity-history/${this.entityType()}/${this.entityId()}`, undefined, { silent: true })
      .subscribe({ next: (e) => this.events.set(e), error: () => this.unavailable.set(true) });
  }

  label(v: string): string {
    return labelize(v);
  }

  changes(e: Row): string {
    if (!e['after'] || typeof e['after'] !== 'object') return '';
    return Object.entries(e['after'])
      .filter(([k]) => !['id', 'calculation_run_id', 'decision_id'].includes(k))
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${e['before']?.[k] !== undefined ? `${e['before'][k]} → ` : ''}${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
  }
}
