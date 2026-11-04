import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Page, Row } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Column, DataTable } from '../../shared/data-table';
import { FieldDef, openForm } from '../../shared/form-dialog';
import { ListState } from '../../shared/list-state';
import { Notice, PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-users',
  imports: [PageHeader, DataTable, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Users" subtitle="Accounts, roles and geography/organisation scopes">
      <button mat-flat-button (click)="create()"><mat-icon>person_add</mat-icon> New user</button>
    </app-page-header>
    <div class="filters"><mat-form-field class="search"><mat-label>Search</mat-label><input matInput [formControl]="search" /></mat-form-field></div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)" (rowClick)="edit($event)" />`,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  protected readonly search = new FormControl('');
  protected readonly columns: Column[] = [
    { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' },
    { key: 'roles', label: 'Roles', value: (r) => r['roles'].map((x: Row) => x['label']).join(', ') },
    { key: 'scopes', label: 'Scopes', value: (r) => (r['scopes'].length ? `${r['scopes'].length} scope(s)` : 'none') },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'last_login_at', label: 'Last login', kind: 'datetime' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/admin/users', { page, page_size: size, search: this.search.value }));

  ngOnInit(): void {
    this.list.load();
    this.search.valueChanges.pipe(debounceTime(300)).subscribe(() => this.list.reset());
  }

  private async fields(includePassword: boolean): Promise<FieldDef[]> {
    const roles = await firstValueFrom(this.api.get<Row[]>('/admin/roles'));
    const base: FieldDef[] = [
      { name: 'full_name', label: 'Full name', type: 'text', required: true }, { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'role_codes', label: 'Roles', type: 'multiselect', required: true, options: roles.map((r) => ({ value: r['code'], label: r['name'] })) },
      { name: 'scope_geo', label: 'Geography scope', type: 'lookup', lookup: 'geo', hint: 'State/district/cluster the user may access' },
      { name: 'scope_org', label: 'FPO / organisation scope', type: 'lookup', lookup: 'organisation' },
      { name: 'organisation_id', label: 'Belongs to organisation', type: 'lookup', lookup: 'organisation' },
      { name: 'farmer_id', label: 'Linked farmer record (Farmer accounts only)', type: 'farmer',
        hint: 'The farmer sees only this record\'s advisories in "My advisories"' },
    ];
    return includePassword
      ? [{ name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Temporary password (min. 10)', type: 'password', required: true }, ...base]
      : [...base, { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'locked'] }];
  }

  private payload(v: Row): Row {
    const scopes = [];
    if (v['scope_geo']) scopes.push({ geo_unit_id: v['scope_geo'] });
    if (v['scope_org']) scopes.push({ organisation_id: v['scope_org'] });
    const { scope_geo, scope_org, ...rest } = v;
    return { ...rest, scopes };
  }

  protected async create(): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: 'New user', fields: await this.fields(true),
      notice: 'Programme-wide roles (admin, analyst, reviewers, verifier) do not need scopes; field roles must be scoped.',
      submit: (v) => firstValueFrom(this.api.post('/admin/users', this.payload(v))),
    });
    if (saved) this.list.load();
  }

  protected async edit(u: Row): Promise<void> {
    const value = { ...u, role_codes: u['role_codes'], scope_geo: u['scopes'].find((s: Row) => s['geo_unit_id'])?.geo_unit_id,
      scope_org: u['scopes'].find((s: Row) => s['organisation_id'])?.organisation_id };
    const saved = await openForm(this.dialog, {
      title: `Edit ${u['email']}`, value,
      fields: [...(await this.fields(false)), { name: 'new_password', label: 'Set temporary password (optional, min. 10)',
        type: 'password', hint: 'The user must change it at next sign-in' }],
      submit: async ({ new_password, ...v }) => {
        const updated = await firstValueFrom(this.api.patch(`/admin/users/${u['id']}`, this.payload(v)));
        if (new_password) await firstValueFrom(this.api.post(`/admin/users/${u['id']}/set-password`, { new_password }));
        return updated;
      },
    });
    if (saved) {
      this.notify.success('User updated');
      this.list.load();
    }
  }
}

