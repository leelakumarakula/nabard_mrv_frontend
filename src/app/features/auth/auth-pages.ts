import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { Notice, PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <img class="auth-logo" src="brand/varsapradaya-logo.svg" alt="Varsapradaya" />
        <h1>Coffee Climate Resilience MRV</h1>
        <p class="tagline">Measurement, reporting and verification for climate-resilient coffee landscapes</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" autocomplete="username" /></mat-form-field>
          <mat-form-field><mat-label>Password</mat-label><input matInput type="password" formControlName="password" autocomplete="current-password" /></mat-form-field>
          @if (error()) {<p class="error-text" role="alert">{{ error() }}</p>}
          <button mat-flat-button type="submit" [disabled]="busy()">Sign in</button>
          <a routerLink="/forgot-password" class="small">Forgot password?</a>
        </form>
      </div>
    </div>`,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly returnUrl = input<string>('/dashboard');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.form.value.email!, this.form.value.password!).subscribe({
      next: (me) => {
        this.busy.set(false);
        this.router.navigateByUrl(me.must_change_password ? '/profile' : this.returnUrl() || '/dashboard');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterLink, Notice],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <img class="auth-logo" src="brand/varsapradaya-logo.svg" alt="Varsapradaya" />
        <h1>Reset password</h1>
        @if (!message()) {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" /></mat-form-field>
            <button mat-flat-button type="submit" [disabled]="form.invalid">Send reset instructions</button>
          </form>
        } @else {
          <p>{{ message() }}</p>
          @if (devToken()) {
            <app-notice kind="warning">No email service is configured in this environment. Development reset link:
              <a [routerLink]="['/reset-password']" [queryParams]="{ token: devToken() }">set a new password</a></app-notice>
          }
        }
        <a routerLink="/login" class="small">Back to sign in</a>
      </div>
    </div>`,
})
export class ForgotPasswordPage {
  private readonly api = inject(ApiService);
  protected readonly message = signal('');
  protected readonly devToken = signal<string | null>(null);
  protected readonly form = new FormGroup({ email: new FormControl('', [Validators.required, Validators.email]) });

  protected submit(): void {
    this.api.post<{ message: string; dev_reset_token: string | null }>('/auth/forgot-password', this.form.value)
      .subscribe((r) => {
        this.message.set(r.message);
        this.devToken.set(r.dev_reset_token);
      });
  }
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <img class="auth-logo" src="brand/varsapradaya-logo.svg" alt="Varsapradaya" />
        <h1>Choose a new password</h1>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field><mat-label>New password (min. 10 characters)</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="new-password" /></mat-form-field>
          <mat-form-field><mat-label>Confirm password</mat-label>
            <input matInput type="password" formControlName="confirm" autocomplete="new-password" /></mat-form-field>
          @if (error()) {<p class="error-text">{{ error() }}</p>}
          <button mat-flat-button type="submit">Set password</button>
        </form>
        <a routerLink="/login" class="small">Back to sign in</a>
      </div>
    </div>`,
})
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  readonly token = input<string>('');
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    password: new FormControl('', [Validators.required, Validators.minLength(10)]),
    confirm: new FormControl('', Validators.required),
  });

  protected submit(): void {
    const { password, confirm } = this.form.value;
    if (this.form.invalid || password !== confirm) {
      this.error.set('Passwords must match and be at least 10 characters.');
      return;
    }
    this.api.post('/auth/reset-password', { token: this.token(), new_password: password }).subscribe(() => {
      this.notify.success('Password reset. Please sign in.');
      this.router.navigate(['/login']);
    });
  }
}

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, PageHeader, Notice],
  template: `
    <app-page-header title="Profile" [subtitle]="auth.me()?.email" />
    @if (auth.me()?.must_change_password) {<app-notice kind="warning">Please change your temporary password.</app-notice>}
    <div class="grid-2">
      <section class="panel">
        <h3>Your details</h3>
        <form [formGroup]="profile" (ngSubmit)="saveProfile()" class="form-grid">
          <mat-form-field class="span-2"><mat-label>Full name</mat-label><input matInput formControlName="full_name" /></mat-form-field>
          <mat-form-field class="span-2"><mat-label>Phone</mat-label><input matInput formControlName="phone" /></mat-form-field>
          <div class="span-2"><p class="muted small">Roles: {{ roles() }}</p></div>
          <div class="span-2 actions"><button mat-flat-button type="submit">Save</button></div>
        </form>
      </section>
      <section class="panel">
        <h3>Change password</h3>
        <form [formGroup]="password" (ngSubmit)="changePassword()" class="form-grid">
          <mat-form-field class="span-2"><mat-label>Current password</mat-label><input matInput type="password" formControlName="current_password" /></mat-form-field>
          <mat-form-field class="span-2"><mat-label>New password (min. 10)</mat-label><input matInput type="password" formControlName="new_password" /></mat-form-field>
          <div class="span-2 actions"><button mat-flat-button type="submit" [disabled]="password.invalid">Change password</button></div>
        </form>
      </section>
    </div>`,
})
export class ProfilePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  protected readonly profile = new FormGroup({ full_name: new FormControl(''), phone: new FormControl('') });
  protected readonly password = new FormGroup({
    current_password: new FormControl('', Validators.required),
    new_password: new FormControl('', [Validators.required, Validators.minLength(10)]),
  });

  ngOnInit(): void {
    const me = this.auth.me();
    this.profile.setValue({ full_name: me?.full_name ?? '', phone: me?.phone ?? '' });
  }

  protected roles(): string {
    return this.auth.me()?.roles.map((r) => r.label).join(', ') ?? '';
  }

  protected saveProfile(): void {
    this.api.patch('/auth/me', this.profile.value).subscribe(() => {
      this.auth.loadMe().subscribe();
      this.notify.success('Profile saved');
    });
  }

  protected changePassword(): void {
    this.api.post('/auth/change-password', this.password.value).subscribe(() => {
      this.password.reset();
      this.auth.loadMe().subscribe();
      this.notify.success('Password changed');
    });
  }
}

@Component({
  selector: 'app-access-denied',
  imports: [MatIconModule, MatButtonModule, RouterLink],
  template: `
    <section class="panel" style="text-align:center; padding: 48px">
      <mat-icon style="font-size:48px;height:48px;width:48px" class="muted">lock</mat-icon>
      <h1 style="justify-content:center">Access denied</h1>
      <p class="muted">Your role or assigned geography does not include this page. Contact your programme administrator.</p>
      <a mat-flat-button routerLink="/dashboard">Go to dashboard</a>
    </section>`,
})
export class AccessDeniedPage {}
