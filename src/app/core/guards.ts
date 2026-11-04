import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Requires a signed-in user. Route data `perm` (string | string[]) additionally requires any listed permission.
 * Frontend checks only shape navigation – the backend enforces every permission. */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.me()?.must_change_password && !state.url.startsWith('/profile')) {
    // The server refuses everything else until the temporary password is changed.
    return router.createUrlTree(['/profile']);
  }
  const perm = route.data?.['perm'] as string | string[] | undefined;
  if (perm && !auth.hasAny(Array.isArray(perm) ? perm : [perm])) {
    return router.createUrlTree(['/access-denied']);
  }
  return true;
};
