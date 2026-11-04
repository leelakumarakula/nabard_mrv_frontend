import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LookupsService } from '../../core/lookups.service';
import { GeoTreeNode } from '../../core/models';
import { DemoBadge } from '../../shared/badges';
import { openForm } from '../../shared/form-dialog';
import { Notice, PageHeader } from '../../shared/page-header';

const CHILD: Record<string, 'district' | 'cluster' | null> = { state: 'district', district: 'cluster', cluster: null };

@Component({
  selector: 'app-geography',
  imports: [PageHeader, Notice, DemoBadge, MatButtonModule, MatIconModule, MatTooltipModule, RouterLink, NgTemplateOutlet],
  template: `
    <app-page-header title="Geography" subtitle="State → district → cluster hierarchy with registered coverage">
      @if (auth.has('geo.manage')) {<button mat-flat-button (click)="add(null)"><mat-icon>add</mat-icon> Add state</button>}
    </app-page-header>
    <app-notice>The Farm map shows plots at their recorded GPS points. Administrative boundary layers need approved geospatial datasets and licences (pending programme confirmation); the hierarchy and coverage counts below are maintained in the registry.</app-notice>
    <section class="panel">
      <ng-template #node let-n>
        <div class="tree-row" [style.padding-left.px]="depth(n) * 24">
          <button mat-icon-button (click)="toggle(n)" [disabled]="!n.children.length" [attr.aria-label]="'Expand ' + n.name">
            <mat-icon>{{ n.children.length ? (open().has(n.id) ? 'expand_more' : 'chevron_right') : 'remove' }}</mat-icon>
          </button>
          <span class="grow"><strong>{{ n.name }}</strong>&ngsp;<span class="muted small">{{ n.unit_type }} · {{ n.code }}</span>
            <app-demo [show]="n.is_demo" />
            @if (n.requires_confirmation) {<span class="badge tone-warning" [matTooltip]="n.confirmation_note ?? ''">Needs confirmation</span>}</span>
          <a class="small" [routerLink]="['/farmers']" [queryParams]="{ geo_unit_id: n.id }" matTooltip="Farmers registered">
            {{ n.farmer_count }} farmers</a>
          <span class="small muted" style="width:70px;text-align:right">{{ n.fpo_count }} FPOs</span>
          @if (auth.has('geo.manage')) {
            <button mat-icon-button (click)="edit(n)" matTooltip="Edit / confirmation flag"><mat-icon>edit</mat-icon></button>
          }
          @if (auth.has('geo.manage') && childType(n)) {
            <button mat-icon-button (click)="add(n)" [matTooltip]="'Add ' + childType(n)"><mat-icon>add</mat-icon></button>
          }
        </div>
        @if (open().has(n.id)) {
          @for (c of n.children; track c.id) {<ng-container *ngTemplateOutlet="node; context: { $implicit: c }" />}
        }
      </ng-template>
      @for (n of tree(); track n.id) {<ng-container *ngTemplateOutlet="node; context: { $implicit: n }" />}
      @empty {<p class="muted">No geography defined.</p>}
    </section>`,
  styles: `.tree-row { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); min-height: 44px; }`,
})
export class GeographyPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly lookups = inject(LookupsService);
  protected readonly tree = signal<GeoTreeNode[]>([]);
  protected readonly open = signal(new Set<string>());
  private depths = new Map<string, number>();

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.get<GeoTreeNode[]>('/geo-units/tree').subscribe((t) => {
      this.depths.clear();
      const walk = (nodes: GeoTreeNode[], d: number) => nodes.forEach((n) => { this.depths.set(n.id, d); walk(n.children, d + 1); });
      walk(t, 0);
      this.tree.set(t);
    });
  }

  protected depth(n: GeoTreeNode): number {
    return this.depths.get(n.id) ?? 0;
  }

  protected childType(n: GeoTreeNode): string | null {
    return CHILD[n.unit_type];
  }

  protected toggle(n: GeoTreeNode): void {
    const s = new Set(this.open());
    if (s.has(n.id)) s.delete(n.id);
    else s.add(n.id);
    this.open.set(s);
  }

  protected async edit(n: GeoTreeNode): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: `Edit ${n.name}`, value: n,
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'geometry_ref', label: 'Geometry reference', type: 'text' },
        { name: 'requires_confirmation', label: 'Provisional – requires programme-owner confirmation', type: 'boolean' },
        { name: 'confirmation_note', label: 'Confirmation note', type: 'textarea' },
      ],
      submit: (v) => firstValueFrom(this.api.patch(`/geo-units/${n.id}`, v)),
    });
    if (saved) {
      this.lookups.refresh('geo');
      this.load();
    }
  }

  protected async add(parent: GeoTreeNode | null): Promise<void> {
    const unitType = parent ? CHILD[parent.unit_type] : 'state';
    const saved = await openForm(this.dialog, {
      title: parent ? `Add ${unitType} under ${parent.name}` : 'Add state',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'code', label: 'Code', type: 'text', required: true, hint: 'Unique, e.g. IN-KA-D3' },
        { name: 'geometry_ref', label: 'Geometry reference', type: 'text', hint: 'Optional reference to an approved boundary dataset' },
      ],
      submit: (v) => firstValueFrom(this.api.post('/geo-units', { ...v, unit_type: unitType, parent_id: parent?.id ?? null })),
    });
    if (saved) {
      this.lookups.refresh('geo');
      this.load();
    }
  }
}
