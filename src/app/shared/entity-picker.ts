import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';

import { ApiService } from '../core/api.service';
import { Page } from '../core/models';

interface Option {
  id: string;
  label: string;
}

/** Server-side search for farmers or plots; the bound control holds the selected id. */
@Component({
  selector: 'app-entity-picker',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field class="full">
      <mat-label>{{ label() }}</mat-label>
      <input matInput [formControl]="search" [matAutocomplete]="auto" [required]="required()"
             placeholder="Type a code or name" />
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="select($event.option.value)">
        @for (o of options(); track o.id) {<mat-option [value]="o">{{ o.label }}</mat-option>}
      </mat-autocomplete>
      @if (hint()) {<mat-hint>{{ hint() }}</mat-hint>}
    </mat-form-field>`,
})
export class EntityPicker implements OnInit {
  private readonly api = inject(ApiService);
  readonly kind = input.required<'farmer' | 'plot'>();
  readonly label = input('Select');
  readonly hint = input('');
  readonly required = input(false);
  readonly control = input.required<FormControl>();
  readonly extraParams = input<Record<string, string>>({});

  protected readonly search = new FormControl<string | Option>('');
  protected readonly options = signal<Option[]>([]);

  ngOnInit(): void {
    const id = this.control().value;
    if (id) {
      const path = this.kind() === 'farmer' ? `/farmers/${id}` : `/plots/${id}`;
      this.api.get<any>(path).subscribe((r) => this.search.setValue(this.toOption(r).label, { emitEvent: false }));
    }
    this.search.valueChanges
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((text) => {
          if (!text) this.control().setValue(null);
          const path = this.kind() === 'farmer' ? '/farmers' : '/plots';
          return this.api.get<Page<any>>(path, { search: text, page_size: 20, ...this.extraParams() });
        }),
      )
      .subscribe((page) => this.options.set(page.items.map((r) => this.toOption(r))));
    this.search.setValue('');
  }

  protected select(option: Option): void {
    this.control().setValue(option.id);
    this.control().markAsDirty();
    this.search.setValue(option.label, { emitEvent: false });
  }

  private toOption(r: any): Option {
    return this.kind() === 'farmer'
      ? { id: r.id, label: `${r.farmer_code} – ${r.full_name}` }
      : { id: r.id, label: [r.farm_name ? `${r.farm_name} · ${r.plot_code}` : r.plot_code, r.farmer_label ? `(${r.farmer_label})` : '']
          .filter(Boolean).join(' ') };
  }
}
