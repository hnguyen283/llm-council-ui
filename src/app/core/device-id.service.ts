import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceIdService {
  private readonly storageKey = 'llm-council.device-id.v1';
  private fallbackId: string | null = null;

  current(): string {
    try {
      const existing = localStorage.getItem(this.storageKey);
      if (existing) return existing;
      const created = this.mint();
      localStorage.setItem(this.storageKey, created);
      return created;
    } catch {
      this.fallbackId ??= this.mint();
      return this.fallbackId;
    }
  }

  private mint(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch { /* fall through */ }
    return `device-${Date.now()}-${Math.floor(Math.random() * 1e12).toString(36)}`;
  }
}
