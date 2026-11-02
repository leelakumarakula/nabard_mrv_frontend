import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { labelize, toneOf } from '../core/format';

@Component({
  selector: 'app-status',
  template: `<span class="badge" [class]="'badge tone-' + tone()" [attr.title]="title() || null">
    @if (prefix()) {<span class="badge-prefix">{{ prefix() }}:</span>}{{ text() }}</span>`,
})
export class StatusBadge {
  readonly status = input<unknown>();
  readonly prefix = input<string>('');
  readonly title = input<string>('');
  protected readonly tone = computed(() => toneOf(this.status()));
  protected readonly text = computed(() => labelize(this.status()));
}

@Component({
  selector: 'app-demo',
  imports: [MatTooltipModule],
  template: `@if (show()) {
    <span class="badge tone-demo" matTooltip="Synthetic demonstration data – not a real beneficiary, measurement or achievement">DEMO</span>
  }`,
})
export class DemoBadge {
  readonly show = input<boolean | null | undefined>(false);
}

const NATURE: Record<string, { label: string; icon: string; tone: string }> = {
  observed: { label: 'Observed', icon: 'visibility', tone: 'success' },
  user_reported: { label: 'Reported', icon: 'record_voice_over', tone: 'info' },
  model_prediction: { label: 'Prediction – not confirmed', icon: 'insights', tone: 'prediction' },
  calculated: { label: 'Calculated (engine)', icon: 'functions', tone: 'info' },
  assessment: { label: 'Assessment', icon: 'fact_check', tone: 'info' },
};

@Component({
  selector: 'app-nature',
  imports: [MatIconModule, MatTooltipModule],
  template: `<span class="badge" [class]="'badge tone-' + meta().tone" [matTooltip]="tooltip()">
    <mat-icon class="badge-icon">{{ meta().icon }}</mat-icon>{{ meta().label }}</span>`,
})
export class NatureBadge {
  readonly nature = input<string>('');
  protected readonly meta = computed(() => NATURE[this.nature()] ?? { label: labelize(this.nature()), icon: 'label', tone: 'neutral' });
  protected readonly tooltip = computed(() =>
    this.nature() === 'model_prediction'
      ? 'Model risk estimate. Not a confirmed field condition – confirm with field observation.'
      : this.meta().label,
  );
}

/** The separate lifecycle status dimensions of a record (never merged into one status). */
@Component({
  selector: 'app-lifecycle',
  imports: [StatusBadge],
  template: `<div class="lifecycle">
    @if (row()?.submission_status) {<app-status prefix="Submission" [status]="row().submission_status" />}
    @if (row()?.validation_status) {<app-status prefix="Validation" [status]="row().validation_status" />}
    @if (row()?.calculation_status) {<app-status prefix="Calculation" [status]="row().calculation_status" />}
    @if (row()?.review_status) {<app-status prefix="Review" [status]="row().review_status" />}
    @if (row()?.verification_status) {<app-status prefix="Verification" [status]="row().verification_status" />}
  </div>`,
})
export class LifecycleBadges {
  readonly row = input<any>();
}
