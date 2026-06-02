import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';

/**
 * Public sign-up page.
 *
 * Collects username, email, and password (min 12 chars; backend enforces
 * the same), creates the account through {@link AuthService.signup}, and
 * routes to /login with a `reason=signed_up` query param so the login page
 * can render a confirmation banner.
 *
 * Server-returned conflict codes (ACCOUNT_USERNAME_TAKEN /
 * ACCOUNT_EMAIL_TAKEN) are mapped to specific inline messages; everything
 * else collapses to a generic copy.
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>Create account</h1>
        <p class="subtitle">Sign up to run multi-model research jobs</p>

        <form (ngSubmit)="submit(f)" #f="ngForm">
          <label>
            <span>Username</span>
            <input name="username" [(ngModel)]="username"
                   required minlength="3" maxlength="64"
                   autocomplete="username" />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" [(ngModel)]="email"
                   required email autocomplete="email" />
          </label>
          <label>
            <span>Password (min 12 characters)</span>
            <input name="password" type="password" [(ngModel)]="password"
                   required minlength="12" autocomplete="new-password" />
          </label>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <button class="primary" type="submit" [disabled]="busy() || !f.form.valid">
            {{ busy() ? 'Creating…' : 'Create account' }}
          </button>
        </form>

        <p class="hint">Already have an account? <a routerLink="/login">Sign in</a></p>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 400px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px; }
    h1 { margin: 0 0 4px 0; font-size: 22px; }
    .subtitle { margin: 0 0 24px 0; color: var(--text-dim); }
    label { display: block; margin-bottom: 16px; }
    label span { display: block; margin-bottom: 6px; color: var(--text-dim); font-size: 13px; }
    button { width: 100%; padding: 12px; margin-top: 4px; }
    .error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--red); color: var(--red); padding: 10px 12px; border-radius: var(--radius); margin-bottom: 16px; font-size: 13px; }
    .hint { margin-top: 20px; font-size: 12px; color: var(--text-dim); text-align: center; }
    a { color: var(--text); }
  `]
})
export class SignupComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  username = '';
  email    = '';
  password = '';
  busy  = signal(false);
  error = signal<string | null>(null);

  submit(_: NgForm) {
    this.busy.set(true);
    this.error.set(null);
    this.auth.signup(this.username, this.email, this.password).subscribe({
      next: () => this.router.navigate(['/login'], { queryParams: { reason: 'signed_up' } }),
      error: e => {
        this.busy.set(false);
        this.error.set(this.mapError(e));
      }
    });
  }

  private mapError(e: HttpErrorResponse): string {
    const body = e.error;
    // The auth-service may pass through the account-service body as a string
    // (when the upstream returned a 409 with a structured ErrorBody). Try to
    // parse JSON if it looks like one; otherwise fall through.
    let code: string | undefined;
    if (typeof body === 'string') {
      try { code = JSON.parse(body)?.code; } catch { /* ignore */ }
    } else if (body && typeof body === 'object') {
      code = (body as any).code;
    }
    if (code === 'ACCOUNT_USERNAME_TAKEN') return 'That username is already in use.';
    if (code === 'ACCOUNT_EMAIL_TAKEN')    return 'That email already has an account.';
    if (code === 'ACCOUNT_TAKEN' || e.status === 409) {
      return 'That username or email is already in use.';
    }
    if (code === 'AUTH_VALIDATION' || code === 'ACCOUNT_VALIDATION' || e.status === 400) {
      return 'Enter a valid email and a password with at least 12 characters.';
    }
    if (e.status === 0) return 'Gateway is unreachable. Check that the public API endpoint is reachable.';
    if (e.status === 503 || e.status >= 500) return 'Account creation is temporarily unavailable. Please try again shortly.';
    return 'Could not create the account. Please try again.';
  }
}
