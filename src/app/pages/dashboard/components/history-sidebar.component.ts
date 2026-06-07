import { Component, input, output, model, signal, HostListener, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PromptCacheEntry } from '../../../core/prompt-cache.service';
import { LOCALES, LocaleService } from '../../../core/locale.service';
import { PasswordChangeFormComponent } from './password-change-form.component';
import { UsageSummaryCardComponent } from './usage-summary-card.component';
import { UserUsage } from '../../../core/usage.service';

@Component({
  selector: 'app-history-sidebar',
  standalone: true,
  imports: [CommonModule, TranslateModule, PasswordChangeFormComponent, UsageSummaryCardComponent],
  template: `
    <!-- Backdrop Overlay for Mobile -->
    @if (isOpen()) {
      <div 
        class="backdrop" 
        (click)="closeSidebar()" 
        aria-hidden="true">
      </div>
    }

    <nav 
      class="sidebar-container" 
      [class.open]="isOpen()"
      id="history-drawer"
      [attr.aria-label]="'Research history' | translate"
      [attr.aria-hidden]="!isOpen()"
    >
      <!-- Compressed Header -->
      <div class="sidebar-header">
        <h2>{{ 'Research History' | translate }}</h2>
        <button 
          type="button" 
          class="close-btn" 
          (click)="closeSidebar()" 
          [attr.aria-label]="'Close research history' | translate"
          [attr.aria-expanded]="isOpen()"
          aria-controls="history-drawer"
        >
          &times;
        </button>
      </div>

      <!-- Compressed History Items List -->
      <div class="history-list" role="list">
        @if (recentQueries().length === 0) {
          <div class="empty-state">{{ 'No history items found.' | translate }}</div>
        } @else {
          @for (item of recentQueries(); track item.timestamp) {
            <button 
              type="button" 
              class="history-item" 
              role="listitem"
              (click)="selectItem(item)"
              [attr.aria-label]="'Reopen research for: {{query}}' | translate:{ query: item.query }"
            >
              <div class="item-main">
                <span class="item-title">{{ item.query }}</span>
                <span class="item-preview">{{ getPreviewText(item) }}</span>
              </div>
              <div class="item-footer">
                <span class="badge state-{{ item.status.state.toLowerCase() }}">{{ getStatusLabel(item.status.state) }}</span>
                <span class="item-time">{{ timeSinceTimestamp(item.timestamp) }}</span>
                <span class="item-locale">{{ getLocaleLabel(item.locale) }}</span>
              </div>
            </button>
          }
        }
      </div>

      <!-- Consolidated Bottom Settings Section -->
      <div class="sidebar-footer">
        <hr class="footer-divider" />

        <!-- Language Switcher Row -->
        <div class="footer-row lang-row">
          <span class="footer-label">{{ 'Language:' | translate }}</span>
          <div class="lang-buttons" role="group" [attr.aria-label]="'Language Switcher' | translate">
            @for (l of locales(); track l.code) {
              <button
                type="button"
                class="lang-btn"
                [class.active]="locale() === l.code"
                (click)="setLocale.emit(l.code)"
                [title]="l.label | translate"
              >
                {{ l.short }}
              </button>
            }
          </div>
        </div>

        <!-- Collapsible Usage Overview -->
        <div class="footer-collapsible">
          <button 
            type="button" 
            class="footer-trigger" 
            [attr.aria-expanded]="usageExpanded()"
            (click)="toggleUsage()"
          >
            <span class="chevron" [class.open]="usageExpanded()" aria-hidden="true">&#9656;</span>
            <span>{{ 'Usage Overview' | translate }}</span>
          </button>
          @if (usageExpanded()) {
            <div class="footer-collapsible-content">
              <app-usage-summary-card
                [usage]="usage()"
                [loading]="loading()"
                [error]="error()"
              ></app-usage-summary-card>
            </div>
          }
        </div>

        <!-- Collapsible Account Settings -->
        <div class="footer-collapsible">
          <button 
            type="button" 
            class="footer-trigger" 
            [attr.aria-expanded]="settingsExpanded()"
            (click)="toggleSettings()"
          >
            <span class="chevron" [class.open]="settingsExpanded()" aria-hidden="true">&#9656;</span>
            <span>{{ 'Account Settings' | translate }}</span>
          </button>
          @if (settingsExpanded()) {
            <div class="footer-collapsible-content">
              <div class="profile-compact-details">
                <div><span class="lbl">{{ 'User:' | translate }}</span> <span class="val">{{ username() || 'N/A' }}</span></div>
                <div><span class="lbl">{{ 'Email:' | translate }}</span> <span class="val">{{ email() || 'N/A' }}</span></div>
                <div><span class="lbl">{{ 'Method:' | translate }}</span> <span class="val capitalize">{{ (loginMethod() || 'Password') | translate }}</span></div>
              </div>
              <app-password-change-form></app-password-change-form>
            </div>
          }
        </div>

        <!-- Logout Button -->
        <button (click)="logout.emit()" class="footer-logout-btn">
          {{ 'Log Out' | translate }}
        </button>
      </div>
    </nav>
  `,
  styles: [`
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }

    .capitalize {
      text-transform: capitalize;
    }

    /* Backdrop overlay on mobile */
    .backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(2px);
      z-index: 90;
      transition: opacity 0.3s ease;
    }

    /* Left Sidebar container */
    .sidebar-container {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 290px;
      background: var(--bg-elev);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      min-height: 0;
      z-index: 95;
      transform: translateX(-100%);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 10px 0 25px rgba(0, 0, 0, 0.15);
    }

    .sidebar-container.open {
      transform: translateX(0);
    }

    /* Compressed Sidebar Header */
    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      flex: 0 0 auto;
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .close-btn {
      background: transparent;
      border: none;
      font-size: 20px;
      color: var(--text-dim);
      cursor: pointer;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: color 0.15s, background-color 0.15s;
    }

    .close-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }

    /* History List */
    .history-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty-state {
      padding: 24px 0;
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
    }

    /* Compressed History Items */
    .history-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      padding: 10px;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      min-height: 44px; /* Touch target */
    }

    .history-item:hover {
      background: rgba(59, 130, 246, 0.06);
      border-color: rgba(59, 130, 246, 0.25);
    }

    .item-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .item-title {
      font-weight: 600;
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-preview {
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 1; /* 1-line preview only */
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .item-footer {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--text-dim);
      flex-wrap: wrap;
    }

    .item-time {
      margin-right: auto;
      font-variant-numeric: tabular-nums;
    }

    .item-locale {
      padding: 0px 3px;
      border: 1px solid var(--border);
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
      font-size: 8px;
    }

    /* Badges */
    .badge {
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 8.5px;
      text-transform: uppercase;
    }
    .badge.state-pending  { background: rgba(148, 163, 184, 0.12); color: var(--text-dim); }
    .badge.state-running  { background: rgba(59, 130, 246, 0.12); color: var(--accent); }
    .badge.state-done     { background: rgba(16, 185, 129, 0.12); color: var(--green); }
    .badge.state-failed   { background: rgba(239, 68, 68, 0.12); color: var(--red); }
    .badge.state-canceled { background: rgba(148, 163, 184, 0.16); color: var(--text-dim); }

    /* Bottom Settings Section */
    .sidebar-footer {
      flex: 0 0 auto;
      max-height: min(58vh, 520px);
      overflow-y: auto;
      padding: 0 14px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--bg-elev);
      border-top: none;
    }

    .footer-divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 0 0 4px 0;
      width: 100%;
    }

    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
    }

    .footer-label {
      color: var(--text-dim);
      font-weight: 500;
    }

    /* Language row */
    .lang-buttons {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      background: var(--bg);
    }

    .lang-btn {
      padding: 4px 10px;
      font-size: 10.5px;
      font-weight: 700;
      color: var(--text-dim);
      background: transparent;
      border: none;
      border-right: 1px solid var(--border);
      cursor: pointer;
      height: 28px;
      min-width: 36px;
    }

    .lang-btn:last-child {
      border-right: none;
    }

    .lang-btn.active {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
    }

    /* Collapsible areas in footer */
    .footer-collapsible {
      display: flex;
      flex-direction: column;
    }

    .footer-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 12px;
      font-weight: 600;
      padding: 6px 0;
      cursor: pointer;
      width: 100%;
      text-align: left;
      min-height: 36px;
    }

    .footer-trigger:hover {
      color: var(--text);
    }

    .footer-trigger .chevron {
      font-size: 9px;
      transition: transform 0.2s ease;
      color: var(--text-dim);
    }

    .footer-trigger .chevron.open {
      transform: rotate(90deg);
    }

    .footer-collapsible-content {
      padding: 6px 0 10px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: expand 0.2s ease-out;
    }

    @keyframes expand {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .profile-compact-details {
      background: rgba(0, 0, 0, 0.1);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 11.5px;
    }

    .profile-compact-details .lbl {
      color: var(--text-dim);
    }

    .profile-compact-details .val {
      color: var(--text);
      font-weight: 500;
    }

    .footer-logout-btn {
      width: 100%;
      padding: 8px;
      background: transparent;
      border: 1px solid var(--red);
      color: var(--red);
      font-weight: 600;
      font-size: 12px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin-top: 4px;
    }

    .footer-logout-btn:hover {
      background: rgba(239, 68, 68, 0.08);
    }

    /* Desktop Adjustments: Sticky left sidebar */
    @media (min-width: 1024px) {
      .sidebar-container {
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 10;
        transform: none;
        box-shadow: none;
      }
      .backdrop {
        display: none;
      }
      .close-btn {
        display: none;
      }
      .sidebar-footer {
        max-height: min(64vh, 620px);
      }
    }
  `]
})
export class HistorySidebarComponent {
  private localeService = inject(LocaleService);

