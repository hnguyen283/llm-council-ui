import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { LocaleCode, LocaleService } from './locale.service';

/**
 * Wire shape for one source row in the final report. Mirrors the
 * backend record so client and server can exchange the report directly
 * without translation.
 */
export interface RankedSource {
  url: string;
  /**
   * Coarse tier label preserved for clients that bucket sources into
   * tiers; derived from the numeric confidence score below.
   */
  reliability: 'Tier 1' | 'Tier 2' | 'Tier 3';
  summary: string;
  /** Numeric confidence score on the supplied source. */
  confidenceScore: number;
  /** One-sentence justification for the score. */
  rationale: string;
}

/**
 * Wire shape for the deliverable produced at the end of a research run.
 *
 * `directAnswer` is the short, source-free natural-language answer
 * synthesised by the post-judge `FinalAnswerStateAction`. It is optional
 * on the wire so older backends and degraded runs (where the synthesis
 * step was skipped, errored, or timed out) can still emit a valid report;
 * the UI falls back to the ranked findings/sources in that case.
 */
export interface FinalReport {
  query: string;
  keyFindings: string[];
  conflicts: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sources: RankedSource[];
  degraded?: boolean;
  degradationNotes?: string[];
  directAnswer?: string | null;
}

/**
 * Coarse lifecycle of a job from acceptance through terminal state.
 *
 * Permitted transitions:
 * ```
 *   PENDING ──► RUNNING ──► DONE
 *      │           │     ╲──► FAILED
 *      │           │
 *      └──► CANCEL_REQUESTED ──► CANCELED
 *                  ▲
 *                  └── RUNNING may also transition here when the owner
 *                      posts /jobs/{id}/cancel mid-run.
 * ```
 * `DONE`, `FAILED`, and `CANCELED` are terminal. Once terminal, the
 * backend drops late updates so subscribers will never see a canceled
 * job flip back to `DONE`.
 */
export type JobState =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELED';

/** Snapshot returned by both the polling and the streaming endpoints. */
export interface JobStatus {
  jobId: string;
  state: JobState;
  stage: string;
  updatedAt: string;
  result: FinalReport | null;
  error: string | null;
  quickAnswer?: string | null;
}

/**
 * Acknowledgement payload returned by the submission endpoint.
 *
 * `clientRequestId` is always populated: when the SPA sent one on the
 * request body the orchestrator echoes it verbatim, otherwise the
 * server mints one. The SPA stores this id alongside the cached job
 * session record and uses it to discard stream events that belong to
 * a superseded local generation.
 */
export interface JobAccepted {
  jobId: string;
  clientRequestId: string;
}

/**
 * Optional metadata accepted by {@link JobsService.submit}. Both fields
 * are forwarded to the orchestrator on the request body and are safe to
 * omit — old call sites that pass only `(query, locale?)` keep working.
 */
export interface JobSubmitOptions {
  /**
   * Client-side request generation id. Mint a fresh UUID for every Run
   * click; the orchestrator echoes it on {@link JobAccepted} so the SPA
   * can verify the response matches the click that issued it.
   */
  clientRequestId?: string;
  /**
   * Id of an owned active job that this submission should cancel as
   * part of being accepted. The backend cancels the prior job
   * atomically before creating the new one; mismatched ownership is
   * silently ignored so stale ids are harmless.
   */
  supersedesJobId?: string;
}

/**
 * Singleton service that owns the conversation with the orchestrator's
 * job API.
 *
 * Exposes three operations: submit a job, fetch a snapshot, and
 * subscribe to the streaming progress feed. The streaming code uses
 * fetch with a readable stream rather than the browser's native event
 * source so the bearer token can be attached to the request.
 */
