import { Component, input, computed } from '@angular/core';
import { UserUsage } from '../../../core/usage.service';

@Component({
  selector: 'app-usage-summary-card',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="usage-status" role="status">
        <span class="spinner"></span> Loading usage...
      </div>
    } @else if (error()) {
      <div class="usage-status error" role="alert">
        ⚠️ {{ error() }}
      </div>
    } @else if (!usage()) {
      <div class="usage-status">No usage data yet</div>
    } @else {
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
    .usage-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      font-size: 13px;
      color: var(--text-dim);
      background: rgba(255, 255, 255, 0.02);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
    }
    .usage-status.error {
      color: var(--red);
      background: rgba(239, 68, 68, 0.05);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class UsageSummaryCardComponent {
  readonly usage = input<UserUsage | null>(null);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);

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
