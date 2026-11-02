import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { SILENT_ERRORS } from './http-context';

export type Params = Record<string, string | number | boolean | null | undefined | string[]>;

/** Typed wrapper over HttpClient for the MRV API. Empty/null query params are dropped. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiBaseUrl;

  /** `silent` skips the global error toast so the caller can handle expected errors (e.g. 403). */
  get<T>(path: string, params?: Params, options: { silent?: boolean } = {}): Observable<T> {
    const context = new HttpContext().set(SILENT_ERRORS, !!options.silent);
    return this.http.get<T>(this.url(path), { params: toParams(params), context });
  }

  post<T>(path: string, body: unknown = {}, params?: Params): Observable<T> {
    return this.http.post<T>(this.url(path), body, { params: toParams(params) });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  upload<T>(path: string, form: FormData): Observable<T> {
    return this.http.post<T>(this.url(path), form);
  }

  blob(path: string, params?: Params): Observable<Blob> {
    return this.http.get(this.url(path), { params: toParams(params), responseType: 'blob' });
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

export function toParams(params?: Params): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => (result = result.append(key, v)));
    else result = result.set(key, String(value));
  }
  return result;
}

/** Save a Blob as a file in the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
