import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/auth.service';
import { LOCALES, LocaleService } from '../../core/locale.service';
import {
  PrivacyExportStatus,
  PrivacyRequestStatus,
  PrivacyRequestType,
  PrivacyService
} from '../../core/privacy.service';

interface RequestOption {
  value: PrivacyRequestType;
  label: string;
  description: string;
}

@Component({
  selector: 'app-privacy-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  template: `
    <div class="privacy-shell">
      <header class="app-header">
        <a routerLink="/dashboard" class="brand" [attr.aria-label]="'Return to research dashboard' | translate">
          {{ 'LLM Council' | translate }}
        </a>
        <nav class="primary-nav" [attr.aria-label]="'Account navigation' | translate">
          <a routerLink="/dashboard">{{ 'Research' | translate }}</a>
          <a routerLink="/privacy" class="active" aria-current="page">{{ 'Privacy' | translate }}</a>
        </nav>
        <div class="header-actions">
          <div class="language-control" role="group" [attr.aria-label]="'Language Switcher' | translate">
            @for (option of locales; track option.code) {
              <button
                type="button"
                [class.active]="localeService.locale() === option.code"
                (click)="setLocale(option.code)"
                [title]="option.label | translate"
              >
                {{ option.short }}
              </button>
            }
          </div>
          <button type="button" class="logout-button" (click)="logout()">{{ 'Log Out' | translate }}</button>
        </div>
      </header>

      <main class="privacy-main">
        <section class="page-heading" aria-labelledby="privacy-title">
          <div>
            <p class="eyebrow">{{ 'Account controls' | translate }}</p>
            <h1 id="privacy-title">{{ 'Privacy Center' | translate }}</h1>
            <p class="intro-copy">
              {{ 'Submit and track requests about your account data. Outcomes may reflect verified retention obligations.' | translate }}
            </p>
          </div>
          <button
            type="button"
            class="refresh-button"
            (click)="refresh()"
            [disabled]="privacy.loading()"
          >
            {{ (privacy.loading() ? 'Refreshing...' : 'Refresh') | translate }}
          </button>
        </section>

        @if (privacy.errorKey(); as errorKey) {
          <div class="message error-message" role="alert">
            <span>{{ errorKey | translate }}</span>
            <button type="button" (click)="refresh()">{{ 'Try again' | translate }}</button>
          </div>
        }

        @if (privacy.noticeKey(); as noticeKey) {
          <div class="message success-message" role="status">
            <span>{{ noticeKey | translate }}</span>
            <button type="button" (click)="privacy.clearNotice()" [attr.aria-label]="'Dismiss notification' | translate">
              {{ 'Dismiss' | translate }}
            </button>
          </div>
        }

        @if (privacy.loading() && !privacy.summary()) {
          <div class="loading-state" role="status">{{ 'Loading privacy controls...' | translate }}</div>
        } @else {
          @if (privacy.summary(); as summary) {
            <section class="summary-strip" [attr.aria-label]="'Privacy account summary' | translate">
              <div class="summary-item">
                <span class="summary-label">{{ 'Account email' | translate }}</span>
                <strong>{{ summary.email }}</strong>
              </div>
              <div class="summary-item">
                <span class="summary-label">{{ 'Open requests' | translate }}</span>
                <strong>{{ summary.openRequestCount }}</strong>
              </div>
              <div class="summary-item">
                <span class="summary-label">{{ 'Privacy profile created' | translate }}</span>
                <strong>{{ formatDate(summary.registeredAt) }}</strong>
              </div>
            </section>
          }

          <div class="privacy-workspace">
            <aside class="request-tool" aria-labelledby="new-request-title">
              <h2 id="new-request-title">{{ 'New privacy request' | translate }}</h2>
              <form (ngSubmit)="submitRequest()">
                <label for="request-type">{{ 'Request type' | translate }}</label>
                <select id="request-type" name="requestType" [(ngModel)]="requestType">
                  @for (option of availableRequestOptions(); track option.value) {
                    <option [ngValue]="option.value">{{ option.label | translate }}</option>
                  }
                </select>
                <p class="request-description">{{ selectedRequestDescription() | translate }}</p>
                <div class="policy-note">
                  {{ 'Submitting creates an auditable request. Completion and data availability are confirmed by the backend.' | translate }}
                </div>
                <button type="submit" class="primary submit-button" [disabled]="privacy.submitting()">
                  {{ (privacy.submitting() ? 'Submitting...' : 'Submit request') | translate }}
                </button>
              </form>
            </aside>

            <section class="request-section" aria-labelledby="request-history-title">
              <div class="section-heading">
                <div>
                  <h2 id="request-history-title">{{ 'Request history' | translate }}</h2>
                  <p>{{ 'Status and evidence come directly from your privacy records.' | translate }}</p>
                </div>
                <span class="request-count">{{ privacy.requests().length }}</span>
              </div>

              @if (privacy.requests().length === 0) {
                <div class="empty-state">
                  <h3>{{ 'No privacy requests yet' | translate }}</h3>
                  <p>{{ 'Submitted requests will appear here.' | translate }}</p>
                </div>
              } @else {
                <div class="history-grid">
                  <div class="request-list" role="list" [attr.aria-label]="'Privacy requests' | translate">
                    @for (request of privacy.requests(); track request.requestId) {
                      <button
                        type="button"
                        class="request-row"
                        role="listitem"
                        [class.selected]="privacy.selectedRequest()?.request?.requestId === request.requestId"
                        (click)="selectRequest(request.requestId)"
                      >
                        <span class="request-row-main">
                          <strong>{{ requestTypeLabel(request.requestType) | translate }}</strong>
                          <span>{{ formatDate(request.submittedAt) }}</span>
                        </span>
                        <span class="status-badge" [class]="'status-badge ' + statusClass(request.status)">
                          {{ statusLabel(request.status) | translate }}
                        </span>
                      </button>
                    }
                  </div>

                  <article class="detail-panel" aria-live="polite">
                    @if (privacy.detailLoading()) {
                      <div class="loading-state compact">{{ 'Loading request details...' | translate }}</div>
                    } @else if (privacy.selectedRequest(); as detail) {
                      <div class="detail-heading">
                        <div>
                          <p class="eyebrow">{{ 'Request detail' | translate }}</p>
                          <h3>{{ requestTypeLabel(detail.request.requestType) | translate }}</h3>
                          <p class="request-id">{{ 'Request ID' | translate }}: {{ detail.request.requestId }}</p>
                        </div>
                        <span class="status-badge" [class]="'status-badge ' + statusClass(detail.request.status)">
                          {{ statusLabel(detail.request.status) | translate }}
                        </span>
                      </div>

                      @if (detail.legalHold.active) {
                        <section class="legal-hold" role="status">
                          <h4>{{ 'Retention obligation applies' | translate }}</h4>
                          <p>{{ 'Some deletion actions are paused because records must be retained. Internal legal details are not displayed here.' | translate }}</p>
                        </section>
                      }

                      <section class="detail-section" aria-labelledby="timeline-title">
                        <h4 id="timeline-title">{{ 'Status timeline' | translate }}</h4>
                        <ol class="timeline">
                          @for (event of detail.timeline; track event.status + event.occurredAt) {
                            <li>
                              <span class="timeline-marker" aria-hidden="true"></span>
                              <div>
                                <strong>{{ timelineLabel(event.status) | translate }}</strong>
                                <span>{{ formatDate(event.occurredAt) }}</span>
                              </div>
                            </li>
                          }
                        </ol>
                      </section>

                      <section class="detail-section export-section" aria-labelledby="export-title">
                        <div>
                          <h4 id="export-title">{{ 'Data export' | translate }}</h4>
                          <p>{{ exportDescription(detail.export.status) | translate }}</p>
                        </div>
                        <button
                          type="button"
                          (click)="downloadExport(detail.request.requestId)"
                          [disabled]="detail.export.status !== 'AVAILABLE' || privacy.downloading()"
                        >
                          {{ (privacy.downloading() ? 'Downloading...' : 'Download export') | translate }}
                        </button>
                      </section>

                      <section class="detail-section receipt-section" aria-labelledby="receipt-title">
                        <div class="receipt-heading">
                          <div>
                            <h4 id="receipt-title">{{ 'Completion receipt' | translate }}</h4>
                            <p>
                              {{ (detail.receipt.available
                                ? 'A system receipt is available for this terminal request.'
                                : 'A receipt becomes available when the request reaches a terminal status.') | translate }}
                            </p>
                          </div>
                          <button
                            type="button"
                            (click)="loadReceipt(detail.request.requestId)"
                            [disabled]="!detail.receipt.available || privacy.receiptLoading()"
                          >
                            {{ (privacy.receiptLoading() ? 'Loading receipt...' : 'View receipt') | translate }}
                          </button>
                        </div>

                        @if (privacy.receipt(); as receipt) {
                          <div class="receipt-details">
                            <dl>
                              <div><dt>{{ 'Receipt ID' | translate }}</dt><dd>{{ receipt.receiptId }}</dd></div>
                              <div><dt>{{ 'Completed at' | translate }}</dt><dd>{{ formatDate(receipt.completedAt) }}</dd></div>
                              <div><dt>{{ 'Correlation ID' | translate }}</dt><dd>{{ receipt.correlationId }}</dd></div>
                            </dl>
                            <div class="receipt-actions">
                              <div>
                                <strong>{{ 'Completed actions' | translate }}</strong>
                                <span>{{ actionList(receipt.completedActions) }}</span>
                              </div>
                              <div>
                                <strong>{{ 'Blocked actions' | translate }}</strong>
                                <span>{{ actionList(receipt.blockedActions) }}</span>
                              </div>
                            </div>
                          </div>
                        }
                      </section>
                    } @else {
                      <div class="empty-state compact">
                        <p>{{ 'Select a request to inspect its status.' | translate }}</p>
                      </div>
                    }
                  </article>
                </div>
              }
            </section>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--bg); }
    .privacy-shell { min-height: 100vh; }
    .app-header {
      position: sticky; top: 0; z-index: 40; height: 56px; padding: 0 24px;
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      border-bottom: 1px solid var(--border); background: var(--bg-elev);
    }
    .brand { color: var(--text); font-size: 16px; font-weight: 700; text-decoration: none; }
    .primary-nav { display: flex; align-self: stretch; gap: 8px; }
    .primary-nav a {
      display: flex; align-items: center; padding: 0 12px; color: var(--text-dim);
      border-bottom: 2px solid transparent; font-size: 13px; font-weight: 600; text-decoration: none;
    }
    .primary-nav a:hover, .primary-nav a.active { color: var(--text); border-bottom-color: var(--accent); }
    .header-actions { justify-self: end; display: flex; align-items: center; gap: 12px; }
    .language-control { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .language-control button { min-width: 38px; height: 30px; padding: 0 8px; border: 0; border-right: 1px solid var(--border); border-radius: 0; font-size: 11px; }
    .language-control button:last-child { border-right: 0; }
    .language-control button.active { color: var(--accent); background: rgba(59, 130, 246, .14); }
    .logout-button { height: 34px; padding: 0 12px; font-size: 12px; }

    .privacy-main { max-width: 1180px; margin: 0 auto; padding: 28px 24px 56px; }
    .page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .eyebrow { margin: 0 0 6px; color: var(--text-dim); font-size: 11px; font-weight: 700; text-transform: uppercase; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    .intro-copy { max-width: 680px; margin: 8px 0 0; color: var(--text-dim); line-height: 1.55; }
    .refresh-button { min-width: 96px; height: 40px; }
    .message { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 18px; padding: 10px 12px; border: 1px solid; border-radius: var(--radius); }
    .message button { padding: 4px 9px; font-size: 12px; }
    .error-message { color: #fca5a5; border-color: rgba(239, 68, 68, .45); background: rgba(239, 68, 68, .08); }
    .success-message { color: #6ee7b7; border-color: rgba(16, 185, 129, .45); background: rgba(16, 185, 129, .08); }
    .loading-state { padding: 48px 16px; color: var(--text-dim); text-align: center; }
    .loading-state.compact { padding: 28px 12px; }

    .summary-strip { display: grid; grid-template-columns: 1.4fr .65fr 1fr; border-block: 1px solid var(--border); margin-bottom: 28px; }
    .summary-item { min-width: 0; padding: 14px 18px; border-right: 1px solid var(--border); }
    .summary-item:first-child { padding-left: 0; }
    .summary-item:last-child { border-right: 0; }
    .summary-item strong { display: block; margin-top: 4px; overflow-wrap: anywhere; font-size: 14px; }
    .summary-label { color: var(--text-dim); font-size: 11px; font-weight: 600; }

    .privacy-workspace { display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap: 32px; align-items: start; }
    .request-tool { padding: 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elev); }
    .request-tool h2, .section-heading h2 { margin: 0; font-size: 16px; }
    .request-tool form { margin-top: 18px; }
    .request-tool label { display: block; margin-bottom: 7px; color: var(--text-dim); font-size: 12px; font-weight: 600; }
    select { width: 100%; height: 42px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text); font: inherit; }
    select:focus { outline: none; border-color: var(--accent); }
    .request-description { min-height: 42px; margin: 12px 0; color: var(--text-dim); font-size: 12px; line-height: 1.5; }
    .policy-note { padding: 10px 0; border-block: 1px solid var(--border); color: var(--text-dim); font-size: 11px; line-height: 1.5; }
    .submit-button { width: 100%; height: 42px; margin-top: 16px; }

    .request-section { min-width: 0; }
    .section-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .section-heading p { margin: 5px 0 0; color: var(--text-dim); font-size: 12px; }
    .request-count { min-width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; font-size: 11px; font-weight: 700; }
    .history-grid { display: grid; grid-template-columns: minmax(210px, 280px) minmax(0, 1fr); gap: 22px; }
    .request-list { display: flex; flex-direction: column; gap: 8px; }
    .request-row { width: 100%; min-height: 64px; padding: 10px 11px; display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; }
    .request-row.selected { border-color: var(--accent); background: rgba(59, 130, 246, .08); }
    .request-row-main { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .request-row-main strong { font-size: 12px; }
    .request-row-main span { color: var(--text-dim); font-size: 10px; }
    .status-badge { flex: 0 0 auto; padding: 3px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .status-neutral { color: var(--text-dim); background: rgba(148, 163, 184, .14); }
    .status-progress { color: #93c5fd; background: rgba(59, 130, 246, .14); }
    .status-success { color: #6ee7b7; background: rgba(16, 185, 129, .14); }
    .status-warning { color: #fcd34d; background: rgba(245, 158, 11, .14); }
    .status-danger { color: #fca5a5; background: rgba(239, 68, 68, .14); }

    .detail-panel { min-width: 0; padding-left: 22px; border-left: 1px solid var(--border); }
    .detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .detail-heading h3 { margin: 0; font-size: 17px; }
    .request-id { margin: 6px 0 0; color: var(--text-dim); font-family: ui-monospace, monospace; font-size: 10px; overflow-wrap: anywhere; }
    .legal-hold { margin-top: 18px; padding: 12px; border-left: 3px solid var(--amber); background: rgba(245, 158, 11, .07); }
    .legal-hold h4 { margin: 0 0 5px; color: #fcd34d; font-size: 13px; }
    .legal-hold p, .detail-section p { margin: 0; color: var(--text-dim); font-size: 11px; line-height: 1.5; }
    .detail-section { padding: 18px 0; border-bottom: 1px solid var(--border); }
    .detail-section:last-child { border-bottom: 0; }
    .detail-section h4 { margin: 0 0 10px; font-size: 13px; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li { position: relative; display: flex; gap: 10px; padding: 0 0 15px; }
    .timeline li:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 10px; bottom: 0; width: 1px; background: var(--border); }
    .timeline-marker { position: relative; z-index: 1; width: 9px; height: 9px; margin-top: 3px; border: 2px solid var(--accent); border-radius: 50%; background: var(--bg); }
    .timeline div { display: flex; flex-direction: column; gap: 3px; }
    .timeline strong { font-size: 11px; }
    .timeline span { color: var(--text-dim); font-size: 10px; }
    .export-section, .receipt-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
    .export-section button, .receipt-heading button { flex: 0 0 auto; min-width: 120px; }
    .receipt-details { margin-top: 16px; }
    .receipt-details dl { margin: 0; display: grid; gap: 8px; }
    .receipt-details dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; }
    .receipt-details dt { color: var(--text-dim); font-size: 10px; }
    .receipt-details dd { margin: 0; font-family: ui-monospace, monospace; font-size: 10px; overflow-wrap: anywhere; }
    .receipt-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .receipt-actions div { display: flex; flex-direction: column; gap: 4px; }
    .receipt-actions strong { font-size: 10px; }
    .receipt-actions span { color: var(--text-dim); font-size: 10px; }
    .empty-state { padding: 48px 16px; border-block: 1px solid var(--border); text-align: center; }
    .empty-state h3 { margin: 0; font-size: 14px; }
    .empty-state p { margin: 6px 0 0; color: var(--text-dim); font-size: 12px; }

    @media (max-width: 900px) {
      .privacy-workspace { grid-template-columns: 1fr; }
      .request-tool { max-width: none; }
    }
    @media (max-width: 700px) {
      .app-header { height: auto; min-height: 56px; padding: 8px 14px; grid-template-columns: 1fr auto; }
      .primary-nav { grid-row: 2; grid-column: 1 / -1; justify-content: center; height: 38px; order: 3; }
      .primary-nav a { padding: 0 16px; }
      .logout-button { display: none; }
      .privacy-main { padding: 22px 14px 40px; }
      .page-heading { align-items: center; }
      h1 { font-size: 24px; }
      .intro-copy { font-size: 13px; }
      .summary-strip { grid-template-columns: 1fr 1fr; }
      .summary-item { padding: 12px; }
      .summary-item:first-child { grid-column: 1 / -1; padding-left: 12px; border-right: 0; border-bottom: 1px solid var(--border); }
      .history-grid { grid-template-columns: 1fr; }
      .request-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .detail-panel { padding: 18px 0 0; border-left: 0; border-top: 1px solid var(--border); }
    }
    @media (max-width: 480px) {
      .page-heading { align-items: flex-start; }
      .refresh-button { min-width: 82px; padding: 7px 10px; }
      .request-list { grid-template-columns: 1fr; }
      .export-section, .receipt-heading { align-items: flex-start; flex-direction: column; }
      .export-section button, .receipt-heading button { width: 100%; }
      .receipt-actions { grid-template-columns: 1fr; }
      .receipt-details dl div { grid-template-columns: 1fr; gap: 3px; }
    }
  `]
})
export class PrivacyCenterComponent implements OnInit, OnDestroy {
  readonly privacy = inject(PrivacyService);
  readonly localeService = inject(LocaleService);
  readonly locales = LOCALES;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private pollHandle: number | null = null;

  requestType: PrivacyRequestType = 'ACCESS_EXPORT';

  readonly requestOptions: RequestOption[] = [
    {
      value: 'ACCESS_EXPORT',
      label: 'Access and export',
      description: 'Request an account-data export. Download availability is confirmed separately.'
    },
    {
      value: 'CORRECTION',
      label: 'Correction',
      description: 'Request review of account information that may need correction.'
    },
    {
      value: 'DELETION',
      label: 'Deletion',
      description: 'Request deletion of eligible account data. Retention obligations may limit the outcome.'
    },
    {
      value: 'RESTRICTION',
      label: 'Restriction',
      description: 'Request limits on eligible processing while the request is reviewed.'
    },
    {
      value: 'WITHDRAW_CONSENT',
      label: 'Withdraw consent',
      description: 'Request withdrawal of consent for eligible processing purposes.'
    }
  ];

  ngOnInit(): void {
    this.privacy.loadOverview();
    this.pollHandle = window.setInterval(() => {
      if (document.visibilityState === 'visible' && this.privacy.requests().some(item => this.isActive(item.status))) {
        this.privacy.loadOverview(undefined, true);
      }
    }, 15_000);
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
  }

  availableRequestOptions(): RequestOption[] {
    const supported = this.privacy.summary()?.supportedRequestTypes;
    if (!supported?.length) return this.requestOptions;
    return this.requestOptions.filter(option => supported.includes(option.value));
  }

  selectedRequestDescription(): string {
    return this.requestOptions.find(option => option.value === this.requestType)?.description ?? '';
  }

  submitRequest(): void {
    this.privacy.createRequest(this.requestType);
  }

  selectRequest(requestId: string): void {
    this.privacy.loadDetail(requestId);
  }

  loadReceipt(requestId: string): void {
    this.privacy.loadReceipt(requestId);
  }

  downloadExport(requestId: string): void {
    this.privacy.downloadExport(requestId);
  }

  refresh(): void {
    this.privacy.loadOverview();
  }

  setLocale(code: string): void {
    this.localeService.set(code);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        this.privacy.clear();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.privacy.clear();
        this.router.navigate(['/login']);
      }
    });
  }

  requestTypeLabel(type: PrivacyRequestType): string {
    return this.requestOptions.find(option => option.value === type)?.label ?? type;
  }

  statusLabel(status: PrivacyRequestStatus): string {
    switch (status) {
      case 'RECEIVED': return 'Received';
      case 'IN_PROGRESS': return 'In progress';
      case 'COMPLETED': return 'Completed';
      case 'FAILED': return 'Failed';
      case 'BLOCKED_LEGAL_HOLD': return 'Blocked by retention obligation';
      case 'PENDING_LEGAL_APPROVAL': return 'Pending policy review';
    }
  }

  statusClass(status: PrivacyRequestStatus): string {
    switch (status) {
      case 'COMPLETED': return 'status-success';
      case 'IN_PROGRESS': return 'status-progress';
      case 'BLOCKED_LEGAL_HOLD':
      case 'PENDING_LEGAL_APPROVAL': return 'status-warning';
      case 'FAILED': return 'status-danger';
      default: return 'status-neutral';
    }
  }

  timelineLabel(status: string): string {
    if (status === 'TASK_COMPLETED') return 'Data action completed';
    if (status === 'TASK_FAILED') return 'Data action failed';
    if (status === 'TASK_SKIPPED_LEGAL_HOLD') return 'Data action retained';
    return this.statusLabel(status as PrivacyRequestStatus);
  }

  exportDescription(status: PrivacyExportStatus): string {
    switch (status) {
      case 'AVAILABLE': return 'Your authorized export is ready to download.';
      case 'PREPARING': return 'The export is being prepared.';
      case 'EXPIRED': return 'The previous export has expired.';
      case 'BLOCKED': return 'The export is blocked by a retention or policy outcome.';
      case 'FAILED': return 'The export could not be prepared.';
      case 'UNAVAILABLE': return 'No authorized export artifact is available yet.';
      default: return 'This request does not include a data export.';
    }
  }

  actionList(actions: string[]): string {
    if (!actions?.length) return this.localeService.instant('None reported');
    return actions.map(action => action.replaceAll('_', ' ').toLowerCase()).join(', ');
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return this.localeService.instant('Not available');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.localeService.instant('Not available');
    return new Intl.DateTimeFormat(
      this.localeService.currentLanguage() === 'vi' ? 'vi-VN' : 'en-US',
      { dateStyle: 'medium', timeStyle: 'short' }
    ).format(date);
  }

  private isActive(status: PrivacyRequestStatus): boolean {
    return status === 'RECEIVED' || status === 'IN_PROGRESS' || status === 'PENDING_LEGAL_APPROVAL';
  }
}
