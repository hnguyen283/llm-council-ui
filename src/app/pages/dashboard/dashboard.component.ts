import { Component, inject, signal, computed, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { JobsService, JobStatus } from '../../core/jobs.service';
import { JobSessionStorageService, JobSessionRecord } from '../../core/job-session-storage.service';
import { LOCALES, LocaleCode, LocaleService } from '../../core/locale.service';
import { DirectAnswerComponent } from './direct-answer.component';
import { PromptCacheService, PromptCacheEntry } from '../../core/prompt-cache.service';

// Decomposed components
import { HistorySidebarComponent } from './components/history-sidebar.component';
import { QuickAnswerCardComponent } from './components/quick-answer-card.component';
import { RequestDetailsAccordionComponent, StageTiming } from './components/request-details-accordion.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    DirectAnswerComponent,
    HistorySidebarComponent,
    QuickAnswerCardComponent,
    RequestDetailsAccordionComponent
  ],
  template: `
    <div class="dashboard-shell">
      <!-- Left History Sidebar -->
      <app-history-sidebar
        [recentQueries]="recentQueries()"
        [(isOpen)]="historyOpen"
        [username]="username()"
        [email]="email()"
        [loginMethod]="loginMethod()"
        [usage]="userUsage()"
        [locale]="locale()"
        [locales]="locales"
        (selectQuery)="loadRecentQuery($event)"
        (setLocale)="setLocale($event)"
        (logout)="logout()"
      ></app-history-sidebar>

      <!-- Main Viewport containing Header & Content -->
      <div class="main-viewport">
        <header role="banner">
          <div class="header-left">
            <button 
              type="button" 
              class="icon-btn menu-btn" 
              (click)="historyOpen.set(true)" 
              aria-label="Open research history"
              [attr.aria-expanded]="historyOpen()"
              aria-controls="history-drawer"
            >
              ☰
            </button>
            <div class="brand">LLM Council</div>
          </div>
        </header>

        <!-- Main Content Area -->
        <main id="main-content" class="main-panel">
          @if (userUsage()?.warningActive) {
            <div class="user-quota-warning-banner" role="alert">
              ⚠️ {{ userUsage()?.warningMessage }} (Remaining requests today: {{ userUsage()?.remainingRequests }})
            </div>
          }

          <!-- Query Input Section -->
          <section class="query-card">
            <label class="query-label" for="prompt-textarea">Research question</label>
            <textarea
              id="prompt-textarea"
              [(ngModel)]="query"
              rows="2"
              placeholder="e.g. Is intermittent fasting effective for weight loss?"
              [disabled]="isRunning()"
            ></textarea>
            
            <div class="actions">
              <button
                class="primary"
                (click)="run()"
                [disabled]="!query.trim() || isRunning()"
              >
                {{ isRunning() ? 'Running...' : 'Run research' }}
              </button>
              
              @if (isRunning() && hasActiveJob()) {
                <button
                  type="button"
                  class="cancel"
                  (click)="cancel()"
                  [disabled]="canceling()"
                >
                  {{ canceling() ? 'Canceling...' : 'Cancel' }}
                </button>
              }
              
              @if (status() && !isRunning()) {
                <button (click)="reset()">Clear</button>
              }
              
              <span class="lang-hint">Prompts in {{ activeLocaleLabel() }}</span>
            </div>
          </section>

          <!-- Job Progress Status -->
          @if (status(); as s) {
            <section class="progress-card">
              <div class="meta">
                <h2>Progress</h2>
                <span
                  class="state state-{{ s.state.toLowerCase() }}"
                  [class.pulsing]="s.state === 'RUNNING' || s.state === 'PENDING' || s.state === 'CANCEL_REQUESTED'"
                >
                  {{ getStatusLabel(s.state) }}
                </span>
                
                <span class="stage-text" aria-live="polite">{{ s.stage }}</span>
                
                <span class="stage-meta">
                  <span class="update-count" [title]="'Backend updates received: ' + updateCount()">
                    #{{ updateCount() }}
                  </span>
                  
                  @if (isRunning()) {
                    <span class="total-time" aria-live="off">
                      Time: {{ runningTotalTimeText() }}
                    </span>
                  } @else if (s.state === 'DONE' && totalTimeText()) {
                    <span class="total-time">
                      Total Time: {{ totalTimeText() }}
                    </span>
                  }
                </span>
              </div>
              
              @if (s.error) {
                <div class="error" role="alert">{{ s.error }}</div>
              }
            </section>
          }

          <!-- Quick Answer Card -->
          <app-quick-answer-card [status]="status()"></app-quick-answer-card>

          <!-- Final Answer Card -->
          @if (status()?.result; as report) {
            <app-direct-answer [report]="report" />

            <section class="report">
              <div class="report-header">
                <h2>Final report</h2>
                <span class="confidence confidence-{{ report.confidence.toLowerCase() }}">
                  {{ report.confidence }} confidence
                </span>
              </div>

              @if (report.degradationNotes && report.degradationNotes.length > 0) {
                <div class="pipeline-notes" role="status">
                  <h3>Run notes</h3>
                  <ul>
                    @for (note of report.degradationNotes; track note) {
                      <li>{{ note }}</li>
                    }
                  </ul>
                </div>
              }

              <div class="block">
                <h3>Conflicts &amp; contradictions</h3>
                @if (report.conflicts.length === 0) {
                  <p class="dim">None detected.</p>
                } @else {
                  <ul>
                    @for (c of report.conflicts; track c) { <li>{{ c }}</li> }
                  </ul>
                }
              </div>
            </section>
          }

          <!-- Details Accordion (always rendered if status exists, handles collapse inside) -->
          @if (status()) {
            <app-request-details-accordion
              [status]="status()"
              [compactMode]="false"
              [timings]="stageTimings()"
              [debugMode]="debugMode()"
            ></app-request-details-accordion>
          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-shell {
      display: flex;
      min-height: 100vh;
      background: var(--bg);
    }

    .main-viewport {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elev);
      height: 56px;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand {
      font-weight: 700;
      font-size: 16px;
      letter-spacing: 0.5px;
      background: linear-gradient(135deg, var(--text) 30%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .icon-btn {
      background: transparent;
      border: none;
      font-size: 20px;
      color: var(--text-dim);
      cursor: pointer;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: color 0.15s, background-color 0.15s;
    }

    .icon-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }

    .menu-btn {
      display: flex;
    }

    /* Main panel spacing - Reduced Visual Density */
    .main-panel {
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .query-card {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    /* Flatter layout - Removed redundant card borders/backgrounds */
    .progress-card, .report {
      background: transparent;
      border: none;
      padding: 0 10px;
    }

    .query-label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-dim);
      font-size: 13px;
      font-weight: 500;
    }

    textarea {
      resize: vertical;
      min-height: 70px;
      font-size: 16px; /* Base size >=16px avoids auto-zoom on iOS */
      line-height: 1.5;
    }

    .actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      align-items: center;
      flex-wrap: wrap;
    }

    .lang-hint {
      margin-left: auto;
      align-self: center;
      font-size: 12px;
      color: var(--text-dim);
    }

    button.primary {
      height: 44px;
      padding: 0 20px;
      font-weight: 600;
    }

    button.cancel {
      background: transparent;
      color: var(--amber);
      border: 1px solid var(--amber);
      height: 44px;
      padding: 0 20px;
      font-weight: 600;
    }

    button.cancel:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.1);
    }

    /* Progress States */
    .meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 13px;
      flex-wrap: wrap;
    }

    .meta h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    .state {
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .state-pending           { background: rgba(148, 163, 184, 0.12); color: var(--text-dim); }
    .state-running           { background: rgba(59, 130, 246, 0.12);  color: var(--accent); }
    .state-done              { background: rgba(16, 185, 129, 0.12);  color: var(--green); }
    .state-failed            { background: rgba(239, 68, 68, 0.12);   color: var(--red); }
    .state-cancel_requested  { background: rgba(245, 158, 11, 0.12);  color: var(--amber); }
    .state-canceled          { background: rgba(148, 163, 184, 0.16); color: var(--text-dim); }

    .state.pulsing {
      animation: state-pulse 1.6s ease-in-out infinite;
    }

    @keyframes state-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.6; }
    }

    .stage-text {
      color: var(--text);
      font-weight: 600;
      text-transform: capitalize;
    }

    .stage-meta {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--text-dim);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .update-count {
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(148, 163, 184, 0.1);
    }

    .total-time {
      font-weight: 600;
      color: var(--text);
    }

    .error {
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--red);
      color: var(--red);
      border-radius: var(--radius);
      font-size: 13px;
    }

    /* Final Report */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .report-header h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    .confidence {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .confidence-high   { background: rgba(16, 185, 129, 0.12); color: var(--green); }
    .confidence-medium { background: rgba(245, 158, 11, 0.12); color: var(--amber); }
    .confidence-low    { background: rgba(239, 68, 68, 0.12); color: var(--red); }

    .pipeline-notes {
      margin: 12px 0;
      padding: 10px 12px;
      border-left: 3px solid var(--amber);
      background: rgba(245, 158, 11, 0.06);
      border-radius: var(--radius);
    }

    .pipeline-notes h3 {
      color: var(--amber);
      margin: 0 0 6px 0;
      font-size: 13px;
    }

    .pipeline-notes ul {
      margin: 0;
      padding-left: 18px;
      font-size: 13px;
    }

    .pipeline-notes li {
      margin-bottom: 4px;
    }

    .block {
      margin-top: 14px;
    }

    .block h3 {
      margin: 0 0 6px 0;
      font-size: 12.5px;
      color: var(--text-dim);
      font-weight: 600;
    }

    .block ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
    }

    .block li {
      margin-bottom: 6px;
      line-height: 1.5;
    }

    .dim {
      color: var(--text-dim);
      margin: 0;
      font-size: 13px;
    }

    .user-quota-warning-banner {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid var(--amber);
      color: #fcd34d;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
      animation: banner-fade-in 0.3s ease-out;
    }

    @keyframes banner-fade-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Desktop layout adjustments: hide hamburger */
    @media (min-width: 1024px) {
      .menu-btn {
        display: none;
      }
    }

    /* Mobile adjustments - Denser padding & spacing */
    @media (max-width: 768px) {
      header {
        padding: 8px 16px;
        height: 50px;
      }
      
      .main-panel {
        padding: 12px;
        gap: 14px;
      }

      .query-card {
        padding: 14px;
      }

      .actions {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        margin-top: 12px;
      }

      .actions button {
        width: 100%;
      }

      .lang-hint {
        margin-left: 0;
        width: 100%;
        text-align: center;
      }

      .stage-meta {
        width: 100%;
        margin-top: 6px;
        margin-left: 0;
      }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private jobs = inject(JobsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private localeService = inject(LocaleService);
  private http = inject(HttpClient);
  private storage = inject(JobSessionStorageService);
  private promptCache = inject(PromptCacheService);

  // Shell open/close states
  historyOpen = signal(false);

  // User profile claims
  username = this.auth.username;
  email = this.auth.email;
  loginMethod = this.auth.loginMethod;

  // Developer mode isolate
  debugMode = signal(false);

  userUsage = signal<any | null>(null);
  recentQueries = signal<PromptCacheEntry[]>([]);
  readonly locales = LOCALES;
  query = '';
  status = signal<JobStatus | null>(null);
  quickAnswerPriority = signal<number>(0);

  private activeClientRequestId: string | null = null;
  private activeJobId: string | null = null;
  canceling = signal(false);

  // Timestamp of submission (used to calculate total elapsed time)
  submittedAt = signal<string | null>(null);

  // Raw history of stage transitions
  private rawTimings = signal<StageTiming[]>([]);

  // Ticker for running total time
  private now = signal(Date.now());
  private nowInterval: ReturnType<typeof setInterval> | null = null;

  // Reconnection variables
  private streamSub: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && this.activeJobId && this.isRunning()) {
      this.reconnectStream(this.activeJobId, 0);
    }
  };

  /**
   * Timings computed list. Dynamically evaluates active stage durations using `now()`
   */
  stageTimings = computed<StageTiming[]>(() => {
    const list = [...this.rawTimings()];
    if (list.length === 0) return [];
    
    const last = list[list.length - 1];
    if (!last.completedAt && this.isRunning()) {
      const currentDuration = Math.max(0, this.now() - Date.parse(last.startedAt));
      list[list.length - 1] = {
        ...last,
        durationMs: currentDuration
      };
    }
    return list;
  });

  /**
   * Live elapsed time text while the job is in flight
   */
  runningTotalTimeText = computed(() => {
    const startStr = this.submittedAt();
    if (!startStr) return '0s';
    const start = Date.parse(startStr);
    const diffMs = Math.max(0, this.now() - start);
    const totalSec = Math.round(diffMs / 1000);
    return `${totalSec}s`;
  });

  /**
   * Final completed total execution time
   */
  totalTimeText = computed(() => {
    const startStr = this.submittedAt();
    const currentStatus = this.status();
    if (!startStr || !currentStatus || this.isRunning()) return '';
    const start = Date.parse(startStr);
    const end = Date.parse(currentStatus.updatedAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return '';
    const totalSec = Math.round(Math.max(0, end - start) / 1000);
    return `${totalSec}s`;
  });

  isRunning = computed(() => {
    const s = this.status();
    return s !== null && (
      s.state === 'PENDING' ||
      s.state === 'RUNNING' ||
      s.state === 'CANCEL_REQUESTED'
    );
  });

  locale = this.localeService.locale;
  activeLocaleLabel = computed(() => {
    const code = this.localeService.locale();
    return LOCALES.find(l => l.code === code)?.label ?? code;
  });

  updateCount = signal(0);

  ngOnInit() {
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.hydrateFromCache();
    this.loadRecentQueriesList();
    this.loadUsage();

    // Subscribe to query params to isolate Developer Mode
    this.route.queryParams.subscribe(params => {
      this.debugMode.set(params['debug'] === 'true');
    });
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.cancelStream();
  }

  loadUsage() {
    this.http.get<any>('/me/usage', { withCredentials: true }).subscribe({
      next: (data) => {
        this.userUsage.set(data);
      },
      error: () => {}
    });
  }

  setLocale(code: string) {
    this.localeService.set(code as LocaleCode);
  }

  hasActiveJob(): boolean {
    return this.activeJobId !== null;
  }

  loadRecentQueriesList() {
    const userId = this.auth.currentUserId();
    this.recentQueries.set(this.promptCache.load(userId));
  }

  getStatusLabel(state: string): string {
    if (state === 'RUNNING') {
      const stage = this.status()?.stage?.toLowerCase() || '';
      if (stage.includes('synth') || stage.includes('enhance') || stage.includes('judge')) {
        return 'Enhancing';
      }
      return 'Researching';
    }
    switch (state) {
      case 'PENDING': return 'Preparing';
      case 'DONE': return 'Completed';
      case 'CANCELED': return 'Canceled';
      case 'CANCEL_REQUESTED': return 'Canceling';
      case 'FAILED': return 'Failed';
      default: return state;
    }
  }

  loadRecentQuery(item: PromptCacheEntry) {
    if (this.isRunning()) return;
    this.cancelStream();
    this.query = item.query;
    this.status.set(null);
    this.status.set(this.processQuickAnswerPriority(item.status));
    this.canceling.set(false);
    this.updateCount.set(0);
    this.activeJobId = null;
    this.activeClientRequestId = null;
    this.submittedAt.set(item.status.updatedAt);
    
    // Setup raw timings from completed job
    const finishedTime = Date.parse(item.status.updatedAt);
    this.rawTimings.set([{
      stage: item.status.stage,
      startedAt: item.status.updatedAt,
      completedAt: item.status.updatedAt,
      durationMs: 0
    }]);

    // Save as current active job session so page reload preserves the view
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    if (userId && sid) {
      const record: JobSessionRecord = {
        version: 1,
        userId,
        sid,
        clientRequestId: `cached-${item.status.jobId}`,
        jobId: item.status.jobId,
        query: item.query,
        locale: item.locale,
        submittedAt: item.status.updatedAt,
        updatedAt: item.status.updatedAt,
        status: item.status,
        resumeUntil: '',
      };
      this.storage.save(record);
    }
  }

  run() {
    const newClientRequestId = this.mintClientRequestId();
    const supersedesJobId = this.activeJobId ?? undefined;
    const submittedQuery = this.query.trim();
    const submittedLocale = this.localeService.current();
    const submittedTimeStr = new Date().toISOString();

    this.cancelStream();
    this.status.set(null);
    this.quickAnswerPriority.set(0);
    this.canceling.set(false);
    this.updateCount.set(0);
    this.submittedAt.set(submittedTimeStr);
    this.rawTimings.set([]);
    this.startNowTicker();

    this.activeClientRequestId = newClientRequestId;
    this.activeJobId = null;

    this.jobs.submit(submittedQuery, submittedLocale, {
      clientRequestId: newClientRequestId,
      supersedesJobId,
    }).subscribe({
      next: ({ jobId, clientRequestId }) => {
        if (clientRequestId !== newClientRequestId) {
          this.status.set({
            jobId, state: 'FAILED', stage: 'failed',
            updatedAt: new Date().toISOString(),
            result: null,
            error: 'Request id mismatch on acceptance',
          });
          this.stopNowTicker();
          return;
        }
        this.activeJobId = jobId;
        this.persistInitial({
          jobId,
          clientRequestId: newClientRequestId,
          query: submittedQuery,
          locale: submittedLocale,
          submittedAt: submittedTimeStr,
        });
        
        // Add initial timing
        this.rawTimings.set([{
          stage: 'submitted',
          startedAt: submittedTimeStr,
          durationMs: 0
        }]);

        this.openStream(jobId);
      },
      error: err => {
        this.status.set({
          jobId: '', state: 'FAILED', stage: 'failed',
          updatedAt: new Date().toISOString(),
          result: null,
          error: err?.message || 'Failed to submit job',
        });
        this.stopNowTicker();
      },
    });
  }

  cancel() {
    const id = this.activeJobId;
    if (!id || this.canceling()) return;
    this.canceling.set(true);
    this.jobs.cancel(id).subscribe({
      next: snap => {
        if (this.activeJobId === id) {
          this.status.set(snap);
          this.persistStatus(snap);
        }
      },
      error: err => {
        this.canceling.set(false);
        const current = this.status();
        if (current) {
          this.status.set({
            ...current,
            error: err?.message || 'Cancel failed',
            updatedAt: new Date().toISOString(),
          });
        }
      },
    });
  }

  reset() {
    if (this.isRunning()) return;
    this.cancelStream();
    this.status.set(null);
    this.quickAnswerPriority.set(0);
    this.canceling.set(false);
    this.activeJobId = null;
    this.activeClientRequestId = null;
    this.query = '';
    this.submittedAt.set(null);
    this.rawTimings.set([]);
    this.storage.clearFor(this.auth.currentUserId(), this.auth.currentSessionId());
  }

  logout() {
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    this.cancelStream();
    this.storage.clearFor(userId, sid);
    this.activeJobId = null;
    this.activeClientRequestId = null;
    this.auth.logout().subscribe({
      next:     () => this.router.navigate(['/login']),
      error:    () => this.router.navigate(['/login']),
    });
  }

  private processQuickAnswerPriority(incoming: JobStatus | null): JobStatus | null {
    if (!incoming) {
      this.quickAnswerPriority.set(0);
      return null;
    }

    const updated = { ...incoming };

    if (updated.quickAnswer && !updated.quickAnswerInfo) {
      try {
        const parsed = JSON.parse(updated.quickAnswer);
        if (parsed && parsed.answer && parsed.artifactType && parsed.source) {
          updated.quickAnswerInfo = parsed;
          updated.quickAnswer = parsed.answer;
        }
      } catch (e) {}
    }

    const current = this.status();
    if (!current) {
      this.quickAnswerPriority.set(this.determinePriority(updated));
      return updated;
    }

    const incomingPriority = this.determinePriority(updated);
    const currentPriority = this.quickAnswerPriority();

    if (incomingPriority >= currentPriority) {
      this.quickAnswerPriority.set(incomingPriority);
      return updated;
    } else {
      updated.quickAnswer = current.quickAnswer;
      updated.quickAnswerInfo = current.quickAnswerInfo;
      return updated;
    }
  }

  private determinePriority(status: JobStatus): number {
    if (status.quickAnswerInfo) {
      const type = status.quickAnswerInfo.artifactType;
      const source = status.quickAnswerInfo.source;
      if (source === 'CURRENT_RUN') {
        return type === 'A2' ? 400 : 300;
      } else if (source === 'CACHE') {
        return type === 'A2' ? 200 : 100;
      }
    }
    if (status.quickAnswer) {
      return 0;
    }
    return -1;
  }

  private openStream(jobId: string) {
    this.streamSub = this.jobs.stream(jobId).subscribe({
      next: status => {
        if (status.jobId !== this.activeJobId) return;
        this.updateCount.update(n => n + 1);
        const resolvedStatus = this.processQuickAnswerPriority(status);
        this.status.set(resolvedStatus);
        
        // Timing tracking
        this.updateStageTiming(status.stage, status.updatedAt, this.isTerminalState(status.state));

        if (resolvedStatus) this.persistStatus(resolvedStatus);
        
        if (this.isTerminalState(status.state)) {
          this.clearReconnectTimer();
          this.stopNowTicker();
          this.canceling.set(false);
          this.activeJobId = null;

          const userId = this.auth.currentUserId();
          if (userId && status.state === 'DONE') {
            this.promptCache.save(userId, this.query, status, this.localeService.current());
            this.loadRecentQueriesList();
          }
          this.loadUsage();
        }
      },
      error: err => {
        if (this.activeJobId !== jobId) return;
        this.updateCount.update(n => n + 1);
        const message = err?.message || 'Stream error';
        if (message.includes('authentication expired')) {
          this.router.navigate(['/login'], { queryParams: { reason: 'expired' } });
          return;
        }

        this.jobs.get(jobId).subscribe({
          next: status => {
            if (this.activeJobId !== jobId) return;
            if (this.isTerminalState(status.state)) {
              const resolvedStatus = this.processQuickAnswerPriority(status);
              this.status.set(resolvedStatus);
              
              this.updateStageTiming(status.stage, status.updatedAt, true);

              if (resolvedStatus) this.persistStatus(resolvedStatus);
              this.clearReconnectTimer();
              this.stopNowTicker();
              this.canceling.set(false);
              this.activeJobId = null;

              const userId = this.auth.currentUserId();
              if (userId && status.state === 'DONE') {
                this.promptCache.save(userId, this.query, status, this.localeService.current());
                this.loadRecentQueriesList();
              }
            } else {
              this.handleInterruptedConnection(jobId, message);
            }
          },
          error: () => {
            if (this.activeJobId !== jobId) return;
            const failed: JobStatus = {
              jobId, state: 'FAILED', stage: 'failed',
              updatedAt: new Date().toISOString(),
              result: null,
              error: message,
            };
            this.status.set(failed);
            this.persistStatus(failed);
            this.stopNowTicker();
            this.canceling.set(false);
            this.activeJobId = null;
          }
        });
      },
      complete: () => {
        if (this.activeJobId === jobId && this.isRunning()) {
          this.reconnectStream(jobId);
        }
      },
    });
  }

  private updateStageTiming(stage: string, updatedAt: string, isTerminal: boolean) {
    const list = [...this.rawTimings()];
    if (list.length === 0 || list[list.length - 1].stage !== stage) {
      if (list.length > 0) {
        const prev = list[list.length - 1];
        prev.completedAt = updatedAt;
        prev.durationMs = Math.max(0, Date.parse(updatedAt) - Date.parse(prev.startedAt));
      }
      list.push({
        stage,
        startedAt: updatedAt,
        durationMs: 0
      });
    } else {
      if (isTerminal) {
        const active = list[list.length - 1];
        active.completedAt = updatedAt;
        active.durationMs = Math.max(0, Date.parse(updatedAt) - Date.parse(active.startedAt));
      }
    }
    this.rawTimings.set(list);
  }

  private handleInterruptedConnection(jobId: string, message: string) {
    const current = this.status();
    if (current && this.isRunning()) {
      this.status.set({
        ...current,
        error: 'Connection interrupted. Reconnecting...',
        updatedAt: new Date().toISOString(),
      });
      this.streamSub = null;
      this.reconnectStream(jobId);
    }
  }

  private isTerminalState(state: JobStatus['state']): boolean {
    return state === 'DONE' || state === 'FAILED' || state === 'CANCELED';
  }

  private mintClientRequestId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {}
    return `c-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  private persistInitial(input: {
    jobId: string;
    clientRequestId: string;
    query: string;
    locale: string;
    submittedAt: string;
  }): void {
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    if (!userId || !sid) return;
    const optimistic: JobStatus = {
      jobId: input.jobId,
      state: 'PENDING',
      stage: 'submitted',
      updatedAt: input.submittedAt,
      result: null,
      error: null,
    };
    const record: JobSessionRecord = {
      version: 1,
      userId,
      sid,
      clientRequestId: input.clientRequestId,
      jobId: input.jobId,
      query: input.query,
      locale: input.locale,
      submittedAt: input.submittedAt,
      updatedAt: input.submittedAt,
      status: optimistic,
      resumeUntil: '',
    };
    this.storage.save(record);
  }

  private persistStatus(status: JobStatus): void {
    if (!status.jobId) return;
    this.storage.update({
      jobId: status.jobId,
      status,
      updatedAt: status.updatedAt,
    });
  }

  private hydrateFromCache(): void {
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    const record = this.storage.load(userId, sid);
    if (!record) return;

    this.query = record.query;
    this.activeClientRequestId = record.clientRequestId;
    this.status.set(this.processQuickAnswerPriority(record.status));
    this.updateCount.set(0);
    this.submittedAt.set(record.submittedAt || record.status.updatedAt);

    // Initial timings setup from cache
    const startStr = record.submittedAt || record.status.updatedAt;
    const endStr = record.status.updatedAt;
    const isTerm = this.isTerminalState(record.status.state);
    
    this.rawTimings.set([{
      stage: record.status.stage,
      startedAt: startStr,
      completedAt: isTerm ? endStr : undefined,
      durationMs: isTerm ? Math.max(0, Date.parse(endStr) - Date.parse(startStr)) : 0
    }]);

    if (isTerm) {
      this.activeJobId = null;
      this.loadUsage();
      return;
    }

    this.activeJobId = record.jobId;
    this.startNowTicker();
    this.openStream(record.jobId);
  }

  private cancelStream() {
    this.clearReconnectTimer();
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    this.stopNowTicker();
  }

  private reconnectStream(jobId: string, delayMs = 1000) {
    this.clearReconnectTimer();
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.activeJobId !== jobId || !this.isRunning()) return;
      this.auth.refreshIfNeeded(30).subscribe({
        next: ok => {
          if (!ok) {
            this.router.navigate(['/login'], { queryParams: { reason: 'expired' } });
            return;
          }
          if (this.activeJobId === jobId && this.isRunning()) {
            this.openStream(jobId);
          }
        },
        error: () => this.router.navigate(['/login'], { queryParams: { reason: 'expired' } }),
      });
    }, delayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startNowTicker() {
    if (this.nowInterval) return;
    this.now.set(Date.now());
    this.nowInterval = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private stopNowTicker() {
    if (this.nowInterval) {
      clearInterval(this.nowInterval);
      this.nowInterval = null;
    }
  }
}
