import { Injectable } from '@angular/core';
import { JobStatus } from './jobs.service';

/**
 * Versioned client-side record of the single active research job for a
 * given (`userId`, `sid`) pair.
 *
 * The dashboard persists one of these on every submission and on every
 * stream snapshot so that closing the tab, locking a mobile screen, or
 * reloading the page can restore the user's in-flight or just-completed
 * run without a backend round-trip.
 *
 * The schema is intentionally narrow:
 * - `version` lets us bump the storage layout without colliding with old
 *   payloads — older versions are deleted on load.
 * - `userId` + `sid` form the trust boundary. A record whose keys do not
 *   match the live auth session is treated as foreign and dropped on
 *   load.
 * - `clientRequestId` lets the dashboard correlate stream events to its
 *   current local generation, so a stray event from a superseded job
 *   cannot mutate the new run's UI state.
 * - `jobId`, `query`, `locale` reconstitute the submission.
 * - `status` is the most recent {@link JobStatus} snapshot, including
 *   any final report or error message, so terminal results render
 *   instantly without re-hitting `GET /jobs/{id}`.
 * - `resumeUntil` is an ISO-8601 TTL after which the record is no
 *   longer considered fresh enough to hydrate.
 */
export interface JobSessionRecord {
  readonly version: 1;
  readonly userId: string;
  readonly sid: string;
  readonly clientRequestId: string;
  readonly jobId: string;
  readonly query: string;
  readonly locale: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly status: JobStatus;
  readonly resumeUntil: string;
}

/** Default TTL for a stored job session, in milliseconds. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Sole storage key. Bump the version suffix when the schema changes. */
const STORAGE_KEY = 'llm-council.job-session.v1';

/** Current record version literal. */
const CURRENT_VERSION = 1 as const;

/**
 * Owns the lone localStorage slot that persists the active research job
 * across tab close, mobile screen timeout, and hard reload.
 *
 * The service deliberately exposes a small, opinionated API rather than a
 * generic key/value cache: there is one active record per browser
 * profile, scoped to the current `(userId, sid)`. The dashboard creates
 * a record on submit, updates it on every stream snapshot, and clears it
 * on logout. Older / cross-user / TTL-expired records are silently
 * dropped on load.
 *
 * Storage choice — `localStorage` — was made because the record is one
 * snapshot, well under the typical 5MB quota even with a full final
 * report. If reports start blowing the quota, the storage backend can be
 * swapped to IndexedDB behind this same surface without touching
 * components. See section 4.2 of the implementation plan.
 *
 * **Privacy:** records contain the user's prompt and any returned
 * findings. The trust boundary is the {@code userId:sid} keying plus
 * explicit `clearFor` on logout — bearer tokens are never persisted
 * here.
 */
@Injectable({ providedIn: 'root' })
export class JobSessionStorageService {
  /**
   * Loads the active record for the supplied identity, or returns null
   * when no record exists, when the keying does not match the supplied
   * identity, when the stored payload is corrupt, or when the record's
   * TTL has elapsed. In the last three cases the underlying entry is
   * deleted so subsequent calls do not have to re-validate.
   *
   * The contract is "give me a record I can render right now or
   * nothing" — callers do not need to inspect the record for staleness
   * themselves.
   */
  load(userId: string | null, sid: string | null): JobSessionRecord | null {
    if (!userId || !sid) return null;
    const raw = this.safeRead();
    if (raw === null) return null;

    const record = this.parse(raw);
    if (record === null) {
      // Corrupt or wrong version — purge so the next caller starts
      // clean rather than re-trying the parse.
      this.safeRemove();
      return null;
    }
    if (record.userId !== userId || record.sid !== sid) {
      // Foreign record. We do NOT delete it — the previous user may
      // legitimately return, and we don't want to wipe their cache
      // just because someone else briefly logged in.
      return null;
    }
    if (this.isExpired(record)) {
      this.safeRemove();
      return null;
    }
    return record;
  }

  /**
   * Replaces the active record. The caller is responsible for ensuring
   * the record's `userId`/`sid` match the live auth session — the
   * service writes the value verbatim. `resumeUntil` is filled in with
   * the default TTL when blank so callers don't have to compute it on
   * every save.
   */
  save(record: JobSessionRecord): void {
    const normalised: JobSessionRecord = {
      ...record,
      version: CURRENT_VERSION,
      resumeUntil: record.resumeUntil || this.defaultResumeUntil(record.submittedAt),
    };
    this.safeWrite(normalised);
  }

