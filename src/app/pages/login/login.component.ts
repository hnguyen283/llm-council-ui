import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { AuthCode } from '../../core/error.codes';

/**
 * Public sign-in page.
 *
 * Reads a `reason=` query param set by the interceptor / auth-service and
 * renders a calm contextual banner. Reasons:
 *
 *  - expired     — silent refresh failed; please sign in again.
 *  - displaced   — another device signed in; this one was bumped.
 *  - reused      — server detected a reused refresh token (forensic event).
 *  - locked      — too many failed attempts; surface the lock copy.
 *  - disabled    — admin-disabled account.
 *  - invalid     — fall-through copy after a bad-credentials submission.
 *  - logged_out  — neutral "you have been signed out" copy.
 *  - stale       — token version bumped (role/permission change).
 *  - signed_up   — after the signup flow; render a success banner.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>LLM Council</h1>
        <p class="subtitle">Sign in to run multi-model research jobs</p>

        @if (banner()) {
          <div class="banner" [class.success]="banner()!.kind === 'success'">
            {{ banner()!.text }}
          </div>
        }

        <form (ngSubmit)="submit()">
          <label>
            <span>Username</span>
            <input type="text" [(ngModel)]="username" name="username" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" [(ngModel)]="password" name="password" autocomplete="current-password" required />
          </label>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <button class="primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <p class="hint">No account yet? <a routerLink="/signup">Create one</a></p>
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
    .error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--red);
      color: var(--red);
      padding: 10px 12px; border-radius: var(--radius);
      margin-bottom: 16px; font-size: 13px;
    }
    .banner {
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 12px; border-radius: var(--radius);
      margin-bottom: 16px; font-size: 13px;
    }
    .banner.success {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.4);
    }
    .hint { margin-top: 20px; font-size: 12px; color: var(--text-dim); text-align: center; }
    a { color: var(--text); }
  `]
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  username = '';
  password = '';
  busy  = signal(false);
  error = signal<string | null>(null);

  /**
   * Contextual banner derived from the `reason=` query param. Re-evaluated
   * via a Signal so it reacts to route changes without a manual subscribe.
   */
  banner = computed(() => {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    switch (reason) {
      case 'expired':    return { kind: 'info' as const,    text: 'Your session expired. Please sign in again.' };
      case 'displaced':  return { kind: 'info' as const,    text: 'You were signed in on another device.' };
      case 'reused':     return { kind: 'info' as const,    text: 'For your security we ended this session. Please sign in again.' };
      case 'locked':     return { kind: 'info' as const,    text: 'Account locked. Try again in 15 minutes, or contact an administrator.' };
      case 'disabled':   return { kind: 'info' as const,    text: 'This account has been disabled. Contact support if this is unexpected.' };
      case 'stale':      return { kind: 'info' as const,    text: 'Your access has changed. Please sign in again.' };
      case 'logged_out': return { kind: 'info' as const,    text: 'You have been signed out.' };
      case 'signed_up':  return { kind: 'success' as const, text: 'Account created. Sign in below.' };
      default:           return null;
    }
  });

  submit() {
    if (!this.username || !this.password) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const code = err.headers?.get('X-Auth-Code') || (err.error as any)?.code;
        if (code === AuthCode.LOCKED)        this.error.set('Account is locked or disabled.');
        else if (code === AuthCode.INVALID)  this.error.set('Username or password is incorrect.');
        else if (err.status === 503)         this.error.set('Authentication is temporarily unavailable. Please try again shortly.');
        else                                  this.error.set('Sign-in failed. Check the gateway is reachable.');
        // Clear the password field on credential failure for safety.
        if (code === AuthCode.INVALID) this.password = '';
      }
    });
  }
}
