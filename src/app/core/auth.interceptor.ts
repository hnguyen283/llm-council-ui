import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { AuthCode, reasonFor } from './error.codes';
import { WorkspaceService } from './workspace.service';

/**
 * Endpoints that must NEVER carry the Authorization header — these are the
 * credential-exchange paths themselves.
 */
const SKIP = ['/auth/login', '/auth/refresh', '/auth/signup'];

/**
 * Outbound HTTP interceptor.
 *
 * Responsibilities:
 *  1. Attach `Authorization: Bearer <access>` on every protected call.
 *  2. Include `withCredentials: true` on every call so the HttpOnly refresh
 *     cookie is sent on /auth/refresh and /auth/logout.
 *  3. On 401/AUTH_001 transparently call /auth/refresh and retry the
 *     original request once. Everything else 401 (displaced, reused,
 *     locked, invalid) routes to /login with a stable `reason=` query
 *     param. 503/AUTH_007 routes to /maintenance.
 *
 * The interceptor never silently retries on AUTH_002 / AUTH_003 / AUTH_004 —
 * those are genuine session termination, not transient expiry.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const workspace = inject(WorkspaceService);

  const skip = SKIP.some(p => req.url.includes(p));
  const t    = auth.token();
  const workspaceId = !skip ? workspace.headerValue() : null;
  const headers: Record<string, string> = {};
  if (!skip && t) headers['Authorization'] = `Bearer ${t}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  const authed = req.clone({ setHeaders: headers, withCredentials: true });

  return next(authed).pipe(
    catchError((err: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
      const code = err.headers?.get('X-Auth-Code') || (err.error as any)?.code;

      // 1. Backend unavailable: hard-route to /maintenance.
      if (err.status === 503 && code === AuthCode.BACKEND) {
        router.navigate(['/maintenance']);
        return throwError(() => err);
      }

      // 2. Expired access token: silently refresh + retry once.
      if (err.status === 401 && code === AuthCode.EXPIRED && !skip) {
        return auth.refresh().pipe(switchMap(ok => {
          if (!ok) {
            router.navigate(['/login'], { queryParams: { reason: 'expired' } });
            return throwError(() => err);
          }
          const t2 = auth.token();
          const retryHeaders: Record<string, string> = {};
          if (t2) retryHeaders['Authorization'] = `Bearer ${t2}`;
          const retryWorkspaceId = workspace.headerValue();
          if (retryWorkspaceId) retryHeaders['X-Workspace-Id'] = retryWorkspaceId;
          const retry = req.clone({
            setHeaders: retryHeaders,
            withCredentials: true,
          });
          return next(retry);
        }));
      }

      // 3. Any other 401: route to /login with a reason. Don't retry.
      if (err.status === 401 && !skip) {
        router.navigate(['/login'], { queryParams: { reason: reasonFor(code) } });
      }

      return throwError(() => err);
    })
  );
};