  /**
   * Merges a partial update into the active record when the supplied
   * `jobId` matches. Used by the dashboard to fold in stream snapshots
   * without rewriting the whole record. No-op when no record exists or
   * the `jobId` does not match — that guards against a stale stream
   * event from a superseded job mutating the new active record.
   */
  update(partial: Partial<JobSessionRecord> & { jobId: string }): void {
    const raw = this.safeRead();
    if (raw === null) return;
    const current = this.parse(raw);
    if (current === null) {
      this.safeRemove();
      return;
    }
    if (current.jobId !== partial.jobId) return;
    const merged: JobSessionRecord = {
      ...current,
      ...partial,
      version: CURRENT_VERSION,
      updatedAt: partial.updatedAt ?? new Date().toISOString(),
    };
    this.safeWrite(merged);
  }

  /**
   * Unconditional delete. Used as a defensive sweep — most clear paths
   * should prefer {@link clearFor} so a foreign record is not wiped by
   * accident.
   */
  clear(): void {
    this.safeRemove();
  }

  /**
   * Deletes the record only when its keying matches the supplied
   * identity. Logout calls this so a user who logs out cannot have
   * their cache trampled by a subsequent login under a different
   * account that has not yet completed.
   */
  clearFor(userId: string | null, sid: string | null): void {
    if (!userId || !sid) return;
    const raw = this.safeRead();
    if (raw === null) return;
    const current = this.parse(raw);
    if (current === null) {
      // Corrupt → purge so we leave a clean slot.
      this.safeRemove();
      return;
    }
    if (current.userId === userId && current.sid === sid) {
      this.safeRemove();
    }
  }

  // ---------- internals ----------

  private parse(raw: string): JobSessionRecord | null {
    try {
      const obj = JSON.parse(raw) as Partial<JobSessionRecord> | null;
      if (obj === null || typeof obj !== 'object') return null;
      if (obj.version !== CURRENT_VERSION) return null;
      // Validate the fields we actually rely on at hydrate time. We do
      // NOT deep-validate `status` — it is a wire shape that may evolve
      // and the dashboard tolerates unknown JobState values.
      if (typeof obj.userId !== 'string' || !obj.userId) return null;
      if (typeof obj.sid !== 'string' || !obj.sid) return null;
      if (typeof obj.clientRequestId !== 'string' || !obj.clientRequestId) return null;
      if (typeof obj.jobId !== 'string' || !obj.jobId) return null;
      if (typeof obj.query !== 'string') return null;
      if (typeof obj.locale !== 'string') return null;
      if (typeof obj.submittedAt !== 'string') return null;
      if (typeof obj.updatedAt !== 'string') return null;
      if (typeof obj.resumeUntil !== 'string') return null;
      if (obj.status === undefined || obj.status === null
          || typeof obj.status !== 'object') return null;
      return obj as JobSessionRecord;
    } catch {
      return null;
    }
  }

  private isExpired(record: JobSessionRecord): boolean {
    const until = Date.parse(record.resumeUntil);
    if (Number.isNaN(until)) return true;
    return until <= Date.now();
  }

  private defaultResumeUntil(submittedAt: string): string {
    const base = Date.parse(submittedAt);
    const millis = Number.isNaN(base) ? Date.now() : base;
    return new Date(millis + DEFAULT_TTL_MS).toISOString();
  }

  private safeRead(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // localStorage can throw in private-mode browsers and when the
      // surrounding origin disables storage entirely. The dashboard
      // degrades gracefully — no resume, no error to the user.
      this.warn('read failed', err);
      return null;
    }
  }

  private safeWrite(record: JobSessionRecord): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (err) {
      // Most likely QuotaExceededError — a very large final report
      // landed in the cache. We do not bubble this up because the
      // current tab still has the in-memory state; only the next
      // reload loses the ability to hydrate.
      this.warn('write failed (quota or storage disabled)', err);
    }
  }

  private safeRemove(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      this.warn('remove failed', err);
    }
  }

  private warn(message: string, err: unknown): void {
    // Console-only — surfacing this in the UI would be noise. The
    // dashboard's hydrate path treats every failure as "no record".
    // eslint-disable-next-line no-console
    console.warn(`[JobSessionStorageService] ${message}:`, err);
  }
}
