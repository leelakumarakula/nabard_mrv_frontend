import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Tone, formatNumber, labelize, toneOf } from '../../core/format';
import { Row } from '../../core/models';
import { DemoBadge, StatusBadge } from '../../shared/badges';
import { MapView } from '../map/map-view';

/** Fill for a status segment – always paired with its label, never colour alone. */
const STATUS_FILL: Record<Tone, string> = {
  success: '#0ca30c', warning: '#fab219', danger: '#d03b3b', info: '#2a78d6', neutral: '#9aa3a0',
};
const STATUS_ORDER: Tone[] = ['success', 'neutral', 'info', 'warning', 'danger'];  // green and red never touch
const RISK_TONE: Record<string, Tone> = { low: 'success', moderate: 'warning', high: 'danger', very_high: 'danger' };

/** Not yet validated reads as "waiting" (blue), so it never shares amber with exceptions. */
function segmentTone(status: string): Tone {
  return status.startsWith('pending') ? 'info' : toneOf(status);
}

interface Segment { key: string; count: number; share: number; fill: string; ink: string }

@Component({
  selector: 'app-dashboard',
  imports: [StatusBadge, DemoBadge, MapView, RouterLink, DatePipe, MatIconModule, MatButtonModule],
  template: `
    <section class="dash-hero">
      <div class="hero-main">
        <p class="hero-kicker">{{ today | date: 'EEEE, d MMMM y' }}</p>
        <h1>Welcome, {{ auth.me()?.full_name ?? '' }}</h1>
        <p class="hero-sub">Summary for your role and assigned geography</p>
        @if (data()?.programme; as p) {
          <div class="hero-chips">
            <span class="hero-chip"><mat-icon>flag</mat-icon>{{ p.name }}</span>
            @if (p.version_label) {<span class="hero-chip">{{ p.version_label }}</span>}
            @if (p.duration_months) {<span class="hero-chip"><mat-icon>event</mat-icon>{{ p.duration_months }} months</span>}
            <span class="hero-chip">{{ label(p.status) }}</span>
          </div>
        }
        <div class="hero-actions">
          @if (canMap) {<a mat-flat-button class="hero-btn" routerLink="/map"><mat-icon>public</mat-icon> Farm map</a>}
          @if (auth.has('mrv.read')) {<a mat-stroked-button class="hero-btn-ghost" routerLink="/mrv"><mat-icon>fact_check</mat-icon> MRV workspace</a>}
          @if (auth.has('report.read')) {<a mat-stroked-button class="hero-btn-ghost" routerLink="/reports"><mat-icon>summarize</mat-icon> Reports</a>}
        </div>
      </div>
      @if (data()?.coverage; as c) {
        <div class="hero-figure" role="img" [attr.aria-label]="pct(c.farmers_enrolled, c.farmers_registered) + '% of registered farmers enrolled with consent'">
          <svg viewBox="0 0 120 120" class="ring" aria-hidden="true">
            <circle cx="60" cy="60" r="52" class="ring-track" />
            <circle cx="60" cy="60" r="52" class="ring-fill" [attr.stroke-dasharray]="ring(c.farmers_enrolled, c.farmers_registered)" />
          </svg>
          <div class="ring-text"><strong>{{ pct(c.farmers_enrolled, c.farmers_registered) }}%</strong><span>enrolled</span></div>
          <div class="hero-figure-caption"><strong>{{ n(c.farmers_enrolled) }}</strong> of {{ n(c.farmers_registered) }}
            registered farmers enrolled with consent</div>
        </div>
      }
    </section>

    @if (data(); as d) {
      @if (d.coverage) {
        <div class="kpi-row">
          <div class="kpi"><span class="kpi-icon"><mat-icon>groups_2</mat-icon></span>
            <div><div class="kpi-value">{{ n(d.coverage.farmers_registered) }}</div><div class="kpi-label">Farmers registered</div></div></div>
          <div class="kpi"><span class="kpi-icon"><mat-icon>how_to_reg</mat-icon></span>
            <div><div class="kpi-value">{{ n(d.coverage.farmers_enrolled) }}</div><div class="kpi-label">Enrolled with consent</div></div></div>
          <div class="kpi"><span class="kpi-icon"><mat-icon>diversity_3</mat-icon></span>
            <div><div class="kpi-value">{{ n(d.coverage.fpos) }}</div><div class="kpi-label">FPOs</div></div></div>
          @if (d.data_quality) {
            <div class="kpi" [class.kpi-alert]="exceptions(d) > 0"><span class="kpi-icon"><mat-icon>rule</mat-icon></span>
              <div><div class="kpi-value">{{ n(exceptions(d)) }}</div><div class="kpi-label">Data-quality exceptions</div>
                <div class="kpi-sub">Rejected/exception records{{ d.data_quality.open_quarantine != null ? ' + open quarantine' : '' }}</div></div></div>
          }
        </div>
      }

      <div class="dash-grid">
        @if (canMap) {
          <section class="dash-card span-8 map-card">
            <app-map-view [plots]="mapPlots()" [threeD]="true" [tilt]="40" [basemap]="'light'" [pointColour]="'#0b7a3b'"
              [controls]="false" [(autoRotate)]="mapSpin" />
            <div class="map-card-overlay">
              <div class="map-card-title"><h3><mat-icon>public</mat-icon>Farm map</h3>
                <span>Where the located plots are · open the map for practice, risk, NDVI and rain layers</span></div>
              <a mat-flat-button routerLink="/map"><mat-icon>open_in_full</mat-icon> Open map</a>
            </div>
            @if (mapPlots().length) {
              <div class="map-card-stats">
                <span><strong>{{ mapPlots().length }}</strong> plots</span>
                <span><strong>{{ mapStats().farmers }}</strong> farmers</span>
                <span><strong>{{ mapStats().areas }}</strong> {{ mapStats().areas === 1 ? 'area' : 'areas' }}</span>
              </div>
            }
            @if (mapLoaded() && !mapPlots().length) {
              <div class="map-card-empty"><mat-icon>add_location_alt</mat-icon>No plots with GPS coordinates yet</div>
            }
            <button type="button" class="map-spin" (click)="mapSpin.set(!mapSpin())" [attr.aria-label]="mapSpin() ? 'Stop rotation' : 'Rotate'">
              <mat-icon>{{ mapSpin() ? 'pause' : '360' }}</mat-icon></button>
          </section>
        }

        @if (d.active_alerts || d.my_tasks) {
          <div class="span-4 dash-stack">
            @if (d.active_alerts) {
              <section class="dash-card">
                <div class="panel-head"><h3><mat-icon>thunderstorm</mat-icon>Active climate alerts</h3><a routerLink="/advisories" class="small">All →</a></div>
                @for (a of d.active_alerts; track a.id) {
                  <a class="feed-row" [routerLink]="['/advisories', a.id]">
                    <span class="feed-icon" [class]="'tone-' + riskTone(a.risk_level)"><mat-icon>warning_amber</mat-icon></span>
                    <span class="grow">{{ a.title }} <app-demo [show]="a.is_demo" /><br />
                      <span class="muted small">{{ a.area }} · {{ label(a.hazard_type) }} · {{ a.issued_at | date: 'mediumDate' }}</span></span>
                    <app-status [status]="a.risk_level" />
                  </a>
                } @empty {<div class="empty-note"><mat-icon>wb_sunny</mat-icon>No active alerts</div>}
              </section>
            }
            @if (d.my_tasks) {
              <section class="dash-card">
                <div class="panel-head"><h3><mat-icon>assignment</mat-icon>My review tasks</h3><a routerLink="/mrv" class="small">MRV workspace →</a></div>
                @for (t of d.my_tasks; track t.id) {
                  <a class="feed-row" [routerLink]="['/mrv/tasks', t.id]">
                    <span class="feed-icon tone-info"><mat-icon>fact_check</mat-icon></span>
                    <span class="grow">{{ t.title }}<br /><span class="muted small">as {{ t.role }}{{ t.due_date ? ' · due ' + t.due_date : '' }}</span></span>
                    <app-status [status]="t.status" />
                  </a>
                } @empty {<div class="empty-note"><mat-icon>task_alt</mat-icon>No open tasks</div>}
              </section>
            }
          </div>
        }

        @if (d.progress?.length) {
          <section class="dash-card span-12">
            <div class="panel-head"><h3><mat-icon>track_changes</mat-icon>Progress against programme targets</h3>
              <span class="muted small">{{ d.programme?.name }} · {{ d.programme?.version_label }}</span></div>
            <p class="muted small">Targets are proposal figures with the status shown. Values are the latest calculated result;
              PROVISIONAL results use definitions still pending programme-owner approval.</p>
            <div class="target-list">
              @for (p of d.progress; track p.metric_code) {
                <div class="target">
                  <div class="target-head"><span class="grow">{{ p.metric_name }}</span>
                    @if (p.latest_result?.provisional) {<span class="badge tone-warning">PROVISIONAL</span>}
                    @if (p.latest_result) {<app-status [status]="p.latest_result.verification_status" />}</div>
                  <div class="meter" role="img" [attr.aria-label]="progressPct(p) + '% of target'">
                    <span [style.width.%]="progressPct(p)"></span></div>
                  <div class="target-foot">
                    <span><strong>{{ p.latest_result ? n(p.latest_result.value) : '—' }}</strong>
                      @if (!p.latest_result) {<span class="muted small"> {{ p.indicator_code ? 'Not calculated' : 'No linked indicator' }}</span>}</span>
                    <span class="muted">target {{ n(p.target_value) }} {{ p.unit }} <app-status [status]="p.target_status" /></span>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        @if (d.funnel) {
          <section class="dash-card span-7">
            <h3><mat-icon>filter_alt</mat-icon>Household participation funnel</h3>
            <div class="bars">
              @for (s of entries(d.funnel.stages); track s[0]; let i = $index) {
                <div class="bar-row" tabindex="0" [attr.data-tip]="label(s[0]) + ': ' + n(s[1]) + ' households'">
                  <div class="bar-label"><span class="step">{{ i + 1 }}</span>{{ label(s[0]) }}
                    <span class="muted small bar-def">{{ d.funnel.definitions[s[0]] }}</span></div>
                  <div class="bar-track"><span class="bar" [style.width.%]="share(s[1], funnelMax(d))"></span>
                    <strong class="bar-value">{{ n(s[1]) }}</strong></div>
                </div>
              }
            </div>
          </section>
        }

        @if (d.data_quality?.monitoring_by_validation_status) {
          <section class="dash-card span-5">
            <h3><mat-icon>verified_user</mat-icon>Monitoring data quality</h3>
            @if (segments(d).length) {
              <div class="seg-bar" role="img" [attr.aria-label]="segmentsLabel(d)">
                @for (s of segments(d); track s.key) {
                  <span class="seg" tabindex="0" [style.flex-grow]="s.count" [style.background]="s.fill" [style.color]="s.ink"
                    [attr.data-tip]="label(s.key) + ': ' + n(s.count) + ' (' + s.share + '%)'">{{ s.share >= 12 ? s.share + '%' : '' }}</span>
                }
              </div>
            } @else {<div class="empty-note"><mat-icon>inbox</mat-icon>No monitoring records yet</div>}
            @for (s of segments(d); track s.key) {
              <div class="feed-row plain"><span class="swatch" [style.background]="s.fill"></span><span>{{ label(s.key) }}</span>
                <span class="grow"></span><strong class="num">{{ n(s.count) }}</strong><span class="muted small share">{{ s.share }}%</span></div>
            }
            @if (d.data_quality.open_quarantine != null) {
              <a class="feed-row" routerLink="/integrations"><span class="feed-icon tone-warning"><mat-icon>inventory_2</mat-icon></span>
                <span class="grow">Open quarantined integration records</span><strong>{{ d.data_quality.open_quarantine }}</strong></a>
            }
          </section>
        }

        @if (breakdown()?.rows?.length) {
          <section class="dash-card span-12">
            <div class="panel-head"><h3><mat-icon>account_tree</mat-icon>By {{ breakdown()!.by }}</h3>
              <span class="seg-toggle">
                <button type="button" [class.on]="breakdown()!.by === 'state'" (click)="loadBreakdown('state')">States</button>
                <button type="button" [class.on]="breakdown()!.by === 'district'" (click)="loadBreakdown('district')">Districts</button></span></div>
            <div class="table-wrap"><table class="simple">
              <thead><tr><th>{{ label(breakdown()!.by) }}</th><th class="num">Households</th><th class="num">Enrolled</th>
                @for (c of breakdown()!.categories; track c.code) {<th class="num">{{ c.name }}</th>}
                <th class="num">Adopted (observed)</th><th class="num">Adopted (verified)</th><th class="num">Demo sites</th>
                <th class="num">Active clusters</th><th class="num">CRPs trained</th></tr></thead>
              <tbody>@for (r of breakdown()!.rows; track r.geo_unit_id) {
                <tr><td>{{ r.name }} @if (r.requires_confirmation) {<span class="badge tone-warning">needs confirmation</span>}</td>
                  <td class="num cell-bar"><span class="cell-fill" [style.width.%]="share(r.households_registered, breakdownMax())"></span>
                    <span class="cell-value">{{ r.households_registered }}</span></td>
                  <td class="num">{{ r.farmers_enrolled }}</td>
                  @for (c of breakdown()!.categories; track c.code) {<td class="num">{{ r.categories[c.code] }}</td>}
                  <td class="num">{{ r.households_adopted_observed }}</td><td class="num">{{ r.households_adopted_verified }}</td>
                  <td class="num">{{ r.demonstration_sites }}</td><td class="num">{{ r.active_clusters }}</td><td class="num">{{ r.crps_trained }}</td></tr>
              }</tbody></table></div>
          </section>
        }

        @if (d.modules) {
          <section class="dash-card span-6">
            <h3><mat-icon>view_module</mat-icon>Workstream records</h3>
            <div class="bars compact">
              @for (m of d.modules; track m.code) {
                <a class="bar-row" [routerLink]="m.code === 'mrv' ? '/mrv' : ['/modules', m.code]">
                  <div class="bar-label"><span class="step">{{ m.number }}</span>{{ m.name }}</div>
                  @if (m.code === 'mrv') {<div class="bar-track"><span class="muted small">Open MRV workspace →</span></div>}
                  @else {<div class="bar-track"><span class="bar" [style.width.%]="share(m.records, modulesMax(d))"></span>
                    <strong class="bar-value">{{ n(m.records) }}</strong></div>}
                </a>
              }
            </div>
          </section>
        }

        @if (d.community) {
          <section class="dash-card span-6">
            <h3><mat-icon>handshake</mat-icon>Demonstrations, surveillance & community resource persons</h3>
            <div class="mini-tiles">
              <div class="mini-tile"><mat-icon>yard</mat-icon><strong>{{ d.community.demonstration_sites?.plantation ?? 0 }}</strong><span>Plantation demonstration sites</span></div>
              <div class="mini-tile"><mat-icon>water_drop</mat-icon><strong>{{ d.community.demonstration_sites?.soil_moisture ?? 0 }}</strong><span>Soil/moisture demonstration sites</span></div>
              <div class="mini-tile"><mat-icon>pest_control</mat-icon><strong>{{ d.community.surveillance_clusters_active }}</strong><span>Active pest surveillance clusters</span></div>
              <div class="mini-tile"><mat-icon>record_voice_over</mat-icon><strong>{{ d.community.crps_trained }}</strong><span>Community resource persons trained</span></div>
            </div>
          </section>
        }

        @if (d.planning_targets?.length && !d.progress?.length) {
          <section class="dash-card span-6">
            <h3><mat-icon>flag_circle</mat-icon>Programme planning targets</h3>
            <p class="muted small">Indicative proposal figures – not achievements. Status shows whether each is approved.</p>
            @for (t of d.planning_targets; track t.metric_name) {
              <div class="feed-row plain"><span class="grow">{{ t.metric_name }}</span>
                <strong class="num">{{ n(t.target_value) }} {{ t.unit }}</strong><app-status [status]="t.status" /></div>
            }
          </section>
        }

        <section class="dash-card span-6">
          <h3><mat-icon>history</mat-icon>Recent activity</h3>
          @if (d.recent_activity?.length) {
            <ul class="timeline activity">
              @for (e of d.recent_activity; track $index) {
                <li><div class="tl-head small"><strong>{{ label(e.action) }}</strong> {{ label(e.entity_type) }}
                  <span class="muted">{{ e.occurred_at | date: 'short' }}</span></div>
                  @if (e.summary) {<div class="muted small">{{ e.summary }}</div>}</li>
              }
            </ul>
          } @else {<div class="empty-note"><mat-icon>schedule</mat-icon>No recent activity</div>}
        </section>
      </div>
    }`,
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  protected readonly data = signal<Row | null>(null);
  protected readonly breakdown = signal<Row | null>(null);
  protected readonly mapPlots = signal<Row[]>([]);
  protected readonly mapLoaded = signal(false);
  protected readonly mapSpin = signal(false);
  protected readonly mapStats = computed(() => ({
    farmers: new Set(this.mapPlots().map((p) => p['farmer_id'])).size,
    areas: new Set(this.mapPlots().map((p) => p['area_label'] ?? '')).size,
  }));
  protected readonly canMap = this.auth.has('farmer.read') && this.auth.has('module.read');
  protected readonly today = new Date();
  protected readonly breakdownMax = computed(() =>
    Math.max(0, ...(this.breakdown()?.['rows'] ?? []).map((r: Row) => Number(r['households_registered']) || 0)));

  ngOnInit(): void {
    this.api.get<Row>('/dashboard').subscribe((d) => this.data.set(d));
    if (this.auth.has('farmer.read')) this.loadBreakdown('state');
    if (this.canMap) {
      this.api.get<Row>('/map/plots').subscribe((m) => { this.mapPlots.set(m['plots'] ?? []); this.mapLoaded.set(true); });
    }
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

  protected riskTone(v: unknown): Tone {
    return RISK_TONE[String(v)] ?? 'neutral';
  }

  protected entries(o: Record<string, number>): [string, number][] {
    return Object.entries(o ?? {});
  }

  protected exceptions(d: Row): number {
    const q = d['data_quality'] ?? {};
    const mon = q.monitoring_by_validation_status ?? {};
    return (q.workstream_exceptions ?? 0) + (mon.exception ?? 0) + (mon.rejected ?? 0) + (q.open_quarantine ?? 0);
  }

  /** Whole-number percentage of part in total (0 when the total is 0). */
  protected pct(part: unknown, total: unknown): number {
    const p = Number(part), t = Number(total);
    return t > 0 && Number.isFinite(p) ? Math.round((p / t) * 100) : 0;
  }

  protected ring(part: unknown, total: unknown): string {
    const length = 2 * Math.PI * 52;
    return `${(this.pct(part, total) / 100) * length} ${length}`;
  }

  /** Bar width in % of the largest value; a non-zero value always shows a sliver. */
  protected share(value: unknown, max: number): number {
    const v = Number(value) || 0;
    return max > 0 && v > 0 ? Math.max(2, (v / max) * 100) : 0;
  }

  protected progressPct(p: Row): number {
    const target = Number(p['target_value']), value = Number(p['latest_result']?.['value']);
    return target > 0 && Number.isFinite(value) ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  }

  protected funnelMax(d: Row): number {
    return Math.max(0, ...Object.values<number>(d['funnel']?.['stages'] ?? {}).map(Number));
  }

  protected modulesMax(d: Row): number {
    return Math.max(0, ...(d['modules'] ?? []).filter((m: Row) => m['code'] !== 'mrv').map((m: Row) => Number(m['records']) || 0));
  }

  protected segments(d: Row): Segment[] {
    const counts: Record<string, number> = d['data_quality']?.['monitoring_by_validation_status'] ?? {};
    const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    return Object.entries(counts)
      .filter(([, c]) => Number(c) > 0)
      .sort(([a], [b]) => STATUS_ORDER.indexOf(segmentTone(a)) - STATUS_ORDER.indexOf(segmentTone(b)))
      .map(([key, c]) => {
        const tone = segmentTone(key);
        return { key, count: Number(c), share: Math.round((Number(c) / total) * 100), fill: STATUS_FILL[tone],
          ink: tone === 'warning' ? '#0b0b0b' : '#ffffff' };
      });
  }

  protected segmentsLabel(d: Row): string {
    return this.segments(d).map((s) => `${labelize(s.key)} ${s.count} (${s.share}%)`).join(', ');
  }
}
