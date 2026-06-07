import { Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { FinalReport } from '../../core/jobs.service';

/**
 * Standalone panel that surfaces the post-judge synthesised direct answer
 * produced by the orchestrator's `FinalAnswerStateAction`.
 *
 * Renders above the existing FinalReport panel so the user sees the
 * one-paragraph answer before scrolling into findings, conflicts, and
 * the ranked sources table. The component is deliberately
 * self-contained: it accepts the {@link FinalReport} via a signal input
 * and renders nothing when the synthesis step did not produce a usable
 * answer (synthesis skipped, errored, or returned a blank string), so
 * the dashboard layout stays clean for degraded runs.
 */
@Component({
  selector: 'app-direct-answer',
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (visible()) {
      <section class="direct-answer-card" [attr.aria-label]="'Direct answer' | translate">
        <div class="da-header">
          <h2>{{ 'Direct answer' | translate }}</h2>
          <span
            class="da-confidence da-confidence-{{ confidenceClass() }}"
            [title]="'Overall report confidence: {{confidence}}' | translate:{ confidence: (confidenceLabelKey() | translate) }"
          >
            {{ confidenceLabelKey() | translate }}
          </span>
        </div>
        <p class="da-body">{{ report()?.directAnswer }}</p>
        <p class="da-hint">
          {{ 'Source list and supporting evidence are shown below.' | translate }}
        </p>
      </section>
    }
  `,
  styles: [`
    .direct-answer-card {
      background: var(--bg-elev);
      border: 1px solid var(--accent);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.15);
    }
    .da-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .da-header h2 {
      margin: 0;
      font-size: 16px;
      color: var(--accent);
    }
    .da-confidence {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .da-confidence-high   { background: rgba(16,185,129,0.15); color: var(--green); }
    .da-confidence-medium { background: rgba(245,158,11,0.15); color: var(--amber); }
    .da-confidence-low    { background: rgba(239,68,68,0.15);  color: var(--red); }
    .da-body {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: var(--text);
      white-space: pre-wrap;
    }
    .da-hint {
      margin: 12px 0 0 0;
      font-size: 12px;
      color: var(--text-dim);
    }
  `]
})
export class DirectAnswerComponent {
  /**
   * Final report whose synthesised answer this panel renders. Accepts
   * null/undefined so the dashboard can pipe its signal straight in
   * without conditional logic at the call site.
   */
  readonly report = input<FinalReport | null | undefined>(null);

  /**
   * Reports whether the panel should render. Hidden when the report is
   * missing, the synthesis step did not run, or the synthesis step
   * returned a blank string.
   */
  readonly visible = computed(() => {
    const r = this.report();
    if (!r) return false;
    const ans = r.directAnswer;
    return typeof ans === 'string' && ans.trim().length > 0;
  });

  /** Maps the report-level confidence band to a CSS class suffix. */
  readonly confidenceClass = computed(() => {
    const c = this.report()?.confidence;
    return (c ?? 'low').toLowerCase();
  });

  readonly confidenceLabelKey = computed(() => {
    switch ((this.report()?.confidence ?? '').toUpperCase()) {
      case 'HIGH': return 'High confidence';
      case 'MEDIUM': return 'Medium confidence';
      case 'LOW': return 'Low confidence';
      default: return 'Low confidence';
    }
  });
}
