import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { JobStatus } from '../../../core/jobs.service';

export interface StageTiming {
  stage: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
}

@Component({
  selector: 'app-request-details-accordion',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    @if (status(); as s) {
      <div class="details-container">
        <!-- Main Collapsible Accordion Trigger -->
        <button
          type="button"
          class="main-details-trigger"
          [attr.aria-expanded]="isMainExpanded()"
          (click)="toggleMain()"
          aria-controls="main-details-content"
        >
          <span class="chevron" [class.open]="isMainExpanded()" aria-hidden="true">&#9656;</span>
          <span>{{ 'Advanced Request Details' | translate }}</span>
          @if (s.result; as result) {
            <span class="badge" *ngIf="result.sources.length">
              {{ 'Sources count' | translate:{ count: result.sources.length } }}
            </span>
          }
        </button>

        <!-- Main Details Content area -->
        <div
          id="main-details-content"
          class="main-details-content"
          [class.show]="isMainExpanded()"
        >
          @if (s.result; as result) {
            <!-- 1. Key Findings Collapsible -->
            @if (result.keyFindings.length) {
              <div class="sub-block">
                <button
                  type="button"
                  class="sub-collapsible-trigger"
                  [attr.aria-expanded]="isFindingsExpanded()"
                  (click)="toggleFindings()"
                  aria-controls="findings-content"
                >
                  <span class="chevron" [class.open]="isFindingsExpanded()" aria-hidden="true">&#9656;</span>
                  <h4>{{ 'Key Findings ({{count}})' | translate:{ count: result.keyFindings.length } }}</h4>
                </button>

                <div
                  id="findings-content"
                  class="sub-collapsible-content"
                  [class.show]="isFindingsExpanded()"
                >
                  <ul class="findings-list">
                    @for (f of result.keyFindings; track f) {
                      <li>{{ f }}</li>
                    }
                  </ul>
                </div>
              </div>
            }

            <!-- 2. Sources Table Collapsible -->
            @if (result.sources.length) {
              <div class="sub-block">
                <button
                  type="button"
                  class="sub-collapsible-trigger"
                  [attr.aria-expanded]="isSourcesExpanded()"
                  (click)="toggleSources()"
                  aria-controls="sources-content"
                >
                  <span class="chevron" [class.open]="isSourcesExpanded()" aria-hidden="true">&#9656;</span>
                  <h4>{{ 'Sources & Citations' | translate }}</h4>
                </button>

                <div
                  id="sources-content"
                  class="sub-collapsible-content scrollable-table-wrapper"
                  [class.show]="isSourcesExpanded()"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{{ 'Tier' | translate }}</th>
                        <th scope="col">{{ 'Score' | translate }}</th>
                        <th scope="col">URL</th>
                        <th scope="col">{{ 'Rationale' | translate }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (src of result.sources; track src.url) {
                        <tr>
                          <td>
                            <span class="tier-badge" [class]="'tier-' + tierClass(src.reliability)">
                              {{ src.reliability }}
                            </span>
                          </td>
                          <td>
                            <div class="score-container" [title]="src.rationale || ''">
                              <span class="score-val" [class]="scoreBand(src.confidenceScore)">
                                {{ src.confidenceScore }}
                              </span>
                              <div class="score-bar-bg">
                                <div
                                  class="score-bar-fill"
                                  [class]="scoreBand(src.confidenceScore)"
                                  [style.width.%]="src.confidenceScore"
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <a [href]="src.url" target="_blank" rel="noopener" class="source-link">
                              {{ shortUrl(src.url) }}
                            </a>
                          </td>
                          <td class="rationale-text">{{ src.rationale || src.summary }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }

          <!-- 3. Stage Timings Collapsible (DEBUG ONLY) -->
          @if (debugMode() && timings().length) {
            <div class="sub-block">
              <button
                type="button"
                class="sub-collapsible-trigger"
                [attr.aria-expanded]="isTimingsExpanded()"
                (click)="toggleTimings()"
                aria-controls="timings-content"
              >
                <span class="chevron" [class.open]="isTimingsExpanded()" aria-hidden="true">&#9656;</span>
                <h4>{{ 'Step-by-step Execution Timings' | translate }}</h4>
              </button>

              <div
                id="timings-content"
                class="sub-collapsible-content"
                [class.show]="isTimingsExpanded()"
              >
                <div class="timings-timeline">
                  @for (t of timings(); track t.stage) {
                    <div class="timeline-row">
                      <span class="timeline-stage capitalize">{{ t.stage }}</span>
                      <span class="timeline-duration">{{ formatDuration(t.durationMs) }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- 4. Telemetry / Diagnostics Collapsible (DEBUG ONLY) -->
          @if (debugMode()) {
            <div class="sub-block">
              <button
                type="button"
                class="sub-collapsible-trigger"
                [attr.aria-expanded]="isTelemetryExpanded()"
                (click)="toggleTelemetry()"
                aria-controls="telemetry-content"
              >
                <span class="chevron" [class.open]="isTelemetryExpanded()" aria-hidden="true">&#9656;</span>
                <h4>{{ 'Diagnostics & Raw State' | translate }}</h4>
              </button>

              <div
                id="telemetry-content"
                class="sub-collapsible-content"
                [class.show]="isTelemetryExpanded()"
              >
                <div class="telemetry-grid">
                  <div class="telemetry-item">
                    <span class="label">{{ 'Job ID' | translate }}</span>
                    <span class="value select-all">{{ s.jobId }}</span>
                  </div>
                  <div class="telemetry-item">
                    <span class="label">{{ 'Current State' | translate }}</span>
                    <span class="value">{{ s.state }}</span>
                  </div>
                  <div class="telemetry-item">
                    <span class="label">{{ 'Current Stage' | translate }}</span>
                    <span class="value">{{ s.stage }}</span>
                  </div>
                  <div class="telemetry-item">
                    <span class="label">{{ 'Last Updated' | translate }}</span>
                    <span class="value">{{ s.updatedAt }}</span>
                  </div>
                </div>
                <details class="raw-json-details">
                  <summary>{{ 'View raw JSON response' | translate }}</summary>
                  <pre class="raw-json"><code>{{ s | json }}</code></pre>
                </details>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .capitalize {
      text-transform: capitalize;
    }

    .select-all {
      user-select: all;
    }

    .details-container {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .main-details-trigger {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 14px 16px;
      background: transparent;
      border: none;
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
      cursor: pointer;
      text-align: left;
      min-height: 44px; /* Touch target */
    }

    .main-details-trigger:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .badge {
      background: rgba(59, 130, 246, 0.12);
      color: var(--accent);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: auto;
    }

    .chevron {
      display: inline-block;
      color: var(--text-dim);
      transition: transform 0.2s ease;
      font-size: 11px;
      line-height: 1;
    }

    .chevron.open {
      transform: rotate(90deg);
    }

    .main-details-content {
      display: none;
      flex-direction: column;
      border-top: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.02);
    }

    .main-details-content.show {
      display: flex;
    }

    .sub-block {
      border-bottom: 1px solid var(--border);
    }

    .sub-block:last-child {
      border-bottom: none;
    }

    .sub-collapsible-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 12px 16px;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      min-height: 44px; /* Touch target */
    }

    .sub-collapsible-trigger:hover {
      background: rgba(255, 255, 255, 0.01);
    }

    .sub-collapsible-trigger h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-dim);
    }

    .sub-collapsible-content {
      display: none;
      padding: 0 16px 16px 16px;
      font-size: 13px;
      line-height: 1.6;
    }

    .sub-collapsible-content.show {
      display: block;
    }

    /* Key Findings List */
    .findings-list {
      margin: 0;
      padding-left: 20px;
    }

    .findings-list li {
      margin-bottom: 8px;
      color: var(--text);
    }

    .findings-list li:last-child {
      margin-bottom: 0;
    }

    /* Sources Table style */
    .scrollable-table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding-left: 0;
      padding-right: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      min-width: 500px;
    }

    th, td {
      padding: 10px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    th {
      color: var(--text-dim);
      font-weight: 600;
      background: rgba(0, 0, 0, 0.05);
      font-size: 11px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .tier-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .tier-1 { background: rgba(16, 185, 129, 0.12); color: var(--green); }
    .tier-2 { background: rgba(59, 130, 246, 0.12); color: var(--accent); }
    .tier-3 { background: rgba(148, 163, 184, 0.12); color: var(--text-dim); }

    .score-container {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 90px;
    }

    .score-val {
      font-weight: 700;
      font-size: 11px;
      min-width: 24px;
      text-align: right;
    }

    .score-val.high { color: var(--green); }
    .score-val.medium { color: var(--accent); }
    .score-val.low { color: var(--red); }

    .score-bar-bg {
      flex: 1;
      height: 5px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
    }

    .score-bar-fill {
      height: 100%;
      border-radius: 3px;
    }

    .score-bar-fill.high { background: var(--green); }
    .score-bar-fill.medium { background: var(--accent); }
    .score-bar-fill.low { background: var(--red); }

    .source-link {
      color: var(--accent);
      font-weight: 500;
      word-break: break-all;
    }

    .source-link:hover {
      text-decoration: underline;
    }

    .rationale-text {
      color: var(--text-dim);
    }

    /* Timings Timeline */
    .timings-timeline {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(0, 0, 0, 0.1);
      padding: 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
    }

    .timeline-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .timeline-row:last-child {
      border-bottom: none;
    }

    .timeline-stage {
      font-weight: 600;
      color: var(--text);
    }

    .timeline-duration {
      font-variant-numeric: tabular-nums;
      color: var(--text-dim);
    }

    /* Telemetry styles */
    .telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: rgba(0, 0, 0, 0.1);
      padding: 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      margin-bottom: 12px;
    }

    .telemetry-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .telemetry-item .label {
      font-size: 11px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .telemetry-item .value {
      font-size: 12px;
      color: var(--text);
      font-weight: 500;
      word-break: break-all;
    }

    .raw-json-details summary {
      cursor: pointer;
      color: var(--accent);
      font-size: 12px;
      margin-top: 8px;
    }

    .raw-json {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      overflow-x: auto;
      font-size: 11px;
      color: #34d399;
      margin-top: 8px;
    }

    @media (max-width: 640px) {
      .telemetry-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RequestDetailsAccordionComponent {
  status = input<JobStatus | null>(null);
  compactMode = input<boolean>(false);
  timings = input<StageTiming[]>([]);

  // Debug mode isolate
  debugMode = input<boolean>(false);

  // Local collapsible toggles
  private userMainExpanded = signal<boolean | null>(null);

  isMainExpanded = computed(() => {
    if (this.compactMode() && this.userMainExpanded() === null) {
      return false;
    }
    if (this.userMainExpanded() !== null) {
      return this.userMainExpanded()!;
    }
    return false; // Default starts collapsed
  });

  isFindingsExpanded = signal(false);
  isSourcesExpanded = signal(false);
  isTimingsExpanded = signal(false);
  isTelemetryExpanded = signal(false);

  toggleMain() {
    this.userMainExpanded.set(!this.isMainExpanded());
  }

  toggleFindings() {
    this.isFindingsExpanded.update(v => !v);
  }

  toggleSources() {
    this.isSourcesExpanded.update(v => !v);
  }

  toggleTimings() {
    this.isTimingsExpanded.update(v => !v);
  }

  toggleTelemetry() {
    this.isTelemetryExpanded.update(v => !v);
  }

  tierClass(reliability: string): string {
    if (reliability.endsWith('1')) return '1';
    if (reliability.endsWith('2')) return '2';
    return '3';
  }

  scoreBand(score: number): 'high' | 'medium' | 'low' {
    if (score == null) return 'low';
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.host + (u.pathname.length > 25 ? u.pathname.slice(0, 25) + '...' : u.pathname);
    } catch {
      return url;
    }
  }

  formatDuration(durationMs: number): string {
    const totalSec = Math.round(durationMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  }
}
