import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, of, shareReplay, tap } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { GeoUnit, Indicator, Organisation, Page, Programme, RecordType, ReportingPeriod, Workstream } from './models';

/** Cached reference lists used by forms and filters. Call refresh() after editing master data.
 * The lists depend on the signed-in user's scope, so the cache belongs to one user and is dropped when the user changes
 * (sign-out, or another person signing in in the same tab). */
@Injectable({ providedIn: 'root' })
export class LookupsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private cache = new Map<string, Observable<any>>();
  private cacheOwner: string | null = null;

  readonly programmes = signal<Programme[]>([]);
  readonly currentProgrammeId = signal<string | null>(null);
  readonly currentProgramme = computed<Programme | null>(
    () => this.programmes().find((p) => p.id === this.currentProgrammeId()) ?? this.programmes()[0] ?? null,
  );

  private cached<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const owner = this.auth.me()?.id ?? null;
    if (owner !== this.cacheOwner) {
      this.cache.clear();
      this.programmes.set([]);
      this.currentProgrammeId.set(null);
      this.cacheOwner = owner;
    }
    if (!this.cache.has(key)) this.cache.set(key, factory().pipe(shareReplay(1)));
    return this.cache.get(key)!;
  }

  refresh(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  loadProgrammes(): Observable<Programme[]> {
    return this.cached('programmes', () =>
      this.api.get<Page<Programme>>('/programmes', { page_size: 200 }).pipe(map((p) => p.items)),
    ).pipe(
      tap((items) => {
        this.programmes.set(items);
        if (!this.currentProgrammeId() && items.length) this.currentProgrammeId.set(items[0].id);
      }),
    );
  }

  periods(programmeId: string | null): Observable<ReportingPeriod[]> {
    if (!programmeId) return of([]);
    return this.cached(`periods:${programmeId}`, () =>
      this.api.get<ReportingPeriod[]>(`/programmes/${programmeId}/reporting-periods`),
    );
  }

  geoUnits(): Observable<GeoUnit[]> {
    return this.cached('geo', () => this.api.get<GeoUnit[]>('/geo-units'));
  }

  organisations(orgType?: string): Observable<Organisation[]> {
    return this.cached(`orgs:${orgType ?? ''}`, () =>
      this.api.get<Page<Organisation>>('/organisations', { org_type: orgType, page_size: 200 }).pipe(map((p) => p.items)),
    );
  }

  indicators(): Observable<Indicator[]> {
    return this.cached('indicators', () =>
      this.api.get<Page<Indicator>>('/indicators', { page_size: 200 }).pipe(map((p) => p.items)),
    );
  }

  workstreams(): Observable<Workstream[]> {
    return this.cached('workstreams', () => this.api.get<Workstream[]>('/workstreams'));
  }

  recordTypes(): Observable<RecordType[]> {
    return this.cached('record-types', () => this.api.get<RecordType[]>('/workstreams/record-types'));
  }

  activities(): Observable<{ activity_code: string; name: string; module_code: string }[]> {
    return this.cached('activities', () => this.api.get<any[]>('/activities'));
  }

  reviewers(): Observable<{ id: string; full_name: string; email: string; can_review: boolean; can_verify: boolean; can_sample: boolean }[]> {
    return this.cached('reviewers', () => this.api.get<any[]>('/mrv/reviewers'));
  }

  calculationMethods(): Observable<{ code: string; version: string; name: string; description: string }[]> {
    return this.cached('methods', () => this.api.get<any[]>('/calculation-methods'));
  }
}
