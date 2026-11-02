import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Me } from './models';

const TOKEN_KEY = 'mrv.token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) – token stays in memory only */
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(readToken());
  readonly me = signal<Me | null>(null);
  readonly isAuthenticated = computed(() => !!this.tokenSignal() && !!this.me());
  private readonly permissionSet = computed(() => new Set(this.me()?.permissions ?? []));

  get token(): string | null {
    return this.tokenSignal();
  }

  has(permission: string): boolean {
    return this.permissionSet().has(permission);
  }

  hasAny(permissions: string[]): boolean {
    return permissions.some((p) => this.has(p));
  }

  login(email: string, password: string): Observable<Me> {
    // URLSearchParams applies strict form encoding (passwords may contain + & = @ etc.).
    const body = new URLSearchParams({ username: email, password });
    return this.http
      .post<{ access_token: string }>(`${environment.apiBaseUrl}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(
        tap((res) => this.setToken(res.access_token)),
        switchMap(() => this.loadMe()),
      );
  }

  loadMe(): Observable<Me> {
    return this.http.get<Me>(`${environment.apiBaseUrl}/auth/me`).pipe(tap((me) => this.me.set(me)));
  }

  /** Called at start-up: restores the session if a valid token is stored. */
  restore(): Observable<boolean> {
    if (!this.token) return of(false);
    return this.loadMe().pipe(
      map(() => true),
      catchError(() => {
        this.clear();
        return of(false);
      }),
    );
  }

  logout(redirect = true): void {
    this.clear();
    if (redirect) this.router.navigate(['/login']);
  }

  private setToken(token: string): void {
    writeToken(token);
    this.tokenSignal.set(token);
  }

  private clear(): void {
    writeToken(null);
    this.tokenSignal.set(null);
    this.me.set(null);
  }
}
