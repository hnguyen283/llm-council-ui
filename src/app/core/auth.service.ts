import { Injectable, computed, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, map } from 'rxjs';
import { DeviceIdService } from './device-id.service';

/** Shape of the bearer token response returned by /auth/login and /auth/refresh. */
export interface TokenResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/**
 * Singleton authentication service used by guards, interceptors, and
 * page components.
 *
 * Storage model (replaces the legacy localStorage approach):
 *  - The access token is held in JavaScript memory only. A page reload
 *    drops it; refresh() recovers it silently from the HttpOnly
 *    refresh-token cookie set by the server.
 *  - The refresh token is in an HttpOnly + Secure + SameSite=Strict
 *    cookie scoped to /auth, written by the server on /auth/login. The
 *    SPA never sees it.
 *
 * Compared to the previous implementation:
 *  - removed localStorage.getItem('aio.token') - keeping the access JWT
 *    in storage was the main XSS exfiltration target.
 *  - added signup() and refresh() flows wired to the new endpoints.
 *  - added userId derived from the JWT sub claim for components that
 *    need to render or scope by the current user without re-fetching.
 *  - added sid derived from the JWT sid claim for job-session caching:
 *    one active record per (userId, sid) so a new login displaces the
 *    prior session's cached job (ADR 1).
 *  - logout no longer sends userId in the request body - the server
 *    derives identity from the HttpOnly refresh cookie pair, so the
 *    body field is unnecessary and was historically a force-logout
 *    vector.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private deviceId = inject(DeviceIdService);

  private accessToken = signal<string | null>(null);
  private userId      = signal<string | null>(null);
  private tokenExpiresAt = signal<number | null>(null);
  /**
   * Decoded sid claim from the current access token. Used by the
   * job-session cache to key its single active-job record so a
   * different auth session - including the same user logging in
   * again after a logout - does not see the prior session's cached
   * job.
   */
  private sessionId   = signal<string | null>(null);

  readonly token           = this.accessToken.asReadonly();
  readonly sid             = this.sessionId.asReadonly();
  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  login(username: string, password: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(
        '/auth/login',
        { username, password },
        { withCredentials: true, headers: this.deviceHeaders() }
      )
      .pipe(tap(r => this.adoptAccess(r.accessToken, r.expiresIn)));
  }

  signup(username: string, email: string, password: string): Observable<void> {
    return this.http.post<void>(
      '/auth/signup',
      { username, email, password },
      { withCredentials: true }
    );
  }

  /**
   * Called on app boot and on 401/AUTH_001. Returns true when the silent
   * refresh succeeds; false when no refresh cookie is present, the cookie
   * has expired, or the family was revoked. On failure the local state is
   * cleared so the caller can route to /login.
   */
  refresh(): Observable<boolean> {
    return this.http
      .post<TokenResponse>(
        '/auth/refresh',
        {},
        { withCredentials: true, headers: this.deviceHeaders() }
      )
      .pipe(
        tap(r => this.adoptAccess(r.accessToken, r.expiresIn)),
        map(() => true),
        catchError(() => { this.clear(); return of(false); })
      );
  }

  refreshIfNeeded(skewSeconds = 30): Observable<boolean> {
    const expiresAt = this.tokenExpiresAt();
    if (!this.accessToken() || !expiresAt || expiresAt - Date.now() <= skewSeconds * 1000) {
      return this.refresh();
    }
    return of(true);
  }

  /**
   * Ends the server-side session and clears local in-memory state.
   *
   * Identity is derived server-side from the refresh_fid / refresh_token
   * HttpOnly cookie pair (sent automatically via withCredentials: true).
   * We deliberately do NOT send a userId field in the body - the
   * backend's production posture rejects it as untrusted, and including
   * it would propagate the historical "logout-anyone" bug. The empty {}
   * body placates content-type negotiation without leaking identity.
   *
   * Local state is cleared regardless of the HTTP outcome so the UI can
   * route to /login even when the backend is unreachable (the access
   * token is short-lived; the user-visible logout completes either
   * way).
   */
  logout(): Observable<void> {
    return this.http
      .post<void>('/auth/logout', {}, { withCredentials: true, headers: this.deviceHeaders() })
      .pipe(
        tap(() => this.clear()),
        catchError(() => { this.clear(); return of(undefined); })
      );
  }

  /** Synchronous accessor for the current user-id (decoded from the JWT sub). */
  currentUserId(): string | null { return this.userId(); }

  /**
   * Synchronous accessor for the current auth session id (decoded from
   * the JWT sid claim). Returns null when no token is in memory or
   * when the token is malformed. Job-session caching keys its records
   * by (userId, sid) so a new login displacing the prior session loses
   * access to the old active job - see ADR 1 in the architecture
   * report.
   */
  currentSessionId(): string | null { return this.sessionId(); }

  // ---------- internals ----------

  private adoptAccess(jwt: string, expiresIn?: number): void {
    this.accessToken.set(jwt);
    const claims = this.decodeClaims(jwt);
    this.userId.set(claims.sub);
    this.sessionId.set(claims.sid);
    const expiresAt = typeof expiresIn === 'number' && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : (typeof claims.exp === 'number' ? claims.exp * 1000 : null);
    this.tokenExpiresAt.set(expiresAt);
  }

  private clear(): void {
    this.accessToken.set(null);
    this.userId.set(null);
    this.sessionId.set(null);
    this.tokenExpiresAt.set(null);
  }

  /**
   * Naive client-side JWT payload decode. The token has already been
   * validated server-side; we just need the sub and sid claims for
   * local cache keying. Returns nulls on any malformed input rather
   * than throwing - the caller treats "no identity" as "no resume".
   */
  private decodeClaims(jwt: string): { sub: string | null; sid: string | null; exp: number | null } {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return { sub: null, sid: null, exp: null };
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      // Pad to a multiple of 4 - base64url payloads omit trailing '='.
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const json = atob(padded);
      const obj = JSON.parse(json) as { sub?: unknown; sid?: unknown; exp?: unknown };
      return {
        sub: typeof obj.sub === 'string' ? obj.sub : null,
        sid: typeof obj.sid === 'string' ? obj.sid : null,
        exp: typeof obj.exp === 'number' ? obj.exp : null,
      };
    } catch {
      return { sub: null, sid: null, exp: null };
    }
  }

  private deviceHeaders(): Record<string, string> {
    return { 'X-Device-Id': this.deviceId.current() };
  }
}