@Injectable({ providedIn: 'root' })
export class JobsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private locale = inject(LocaleService);

  /**
   * Submits a research job. The active UI locale rides on the request
   * so the orchestrator can request localised prompt material from the
   * prompt service. Callers can override the locale for one-off use
   * cases such as test fixtures or share links.
   *
   * `opts.clientRequestId` and `opts.supersedesJobId` are optional and
   * only meaningful for resume/cancel-aware callers (dashboard). Old
   * call sites that omit `opts` continue to work unchanged; the body
   * shape stays additive-compatible with the original
   * `{ query, locale }` contract.
   */
  submit(
    query: string,
    overrideLocale?: LocaleCode,
    opts?: JobSubmitOptions
  ): Observable<JobAccepted> {
    const locale = overrideLocale ?? this.locale.current();
    // Only include the optional fields when the caller actually
    // supplied them so the wire body stays minimal for legacy callers
    // and easier to inspect in network traces.
    const body: {
      query: string;
      locale: LocaleCode;
      clientRequestId?: string;
      supersedesJobId?: string;
    } = { query, locale };
    if (opts?.clientRequestId) body.clientRequestId = opts.clientRequestId;
    if (opts?.supersedesJobId) body.supersedesJobId = opts.supersedesJobId;
    return this.http.post<JobAccepted>('/jobs', body);
  }

  /** Returns the latest snapshot for a known job. */
  get(jobId: string): Observable<JobStatus> {
    return this.http.get<JobStatus>(`/jobs/${jobId}`);
  }

  /**
   * Returns the orchestrator's view of the user's currently active
   * (non-terminal) job, or `null` when none exists.
   *
   * Fallback path used by the dashboard when its local cache is
   * empty (cleared browser data, fresh login on a new browser
   * profile, etc.) but the auth session is still valid. The server
   * answers with `204 No Content` for "no active job", which Angular
   * surfaces as a `null` body on the typed observable.
   */
  active(): Observable<JobStatus | null> {
    return this.http.get<JobStatus | null>('/jobs/active');
  }

  /**
   * Asks the orchestrator to cancel an in-flight job. Returns the
   * authoritative snapshot — typically `CANCEL_REQUESTED` for a
   * pending/running job, or the existing terminal snapshot when the
   * job had already completed or been cancelled before this call.
   *
   * The terminal `CANCELED` transition is driven by the workflow
   * engine at its next cooperative boundary and arrives over the
   * existing SSE stream, not on this response. Callers that want to
   * react to the terminal state should rely on their open stream
   * subscription rather than polling here.
   *
   * The body is optional — `reason` is purely audit/UX context and
   * surfaces in the snapshot's `error` field on the resulting
   * `CANCELED` event so the user can tell intentional stops apart
   * from workflow failures.
   */
  cancel(jobId: string, reason?: string): Observable<JobStatus> {
    const body = reason && reason.trim() ? { reason: reason.trim() } : {};
    return this.http.post<JobStatus>(`/jobs/${jobId}/cancel`, body);
  }

  /**
   * Subscribes to incremental job updates over server-sent events.
   *
   * The native browser event source cannot attach custom headers, so
   * the stream is consumed manually with fetch and a text decoder. The
   * observable emits one parsed snapshot per event and completes when
   * the upstream closes the stream. Cancelling the subscription aborts
   * the underlying request.
   */
  stream(jobId: string): Observable<JobStatus> {
    return new Observable<JobStatus>(subscriber => {
      const controller = new AbortController();

      const open = async (attempt = 0): Promise<void> => {
        const hasFreshToken = await firstValueFrom(this.auth.refreshIfNeeded(15));
        if (!hasFreshToken) {
          subscriber.error(new Error('SSE failed: authentication expired'));
          return;
        }
        const token = this.auth.token();

        const res = await fetch(`/jobs/${jobId}/stream`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          credentials: 'include',
          signal: controller.signal
        });
        if (res.status === 401 && attempt === 0) {
          const refreshed = await firstValueFrom(this.auth.refresh());
          if (refreshed) {
            return open(1);
          }
        }
        if (!res.ok || !res.body) {
          subscriber.error(new Error(`SSE failed: HTTP ${res.status}`));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Events are delimited by a blank line; consume each complete
          // event from the buffer and leave any partial tail for the
          // next read.
          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLines = rawEvent
              .split('\n')
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trim());
            if (dataLines.length === 0) continue;
            try {
              const status = JSON.parse(dataLines.join('\n')) as JobStatus;
              subscriber.next(status);
            } catch (e) {
              console.warn('Bad SSE chunk:', dataLines, e);
            }
          }
        }
        subscriber.complete();
      };

      (async () => {
        try {
          await open();
        } catch (err) {
          if ((err as Error).name !== 'AbortError') subscriber.error(err);
        }
      })();

      return () => controller.abort();
    });
  }
}
