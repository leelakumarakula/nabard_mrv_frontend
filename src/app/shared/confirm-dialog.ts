import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel?: string;
  /** When set, asks for a note (e.g. rationale); `noteRequired` makes it mandatory. */
  noteLabel?: string;
  noteRequired?: boolean;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.noteLabel) {
        <mat-form-field class="full"><mat-label>{{ data.noteLabel }}</mat-label>
          <textarea matInput rows="3" [formControl]="note"></textarea>
          @if (note.hasError('required') || note.hasError('minlength')) {<mat-error>Please enter at least 3 characters</mat-error>}
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [class.danger]="data.danger" (click)="confirm()">{{ data.confirmLabel ?? 'Confirm' }}</button>
    </mat-dialog-actions>`,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ConfirmDialog>);
  protected readonly note = new FormControl('', this.data.noteRequired ? [Validators.required, Validators.minLength(3)] : []);

  protected confirm(): void {
    this.note.markAsTouched();
    if (this.note.invalid) return;
    this.ref.close({ confirmed: true, note: this.note.value || null });
  }
}

/** Resolves to { note } when confirmed, or undefined when cancelled. */
export function confirmAction(dialog: MatDialog, data: ConfirmData): Promise<{ note: string | null } | undefined> {
  return firstValueFrom(dialog.open(ConfirmDialog, { data, width: '520px', maxWidth: '96vw' }).afterClosed());
}
