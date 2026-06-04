import { Component, computed, inject, signal, OnInit, AfterViewInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { AuthCode } from '../../core/error.codes';

declare var google: any;

/**
 * Public sign-in page.
 *
 * Supports traditional username/password login and Google Account sign-in.
 * Reads configurations dynamically from /auth/config to set up Google SSO.
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
            <input type="text" [(ngModel)]="username" name="username" autocomplete="username" required [disabled]="busy()" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" [(ngModel)]="password" name="password" autocomplete="current-password" required [disabled]="busy()" />
          </label>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <button class="primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <div class="divider"><span>OR</span></div>

        <div class="google-btn-wrapper">
          <div id="google-login-btn"></div>
        </div>

        <p class="hint">No account yet? <a routerLink="/signup">Create one</a></p>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 400px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px; }
    h1 { margin: 0 0 4px 0; font-size: 22px; text-align: center; }
    .subtitle { margin: 0 0 24px 0; color: var(--text-dim); text-align: center; font-size: 14px; }
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
    .divider {
      display: flex; align-items: center; text-align: center;
      margin: 20px 0; color: var(--text-dim); font-size: 12px;
    }
    .divider::before, .divider::after {
      content: ''; flex: 1; border-bottom: 1px solid var(--border);
    }
    .divider:not(:empty)::before { margin-right: 12px; }
    .divider:not(:empty)::after { margin-left: 12px; }
    .google-btn-wrapper { display: flex; justify-content: center; margin: 12px 0 24px 0; min-height: 40px; }
    .hint { margin-top: 20px; font-size: 12px; color: var(--text-dim); text-align: center; }
    a { color: var(--text); }
    @media (max-width: 480px) {
      .wrap { padding: 12px; }
      .card { padding: 24px 16px; }
    }
  `]
})
export class LoginComponent implements OnInit, AfterViewInit {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private ngZone = inject(NgZone);

  username = '';
  password = '';
  busy  = signal(false);
  error = signal<string | null>(null);
  googleClientId = '';

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

  ngOnInit(): void {
    this.auth.getAuthConfig().subscribe({
      next: (config) => {
        this.googleClientId = config.googleClientId;
        this.initGoogleSignIn();
      },
      error: () => {
        console.warn('Failed to load Google client ID config. Standard credentials only active.');
      }
    });
  }

  ngAfterViewInit(): void {
    this.initGoogleSignIn();
  }

  private initGoogleSignIn(): void {
    if (!this.googleClientId || typeof google === 'undefined') {
      return;
    }

    google.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: (response: any) => this.handleGoogleCredential(response.credential)
    });

    const btnEl = document.getElementById('google-login-btn');
    if (btnEl) {
      google.accounts.id.renderButton(btnEl, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: '300'
      });
    }
  }

  private handleGoogleCredential(credential: string): void {
    this.ngZone.run(() => {
      this.busy.set(true);
      this.error.set(null);
      this.auth.loginWithGoogle(credential).subscribe({
        next: (res) => {
          if (res && res.code === 'AUTH_GOOGLE_REGISTRATION_REQUIRED') {
            sessionStorage.setItem('google_signup_email', res.email);
            sessionStorage.setItem('google_signup_token', res.signupToken);
            this.router.navigate(['/signup']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          let message = 'Failed to sign in with Google.';
          const body = err.error;
          if (err.status === 403) {
            message = 'Access denied. Sign-in is restricted to authorized email domains.';
          } else if (body && typeof body === 'object' && body.message) {
            message = body.message;
          }
          this.error.set(message);
          setTimeout(() => this.initGoogleSignIn(), 500);
        }
      });
    });
  }

  submit(): void {
    if (!this.username || !this.password) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const body = typeof err.error === 'object' && err.error !== null
          ? err.error as { code?: unknown }
          : null;
        const code = err.headers?.get('X-Auth-Code') || (typeof body?.code === 'string' ? body.code : null);
        if (code === AuthCode.LOCKED)        this.error.set('Account is locked or disabled.');
        else if (code === AuthCode.INVALID || err.status === 401) this.error.set('Username or password is incorrect.');
        else if (err.status === 403)         this.error.set('Access denied. Please sign in with an allowed account.');
        else if (err.status === 0)           this.error.set('Gateway is unreachable. Check that the public API endpoint is reachable.');
        else if (err.status === 503 || err.status >= 500) this.error.set('Authentication is temporarily unavailable. Please try again shortly.');
        else                                  this.error.set('Sign-in failed. Please try again.');
        
        if (code === AuthCode.INVALID || err.status === 401) this.password = '';
      }
    });
  }
}
