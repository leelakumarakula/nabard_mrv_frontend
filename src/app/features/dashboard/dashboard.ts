import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatNumber, labelize } from '../../core/format';
import { Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeader, StatusBadge, DemoBadge, RouterLink, DatePipe, MatIconModule, MatButtonModule],
  template: `
    <app-page-header [title]="'Welcome, ' + (auth.me()?.full_name ?? '')" subtitle="Summary for your role and assigned geography" />
    @if (data(); as d) {
      @if (d.coverage) {
        <div class="stat-row">
          <div class="stat"><div class="value">{{ n(d.coverage.farmers_registered) }}</div><div class="label">Farmers registered</div></div>
          <div class="stat"><div class="value">{{ n(d.coverage.farmers_enrolled) }}</div><div class="label">Enrolled with consent</div></div>
          <div class="stat"><div class="value">{{ n(d.coverage.fpos) }}</div><div class="label">FPOs</div></div>
          @if (d.data_quality) {
            <div class="stat"><div class="value">{{ n(exceptions(d)) }}</div><div class="label">Data-quality exceptions</div>
              <div class="sub muted">Rejected/exception records{{ d.data_quality.open_quarantine != null ? ' + open quarantine' : '' }}</div></div>
          }
        </div>
      }
      @if (d.progress?.length) {
        <section class="panel">
          <div class="panel-head"><h3>Progress against programme targets</h3>
            <span class="muted small">{{ d.programme?.name }} · {{ d.programme?.version_label }}</span></div>
          <p class="muted small">Targets are proposal figures with the status shown. Values are the latest calculated result;
            PROVISIONAL results use definitions still pending programme-owner approval.</p>
          <div class="table-wrap"><table class="simple">
            <thead><tr><th>Target</th><th class="num">Target</th><th class="num">Latest value</th><th>Status</th></tr></thead>
            <tbody>
              @for (p of d.progress; track p.metric_code) {
                <tr><td>{{ p.metric_name }}</td>
                  <td class="num">{{ n(p.target_value) }} {{ p.unit }} <app-status [status]="p.target_status" /></td>
                  <td class="num">{{ p.latest_result ? n(p.latest_result.value) : '—' }}
                    @if (p.latest_result?.provisional) {<span class="badge tone-warning">PROVISIONAL</span>}</td>
                  <td>@if (p.latest_result) {<app-status [status]="p.latest_result.verification_status" />}
                      @else {<span class="muted small">{{ p.indicator_code ? 'Not calculated' : 'No linked indicator' }}</span>}</td></tr>
              }
            </tbody></table></div>
        </section>
      }
      @if (d.funnel) {
        <section class="panel">
          <h3>Household participation funnel</h3>
          <div class="stat-row funnel">
            @for (s of entries(d.funnel.stages); track s[0]) {
              <div class="stat" [title]="d.funnel.definitions[s[0]]"><div class="value">{{ n(s[1]) }}</div>
                <div class="label">{{ label(s[0]) }}</div><div class="sub muted">{{ d.funnel.definitions[s[0]] }}</div></div>
            }
          </div>
        </section>
      }
      @if (breakdown()?.rows?.length) {
        <section class="panel">
          <div class="panel-head"><h3>By {{ breakdown()!.by }}</h3>
            <span><button mat-button (click)="loadBreakdown('state')">States</button><button mat-button (click)="loadBreakdown('district')">Districts</button></span></div>
          <div class="table-wrap"><table class="simple">
            <thead><tr><th>{{ label(breakdown()!.by) }}</th><th class="num">Households</th><th class="num">Enrolled</th>
              @for (c of breakdown()!.categories; track c.code) {<th class="num">{{ c.name }}</th>}
              <th class="num">Adopted (observed)</th><th class="num">Adopted (verified)</th><th class="num">Demo sites</th>
              <th class="num">Active clusters</th><th class="num">CRPs trained</th></tr></thead>
            <tbody>@for (r of breakdown()!.rows; track r.geo_unit_id) {
              <tr><td>{{ r.name }} @if (r.requires_confirmation) {<span class="badge tone-warning">needs confirmation</span>}</td>
                <td class="num">{{ r.households_registered }}</td><td class="num">{{ r.farmers_enrolled }}</td>
                @for (c of breakdown()!.categories; track c.code) {<td class="num">{{ r.categories[c.code] }}</td>}
                <td class="num">{{ r.households_adopted_observed }}</td><td class="num">{{ r.households_adopted_verified }}</td>
                <td class="num">{{ r.demonstration_sites }}</td><td class="num">{{ r.active_clusters }}</td><td class="num">{{ r.crps_trained }}</td></tr>
            }</tbody></table></div>
        </section>
      }
      <div class="grid-2 align-start">
        @if (d.community) {
          <section class="panel">
            <h3>Demonstrations, surveillance & community resource persons</h3>
            <div class="evidence-row"><span class="grow">Plantation demonstration sites</span><strong>{{ d.community.demonstration_sites?.plantation ?? 0 }}</strong></div>
            <div class="evidence-row"><span class="grow">Soil/moisture demonstration sites</span><strong>{{ d.community.demonstration_sites?.soil_moisture ?? 0 }}</strong></div>
            <div class="evidence-row"><span class="grow">Active pest surveillance clusters</span><strong>{{ d.community.surveillance_clusters_active }}</strong></div>
            <div class="evidence-row"><span class="grow">Community resource persons trained</span><strong>{{ d.community.crps_trained }}</strong></div>
          </section>
        }
        @if (d.planning_targets?.length && !d.progress?.length) {
          <section class="panel">
            <h3>Programme planning targets</h3>
            <p class="muted small">Indicative proposal figures – not achievements. Status shows whether each is approved.</p>
            @for (t of d.planning_targets; track t.metric_name) {
              <div class="evidence-row"><span class="grow">{{ t.metric_name }}</span>
                <strong class="num">{{ n(t.target_value) }} {{ t.unit }}</strong><app-status [status]="t.status" /></div>
            }
          </section>
        }
        @if (d.my_tasks) {
          <section class="panel">
            <div class="panel-head"><h3>My review tasks</h3><a routerLink="/mrv" class="small">MRV workspace →</a></div>
            @for (t of d.my_tasks; track t.id) {
              <a class="evidence-row" [routerLink]="['/mrv/tasks', t.id]">
                <span class="grow">{{ t.title }}<br /><span class="muted small">as {{ t.role }}{{ t.due_date ? ' · due ' + t.due_date : '' }}</span></span>
                <app-status [status]="t.status" />
              </a>
            } @empty {<p class="muted">No open tasks.</p>}
          </section>
        }
        @if (d.active_alerts) {
          <section class="panel">
            <div class="panel-head"><h3>Active climate alerts</h3><a routerLink="/advisories" class="small">All advisories →</a></div>
            @for (a of d.active_alerts; track a.id) {
              <a class="evidence-row" [routerLink]="['/advisories', a.id]">
                <mat-icon>warning_amber</mat-icon>
                <span class="grow">{{ a.title }} <app-demo [show]="a.is_demo" /><br />
                  <span class="muted small">{{ a.area }} · {{ label(a.hazard_type) }} · issued {{ a.issued_at | date: 'mediumDate' }}</span></span>
                <app-status [status]="a.risk_level" />
              </a>
            } @empty {<p class="muted">No active alerts.</p>}
          </section>
        }
        @if (d.modules) {
          <section class="panel">
            <h3>Workstream records</h3>
            @for (m of d.modules; track m.code) {
              <a class="evidence-row" [routerLink]="m.code === 'mrv' ? '/mrv' : ['/modules', m.code]">
                <span class="grow">{{ m.number }}. {{ m.name }}</span><strong class="num">{{ m.code === 'mrv' ? '→' : n(m.records) }}</strong></a>
            }
          </section>
        }
        @if (d.data_quality?.monitoring_by_validation_status) {
          <section class="panel">
            <h3>Monitoring data quality</h3>
            @for (s of entries(d.data_quality.monitoring_by_validation_status); track s[0]) {
              <div class="evidence-row"><app-status [status]="s[0]" /><span class="grow"></span><strong class="num">{{ s[1] }}</strong></div>
            }
            @if (d.data_quality.open_quarantine != null) {
              <div class="evidence-row"><span class="grow">Open quarantined integration records</span>
                <a routerLink="/integrations"><strong>{{ d.data_quality.open_quarantine }}</strong></a></div>
            }
          </section>
        }
        <section class="panel">
          <h3>Recent activity</h3>
          @for (e of d.recent_activity; track $index) {
            <div class="evidence-row small"><span class="grow"><strong>{{ label(e.action) }}</strong> {{ label(e.entity_type) }}
              @if (e.summary) {<span class="muted"> – {{ e.summary }}</span>}</span>
              <span class="muted">{{ e.occurred_at | date: 'short' }}</span></div>
          } @empty {<p class="muted">No recent activity.</p>}
        </section>
      </div>
    }`,
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  protected readonly data = signal<Row | null>(null);
  protected readonly breakdown = signal<Row | null>(null);

  ngOnInit(): void {
    this.api.get<Row>('/dashboard').subscribe((d) => this.data.set(d));
    if (this.auth.has('farmer.read')) this.loadBreakdown('state');
  }

  protected loadBreakdown(by: 'state' | 'district'): void {
    this.api.get<Row>('/dashboard/breakdown', { by }).subscribe((b) => this.breakdown.set(b));
  }

  protected n(v: unknown): string {
    return formatNumber(v, 0);
  }

  protected label(v: unknown): string {
    return labelize(v);
  }

  protected entries(o: Record<string, number>): [string, number][] {
    return Object.entries(o ?? {});
  }

  protected exceptions(d: Row): number {
    const q = d['data_quality'] ?? {};
    const mon = q.monitoring_by_validation_status ?? {};
    return (q.workstream_exceptions ?? 0) + (mon.exception ?? 0) + (mon.rejected ?? 0) + (q.open_quarantine ?? 0);
  }
}
