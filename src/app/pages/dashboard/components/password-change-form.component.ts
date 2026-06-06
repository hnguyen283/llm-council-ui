import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-password-change-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="password-form-container">
      <h3>Security & Password</h3>

      @if (loginMethod() === 'google') {
        <div class="google-only-msg" role="status">
          <span class="icon">ℹ️</span>
          <p>Password login is not enabled for this account (authenticated via Google SSO).</p>
        </div>
      } @else {
        <form (submit)="submit($event)" aria-label="Change password form">
          <div class="form-group">
            <label for="current-password">Current Password</label>
            <input
              type="password"
              id="current-password"
              name="currentPassword"
              [(ngModel)]="currentPassword"
              required
              [disabled]="saving()"
              autocomplete="current-password"
            />
          </div>

          <div class="form-group">
            <label for="new-password">New Password (min 12 chars)</label>
            <input
              type="password"
              id="new-password"
              name="newPassword"
              [(ngModel)]="newPassword"
              required
              [disabled]="saving()"
              autocomplete="new-password"
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm New Password</label>
            <input
              type="password"
              id="confirm-password"
              name="confirmPassword"
              [(ngModel)]="confirmPassword"
              required
              [disabled]="saving()"
              autocomplete="new-password"
            />
          </div>

          @if (errorMsg()) {
            <div class="error-msg" role="alert">
              ⚠️ {{ errorMsg() }}
            </div>
          }

          @if (successMsg()) {
            <div class="success-msg" role="status">
              ✅ {{ successMsg() }}
            </div>
          }

          <button
            type="submit"
            class="primary"
            [disabled]="isFormInvalid() || saving()"
          >
            {{ saving() ? 'Updating...' : 'Update Password' }}
          </button>
        </form>
      }
    </div>
  `,
  styles: [`
    .password-form-container {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h3 {
      margin: 0;
      font-size: 14px;
      color: var(--text-dim);
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .google-only-msg {
      display: flex;
      gap: 12px;
      align-items: center;
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 6px;
      padding: 12px;
      color: var(--text-dim);
      font-size: 13px;
      line-height: 1.5;
    }
    .google-only-msg p {
      margin: 0;
    }
    .google-only-msg .icon {
      font-size: 16px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    label {
      font-size: 12px;
      color: var(--text-dim);
    }
    input {
      padding: 8px 10px;
    }
    button {
      margin-top: 6px;
      padding: 8px 12px;
      font-size: 13px;
    }
    .error-msg {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--red);
      color: var(--red);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
    }
    .success-msg {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid var(--green);
      color: var(--green);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
    }
  `]
})
export class PasswordChangeFormComponent {
  private auth = inject(AuthService);

  loginMethod = this.auth.loginMethod;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  saving = signal(false);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  isFormInvalid(): boolean {
    return (
      !this.currentPassword.trim() ||
      this.newPassword.length < 12 ||
      this.newPassword !== this.confirmPassword
    );
  }

  submit(event: Event) {
    event.preventDefault();
    if (this.isFormInvalid() || this.saving()) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);

    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.successMsg.set('Password updated successfully. Logging out...');
        // The auth service changePassword call taps clear() which logs us out.
        // The application's auth checks will automatically redirect the user to login.
      },
      error: (err) => {
        this.saving.set(false);
        if (err.error?.code === 'AUTH_INVALID_CURRENT_PASSWORD') {
          this.errorMsg.set('Current password is correct verification failed.');
        } else if (err.error?.message) {
          this.errorMsg.set(err.error.message);
        } else {
          this.errorMsg.set('Failed to update password. Please check your credentials.');
        }
      }
    });
  }
}
