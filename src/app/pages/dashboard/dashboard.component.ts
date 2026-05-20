import { Component, inject, signal, computed, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { JobsService, JobStatus } from '../../core/jobs.service';
import { JobSessionStorageService, JobSessionRecord } from '../../core/job-session-storage.service';
import { LOCALES, LocaleCode, LocaleService } from '../../core/locale.service';
import { DirectAnswerComponent } from './direct-answer.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, DirectAnswerComponent],
  template: `
    <header>
      <div class="brand">LLM Counsil</div>
      <div class="header-actions">
        <div class="lang-switcher" role="group" aria-label="Language">
          @for (l of locales; track l.code) {
            <button
              type="button"
              class="lang-btn"
              [class.active]="locale() === l.code"
              [disabled]="isRunning()"
              [attr.aria-pressed]="locale() === l.code"
              [title]="l.label"
              (click)="setLocale(l.code)"
            >
              {{ l.short }}
            </button>
          }
        </div>
        <button (click)="logout()">Logout</button>
      </div>
    </header>

    <main>
      <section class="query-card">
        <label class="query-label">Research question</label>
        <textarea
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

      @if (status(); as s) {
        <section class="progress-card">
          <div class="meta">
            <h2>Progress</h2>
            <span
              class="state state-{{ s.state.toLowerCase() }}"
              [class.pulsing]="s.state === 'RUNNING' || s.state === 'PENDING' || s.state === 'CANCEL_REQUESTED'"
            >{{ s.state }}</span>
            <span class="stage-text" aria-live="polite">{{ s.stage }}</span>
            <span class="stage-meta">
              <span class="update-count" [title]="'Backend updates received: ' + updateCount()">
                #{{ updateCount() }}
              </span>
              <span class="time-since" [title]="'Last backend update: ' + s.updatedAt">
                {{ timeSinceUpdate() }}
              </span>
            </span>
          </div>
          @if (s.error) {
            <div class="error">{{ s.error }}</div>
          }
        </section>
      }

      @if (status()?.result; as report) {
        <!-- Post-judge synthesised one-paragraph answer. The panel
             hides itself when synthesis was skipped, errored, or
             returned blank, so the dashboard layout stays clean for
             degraded runs. -->
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

          <div class="block">
            <button
              type="button"
              class="collapsible-header"
              [attr.aria-expanded]="keyFindingsOpen()"
              (click)="toggleKeyFindings()"
            >
              <span class="chevron" [class.open]="keyFindingsOpen()" aria-hidden="true">&#9656;</span>
              <h3>Key findings ({{ report.keyFindings.length }})</h3>
            </button>
            @if (keyFindingsOpen()) {
              @if (report.keyFindings.length === 0) {
                <p class="dim">No findings produced.</p>
              } @else {
                <ul>
                  @for (f of report.keyFindings; track f) { <li>{{ f }}</li> }
                </ul>
              }
            }
          </div>

          <div class="block">
            <h3>Sources ({{ report.sources.length }})</h3>
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Score</th>
                  <th>URL</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                @for (src of report.sources; track src.url) {
                  <tr>
                    <td><span class="tier tier-{{ tierClass(src.reliability) }}">{{ src.reliability }}</span></td>
                    <td>
                      <div class="score" [title]="src.rationale || ''">
                        <span class="score-num score-{{ scoreBand(src.confidenceScore) }}">{{ src.confidenceScore }}</span>
                        <div class="score-bar">
                          <div class="score-bar-fill score-{{ scoreBand(src.confidenceScore) }}"
                               [style.width.%]="src.confidenceScore"></div>
                        </div>
                      </div>
                    </td>
                    <td><a [href]="src.url" target="_blank" rel="noopener">{{ shortUrl(src.url) }}</a></td>
                    <td>{{ src.rationale || src.summary }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </main>
  `,
  styles: [`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 32px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elev);
    }
    .brand { font-weight: 600; font-size: 16px; }
    .header-actions { display: flex; align-items: center; gap: 12px; }

    .lang-switcher {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      background: var(--bg);
    }
    .lang-btn {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      background: transparent;
      border: none;
      border-right: 1px solid var(--border);
      cursor: pointer;
    }
    .lang-btn:last-child { border-right: none; }
    .lang-btn:hover:not(:disabled) { color: var(--text); }
    .lang-btn.active {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
    }
    .lang-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .lang-hint {
      margin-left: auto;
      align-self: center;
      font-size: 12px;
      color: var(--text-dim);
    }

    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .query-card, .progress-card, .report {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
    }
    .query-label { display: block; margin-bottom: 8px; color: var(--text-dim); font-size: 13px; }
    textarea { resize: vertical; min-height: 60px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    /* The Cancel button stands apart from Clear (which is destructive
       only locally): it triggers a backend mutation. Amber matches the
       CANCEL_REQUESTED badge so the connection between "I clicked
       Cancel" and "state went amber" is visually obvious. */
    button.cancel {
      background: transparent;
      color: var(--amber);
      border: 1px solid var(--amber);
    }
    button.cancel:hover:not(:disabled) { background: rgba(245,158,11,0.1); }
    button.cancel:disabled { opacity: 0.6; cursor: not-allowed; }

    h2 { margin: 0 0 16px 0; font-size: 16px; }
    h3 { margin: 0 0 8px 0; font-size: 14px; color: var(--text-dim); }
    .dim { color: var(--text-dim); margin: 0; }

    .meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 13px;
    }
    .meta h2 { margin: 0; }
    .state {
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    .state-pending           { background: rgba(148,163,184,0.15); color: var(--text-dim); }
    .state-running           { background: rgba(59,130,246,0.15);  color: var(--accent); }
    .state-done              { background: rgba(16,185,129,0.15);  color: var(--green); }
    .state-failed            { background: rgba(239,68,68,0.15);   color: var(--red); }
    /* CANCEL_REQUESTED is transient — amber to signal "in flight but
       winding down". CANCELED is a calm grey terminal, distinct from
       FAILED's red so the user can tell intentional stops apart from
       errors. The class names come from s.state.toLowerCase(). */
    .state-cancel_requested  { background: rgba(245,158,11,0.15);  color: var(--amber); }
    .state-canceled          { background: rgba(148,163,184,0.20); color: var(--text-dim); }
    /* Subtle pulse on the badge while the workflow is in flight so the
       user has a visual cue that the connection is alive even between
       stage transitions. */
    .state.pulsing { animation: state-pulse 1.6s ease-in-out infinite; }
    @keyframes state-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }
    .stage-text {
      color: var(--text);
      font-weight: 500;
    }
    .stage-meta {
      margin-left: auto;
      display: inline-flex;
      gap: 8px;
      color: var(--text-dim);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .update-count {
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(148,163,184,0.12);
    }
    .error {
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(239,68,68,0.1);
      border: 1px solid var(--red);
      color: var(--red);
      border-radius: var(--radius);
      font-size: 13px;
    }

    /* Report */
    .report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .report-header h2 { margin: 0; }
    .confidence {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .confidence-high   { background: rgba(16,185,129,0.15); color: var(--green); }
    .confidence-medium { background: rgba(245,158,11,0.15); color: var(--amber); }
    .confidence-low    { background: rgba(239,68,68,0.15); color: var(--red); }
    .pipeline-notes {
      margin: 12px 0 4px 0;
      padding: 12px 14px;
      border-left: 3px solid var(--amber);
      background: rgba(245,158,11,0.10);
      border-radius: var(--radius);
    }
    .pipeline-notes h3 {
      color: var(--amber);
      margin-bottom: 6px;
    }
    .pipeline-notes ul {
      margin: 0;
      padding-left: 18px;
    }
    .pipeline-notes li {
      margin-bottom: 4px;
    }

    .block { margin-top: 20px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin-bottom: 6px; line-height: 1.5; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--text-dim); font-weight: 500; font-size: 12px; }

    .tier {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tier-1 { background: rgba(16,185,129,0.15); color: var(--green); }
    .tier-2 { background: rgba(59,130,246,0.15); color: var(--accent); }
    .tier-3 { background: rgba(148,163,184,0.15); color: var(--text-dim); }

    /* Per-source confidence visual: numeric score plus a proportional
       bar; the full rationale surfaces in a tooltip via the title
       attribute on the wrapper element. */
    .score { display: flex; align-items: center; gap: 8px; min-width: 100px; }
    .score-num { font-weight: 600; font-size: 12px; min-width: 28px; text-align: right; }
    .score-bar {
      flex: 1;
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
      min-width: 60px;
    }
    .score-bar-fill { height: 100%; transition: width 0.3s ease; }
    .score-high   { color: var(--green); background: var(--green); }
    .score-medium { color: var(--accent); background: var(--accent); }
    .score-low    { color: var(--red); background: var(--red); }
    .score-num.score-high   { color: var(--green); background: transparent; }
    .score-num.score-medium { color: var(--accent); background: transparent; }
    .score-num.score-low    { color: var(--red); background: transparent; }

    /* Collapsible block header (used by "Key findings"). The whole
       header is a button so the chevron and the title are part of one
       click target — keeps the keyboard/screen-reader experience
       coherent without needing extra ARIA wiring. */
    .collapsible-header {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 0;
      margin: 0 0 8px 0;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
    }
    .collapsible-header:hover:not(:disabled) { background: transparent; }
    .collapsible-header h3 { margin: 0; }
    .chevron {
      display: inline-block;
      color: var(--text-dim);
      transition: transform 0.15s ease;
      font-size: 12px;
      line-height: 1;
    }
    .chevron.open { transform: rotate(90deg); }

    /* Mobile: the dashboard is built around a 960px column with 32px
       padding and a fixed-layout table. Below ~640px those defaults
       overflow, so we shrink padding, stack the header, and let the
       sources table scroll horizontally inside its block instead of
       blowing out the viewport. */
    @media (max-width: 640px) {
      header {
        padding: 12px 16px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .header-actions { flex-wrap: wrap; }

      main {
        padding: 16px;
        gap: 16px;
      }
      .query-card, .progress-card, .report {
        padding: 16px;
      }
      .actions {
        flex-wrap: wrap;
      }
      .lang-hint {
        margin-left: 0;
        width: 100%;
      }

      .report-header {
        flex-wrap: wrap;
        gap: 8px;
      }

      /* Let the sources table scroll horizontally inside its block
         rather than forcing the whole page wider than the viewport. */
      .block { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { min-width: 480px; }
      th, td { padding: 6px 8px; }
      .score { min-width: 80px; }
      .score-bar { min-width: 40px; }
    }
  `]
})
/**
 * Authenticated dashboard page.
 *
 * Lets the user submit a research question, switch language, and watch
 * the workflow progress in real time. The component subscribes to the
 * job streaming endpoint as soon as the orchestrator accepts the
 * submission and renders the final report when the workflow completes.
 */
