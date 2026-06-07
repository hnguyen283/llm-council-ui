import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LocaleService } from './locale.service';

export interface UserUsage {
  limitRequests: number;
  currentRequests: number;
  remainingRequests: number;
  limitTokens: number;
  currentTokens: number;
  remainingTokens: number;
  limitCostMicros: number;
  currentCostMicros: number;
  remainingCostMicros: number;
  warningActive: boolean;
  warningMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsageService {
  private http = inject(HttpClient);
  private locale = inject(LocaleService);
  private loadSequence = 0;

  readonly usage = signal<UserUsage | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadUsage(): void {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set(null);

    this.http.get<UserUsage>('/me/usage', { withCredentials: true }).subscribe({
      next: (data) => {
        if (sequence !== this.loadSequence) return;
        const safeNumber = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
        
        const mapped: UserUsage = {
          limitRequests: safeNumber(data?.limitRequests),
          currentRequests: safeNumber(data?.currentRequests),
          remainingRequests: safeNumber(data?.remainingRequests),
          limitTokens: safeNumber(data?.limitTokens),
          currentTokens: safeNumber(data?.currentTokens),
          remainingTokens: safeNumber(data?.remainingTokens),
          limitCostMicros: safeNumber(data?.limitCostMicros),
          currentCostMicros: safeNumber(data?.currentCostMicros),
          remainingCostMicros: safeNumber(data?.remainingCostMicros),
          warningActive: !!data?.warningActive,
          warningMessage: data?.warningMessage ?? null
        };
        
        this.usage.set(mapped);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err) => {
        if (sequence !== this.loadSequence) return;
        console.error('Failed to load user usage metrics:', err);
        this.error.set(this.locale.instant('Unable to load usage'));
        this.loading.set(false);
      }
    });
  }

  clear(): void {
    this.loadSequence++;
    this.usage.set(null);
    this.loading.set(false);
    this.error.set(null);
  }
}
