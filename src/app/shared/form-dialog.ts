import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, firstValueFrom, map, of } from 'rxjs';

import { ApiService } from '../core/api.service';
import { deviceId, isoToLocalDateTime, labelize, localDateTimeToIso } from '../core/format';
import { LookupsService } from '../core/lookups.service';
import { Page } from '../core/models';
import { Notice } from './page-header';
import { EntityPicker } from './entity-picker';

export type Lookup = 'geo' | 'state' | 'district' | 'cluster' | 'fpo' | 'organisation' | 'programme' | 'period'
  | 'indicator' | 'activity' | 'module' | 'reviewer' | 'device' | 'role' | 'method' | 'demo_site' | 'surveillance_cluster' | 'verifier';

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'integer' | 'date' | 'datetime' | 'select' | 'multiselect' | 'boolean'
    | 'lookup' | 'farmer' | 'plot' | 'password' | 'email' | 'json';
  required?: boolean;
  options?: (string | { value: unknown; label: string })[];
  lookup?: Lookup;
  hint?: string;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  default?: unknown;
  full?: boolean;
  showIf?: (value: Record<string, any>) => boolean;
}

export interface FormDialogData {
  title: string;
  fields: FieldDef[];
  value?: Record<string, any>;
  submitLabel?: string;
  notice?: string;
  /** Called with the cleaned value; resolve to close the dialog, reject to keep it open (errors are toasted). */
  submit?: (value: Record<string, any>) => Promise<unknown>;
}

interface Option {
  value: unknown;
  label: string;
}

