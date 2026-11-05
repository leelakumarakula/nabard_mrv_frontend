import { Routes } from '@angular/router';

import { authGuard } from './core/guards';
import { Shell } from './layout/shell';

const f = (perm?: string | string[]) => ({ canActivate: [authGuard], data: perm ? { perm } : {} });

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/auth-pages').then((m) => m.LoginPage) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ForgotPasswordPage) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ResetPasswordPage) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'profile', loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ProfilePage) },
      { path: 'access-denied', loadComponent: () => import('./features/auth/auth-pages').then((m) => m.AccessDeniedPage) },

      { path: 'programmes', ...f('programme.read'), loadComponent: () => import('./features/programmes/programmes').then((m) => m.ProgrammesPage) },
      { path: 'programmes/:id', ...f('programme.read'), loadComponent: () => import('./features/programmes/programmes').then((m) => m.ProgrammeDetailPage) },
      { path: 'geography', ...f('geo.read'), loadComponent: () => import('./features/programmes/geography').then((m) => m.GeographyPage) },
      { path: 'organisations', ...f('org.read'), loadComponent: () => import('./features/registry/organisations').then((m) => m.OrganisationsPage) },
      { path: 'organisations/:id', ...f('org.read'), loadComponent: () => import('./features/registry/organisations').then((m) => m.OrganisationDetailPage) },
      { path: 'farmers', ...f('farmer.read'), loadComponent: () => import('./features/registry/farmers').then((m) => m.FarmersPage) },
      { path: 'map', ...f('farmer.read'), loadComponent: () => import('./features/map/plot-map').then((m) => m.PlotMapPage) },
      { path: 'farmers/:id', ...f('farmer.read'), loadComponent: () => import('./features/registry/farmer-detail').then((m) => m.FarmerDetailPage) },

      { path: 'modules/:code', ...f('module.read'), loadComponent: () => import('./features/modules/module-page').then((m) => m.ModulePage) },
      { path: 'records/:id', ...f('module.read'), loadComponent: () => import('./features/modules/record-detail').then((m) => m.RecordDetailPage) },
      { path: 'advisories', ...f('advisory.read'), loadComponent: () => import('./features/operations/advisories').then((m) => m.AdvisoriesPage) },
      { path: 'advisories/:id', ...f('advisory.read'), loadComponent: () => import('./features/operations/advisories').then((m) => m.AdvisoryDetailPage) },
      { path: 'practices', ...f('module.read'), loadComponent: () => import('./features/operations/practices').then((m) => m.PracticesPage) },
      { path: 'practices/:id', ...f('module.read'), loadComponent: () => import('./features/operations/practices').then((m) => m.PracticeDetailPage) },
      { path: 'devices', ...f('module.read'), loadComponent: () => import('./features/operations/devices').then((m) => m.DevicesPage) },
      { path: 'devices/:id', ...f('module.read'), loadComponent: () => import('./features/operations/devices').then((m) => m.DeviceDetailPage) },

      { path: 'demonstration-sites', ...f('module.read'), loadComponent: () => import('./features/community/demo-sites').then((m) => m.DemoSitesPage) },
      { path: 'demonstration-sites/:id', ...f('module.read'), loadComponent: () => import('./features/community/demo-sites').then((m) => m.DemoSiteDetailPage) },
      { path: 'surveillance-clusters', ...f('module.read'), loadComponent: () => import('./features/community/clusters').then((m) => m.ClustersPage) },
      { path: 'surveillance-clusters/:id', ...f('module.read'), loadComponent: () => import('./features/community/clusters').then((m) => m.ClusterDetailPage) },
      { path: 'crps', ...f('module.read'), loadComponent: () => import('./features/community/crps').then((m) => m.CrpsPage) },
      { path: 'verification', ...f('verification.read'), loadComponent: () => import('./features/mrv/verification').then((m) => m.VerificationPage) },
      { path: 'verification/:id', ...f('verification.read'), loadComponent: () => import('./features/mrv/verification').then((m) => m.SampleDetailPage) },

      { path: 'indicators', ...f('indicator.read'), loadComponent: () => import('./features/mrv/indicators').then((m) => m.IndicatorsPage) },
      { path: 'indicators/:id', ...f('indicator.read'), loadComponent: () => import('./features/mrv/indicators').then((m) => m.IndicatorDetailPage) },
      { path: 'baselines', ...f('baseline.read'), loadComponent: () => import('./features/mrv/baselines').then((m) => m.BaselinesPage) },
      { path: 'baselines/:id', ...f('baseline.read'), loadComponent: () => import('./features/mrv/baselines').then((m) => m.BaselineDetailPage) },
      { path: 'monitoring', ...f('monitoring.read'), loadComponent: () => import('./features/mrv/monitoring').then((m) => m.MonitoringPage) },
      { path: 'monitoring/:id', ...f('monitoring.read'), loadComponent: () => import('./features/mrv/monitoring').then((m) => m.MonitoringDetailPage) },
      { path: 'evidence', ...f('evidence.read'), loadComponent: () => import('./features/mrv/evidence').then((m) => m.EvidencePage) },
      { path: 'mrv', ...f('mrv.read'), loadComponent: () => import('./features/mrv/workspace').then((m) => m.MrvWorkspacePage) },
      { path: 'mrv/results/:id', ...f('mrv.read'), loadComponent: () => import('./features/mrv/workspace').then((m) => m.ResultDetailPage) },
      { path: 'mrv/tasks/:id', ...f('mrv.read'), loadComponent: () => import('./features/mrv/review-task').then((m) => m.ReviewTaskPage) },

      { path: 'integrations', ...f('integration.read'), loadComponent: () => import('./features/integrations/integrations').then((m) => m.IntegrationsPage) },
      { path: 'integrations/:code', ...f('integration.read'), loadComponent: () => import('./features/integrations/integrations').then((m) => m.SourceDetailPage) },
      { path: 'reports', ...f('report.read'), loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsPage) },
      { path: 'reports/:id', ...f('report.read'), loadComponent: () => import('./features/reports/reports').then((m) => m.ReportDetailPage) },

      { path: 'programme-status', ...f('programme.read'), loadComponent: () => import('./features/programmes/status').then((m) => m.ProgrammeStatusPage) },
      { path: 'admin/configuration', ...f(['programme.manage', 'admin.settings']), loadComponent: () => import('./features/admin/configuration').then((m) => m.ConfigurationPage) },
      { path: 'admin/users', ...f('admin.users'), loadComponent: () => import('./features/admin/admin').then((m) => m.UsersPage) },
      { path: 'admin/roles', ...f('admin.users'), loadComponent: () => import('./features/admin/admin').then((m) => m.RolesPage) },
      { path: 'admin/audit', ...f('admin.audit'), loadComponent: () => import('./features/admin/admin').then((m) => m.AuditPage) },
      { path: 'admin/settings', ...f('admin.settings'), loadComponent: () => import('./features/admin/admin').then((m) => m.SettingsPage) },
      { path: 'my-advisories', ...f('self.read'), loadComponent: () => import('./features/me/my-advisories').then((m) => m.MyAdvisoriesPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
