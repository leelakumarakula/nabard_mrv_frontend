import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);

  success(message: string): void {
    this.snack.open(message, 'OK', { duration: 3500, panelClass: 'snack-success' });
  }

  error(message: string): void {
    this.snack.open(message, 'Dismiss', { duration: 8000, panelClass: 'snack-error' });
  }
}

/** Turn the API error envelope into a readable message. */
export function errorMessage(err: any): string {
  const body = err?.error;
  if (body?.error) {
    const details = Array.isArray(body.error.details)
      ? body.error.details.map((d: any) => (d.field ? `${d.field}: ${d.message}` : d.message ?? d)).join('; ')
      : '';
    return details ? `${body.error.message} – ${details}` : body.error.message;
  }
  if (err?.status === 0) return 'Cannot reach the server. Check your connection.';
  return err?.message ?? 'Something went wrong';
}
