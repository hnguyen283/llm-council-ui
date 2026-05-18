import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { JobsService, JobStatus } from '../../core/jobs.service';
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
          @if (status()) {
            <button (click)="reset()" [disabled]="isRunning()">Clear</button>
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
              [class.pulsing]="s.state === 'RUNNING' || s.state === 'PENDING'"
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
    .state-pending  { background: rgba(148,163,184,0.15); color: var(--text-dim); }
    .state-running  { background: rgba(59,130,246,0.15); color: var(--accent); }
    .state-done     { background: rgba(16,185,129,0.15); color: var(--green); }
    .state-failed   { background: rgba(239,68,68,0.15); color: var(--red); }
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
export class DashboardComponent implements OnDestroy {
  private jobs = inject(JobsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private localeService = inject(LocaleService);

  readonly locales = LOCALES;
  query = '';
  status = signal<JobStatus | null>(null);
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
  isRunning = computed(() => {
    const s = this.status();
    return s !== null && (s.state === 'PENDING' || s.state === 'RUNNING');
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

  /** Switches the active locale via the shared locale service. */
  setLocale(code: LocaleCode) {
    this.localeService.set(code);
  }

  /** Toggles the collapsible "Key findings" panel. */
  toggleKeyFindings() {
    this.keyFindingsOpen.update(v => !v);
  }

  /**
   * Submits the current question and opens the streaming subscription
   * as soon as the orchestrator returns the new job identifier.
   */
  run() {
    this.cancelStream();
    this.status.set(null);
    this.keyFindingsOpen.set(false);
    this.updateCount.set(0);
    this.startNowTicker();
    this.jobs.submit(this.query.trim(), this.localeService.current()).subscribe({
      next: ({ jobId }) => this.openStream(jobId),
      error: err => this.status.set({
        jobId: '', state: 'FAILED', stage: 'failed',
        updatedAt: new Date().toISOString(),
        result: null,
        error: err?.message || 'Failed to submit job'
      })
    });
  }

  /** Cancels any active stream and clears the visible state. */
  reset() {
    this.cancelStream();
    this.status.set(null);
    this.query = '';
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
    this.cancelStream();
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
   */
  private openStream(jobId: string) {
    this.streamSub = this.jobs.stream(jobId).subscribe({
      next: status => {
        // Bump the visible update counter on every snapshot so the
        // user sees mid-stage pings even when `stage` stays the same.
        this.updateCount.update(n => n + 1);
        this.status.set(status);
        if (status.state === 'DONE' || status.state === 'FAILED') {
          this.stopNowTicker();
        }
      },
      error: err => {
        this.updateCount.update(n => n + 1);
        this.status.set({
          jobId, state: 'FAILED', stage: 'failed',
          updatedAt: new Date().toISOString(),
          result: null,
          error: err?.message || 'Stream error'
        });
        this.stopNowTicker();
      }
    });
  }

  /** Cancels any active streaming subscription. */
  private cancelStream() {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    this.stopNowTicker();
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

  /** Tears down stream + interval when the component is destroyed. */
  ngOnDestroy() {
    this.cancelStream();
  }
}
