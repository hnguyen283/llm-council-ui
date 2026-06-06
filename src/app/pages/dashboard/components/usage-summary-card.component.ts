import { Component, input, computed } from '@angular/core';

export interface UserUsage {
  limitRequests: number;
  currentRequests: number;
  remainingRequests: number;
  limitCostMicros: number;
  currentCostMicros: number;
  remainingCostMicros: number;
  warningActive: boolean;
  warningMessage: string | null;
}

@Component({
  selector: 'app-usage-summary-card',
  standalone: true,
  template: `
    @if (usage(); as u) {
      <div class="usage-card" role="region" aria-label="Usage details">
        <h3>Usage Overview</h3>
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="label">Requests Used Today</span>
            <span class="value">{{ u.currentRequests }} / {{ u.limitRequests }}</span>
            <div class="progress-bar">
              <div class="fill" [style.width.%]="requestPercent()"></div>
            </div>
          </div>
          
          <div class="metric-item">
            <span class="label">Estimated Cost</span>
            <span class="value">{{ formattedCost() }}</span>
          </div>

          <div class="metric-item">
            <span class="label">Remaining Budget</span>
            <span class="value">{{ formattedRemaining() }}</span>
            <div class="progress-bar">
              <div class="fill green" [style.width.%]="costPercentRemaining()"></div>
            </div>
          </div>
        </div>

        @if (u.warningActive && u.warningMessage) {
          <div class="warning-banner" role="alert">
            ⚠️ {{ u.warningMessage }}
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .usage-card {
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
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font-size: 12px;
      color: var(--text-dim);
    }
    .value {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .fill.green {
      background: var(--green);
    }
    .warning-banner {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--amber);
      color: #fcd34d;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
  `]
})
export class UsageSummaryCardComponent {
  readonly usage = input<UserUsage | null>(null);

  readonly requestPercent = computed(() => {
    const u = this.usage();
    if (!u || u.limitRequests === 0) return 0;
    return Math.min(100, (u.currentRequests / u.limitRequests) * 100);
  });

  readonly costPercentRemaining = computed(() => {
    const u = this.usage();
    if (!u || u.limitCostMicros === 0) return 0;
    return Math.max(0, Math.min(100, (u.remainingCostMicros / u.limitCostMicros) * 100));
  });

  readonly formattedCost = computed(() => {
    const u = this.usage();
    if (!u) return '$0.00';
    return '$' + (u.currentCostMicros / 1000000.0).toFixed(2);
  });

  readonly formattedRemaining = computed(() => {
    const u = this.usage();
    if (!u) return '$0.00';
    return '$' + (u.remainingCostMicros / 1000000.0).toFixed(2);
  });
}
