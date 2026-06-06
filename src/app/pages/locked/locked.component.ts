import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Static page shown when an account is locked or disabled.
 *
 * Reached from the login page's reason-driven copy switch when a user lands
 * with {@code ?reason=locked} or {@code ?reason=disabled}, or via direct
 * navigation. Deliberately gives no lock-window detail (the backend doesn't
 * surface it beyond the high-level state).
 */
@Component({
  selector: 'app-locked',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>{{ 'Account locked' | translate }}</h1>
        <p>{{ 'Your account is temporarily locked.' | translate }}</p>
        <p>{{ 'Try again in a few minutes, or contact an administrator if the lock persists.' | translate }}</p>
        <a routerLink="/login" class="link">{{ 'Back to sign in' | translate }}</a>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px; text-align: center; }
    h1 { margin: 0 0 12px 0; font-size: 20px; }
    p  { margin: 0 0 12px 0; color: var(--text-dim); }
    .link { display: inline-block; margin-top: 16px; color: var(--text); }
  `]
})
export class LockedComponent {}
