import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-header',
  imports: [MatIconModule, MatButtonModule, RouterLink],
  template: `
    <header class="page-header">
      <div class="page-title">
        @if (back()) {
          <a mat-icon-button [routerLink]="back()" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
        }
        <div>
          <h1>{{ title() }} <ng-content select="[badges]" /></h1>
          @if (subtitle()) {<p class="muted">{{ subtitle() }}</p>}
        </div>
      </div>
      <div class="page-actions"><ng-content /></div>
    </header>`,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null | undefined>('');
  readonly back = input<string | null>(null);
}

@Component({
  selector: 'app-notice',
  imports: [MatIconModule],
  template: `<div class="notice" [class]="'notice notice-' + kind()" role="note">
    <mat-icon>{{ kind() === 'warning' ? 'warning_amber' : 'info' }}</mat-icon><div><ng-content /></div></div>`,
})
export class Notice {
  readonly kind = input<'info' | 'warning'>('info');
}
