import { Component, inject, signal, OnInit, AfterViewInit, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

declare var google: any;

/**
 * Public Google sign-up page.
 *
 * Removes standard password fields to enforce Google Sign-in as the sole
 * account creation mechanism. Fetches Google Client ID from backend
 * dynamically, initializes Google Identity Services, and renders the button.
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="wrap">
      <div class="card">
        @if (showRegistrationForm()) {
          <h1>Complete account</h1>
          <p class="subtitle">Set your username and an optional password to complete your Google account registration.</p>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <form (ngSubmit)="submitRegistration()">
            <label class="form-field">
              <span>Google Email</span>
              <input type="text" [value]="email()" disabled class="disabled-input" />
            </label>
            <label class="form-field">
              <span>Username</span>
              <input type="text" [(ngModel)]="username" name="username" required autocomplete="username" [disabled]="busy()" />
            </label>
            <label class="form-field">
              <span>Password (Optional, min 12 chars)</span>
              <input type="password" [(ngModel)]="password" name="password" autocomplete="new-password" placeholder="Leave blank for Google-only login" [disabled]="busy()" />
            </label>

            <button class="primary" type="submit" [disabled]="busy() || !username">
              {{ busy() ? 'Completing...' : 'Complete Registration' }}
            </button>
          </form>

          <p class="hint"><a (click)="cancelRegistration()" class="start-over-link">Start over</a></p>
        } @else {
          <h1>Create account</h1>
          <p class="subtitle">Google Sign-in is the only supported method for creating an account.</p>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          @if (busy()) {
            <div class="loading-wrapper">
              <span class="spinner"></span>
              <p class="loading-text">Authenticating with Google…</p>
            </div>
          } @else {
            <div class="google-btn-wrapper">
              <div id="google-signup-btn"></div>
            </div>
          }

          <p class="hint">Already have an account? <a routerLink="/login">Sign in</a></p>
        }
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 400px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px; text-align: center; }
    h1 { margin: 0 0 4px 0; font-size: 22px; }
    .subtitle { margin: 0 0 24px 0; color: var(--text-dim); line-height: 1.4; font-size: 14px; }
    .error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--red); color: var(--red); padding: 10px 12px; border-radius: var(--radius); margin-bottom: 16px; font-size: 13px; text-align: left; }
    .hint { margin-top: 20px; font-size: 12px; color: var(--text-dim); text-align: center; }
    a { color: var(--text); }
    .google-btn-wrapper { display: flex; justify-content: center; margin: 24px 0; min-height: 40px; }
    .loading-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 24px 0; }
    .loading-text { color: var(--text-dim); font-size: 13px; margin: 12px 0 0 0; }
    .spinner { width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    label.form-field { display: block; margin-bottom: 16px; text-align: left; }
    label.form-field span { display: block; margin-bottom: 6px; color: var(--text-dim); font-size: 13px; }
    .disabled-input { opacity: 0.65; cursor: not-allowed; background: var(--bg-elev-2) !important; }
    button { width: 100%; padding: 12px; margin-top: 8px; }
    .start-over-link { cursor: pointer; color: var(--accent); text-decoration: none; }
    .start-over-link:hover { text-decoration: underline; }
    @media (max-width: 480px) {
      .wrap { padding: 12px; }
      .card { padding: 24px 16px; }
    }
  `]
})
export class SignupComponent implements OnInit, AfterViewInit {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  showRegistrationForm = signal(false);
  email = signal('');
  signupToken = signal('');

  username = '';
  password = '';

  busy  = signal(false);
  error = signal<string | null>(null);
  googleClientId = '';

  ngOnInit(): void {
    const storedEmail = sessionStorage.getItem('google_signup_email');
    const storedToken = sessionStorage.getItem('google_signup_token');
    if (storedEmail && storedToken) {
      this.email.set(storedEmail);
      this.signupToken.set(storedToken);
      this.showRegistrationForm.set(true);
      sessionStorage.removeItem('google_signup_email');
      sessionStorage.removeItem('google_signup_token');
    }

    this.auth.getAuthConfig().subscribe({
      next: (config) => {
        this.googleClientId = config.googleClientId;
        if (!this.showRegistrationForm()) {
          this.initGoogleSignIn();
        }
      },
      error: () => {
        this.error.set('Failed to load signup configuration. Please check backend connectivity.');
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.showRegistrationForm()) {
      this.initGoogleSignIn();
    }
  }

  cancelRegistration(): void {
    this.showRegistrationForm.set(false);
    this.email.set('');
    this.signupToken.set('');
    this.username = '';
    this.password = '';
    this.error.set(null);
    setTimeout(() => this.initGoogleSignIn(), 100);
  }

  submitRegistration(): void {
    if (!this.username) return;
    this.busy.set(true);
    this.error.set(null);

    const payload = {
      username: this.username,
      password: this.password ? this.password : undefined,
      signupToken: this.signupToken()
    };

    this.auth.completeGoogleSignup(payload).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        let msg = 'Failed to complete registration.';
        if (err.error && typeof err.error === 'object' && err.error.message) {
          msg = err.error.message;
        }
        this.error.set(msg);
      }
    });
  }

  private initGoogleSignIn(): void {
    if (!this.googleClientId || typeof google === 'undefined') {
      return;
    }

    google.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: (response: any) => this.handleGoogleCredential(response.credential)
    });

    const btnEl = document.getElementById('google-signup-btn');
    if (btnEl) {
      google.accounts.id.renderButton(btnEl, {
        theme: 'outline',
        size: 'large',
        text: 'signup_with',
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
            this.email.set(res.email);
            this.signupToken.set(res.signupToken);
            this.showRegistrationForm.set(true);
            this.busy.set(false);
          } else {
            this.router.navigate(['/dashboard']);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          let message = 'Failed to sign up with Google.';
          const body = err.error;
          if (err.status === 403) {
            message = 'Access denied. Sign up is restricted to authorized email domains.';
          } else if (body && typeof body === 'object' && body.message) {
            message = body.message;
          }
          this.error.set(message);
          setTimeout(() => this.initGoogleSignIn(), 500);
        }
      });
    });
  }
}
