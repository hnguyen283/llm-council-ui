import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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

@Injectable({ providedIn: 'root' })
export class UsageService {
  private http = inject(HttpClient);

  readonly usage = signal<UserUsage | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadUsage(): void {
    this.loading.set(true);
    this.error.set(null);

    this.http.get<UserUsage>('/me/usage', { withCredentials: true }).subscribe({
      next: (data) => {
        const safeNumber = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
        
        const mapped: UserUsage = {
          limitRequests: safeNumber(data?.limitRequests),
          currentRequests: safeNumber(data?.currentRequests),
          remainingRequests: safeNumber(data?.remainingRequests),
          limitCostMicros: safeNumber(data?.limitCostMicros),
          currentCostMicros: safeNumber(data?.currentCostMicros),
          remainingCostMicros: safeNumber(data?.remainingCostMicros),
          warningActive: !!data?.warningActive,
          warningMessage: data?.warningMessage ?? null
        };
        
        this.usage.set(mapped);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load user usage metrics:', err);
        this.error.set('Unable to load usage');
        this.loading.set(false);
      }
    });
  }

  clear(): void {
    this.usage.set(null);
    this.loading.set(false);
    this.error.set(null);
  }
}
