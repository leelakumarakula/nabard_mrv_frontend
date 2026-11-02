import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { SILENT_ERRORS } from './http-context';
import { NotifyService, errorMessage } from './notify.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotifyService);
  const isApi = req.url.startsWith(environment.apiBaseUrl);
  const token = auth.token;
  const request = isApi && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const isLogin = req.url.endsWith('/auth/login') || req.url.endsWith('/auth/me');
      if (err.status === 401 && isApi && !isLogin) {
        auth.logout();
      } else if (!req.context.get(SILENT_ERRORS) && !isLogin) {
        notify.error(errorMessage(err));
      }
      return throwError(() => err);
    }),
  );
};