  recentQueries = input<PromptCacheEntry[]>([]);
  isOpen = model(false);
  
  // Footer inputs
  username = input<string | null>('');
  email = input<string | null>('');
  loginMethod = input<string | null>('');
  usage = input<UserUsage | null>(null);
  loading = input<boolean>(false);
  error = input<string | null>(null);
  locale = input<string>('');
  locales = input<any[]>([]);

  // Outputs
  selectQuery = output<PromptCacheEntry>();
  close = output<void>();
  setLocale = output<string>();
  logout = output<void>();
  loadUsage = output<void>();

  // Footer collapsible states
  usageExpanded = signal(false);
  settingsExpanded = signal(false);

  constructor() {
    effect(() => {
      if (this.isOpen() && this.usageExpanded()) {
        this.loadUsage.emit();
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey() {
    if (this.isOpen()) {
      this.closeSidebar();
    }
  }

  closeSidebar() {
    this.isOpen.set(false);
    this.close.emit();
  }

  selectItem(item: PromptCacheEntry) {
    this.selectQuery.emit(item);
    if (window.innerWidth < 1024) {
      this.closeSidebar();
    }
  }

  toggleUsage() {
    this.usageExpanded.update(v => !v);
  }

  toggleSettings() {
    this.settingsExpanded.update(v => !v);
  }

  getPreviewText(item: PromptCacheEntry): string {
    if (item.status.result?.directAnswer) {
      return item.status.result.directAnswer;
    }
    if (item.status.quickAnswer) {
      return item.status.quickAnswer;
    }
    return this.localeService.instant('No answer preview available.');
  }

  getStatusLabel(state: string): string {
    switch (state) {
      case 'DONE': return this.localeService.instant('Completed');
      case 'RUNNING': return this.localeService.instant('Running');
      case 'PENDING': return this.localeService.instant('Preparing');
      case 'FAILED': return this.localeService.instant('Failed');
      case 'CANCELED': return this.localeService.instant('Canceled');
      case 'CANCEL_REQUESTED': return this.localeService.instant('Canceling');
      default: return state;
    }
  }

  getLocaleLabel(code: string): string {
    return LOCALES.find(l => l.code === code)?.short ?? code;
  }

  timeSinceTimestamp(timestamp: string): string {
    const t = Date.parse(timestamp);
    if (Number.isNaN(t)) return '';
    const deltaSec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (deltaSec < 1) return this.localeService.instant('just now');
    if (deltaSec < 60) return this.localeService.instant('{{count}}s ago', { count: deltaSec });
    const m = Math.floor(deltaSec / 60);
    if (m < 60) return this.localeService.instant('{{count}}m ago', { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return this.localeService.instant('{{count}}h ago', { count: h });
    return new Date(t).toLocaleDateString(this.localeService.currentLanguage());
  }
}
