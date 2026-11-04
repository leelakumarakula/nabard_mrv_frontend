import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { toParams } from './api.service';
import { AuthService } from './auth.service';
import { LookupsService } from './lookups.service';
import { labelize, localDateTimeToIso, toneOf } from './format';
import { authGuard } from './guards';
import { Me } from './models';
import { errorMessage } from './notify.service';

describe('format helpers', () => {
  it('labelizes snake_case values', () => {
    expect(labelize('pending_review')).toBe('Pending review');
    expect(labelize(null)).toBe('—');
  });

  it('maps statuses to tones, keeping verified and provisional states distinct', () => {
    expect(toneOf('verified')).toBe('success');
    expect(toneOf('unverified')).toBe('warning');
    expect(toneOf('rejected')).toBe('danger');
    expect(toneOf('imported')).toBe('info');
    expect(toneOf('something_else')).toBe('neutral');
  });

  it('adds the browser timezone offset to datetime-local values', () => {
    const iso = localDateTimeToIso('2026-10-21T07:00');
    expect(iso).toMatch(/^2026-10-21T07:00:00[+-]\d{2}:\d{2}$/);
    expect(localDateTimeToIso('')).toBeNull();
  });
});

describe('api helpers', () => {
  it('drops empty query params and repeats arrays', () => {
    const params = toParams({ a: 'x', b: null, c: '', d: undefined, e: 0, f: ['1', '2'] });
    expect(params.get('a')).toBe('x');
    expect(params.has('b')).toBe(false);
    expect(params.has('c')).toBe(false);
    expect(params.get('e')).toBe('0');
    expect(params.getAll('f')).toEqual(['1', '2']);
  });

  it('formats the API error envelope', () => {
    const err = { error: { error: { message: 'Request validation failed', details: [{ field: 'value', message: 'required' }] } } };
    expect(errorMessage(err)).toBe('Request validation failed – value: required');
    expect(errorMessage({ status: 0 })).toContain('Cannot reach the server');
  });
});

describe('AuthService and authGuard', () => {
  const me: Me = {
    id: 'u1', email: 'field@demo.local', full_name: 'Field', phone: null, status: 'active', organisation_id: null,
    farmer_id: null, must_change_password: false, roles: [], role_codes: ['field_officer'],
    permissions: ['farmer.read', 'module.read'], all_scope: false,
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  });

  it('logs in, stores the token and loads permissions', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    let loaded: Me | undefined;
    auth.login('field@demo.local', 'secret-pass').subscribe((m) => (loaded = m));
    const login = http.expectOne((r) => r.url.endsWith('/auth/login'));
    expect(login.request.body).toContain('username=field%40demo.local');
    login.flush({ access_token: 'tok' });
    http.expectOne((r) => r.url.endsWith('/auth/me')).flush(me);
    expect(loaded?.email).toBe('field@demo.local');
    expect(auth.token).toBe('tok');
    expect(auth.has('farmer.read')).toBe(true);
    expect(auth.has('admin.users')).toBe(false);
    expect(auth.hasAny(['admin.users', 'module.read'])).toBe(true);
  });

  it('redirects unauthenticated users to login and unauthorised users to access-denied', () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const state = { url: '/admin/users' } as RouterStateSnapshot;
    const route = (perm?: string) => ({ data: perm ? { perm } : {} }) as unknown as ActivatedRouteSnapshot;

    const anon = TestBed.runInInjectionContext(() => authGuard(route('admin.users'), state)) as UrlTree;
    expect(router.serializeUrl(anon)).toBe('/login?returnUrl=%2Fadmin%2Fusers');

    auth.me.set(me);
    (auth as unknown as { tokenSignal: { set(v: string): void } }).tokenSignal.set('tok');
    const denied = TestBed.runInInjectionContext(() => authGuard(route('admin.users'), state)) as UrlTree;
    expect(router.serializeUrl(denied)).toBe('/access-denied');
    expect(TestBed.runInInjectionContext(() => authGuard(route('farmer.read'), state))).toBe(true);
  });
});

describe('LookupsService', () => {
  const user = (id: string): Me => ({
    id, email: `${id}@demo.local`, full_name: id, phone: null, status: 'active', organisation_id: null, farmer_id: null,
    must_change_password: false, roles: [], role_codes: [], permissions: ['geo.read'], all_scope: false,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  });

  it('never serves one user’s cached lists to the next user in the same tab', () => {
    const auth = TestBed.inject(AuthService);
    const lookups = TestBed.inject(LookupsService);
    const http = TestBed.inject(HttpTestingController);
    let names: string[] = [];

    auth.me.set(user('coordinator-ap'));
    lookups.geoUnits().subscribe((g) => (names = g.map((u) => u.name)));
    http.expectOne((r) => r.url.endsWith('/geo-units')).flush([{ id: 'g1', name: 'Andhra Pradesh', unit_type: 'state' }]);
    lookups.geoUnits().subscribe();
    http.expectNone((r) => r.url.endsWith('/geo-units'));  // cached for the same user
    expect(names).toEqual(['Andhra Pradesh']);

    auth.me.set(user('coordinator-od'));                    // another person signs in
    lookups.geoUnits().subscribe((g) => (names = g.map((u) => u.name)));
    http.expectOne((r) => r.url.endsWith('/geo-units')).flush([{ id: 'g2', name: 'Odisha', unit_type: 'state' }]);
    expect(names).toEqual(['Odisha']);
    http.verify();
  });
});

describe('authGuard with a temporary password', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  });

  it('sends the user to the profile page until the password is changed', () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const route = { data: {} } as unknown as ActivatedRouteSnapshot;
    const go = (url: string) => TestBed.runInInjectionContext(() => authGuard(route, { url } as RouterStateSnapshot));
    auth.me.set({
      id: 'u9', email: 'new@demo.local', full_name: 'New', phone: null, status: 'active', organisation_id: null,
      farmer_id: null, must_change_password: true, roles: [], role_codes: [], permissions: ['farmer.read'], all_scope: false,
    });
    (auth as unknown as { tokenSignal: { set(v: string): void } }).tokenSignal.set('tok');

    expect(router.serializeUrl(go('/farmers') as UrlTree)).toBe('/profile');
    expect(go('/profile')).toBe(true);
    auth.me.update((m) => (m ? { ...m, must_change_password: false } : m));
    expect(go('/farmers')).toBe(true);
  });
});