@Component({
  selector: 'app-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, EntityPicker, Notice],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.notice) {<app-notice kind="warning">{{ data.notice }}</app-notice>}
      <form [formGroup]="form" class="form-grid" (ngSubmit)="save()" id="form-dialog">
        @for (f of data.fields; track f.name) {
          @if (visible(f)) {
            <div [class.span-2]="f.full || f.type === 'textarea' || f.type === 'json'">
              @switch (f.type) {
                @case ('boolean') {
                  <mat-checkbox [formControlName]="f.name">{{ f.label }}</mat-checkbox>
                  @if (f.hint) {<div class="hint">{{ f.hint }}</div>}
                }
                @case ('farmer') {<app-entity-picker kind="farmer" [label]="f.label" [hint]="f.hint ?? ''"
                                                    [required]="!!f.required" [control]="ctrl(f.name)" />}
                @case ('plot') {<app-entity-picker kind="plot" [label]="f.label" [hint]="f.hint ?? ''"
                                                  [required]="!!f.required" [control]="ctrl(f.name)" />}
                @case ('select') {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <mat-select [formControlName]="f.name">
                      @if (!f.required) {<mat-option [value]="null">—</mat-option>}
                      @for (o of opts(f); track $index) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
                    </mat-select>
                    @if (f.hint) {<mat-hint>{{ f.hint }}</mat-hint>}
                  </mat-form-field>
                }
                @case ('multiselect') {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <mat-select [formControlName]="f.name" multiple>
                      @for (o of opts(f); track $index) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
                    </mat-select>
                  </mat-form-field>
                }
                @case ('lookup') {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <mat-select [formControlName]="f.name">
                      @if (!f.required) {<mat-option [value]="null">—</mat-option>}
                      @for (o of lookupOptions()[f.name] ?? []; track $index) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
                    </mat-select>
                    @if (f.hint) {<mat-hint>{{ f.hint }}</mat-hint>}
                  </mat-form-field>
                }
                @case ('textarea') {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <textarea matInput rows="3" [formControlName]="f.name"></textarea>
                    @if (f.hint) {<mat-hint>{{ f.hint }}</mat-hint>}
                  </mat-form-field>
                }
                @case ('json') {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <textarea matInput rows="4" class="mono" [formControlName]="f.name"></textarea>
                    <mat-hint>{{ f.hint ?? 'JSON' }}</mat-hint>
                  </mat-form-field>
                }
                @default {
                  <mat-form-field class="full"><mat-label>{{ f.label }}</mat-label>
                    <input matInput [type]="inputType(f)" [formControlName]="f.name"
                           [attr.min]="f.min ?? null" [attr.max]="f.max ?? null"
                           [attr.step]="f.type === 'integer' ? 1 : (f.type === 'number' ? 'any' : null)" />
                    @if (f.unit) {<span matTextSuffix>&nbsp;{{ f.unit }}</span>}
                    @if (f.hint) {<mat-hint>{{ f.hint }}</mat-hint>}
                    @if (ctrl(f.name).hasError('required')) {<mat-error>Required</mat-error>}
                    @if (ctrl(f.name).hasError('min')) {<mat-error>Must be ≥ {{ f.min }}</mat-error>}
                    @if (ctrl(f.name).hasError('max')) {<mat-error>Must be ≤ {{ f.max }}</mat-error>}
                  </mat-form-field>
                }
              }
            </div>
          }
        }
      </form>
      @if (error()) {<p class="error-text">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancel</button>
      <button mat-flat-button type="submit" form="form-dialog" [disabled]="saving()">{{ data.submitLabel ?? 'Save' }}</button>
    </mat-dialog-actions>`,
})
export class FormDialog implements OnInit {
  protected readonly data = inject<FormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FormDialog>);
  private readonly lookups = inject(LookupsService);
  private readonly api = inject(ApiService);
  protected readonly form = new FormGroup<Record<string, FormControl>>({});
  protected readonly lookupOptions = signal<Partial<Record<string, Option[]>>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    for (const f of this.data.fields) {
      let value = this.data.value?.[f.name] ?? f.default ?? (f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : null);
      if (f.type === 'datetime') value = isoToLocalDateTime(value);
      if (f.type === 'json' && value && typeof value === 'object') value = JSON.stringify(value, null, 2);
      const validators = [];
      if (f.required && f.type !== 'boolean') validators.push(Validators.required);
      if (f.min != null) validators.push(Validators.min(f.min));
      if (f.max != null) validators.push(Validators.max(f.max));
      this.form.addControl(f.name, new FormControl(value, validators));
      if (f.type === 'lookup' && f.lookup) {
        this.loadLookup(f.lookup).subscribe((opts) => this.lookupOptions.update((all) => ({ ...all, [f.name]: opts })));
      }
    }
  }

  protected ctrl(name: string): FormControl {
    return this.form.controls[name];
  }

  protected visible(f: FieldDef): boolean {
    return !f.showIf || f.showIf(this.form.getRawValue());
  }

  protected opts(f: FieldDef): Option[] {
    return (f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: labelize(o) } : o));
  }

  protected inputType(f: FieldDef): string {
    return { number: 'number', integer: 'number', date: 'date', datetime: 'datetime-local', password: 'password', email: 'email' }[
      f.type as string
    ] ?? 'text';
  }

  private loadLookup(kind: Lookup): Observable<Option[]> {
    const geo = (type?: string) =>
      this.lookups.geoUnits().pipe(map((g) => g.filter((u) => !type || u.unit_type === type)
        .map((u) => ({ value: u.id, label: `${u.name} (${u.unit_type})` }))));
    switch (kind) {
      case 'geo': return geo();
      case 'state': case 'district': case 'cluster': return geo(kind);
      case 'fpo': return this.lookups.organisations('fpo').pipe(map((o) => o.map((x) => ({ value: x.id, label: x.name }))));
      case 'organisation': return this.lookups.organisations().pipe(map((o) => o.map((x) => ({ value: x.id, label: x.name }))));
      case 'programme': return this.lookups.loadProgrammes().pipe(map((p) => p.map((x) => ({ value: x.id, label: x.name }))));
      case 'period': return this.lookups.periods(this.lookups.currentProgramme()?.id ?? null)
        .pipe(map((p) => p.map((x) => ({ value: x.id, label: `${x.name} (${x.start_date} → ${x.end_date})` }))));
      case 'indicator': return this.lookups.indicators().pipe(map((i) => i.map((x) => ({ value: x.id, label: `${x.code} – ${x.name} (${x.unit})` }))));
      case 'activity': return this.lookups.activities().pipe(map((a) => a.map((x) => ({ value: x.activity_code, label: `${x.activity_code} – ${x.name}` }))));
      case 'module': return this.lookups.workstreams().pipe(map((w) => w.map((x) => ({ value: x.code, label: `${x.number}. ${x.name}` }))));
      case 'reviewer': return this.lookups.reviewers().pipe(map((r) => r.filter((x) => x.can_review).map((x) => ({ value: x.id, label: `${x.full_name} (${x.email})` }))));
      case 'method': return this.lookups.calculationMethods().pipe(map((m) => m.map((x) => ({ value: x.code, label: `${x.name} (v${x.version})` }))));
      case 'device': return this.api.get<Page<any>>('/devices', { page_size: 200 }).pipe(map((p) => p.items.map((x) => ({ value: x.id, label: `${deviceId(x.device_code)} (${labelize(x.device_type)})` }))));
      case 'demo_site': return this.api.get<Page<any>>('/demonstration-sites', { page_size: 200 }).pipe(map((p) => p.items.map((x) => ({ value: x.id, label: `${x.site_code} – ${x.name}` }))));
      case 'surveillance_cluster': return this.api.get<Page<any>>('/surveillance-clusters', { page_size: 200 }).pipe(map((p) => p.items.map((x) => ({ value: x.id, label: `${x.cluster_code} – ${x.name}` }))));
      case 'verifier': return this.lookups.reviewers().pipe(map((r) => r.filter((x) => x.can_verify).map((x) => ({ value: x.id, label: x.full_name }))));
      case 'role': return this.api.get<any[]>('/admin/roles').pipe(map((r) => r.map((x) => ({ value: x.code, label: x.name }))));
      default: return of([]);
    }
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Please complete the required fields.');
      return;
    }
    let value: Record<string, any>;
    try {
      value = this.clean();
    } catch (e: any) {
      this.error.set(e.message);
      return;
    }
    this.error.set('');
    if (!this.data.submit) {
      this.ref.close(value);
      return;
    }
    this.saving.set(true);
    try {
      const result = await this.data.submit(value);
      this.ref.close(result ?? value);
    } catch {
      /* error already shown by the HTTP interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  private clean(): Record<string, any> {
    const raw = this.form.getRawValue();
    const out: Record<string, any> = {};
    for (const f of this.data.fields) {
      if (!this.visible(f)) continue;
      let v = raw[f.name];
      if (v === '' || v === undefined) v = null;
      if (v !== null && (f.type === 'number' || f.type === 'integer')) v = Number(v);
      if (f.type === 'datetime') v = localDateTimeToIso(v);
      if (f.type === 'json' && v !== null) {
        try {
          v = JSON.parse(v);
        } catch {
          throw new Error(`${f.label} is not valid JSON`);
        }
      }
      out[f.name] = v;
    }
    return out;
  }
}

/** Open a schema-driven form dialog; resolves with the saved value or undefined if cancelled. */
export function openForm<T = any>(dialog: MatDialog, data: FormDialogData, width = '720px'): Promise<T | undefined> {
  return firstValueFrom(dialog.open(FormDialog, { data, width, maxWidth: '96vw', autoFocus: 'first-tabbable' }).afterClosed());
}
