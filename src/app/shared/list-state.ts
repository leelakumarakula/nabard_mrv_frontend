import { signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Observable, Subscription } from 'rxjs';

import { Page } from '../core/models';

/** Paging + loading state for server-driven lists. */
export class ListState<T = Record<string, any>> {
  readonly rows = signal<T[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  readonly loading = signal(false);
  private sub?: Subscription;

  constructor(private readonly fetch: (page: number, pageSize: number) => Observable<Page<T>>) {}

  load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = this.fetch(this.pageIndex() + 1, this.pageSize()).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  reset(): void {
    this.pageIndex.set(0);
    this.load();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }
}
