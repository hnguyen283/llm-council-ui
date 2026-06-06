import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobStatus } from '../../../core/jobs.service';

@Component({
  selector: 'app-quick-answer-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (quickAnswerText()) {
      <section 
        class="quick-answer-card" 
        [class.collapsed]="!isExpanded()"
        [class.has-a2]="isA2()"
        role="region" 
        aria-labelledby="qa-title"
      >
        <button
          type="button"
          class="collapsible-header"
          [attr.aria-expanded]="isExpanded()"
          (click)="toggleExpanded()"
          aria-controls="qa-content-area"
        >
          <span class="chevron" [class.open]="isExpanded()" aria-hidden="true">&#9656;</span>
          <span class="lightning-bolt" aria-hidden="true">⚡</span>
          <h3 id="qa-title">Quick Answer</h3>
          
          <!-- Badges & Metadata -->
          <div class="metadata-badges">
            @if (state() === 'DONE') {
              <span class="badge superseded">Superseded by final report</span>
            } @else {
              @if (isA2()) {
                <span class="badge enhanced-badge animate-pulse-subtle">Enhanced (A2)</span>
              } @else if (isA1()) {
                <span class="badge basic-badge">Basic (A1)</span>
              }

              @if (isCached()) {
                <span class="badge cached-badge">Cached</span>
              } @else {
                <span class="badge run-badge">Current Run</span>
              }
            }
          </div>

          @if (updatedTimeText()) {
            <span class="updated-time">{{ updatedTimeText() }}</span>
          }
        </button>
        
        <!-- Live Region for Screen Readers -->
        <div class="sr-only" aria-live="polite">
          {{ liveRegionAnnouncement() }}
        </div>

        <div 
          id="qa-content-area" 
          class="quick-answer-content" 
          [class.show]="isExpanded()"
        >
          @if (showA2UpgradeAlert()) {
            <div class="upgrade-banner" role="status">
              <span class="sparkle">✨</span> Enhanced answer updated from current research
            </div>
          }
          
          <div class="answer-text">
            {{ quickAnswerText() }}
          </div>
        </div>
      </section>
    }
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

    .quick-answer-card {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(147, 51, 234, 0.06) 100%);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: 0 4px 24px rgba(59, 130, 246, 0.04);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .quick-answer-card:hover {
      box-shadow: 0 6px 30px rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.35);
    }

    /* Subtle HSL Glow for A2 */
    .quick-answer-card.has-a2 {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%);
      border-color: rgba(16, 185, 129, 0.3);
    }

    .quick-answer-card.has-a2:hover {
      border-color: rgba(16, 185, 129, 0.45);
      box-shadow: 0 6px 30px rgba(16, 185, 129, 0.08);
    }

    .collapsible-header {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      flex-wrap: wrap;
      min-height: 44px; /* Touch target */
    }

    .chevron {
      display: inline-block;
      color: var(--text-dim);
      transition: transform 0.2s ease;
      font-size: 12px;
      line-height: 1;
    }

    .chevron.open {
      transform: rotate(90deg);
    }

    .lightning-bolt {
      font-size: 16px;
      color: var(--amber);
      animation: lightning-glow 2s infinite alternate;
    }

    @keyframes lightning-glow {
      from { filter: drop-shadow(0 0 1px rgba(245, 158, 11, 0.2)); }
      to { filter: drop-shadow(0 0 5px rgba(245, 158, 11, 0.7)); }
    }

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }

    .metadata-badges {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      letter-spacing: 0.3px;
    }

    .badge.superseded {
      color: var(--text-dim);
      background: rgba(148, 163, 184, 0.15);
    }

    .badge.enhanced-badge {
      color: #10b981;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .badge.basic-badge {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .badge.cached-badge {
      color: var(--text-dim);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
    }

    .badge.run-badge {
      color: var(--amber);
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.2);
    }

    .updated-time {
      margin-left: auto;
      font-size: 11px;
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
    }

    .quick-answer-content {
      display: none;
      flex-direction: column;
      gap: 12px;
      margin-top: 14px;
      line-height: 1.6;
      font-size: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 14px;
    }

    .quick-answer-content.show {
      display: flex;
    }

    .upgrade-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #34d399;
      font-weight: 500;
      animation: slide-down 0.3s ease-out;
    }

    .sparkle {
      font-size: 14px;
    }

    .answer-text {
      color: var(--text);
      white-space: pre-wrap;
    }

    .animate-pulse-subtle {
      animation: pulse-subtle 2s infinite;
    }

    @keyframes pulse-subtle {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.75; }
    }

    @keyframes slide-down {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 640px) {
      .collapsible-header {
        gap: 6px;
      }
      .updated-time {
        width: 100%;
        margin-left: 20px;
        margin-top: 4px;
      }
      .metadata-badges {
        margin-left: 20px;
      }
    }
  `]
})
export class QuickAnswerCardComponent {
  status = input<JobStatus | null>(null);

  // Manual toggle state
  private userExpanded = signal<boolean | null>(null);

  isExpanded = computed(() => {
    if (this.userExpanded() !== null) {
      return this.userExpanded()!;
    }
    // Default: expanded during RUNNING/PENDING stages, collapsed on DONE if final answer exists
    const state = this.status()?.state;
    return state === 'RUNNING' || state === 'PENDING' || state === 'CANCEL_REQUESTED';
  });

  quickAnswerText = computed(() => this.status()?.quickAnswer || '');
  
  quickAnswerInfo = computed(() => this.status()?.quickAnswerInfo);

  state = computed(() => this.status()?.state);

  isA1 = computed(() => this.quickAnswerInfo()?.artifactType === 'A1');
  isA2 = computed(() => this.quickAnswerInfo()?.artifactType === 'A2');
  isCached = computed(() => this.quickAnswerInfo()?.source === 'CACHE');

  showA2UpgradeAlert = computed(() => {
    return this.isA2() && this.quickAnswerInfo()?.source === 'CURRENT_RUN';
  });

  updatedTimeText = computed(() => {
    const info = this.quickAnswerInfo();
    if (!info) return '';
    const dateStr = info.establishedAt;
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return `Updated at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  });

  // Generates announcements for screen readers when quick answer changes
  liveRegionAnnouncement = computed(() => {
    const text = this.quickAnswerText();
    const type = this.isA2() ? 'Enhanced' : 'Basic';
    if (!text) return 'Quick Answer is empty.';
    return `${type} Quick Answer updated: ${text.substring(0, 100)}...`;
  });

  toggleExpanded() {
    this.userExpanded.set(!this.isExpanded());
  }
}
