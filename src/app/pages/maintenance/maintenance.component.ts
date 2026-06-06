import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Static page shown when the authentication backend returns
 * {@code AUTH_007} (fail-closed Redis outage in production).
 *
 * Deliberately offers no retry loop — the user has to navigate manually,
 * so we don't tight-loop refreshes against a backend that is already known
 * to be down.
 */
@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>{{ 'Temporarily unavailable' | translate }}</h1>
        <p>{{ 'Authentication is temporarily unavailable.' | translate }}</p>
        <p>{{ 'Please try again in a few minutes.' | translate }}</p>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px; text-align: center; }
    h1 { margin: 0 0 12px 0; font-size: 20px; }
    p  { margin: 0 0 12px 0; color: var(--text-dim); }
  `]
})
export class MaintenanceComponent {}