@Component({
  selector: 'app-roles',
  imports: [PageHeader, Notice, MatCheckboxModule, MatButtonModule],
  template: `
    <app-page-header title="Roles & permissions" subtitle="Backend-enforced permissions per role" />
    <app-notice>Changes apply immediately to every user holding the role. Separation of duties (submitter / internal reviewer /
      independent verifier) is additionally enforced by policy settings.</app-notice>
    <div class="table-wrap">
      <table class="simple matrix">
        <thead><tr><th>Permission</th>@for (r of roles(); track r['id']) {<th class="rot">{{ r['name'] }}</th>}</tr></thead>
        <tbody>@for (p of permissions(); track p['code']) {
          <tr><td><code>{{ p['code'] }}</code><div class="muted small">{{ p['description'] }}</div></td>
            @for (r of roles(); track r['id']) {
              <td><mat-checkbox [checked]="r['permissions'].includes(p['code'])" [disabled]="!canEdit()"
                                (change)="toggle(r, p['code'], $event.checked)" [attr.aria-label]="r['name'] + ' ' + p['code']" /></td>
            }</tr>
        }</tbody>
      </table>
    </div>`,
  styles: `.matrix th.rot { font-size: 0.75rem; max-width: 90px; white-space: normal; } .matrix td { padding: 4px 8px; }`,
})
export class RolesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  protected readonly roles = signal<Row[]>([]);
  protected readonly permissions = signal<Row[]>([]);
  protected readonly canEdit = computed(() => this.auth.has('admin.roles'));

  ngOnInit(): void {
    this.api.get<Row[]>('/admin/roles').subscribe((r) => this.roles.set(r));
    if (this.auth.has('admin.roles')) this.api.get<Row[]>('/admin/permissions').subscribe((p) => this.permissions.set(p));
    else this.api.get<Row[]>('/admin/roles').subscribe((r) =>
      this.permissions.set([...new Set(r.flatMap((x) => x['permissions']))].sort().map((code) => ({ code, description: '' }))));
  }

  protected toggle(role: Row, code: string, on: boolean): void {
    const permissions = on ? [...role['permissions'], code] : role['permissions'].filter((p: string) => p !== code);
    this.api.put<Row>(`/admin/roles/${role['id']}/permissions`, { permissions }).subscribe({
      next: (updated) => {
        this.roles.update((all) => all.map((r) => (r['id'] === updated['id'] ? updated : r)));
        this.notify.success(`${updated['name']} updated`);
      },
      error: () => this.ngOnInit(),
    });
  }
}

@Component({
  selector: 'app-audit',
  imports: [PageHeader, DataTable, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <app-page-header title="Audit log" subtitle="Append-only history of imports, edits, approvals, exports, evidence access and decisions" />
    <div class="filters">
      <mat-form-field><mat-label>Entity type</mat-label><input matInput [formControl]="entityType" /></mat-form-field>
      <mat-form-field><mat-label>Action</mat-label><input matInput [formControl]="action" /></mat-form-field>
    </div>
    <app-table [columns]="columns" [rows]="list.rows()" [total]="list.total()" [pageIndex]="list.pageIndex()"
               [pageSize]="list.pageSize()" [loading]="list.loading()" (page)="list.onPage($event)" [clickable]="false" />`,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly entityType = new FormControl('');
  protected readonly action = new FormControl('');
  protected readonly columns: Column[] = [
    { key: 'occurred_at', label: 'When', kind: 'datetime' }, { key: 'actor_email', label: 'Actor' },
    { key: 'action', label: 'Action', kind: 'label' }, { key: 'entity_type', label: 'Entity', kind: 'label' },
    { key: 'summary', label: 'Summary' }, { key: 'correlation_id', label: 'Request ID' },
  ];
  protected readonly list = new ListState((page, size) => this.api.get<Page<Row>>('/admin/audit-events', {
    page, page_size: size, entity_type: this.entityType.value, action: this.action.value }));

  ngOnInit(): void {
    this.list.load();
    this.entityType.valueChanges.pipe(debounceTime(400)).subscribe(() => this.list.reset());
    this.action.valueChanges.pipe(debounceTime(400)).subscribe(() => this.list.reset());
  }
}

@Component({
  selector: 'app-settings',
  imports: [PageHeader, Notice, DataTable],
  template: `
    <app-page-header title="System settings" subtitle="Configurable policy rules" />
    <app-notice kind="warning">Settings flagged "needs confirmation" encode programme policy that the programme owner must confirm.</app-notice>
    <app-table [columns]="columns" [rows]="settings()" (rowClick)="edit($event)" />`,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly settings = signal<Row[]>([]);
  protected readonly columns: Column[] = [
    { key: 'key', label: 'Setting' }, { key: 'value', label: 'Value', value: (r) => JSON.stringify(r['value']) },
    { key: 'description', label: 'Description' }, { key: 'requires_confirmation', label: 'Needs confirmation', kind: 'bool' },
    { key: 'updated_at', label: 'Updated', kind: 'datetime' },
  ];

  ngOnInit(): void {
    this.api.get<Row[]>('/admin/settings').subscribe((s) => this.settings.set(s));
  }

  protected async edit(s: Row): Promise<void> {
    const saved = await openForm(this.dialog, {
      title: s['key'], notice: s['description'],
      fields: [{ name: 'value', label: 'Value (JSON)', type: 'json', required: true },
        { name: 'requires_confirmation', label: 'Still needs programme-owner confirmation', type: 'boolean' }],
      value: { value: s['value'], requires_confirmation: s['requires_confirmation'] },
      submit: (v) => firstValueFrom(this.api.put(`/admin/settings/${s['key']}`, v)),
    });
    if (saved) this.ngOnInit();
  }
}
