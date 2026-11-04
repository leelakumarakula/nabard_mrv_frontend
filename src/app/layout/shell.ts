import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LookupsService } from '../core/lookups.service';
import { SystemInfo } from '../core/models';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  perm?: string | string[];
  /** Only for accounts linked to a farmer record (self-service pages). */
  farmerOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { title: '', items: [{ label: 'Dashboard', icon: 'dashboard', link: '/dashboard' }] },
  {
    title: 'Programme', items: [
      { label: 'Programmes', icon: 'flag', link: '/programmes', perm: 'programme.read' },
      { label: 'Status & decisions', icon: 'pending_actions', link: '/programme-status', perm: 'programme.read' },
      { label: 'Geography', icon: 'account_tree', link: '/geography', perm: 'geo.read' },
      { label: 'FPOs & organisations', icon: 'groups', link: '/organisations', perm: 'org.read' },
      { label: 'Farmers & plots', icon: 'agriculture', link: '/farmers', perm: 'farmer.read' },
    ],
  },
  {
    title: 'Workstreams', items: [
      { label: '1. Climate & early warning', icon: 'thunderstorm', link: '/modules/climate', perm: 'module.read' },
      { label: '2. Soil & water conservation', icon: 'water_drop', link: '/modules/water', perm: 'module.read' },
      { label: '3. Pest & disease', icon: 'bug_report', link: '/modules/pest', perm: 'module.read' },
      { label: '4. Soil & microclimate', icon: 'grass', link: '/modules/soil', perm: 'module.read' },
      { label: '5. Suitability & planning', icon: 'terrain', link: '/modules/suitability', perm: 'module.read' },
      { label: '6. Farmer & community', icon: 'diversity_3', link: '/modules/farmer_fpo', perm: 'module.read' },
      { label: '7. MRV & verification', icon: 'verified', link: '/mrv', perm: 'mrv.read' },
    ],
  },
  {
    title: 'Field operations', items: [
      { label: 'Advisories & alerts', icon: 'campaign', link: '/advisories', perm: 'advisory.read' },
      { label: 'Practice adoption', icon: 'task_alt', link: '/practices', perm: 'module.read' },
      { label: 'IoT devices', icon: 'sensors', link: '/devices', perm: 'module.read' },
      { label: 'Demonstration sites', icon: 'yard', link: '/demonstration-sites', perm: 'module.read' },
      { label: 'Pest surveillance clusters', icon: 'pest_control', link: '/surveillance-clusters', perm: 'module.read' },
      { label: 'Community resource persons', icon: 'record_voice_over', link: '/crps', perm: 'module.read' },
    ],
  },
  {
    title: 'MRV', items: [
      { label: 'Indicators', icon: 'query_stats', link: '/indicators', perm: 'indicator.read' },
      { label: 'Baselines', icon: 'start', link: '/baselines', perm: 'baseline.read' },
      { label: 'Monitoring records', icon: 'monitoring', link: '/monitoring', perm: 'monitoring.read' },
      { label: 'Evidence', icon: 'folder_open', link: '/evidence', perm: 'evidence.read' },
      { label: 'MRV workspace', icon: 'fact_check', link: '/mrv', perm: 'mrv.read' },
      { label: 'Independent verification', icon: 'policy', link: '/verification', perm: 'verification.read' },
    ],
  },
  {
    title: 'Data & reporting', items: [
      { label: 'Integrations', icon: 'hub', link: '/integrations', perm: 'integration.read' },
      { label: 'Reports', icon: 'summarize', link: '/reports', perm: 'report.read' },
    ],
  },
  {
    title: 'Administration', items: [
      { label: 'Users', icon: 'manage_accounts', link: '/admin/users', perm: 'admin.users' },
      { label: 'Roles & permissions', icon: 'admin_panel_settings', link: '/admin/roles', perm: 'admin.users' },
      { label: 'Audit log', icon: 'history', link: '/admin/audit', perm: 'admin.audit' },
      { label: 'Programme configuration', icon: 'settings_applications', link: '/admin/configuration', perm: ['programme.manage', 'admin.settings'] },
      { label: 'System settings', icon: 'tune', link: '/admin/settings', perm: 'admin.settings' },
    ],
  },
  { title: 'My farm', items: [{ label: 'My advisories', icon: 'notifications', link: '/my-advisories', perm: 'self.read', farmerOnly: true }] },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatTooltipModule],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav #drawer [mode]="isMobile() ? 'over' : 'side'" [opened]="!isMobile()" class="sidenav">
        <div class="brand"><img src="brand/varsapradaya-logo.svg" alt="Varsapradaya" /><span>Coffee Climate Resilience MRV</span></div>
        @for (group of nav(); track group.title) {
          @if (group.title) {<div class="nav-group">{{ group.title }}</div>}
          <mat-nav-list>
            @for (item of group.items; track item.link + item.label) {
              <a mat-list-item [routerLink]="item.link" routerLinkActive="active" (click)="isMobile() && drawer.close()">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon><span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
        }
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          <button mat-icon-button (click)="drawer.toggle()" aria-label="Toggle navigation"><mat-icon>menu</mat-icon></button>
          <span class="programme" [matTooltip]="programme()?.funding_note ?? ''">{{ programme()?.name ?? 'Coffee Climate Resilience MRV' }}</span>
          <span class="spacer"></span>
          <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
            <mat-icon>account_circle</mat-icon> <span class="hide-sm">{{ auth.me()?.full_name }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-info">{{ auth.me()?.email }}<br /><span class="muted small">{{ roles() }}</span></div>
            <a mat-menu-item routerLink="/profile"><mat-icon>person</mat-icon> Profile & password</a>
            <button mat-menu-item (click)="auth.logout()"><mat-icon>logout</mat-icon> Sign out</button>
          </mat-menu>
        </mat-toolbar>
        @if (info()?.demo_data_present) {
          <div class="demo-banner" role="status">
            <mat-icon>science</mat-icon>
            DEMO / SYNTHETIC DATA is loaded in this {{ info()?.app_env }} environment. Records marked DEMO are not real
            beneficiaries, measurements or verified programme achievements.
          </div>
        }
        <main class="content"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>`,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupsService);
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 900px)').pipe(map((s) => s.matches)), { initialValue: false });
  protected readonly info = signal<SystemInfo | null>(null);
  protected readonly programme = this.lookups.currentProgramme;
  protected readonly roles = computed(() => this.auth.me()?.roles.map((r) => r.label).join(', ') ?? '');
  protected readonly nav = computed(() => {
    const me = this.auth.me();
    return NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => (!i.perm || this.auth.hasAny(Array.isArray(i.perm) ? i.perm : [i.perm]))
        && (!i.farmerOnly || !!me?.farmer_id)),
    })).filter((g) => g.items.length);
  });

  private started = false;

  constructor() {
    // Load the banner and programme list once the account may use the platform (not while a temporary password
    // still has to be changed – the server refuses those calls until then).
    effect(() => {
      const me = this.auth.me();
      if (this.started || !me || me.must_change_password) return;
      this.started = true;
      untracked(() => {
        this.api.get<SystemInfo>('/dashboard/system-info').subscribe((i) => this.info.set(i));
        if (this.auth.has('programme.read')) this.lookups.loadProgrammes().subscribe();
      });
    });
  }
}
