import { Injectable } from '@angular/core';
import { JobStatus } from './jobs.service';

/** Shape of an entry in the prompt cache list. */
export interface PromptCacheEntry {
  readonly query: string;
  readonly status: JobStatus;
  readonly locale: string;
  readonly timestamp: string;
}

/**
 * Singleton service that manages client-side caching of the last three successfully
 * completed research queries and their final reports.
 *
 * Scoped by `userId` to preserve the user privacy boundary between logins on the
 * same device/browser profile.
 */
@Injectable({ providedIn: 'root' })
export class PromptCacheService {
  private readonly storageKeyPrefix = 'llm-council.prompt-cache.v1.';

  /**
   * Loads the prompt cache for the specified user from localStorage.
   * Returns an array of up to 3 entries, or an empty array.
   */
  load(userId: string | null): PromptCacheEntry[] {
    if (!userId) return [];
    try {
      const raw = localStorage.getItem(this.storageKeyPrefix + userId);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && typeof item.query === 'string' && item.status);
      }
    } catch (err) {
      console.warn('[PromptCacheService] Load failed:', err);
    }
    return [];
  }

  /**
   * Saves a successfully completed research run to the user's prompt cache.
   * Displaces older entries to keep exactly the most recent 3 unique queries.
   */
  save(userId: string | null, query: string, status: JobStatus, locale: string): void {
    if (!userId || !query.trim() || !status || status.state !== 'DONE') return;
    try {
      const list = this.load(userId);
      const trimmedQuery = query.trim();

      // Enforce unique queries: discard previous record of the same query (case-insensitive)
      const filtered = list.filter(
        item => item.query.trim().toLowerCase() !== trimmedQuery.toLowerCase()
      );

      const newEntry: PromptCacheEntry = {
        query: trimmedQuery,
        status,
        locale,
        timestamp: new Date().toISOString(),
      };

      // Prepend the new result and slice to keep only the last three entries
      const updated = [newEntry, ...filtered].slice(0, 3);
      localStorage.setItem(this.storageKeyPrefix + userId, JSON.stringify(updated));
    } catch (err) {
      console.warn('[PromptCacheService] Save failed:', err);
    }
  }

  /**
   * Wipes the cached entries for the specified user.
   */
  clearFor(userId: string | null): void {
    if (!userId) return;
    try {
      localStorage.removeItem(this.storageKeyPrefix + userId);
    } catch (err) {
      console.warn('[PromptCacheService] Clear failed:', err);
    }
  }
}
