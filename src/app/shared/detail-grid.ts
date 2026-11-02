import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';

import { formatNumber, labelize } from '../core/format';
import { NatureBadge, StatusBadge } from './badges';

export interface DetailItem {
  label: string;
  value: unknown;
  kind?: 'text' | 'status' | 'date' | 'datetime' | 'number' | 'bool' | 'nature' | 'label' | 'mono' | 'json';
  full?: boolean;
}

@Component({
  selector: 'app-details',
  imports: [DatePipe, StatusBadge, NatureBadge],
  template: `
    <dl class="details">
      @for (item of items(); track item.label) {
        <div class="detail" [class.span-2]="item.full">
          <dt>{{ item.label }}</dt>
          <dd>
            @switch (item.kind) {
              @case ('status') {<app-status [status]="item.value" />}
              @case ('nature') {<app-nature [nature]="$any(item.value)" />}
              @case ('date') {{{ item.value ? ($any(item.value) | date: 'mediumDate') : '—' }}}
              @case ('datetime') {{{ item.value ? ($any(item.value) | date: 'medium') : '—' }}}
              @case ('number') {{{ num(item.value) }}}
              @case ('bool') {{{ item.value === true ? 'Yes' : item.value === false ? 'No' : '—' }}}
              @case ('label') {{{ label(item.value) }}}
              @case ('mono') {<code>{{ item.value ?? '—' }}</code>}
              @case ('json') {<pre class="json">{{ json(item.value) }}</pre>}
              @default {{{ (item.value ?? '') === '' ? '—' : item.value }}}
            }
          </dd>
        </div>
      }
    </dl>`,
})
export class DetailGrid {
  readonly items = input.required<DetailItem[]>();

  num(v: unknown): string {
    return formatNumber(v, 4);
  }

  label(v: unknown): string {
    return labelize(v);
  }

  json(v: unknown): string {
    const empty = v == null || (typeof v === 'object' && Object.keys(v as object).length === 0);
    return empty ? '—' : JSON.stringify(v, null, 2);
  }
}