export class DashboardComponent implements OnInit, OnDestroy {
  private jobs = inject(JobsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private localeService = inject(LocaleService);
  /**
   * Per-(userId, sid) snapshot of the user's most recent submission.
   * The dashboard hydrates from this on init and writes back to it on
   * every stream event so closing the tab, locking a mobile screen, or
   * reloading the page restores the in-flight or just-completed run
   * without a backend round-trip.
   */
  private storage = inject(JobSessionStorageService);

  readonly locales = LOCALES;
  query = '';
  status = signal<JobStatus | null>(null);
  /**
   * Local generation id for the current Run click. Minted server-side
   * if the SPA forgets to provide one; we always provide one. Every
   * inbound stream event is matched against this so a stray event from
   * a superseded job cannot mutate the new run's UI.
   */
  private activeClientRequestId: string | null = null;
  /**
   * Id of the job currently attached to the dashboard. Set on a
   * successful submit, cleared when the snapshot reaches a terminal
   * state. The supersede flow on the next Run click reads this and
   * forwards it as `supersedesJobId` so the backend cancels the old
   * job atomically.
   */
  private activeJobId: string | null = null;
  /**
   * True while a cancel HTTP call is in flight or while we are
   * waiting for the terminal `CANCELED` snapshot to arrive over the
   * stream. Used to disable the Cancel button so a double-click
   * doesn't fire a second cancel.
   */
  canceling = signal(false);
  /**
   * Whether the "Key findings" panel is expanded. The panel is
   * collapsed by default because the conflicts & contradictions
   * section above it carries the more actionable signal; users
   * opt into the full findings list when they want detail.
   */
  keyFindingsOpen = signal(false);
  /**
   * Number of streaming snapshots received from the backend for the
   * current run. Surfaces in the UI so the user can tell that the
   * connection is alive and progressing even when the coarse `stage`
   * label doesn't change between pings.
   */
  updateCount = signal(0);
  /**
   * Monotonic 1Hz tick that re-evaluates time-derived computeds (e.g.
   * "updated 2s ago"). Kept as a signal so the framework can fold it
   * into the change-detection graph instead of us forcing
   * markForCheck() on every tick.
   */
  private now = signal(Date.now());
  private nowInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Whether the dashboard considers the current job in-flight. Used to
   * disable the textarea, locale switcher, and primary submit button.
   *
   * `CANCEL_REQUESTED` is treated as still-running on purpose: the
   * orchestrator has accepted the cancel but the workflow has not yet
   * exited a cooperative boundary, so the UI must keep the existing job
   * attached until the terminal `CANCELED` snapshot arrives. G6 layers
   * a separate `canceling` signal on top of this for Cancel-button
   * specific behaviour.
   */
  isRunning = computed(() => {
    const s = this.status();
    return s !== null && (
      s.state === 'PENDING' ||
      s.state === 'RUNNING' ||
      s.state === 'CANCEL_REQUESTED'
    );
  });
  /**
   * Human-readable "Xs ago" string derived from the latest
   * `updatedAt` on the job snapshot. Re-evaluates every second so the
   * user can see freshness without us having to push a custom
   * formatter on every stream chunk.
   */
  timeSinceUpdate = computed(() => {
    const s = this.status();
    if (!s) return '';
    const t = Date.parse(s.updatedAt);
    if (Number.isNaN(t)) return '';
    const deltaSec = Math.max(0, Math.round((this.now() - t) / 1000));
    if (deltaSec < 1) return 'just now';
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const m = Math.floor(deltaSec / 60);
    const s2 = deltaSec % 60;
    return `${m}m ${s2}s ago`;
  });

  locale = this.localeService.locale;
  activeLocaleLabel = computed(() => {
    const code = this.localeService.locale();
    return LOCALES.find(l => l.code === code)?.label ?? code;
  });

  private streamSub: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && this.activeJobId && this.isRunning()) {
      this.reconnectStream(this.activeJobId, 0);
    }
  };

  /** Switches the active locale via the shared locale service. */
  setLocale(code: LocaleCode) {
    this.localeService.set(code);
  }

  /**
   * Whether the dashboard currently owns an active backend job. Public
   * so the template can conditionally render the Cancel button; relying
   * on a plain method (rather than a signal) is fine here because
   * Angular's default change detection re-evaluates it on every event
   * tick, and Cancel button visibility tracks the same events that
   * mutate `activeJobId`.
   */
  hasActiveJob(): boolean {
    return this.activeJobId !== null;
  }

  /** Toggles the collapsible "Key findings" panel. */
  toggleKeyFindings() {
    this.keyFindingsOpen.update(v => !v);
  }

  /**
   * Submits the current question and opens the streaming subscription
   * as soon as the orchestrator returns the new job identifier.
   *
   * Every click mints a fresh `clientRequestId` so the dashboard can
   * verify the orchestrator's acceptance against its current local
   * generation and discard stale stream events from any prior job.
   * When an active job already exists, its id rides along as
   * `supersedesJobId` so the backend cancels it atomically before
   * accepting the new submission.
   */
  run() {
    const newClientRequestId = this.mintClientRequestId();
    const supersedesJobId = this.activeJobId ?? undefined;
    const submittedQuery = this.query.trim();
    const submittedLocale = this.localeService.current();
    const submittedAt = new Date().toISOString();

    this.cancelStream();
    this.status.set(null);
    this.canceling.set(false);
    this.keyFindingsOpen.set(false);
    this.updateCount.set(0);
    this.startNowTicker();

    // Optimistic local pointer: clear the prior job immediately so a
    // stream event from it that races our cancel cannot land on the
    // new run.
    this.activeClientRequestId = newClientRequestId;
    this.activeJobId = null;

    this.jobs.submit(submittedQuery, submittedLocale, {
      clientRequestId: newClientRequestId,
      supersedesJobId,
    }).subscribe({
      next: ({ jobId, clientRequestId }) => {
        if (clientRequestId !== newClientRequestId) {
          // The orchestrator echoed a different generation than the
          // one we minted. The most likely cause is a stale response
          // from a previous click landing late; refuse to attach.
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
          submittedAt,
        });
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

  /**
   * Posts /jobs/{id}/cancel for the currently attached job. The
   * acknowledgement is folded into the visible status, and
   * `canceling()` is held true until the terminal `CANCELED`
   * snapshot arrives on the stream (see {@link openStream}). Errors
   * on the cancel POST flip `canceling()` back to false but leave
   * the job attached so the user can retry.
   */
  cancel() {
    const id = this.activeJobId;
    if (!id || this.canceling()) return;
    this.canceling.set(true);
    this.jobs.cancel(id).subscribe({
      next: snap => {
        // The acknowledged snapshot is typically CANCEL_REQUESTED.
        // Fold it into the UI + cache; the stream takes over from
        // here and will deliver the terminal CANCELED event.
        if (this.activeJobId === id) {
          this.status.set(snap);
          this.persistStatus(snap);
        }
      },
      error: err => {
        // Non-terminal cancel error — surface to the user but keep
        // the job attached so they can try again or wait for the
        // workflow to finish naturally.
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

  /**
   * Clears the visible state and the per-(userId, sid) cache record.
   * Disabled while {@link isRunning} returns true, so a user cannot
   * silently abandon an in-flight job here — they must go through the
   * explicit Cancel button so the backend tears the workflow down too.
   */
  reset() {
    if (this.isRunning()) return;
    this.cancelStream();
    this.status.set(null);
    this.canceling.set(false);
    this.activeJobId = null;
    this.activeClientRequestId = null;
    this.query = '';
    this.storage.clearFor(this.auth.currentUserId(), this.auth.currentSessionId());
  }

  /**
   * Cancels the stream, asks the server to end the session, then routes
   * to /login. The Observable returned by AuthService.logout() must be
   * subscribed for the HTTP call to actually fire — the prior fire-and-
   * forget version never reached the server, which left server-side
   * sessions/refresh-families alive after a "logout".
   *
   * AuthService.logout() always completes (it catches HTTP failures and
   * clears local state regardless), so we route on `finalize`-equivalent
   * behaviour: navigate inside subscribe so the back-button history is
   * predictable.
   */
  logout() {
    // Snapshot identity BEFORE the auth call clears it, so clearFor can
    // still match the cached record against (userId, sid).
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    this.cancelStream();
    this.storage.clearFor(userId, sid);
    this.activeJobId = null;
    this.activeClientRequestId = null;
    this.auth.logout().subscribe({
      next:     () => this.router.navigate(['/login']),
      // Local state is already cleared by AuthService on either branch;
      // still route to /login so the user is not stuck on the dashboard
      // staring at an unauthenticated view.
      error:    () => this.router.navigate(['/login']),
    });
  }

  /** Extracts the numeric portion of a tier label for CSS class binding. */
  tierClass(reliability: string): string {
    if (reliability.endsWith('1')) return '1';
    if (reliability.endsWith('2')) return '2';
    return '3';
  }

  /**
   * Maps a numeric confidence score to one of three colour bands so the
   * score bar, the numeric label, and the overall confidence chip all
   * share consistent visual styling.
   */
  scoreBand(score: number): 'high' | 'medium' | 'low' {
    if (score == null) return 'low';
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  /**
   * Renders a compact representation of a URL for table display: host
   * plus a truncated path so long URLs do not blow up the column width.
   */
  shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.host + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '...' : u.pathname);
    } catch {
      return url;
    }
  }

  /**
   * Subscribes to the streaming feed for the given job id and pushes
   * each emitted snapshot into the visible state signal.
   *
   * Each event is matched against {@link activeJobId} before mutating
   * any visible state — a stream that was opened against a now-
   * superseded job (because Run was clicked again before this
   * subscription tore down) must not be allowed to overwrite the new
   * run's snapshot. The same guard also drops cross-tab interference
   * if a second tab cancels the same job.
   *
   * Every accepted event is persisted into the cache so a reload at
   * any point during the workflow can restore the latest snapshot
   * without a backend round-trip.
   */
  private openStream(jobId: string) {
    this.streamSub = this.jobs.stream(jobId).subscribe({
      next: status => {
        if (status.jobId !== this.activeJobId) {
          // Stale event from a job that has since been superseded —
          // drop silently. The other subscriber (if still attached)
          // gets the same event, but we no longer own the UI for
          // that job.
          return;
        }
        // Bump the visible update counter on every snapshot so the
        // user sees mid-stage pings even when `stage` stays the same.
        this.updateCount.update(n => n + 1);
        this.status.set(status);
        this.persistStatus(status);
        if (this.isTerminalState(status.state)) {
          this.clearReconnectTimer();
          // Stop the relative-time ticker on any terminal state so
          // the "Xs ago" label freezes at the moment the workflow
          // ended. CANCEL_REQUESTED is not terminal — we keep the
          // ticker running until CANCELED actually lands.
          this.stopNowTicker();
          this.canceling.set(false);
          // Detach the active pointer so the next Run click does
          // not try to supersede an already-terminal job. The
          // cached snapshot still survives in storage for hydrate.
          this.activeJobId = null;
        }
      },
      error: err => {
        if (this.activeJobId !== jobId) {
          // The stream that errored was already abandoned. Nothing
          // to surface — the active stream (if any) will report its
          // own errors.
          return;
        }
        this.updateCount.update(n => n + 1);
        const message = err?.message || 'Stream error';
        if (message.includes('authentication expired')) {
          this.router.navigate(['/login'], { queryParams: { reason: 'expired' } });
          return;
        }
        const current = this.status();
        if (current && this.isRunning()) {
          this.status.set({
            ...current,
            error: 'Connection interrupted. Reconnecting...',
            updatedAt: new Date().toISOString(),
          });
          this.streamSub = null;
          this.reconnectStream(jobId);
          return;
        }
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
      },
      complete: () => {
        if (this.activeJobId === jobId && this.isRunning()) {
          this.reconnectStream(jobId);
        }
      },
    });
  }

  /**
   * Whether the supplied state is one of the public terminal states.
   * Mirrors the same predicate the backend enforces on JobStore.
   */
  private isTerminalState(state: JobStatus['state']): boolean {
    return state === 'DONE' || state === 'FAILED' || state === 'CANCELED';
  }

  /**
   * Mints a fresh client request id. Uses the browser's crypto.randomUUID
   * when available (every browser Angular 18 targets), and falls back to
   * a timestamp+random string so legacy environments still produce
   * something unique enough for matching purposes.
   */
  private mintClientRequestId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch { /* fall through */ }
    return `c-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  /**
   * Writes the initial cache record on a successful submit. The
   * status field is the optimistic local PENDING snapshot — the
   * first real event from the stream will overwrite it via
   * {@link persistStatus}.
   */
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
      resumeUntil: '',     // storage fills in the default 24h TTL.
    };
    this.storage.save(record);
  }

  /**
   * Folds the latest snapshot into the cache without rewriting the
   * full record. The storage layer drops the update silently when
   * the cached record's jobId does not match — the same guarantee
   * that protects against stale stream events landing on the new
   * active record.
   */
  private persistStatus(status: JobStatus): void {
    if (!status.jobId) return;
    this.storage.update({
      jobId: status.jobId,
      status,
      updatedAt: status.updatedAt,
    });
  }

  /**
   * Restores a previously-submitted job from cache on component init.
   *
   * Terminal records render immediately and do not reopen a stream:
   * the deliverable is already in the cache and the backend may have
   * already pruned the job. Non-terminal records render their cached
   * snapshot first and then reopen the stream so the user sees fresh
   * updates as soon as the connection is alive again.
   */
  private hydrateFromCache(): void {
    const userId = this.auth.currentUserId();
    const sid = this.auth.currentSessionId();
    const record = this.storage.load(userId, sid);
    if (!record) return;

    this.query = record.query;
    this.activeClientRequestId = record.clientRequestId;
    this.status.set(record.status);
    this.updateCount.set(0);

    if (this.isTerminalState(record.status.state)) {
      // Terminal cache hit — show the cached final report (or error)
      // without any backend traffic. activeJobId stays null so the
      // next Run click does not try to supersede a finished job.
      this.activeJobId = null;
      return;
    }

    // Still in flight when last persisted — attach the active pointer
    // and reopen the stream. The first event will update the
    // snapshot, and the terminal path will clear activeJobId.
    this.activeJobId = record.jobId;
    this.startNowTicker();
    this.openStream(record.jobId);
  }

  /** Cancels any active streaming subscription. */
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

  /**
   * Starts the 1Hz ticker that drives the relative "Xs ago" label.
   * Safe to call repeatedly — only one interval is ever live.
   */
  private startNowTicker() {
    if (this.nowInterval) return;
    this.now.set(Date.now());
    this.nowInterval = setInterval(() => this.now.set(Date.now()), 1000);
  }

  /** Stops the relative-time ticker. */
  private stopNowTicker() {
    if (this.nowInterval) {
      clearInterval(this.nowInterval);
      this.nowInterval = null;
    }
  }

  /**
   * Restores the user's most recent submission from the per-(userId,
   * sid) cache so a reload, tab close + reopen, or mobile screen
   * timeout does not lose the in-flight or just-completed run.
   */
  ngOnInit() {
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.hydrateFromCache();
  }

  /** Tears down stream + interval when the component is destroyed. */
  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.cancelStream();
  }
}
