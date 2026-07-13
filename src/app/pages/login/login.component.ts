import { Component, computed, inject, signal, OnInit, AfterViewInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/auth.service';
import { AuthCode } from '../../core/error.codes';
import { LocaleService } from '../../core/locale.service';

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
  imports: [FormsModule, RouterLink, TranslateModule],
  template: `
    <div class="wrap">
      <div class="login-container">
        <!-- Left Column: Welcome and Video -->
        <div class="welcome-section">
          <div class="welcome-header">
            <h2>{{ 'Welcome to LLM Council' | translate }}</h2>
            <p>{{ 'Learn how our multi-model consensus engine researches, analyzes, and cross-references information to deliver high-confidence insights.' | translate }}</p>
          </div>
          <div class="video-container">
            <iframe 
              src="https://www.youtube.com/embed/gVra057_hMk" 
              [title]="'LLM Council Introduction Video' | translate" 
              frameborder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              referrerpolicy="strict-origin-when-cross-origin" 
              allowfullscreen
            ></iframe>
          </div>
        </div>

        <!-- Right Column: Login Card -->
        <div class="card">
          <h1>{{ 'LLM Council' | translate }}</h1>
          <p class="subtitle">{{ 'Sign in to run multi-model research jobs' | translate }}</p>

          @if (banner()) {
            <div class="banner" [class.success]="banner()!.kind === 'success'">
              {{ banner()!.text }}
            </div>
          }

          <form (ngSubmit)="submit()">
            <label>
              <span>{{ 'Username' | translate }}</span>
              <input type="text" [(ngModel)]="username" name="username" autocomplete="username" required [disabled]="busy()" />
            </label>
            <label>
              <span>{{ 'Password' | translate }}</span>
              <input type="password" [(ngModel)]="password" name="password" autocomplete="current-password" required [disabled]="busy()" />
            </label>

            @if (error()) {
              <div class="error">{{ error() }}</div>
            }

            <button class="primary" type="submit" [disabled]="busy()">
              {{ (busy() ? 'Signing in...' : 'Sign in') | translate }}
            </button>
          </form>

          <div class="divider"><span>{{ 'OR' | translate }}</span></div>

          <div class="google-btn-wrapper">
            <div id="google-login-btn"></div>
          </div>

          <p class="hint">{{ 'No account yet?' | translate }} <a routerLink="/signup">{{ 'Create one' | translate }}</a></p>
        </div>
      </div>

      <!-- Donate Panel -->
      <div class="donate-panel">
        <div class="donate-header">
          <h3>{{ 'Donate to Support Us' | translate }}</h3>
          <p>{{ 'Support the ongoing development of LLM Council. Scan a QR code or copy the address below.' | translate }}</p>
        </div>
        <div class="donate-wallets">
          <!-- Ethereum Wallet -->
          <div class="wallet-card">
            <div class="wallet-qr" [title]="'Ethereum Wallet QR Code' | translate">
              <img src="/ethereumWallet.png" [alt]="'Ethereum Wallet QR Code' | translate" />
            </div>
            <div class="wallet-info">
              <span class="wallet-network">{{ 'Ethereum Network (ERC-20)' | translate }}</span>
              <div class="wallet-address-wrapper">
                <code class="wallet-address">{{ ethAddress }}</code>
                <div class="wallet-actions">
                  <button type="button" class="copy-btn" [class.copied]="ethCopied()" (click)="copyAddress(ethAddress, 'eth')">
                    @if (ethCopied()) {
                      <span>✓ {{ 'Copied!' | translate }}</span>
                    } @else {
                      <span>📋 {{ 'Copy Address' | translate }}</span>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Solana Wallet -->
          <div class="wallet-card">
            <div class="wallet-qr" [title]="'Solana Wallet QR Code' | translate">
              <img src="/solanaWallet.png" [alt]="'Solana Wallet QR Code' | translate" />
            </div>
            <div class="wallet-info">
              <span class="wallet-network">{{ 'Solana Network' | translate }}</span>
              <div class="wallet-address-wrapper">
                <code class="wallet-address">{{ solAddress }}</code>
                <div class="wallet-actions">
                  <button type="button" class="copy-btn" [class.copied]="solCopied()" (click)="copyAddress(solAddress, 'sol')">
                    @if (solCopied()) {
                      <span>✓ {{ 'Copied!' | translate }}</span>
                    } @else {
                      <span>📋 {{ 'Copy Address' | translate }}</span>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wrap {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
      background: var(--bg);
      gap: 48px;
    }
    .login-container {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 48px;
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
    }
    .welcome-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    .welcome-header h2 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 800;
      color: var(--text);
      background: linear-gradient(135deg, var(--text) 50%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .welcome-header p {
      margin: 0;
      font-size: 14px;
      color: var(--text-dim);
      line-height: 1.6;
    }
    .video-container {
      width: 100%;
      border-radius: var(--radius);
      overflow: hidden;
      aspect-ratio: 16 / 9;
      background: #000;
      border: 1px solid var(--border);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    }
    .video-container iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .card {
      width: 100%;
      max-width: 400px;
      flex-shrink: 0;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    }
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

    /* Donate Panel */
    .donate-panel {
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
    .donate-header {
      text-align: center;
    }
    .donate-header h3 {
      margin: 0 0 6px 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }
    .donate-header p {
      margin: 0;
      font-size: 12.5px;
      color: var(--text-dim);
    }
    .donate-wallets {
      display: flex;
      flex-direction: row;
      gap: 24px;
    }
    .wallet-card {
      flex: 1;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .wallet-qr {
      width: 88px;
      height: 88px;
      background: white;
      border-radius: 6px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease;
    }
    .wallet-qr:hover {
      transform: scale(1.05);
    }
    .wallet-qr img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .wallet-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .wallet-network {
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
    }
    .wallet-address-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .wallet-address {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: var(--text);
      background: rgba(0, 0, 0, 0.2);
      padding: 6px 8px;
      border-radius: 4px;
      word-break: break-all;
      user-select: all;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .wallet-actions {
      display: flex;
      gap: 8px;
    }
    .copy-btn {
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(59, 130, 246, 0.1);
      border-color: rgba(59, 130, 246, 0.3);
      color: var(--accent);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .copy-btn:hover {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .copy-btn.copied {
      background: rgba(16, 185, 129, 0.15);
      border-color: var(--green);
      color: var(--green);
    }
    
    @media (max-width: 899px) {
      .login-container {
        flex-direction: column;
        gap: 32px;
        max-width: 500px;
      }
      .welcome-section {
        width: 100%;
      }
      .card {
        width: 100%;
        max-width: 100%;
      }
      .donate-wallets {
        flex-direction: column;
        gap: 16px;
      }
    }
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
  private locale = inject(LocaleService);

  ethAddress = '0xA0fd4299497615d7023410f6efe2D0Ca5D26d145';
  solAddress = 'HjJJgLghS85JHkb1awrDa6FBwsALPECJNZYmmYKxTXKL';
  ethCopied = signal(false);
  solCopied = signal(false);

  copyAddress(address: string, network: 'eth' | 'sol'): void {
    navigator.clipboard.writeText(address).then(() => {
      if (network === 'eth') {
        this.ethCopied.set(true);
        setTimeout(() => this.ethCopied.set(false), 2000);
      } else {
        this.solCopied.set(true);
        setTimeout(() => this.solCopied.set(false), 2000);
      }
    });
  }

  username = '';
  password = '';
  busy  = signal(false);
  error = signal<string | null>(null);
  googleClientId = '';

  banner = computed(() => {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    switch (reason) {
      case 'expired':    return { kind: 'info' as const,    text: this.locale.instant('Your session expired. Please sign in again.') };
      case 'displaced':  return { kind: 'info' as const,    text: this.locale.instant('You were signed in on another device.') };
      case 'reused':     return { kind: 'info' as const,    text: this.locale.instant('For your security we ended this session. Please sign in again.') };
      case 'locked':     return { kind: 'info' as const,    text: this.locale.instant('Account locked. Try again in 15 minutes, or contact an administrator.') };
      case 'disabled':   return { kind: 'info' as const,    text: this.locale.instant('This account has been disabled. Contact support if this is unexpected.') };
      case 'stale':      return { kind: 'info' as const,    text: this.locale.instant('Your access has changed. Please sign in again.') };
      case 'logged_out': return { kind: 'info' as const,    text: this.locale.instant('You have been signed out.') };
      case 'signed_up':  return { kind: 'success' as const, text: this.locale.instant('Account created. Sign in below.') };
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
          let message = this.locale.instant('Failed to sign in with Google.');
          const body = err.error;
          const code = err.headers?.get('X-Auth-Code') || (body && typeof body === 'object' && typeof body.code === 'string' ? body.code : null);
          if (code === 'AUTH_GOOGLE_DOMAIN_DENIED') {
            message = this.locale.instant('Access denied. Sign-in is restricted to authorized email domains.');
          } else if (body && typeof body === 'object' && body.message) {
            message = body.message;
          } else if (err.status === 403) {
            message = this.locale.instant('Access denied. Please sign in with an allowed account.');
          } else if (err.status === 503 || err.status >= 500) {
            message = this.locale.instant('Authentication is temporarily unavailable. Please try again shortly.');
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
        if (code === AuthCode.LOCKED)        this.error.set(this.locale.instant('Account is locked or disabled.'));
        else if (code === AuthCode.INVALID || err.status === 401) this.error.set(this.locale.instant('Username or password is incorrect.'));
        else if (err.status === 403)         this.error.set(this.locale.instant('Access denied. Please sign in with an allowed account.'));
        else if (err.status === 0)           this.error.set(this.locale.instant('Gateway is unreachable. Check that the public API endpoint is reachable.'));
        else if (err.status === 503 || err.status >= 500) this.error.set(this.locale.instant('Authentication is temporarily unavailable. Please try again shortly.'));
        else                                  this.error.set(this.locale.instant('Sign-in failed. Please try again.'));
        
        if (code === AuthCode.INVALID || err.status === 401) this.password = '';
      }
    });
  }
}
