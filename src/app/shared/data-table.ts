import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { formatNumber, labelize } from '../core/format';
import { Row } from '../core/models';
import { DemoBadge, NatureBadge, StatusBadge } from './badges';

export interface Column {
  key: string;
  label: string;
  kind?: 'text' | 'status' | 'date' | 'datetime' | 'number' | 'bool' | 'nature' | 'label' | 'ref';
  value?: (row: Row) => unknown;
  width?: string;
}

/** Paged, server-driven table. The first column shows a DEMO badge for synthetic rows. */
@Component({
  selector: 'app-table',
  imports: [MatTableModule, MatPaginatorModule, MatProgressBarModule, MatIconModule, MatTooltipModule, DatePipe,
    StatusBadge, DemoBadge, NatureBadge],
  template: `
    <div class="table-wrap">
      @if (loading()) {<mat-progress-bar mode="indeterminate" />}
      <table mat-table [dataSource]="rows()" class="data-table">
        @for (col of columns(); track col.key; let first = $first) {
          <ng-container [matColumnDef]="col.key">
            <th mat-header-cell *matHeaderCellDef [style.width]="col.width">{{ col.label }}</th>
            <td mat-cell *matCellDef="let row">
              @let v = cell(row, col);
              @switch (col.kind) {
                @case ('status') {<app-status [status]="v" />}
                @case ('nature') {<app-nature [nature]="$any(v)" />}
                @case ('date') {{{ v ? ($any(v) | date: 'mediumDate') : '—' }}}
                @case ('datetime') {{{ v ? ($any(v) | date: 'medium') : '—' }}}
                @case ('number') {<span class="num">{{ num(v) }}</span>}
                @case ('bool') {<mat-icon class="bool-icon">{{ v ? 'check' : (v === false ? 'close' : 'remove') }}</mat-icon>}
                @case ('label') {{{ label(v) }}}
                @case ('ref') {{{ $any(v)?.label ?? '—' }}}
                @default {{{ v ?? '—' }}}
              }
              @if (first) {<app-demo [show]="row.is_demo" />}
            </td>
          </ng-container>
        }
        <tr mat-header-row *matHeaderRowDef="keys()"></tr>
        <tr mat-row *matRowDef="let row; columns: keys()" (click)="rowClick.emit(row)"
            [class.clickable]="clickable()" tabindex="0" (keydown.enter)="rowClick.emit(row)"></tr>
        <tr class="mat-row" *matNoDataRow><td class="empty" [attr.colspan]="columns().length">{{ emptyText() }}</td></tr>
      </table>
    </div>
    @if (total() !== null) {
      <mat-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()"
                     [pageSizeOptions]="[10, 25, 50, 100]" (page)="page.emit($event)" />
    }`,
})
export class DataTable {
  readonly columns = input.required<Column[]>();
  readonly rows = input<Row[]>([]);
  readonly total = input<number | null>(null);
  readonly pageIndex = input(0);
  readonly pageSize = input(25);
  readonly loading = input(false);
  readonly clickable = input(true);
  readonly emptyText = input('No records found');
  readonly page = output<PageEvent>();
  readonly rowClick = output<Row>();

  keys(): string[] {
    return this.columns().map((c) => c.key);
  }

  cell(row: Row, col: Column): any {
    if (col.value) return col.value(row);
    return col.key.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row);
  }

  num(v: unknown): string {
    return formatNumber(v);
  }

  label(v: unknown): string {
    return labelize(v);
  }
}
