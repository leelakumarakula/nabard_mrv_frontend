import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { SILENT_ERRORS } from './http-context';
import { NotifyService, errorMessage } from './notify.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotifyService);
  const router = inject(Router);
  const isApi = req.url.startsWith(environment.apiBaseUrl);
  const token = auth.token;
  const request = isApi && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const isLogin = req.url.endsWith('/auth/login') || req.url.endsWith('/auth/me');
      if (err.status === 401 && isApi && !isLogin) {
        auth.logout();
      } else if (err.status === 403 && err.error?.error?.code === 'password_change_required') {
        router.navigate(['/profile']);  // expected until the temporary password is changed; the profile page explains it
      } else if (!req.context.get(SILENT_ERRORS) && !isLogin) {
        notify.error(errorMessage(err));
      }
      return throwError(() => err);
    }),
  );
};
