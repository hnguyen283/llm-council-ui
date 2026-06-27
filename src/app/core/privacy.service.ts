import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

export type PrivacyRequestType =
  | 'ACCESS_EXPORT'
  | 'CORRECTION'
  | 'DELETION'
  | 'RESTRICTION'
  | 'WITHDRAW_CONSENT';

export type PrivacyRequestStatus =
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED_LEGAL_HOLD'
  | 'PENDING_LEGAL_APPROVAL';

export type PrivacyExportStatus =
  | 'NOT_REQUESTED'
  | 'PREPARING'
  | 'AVAILABLE'
  | 'EXPIRED'
  | 'UNAVAILABLE'
  | 'BLOCKED'
  | 'FAILED';

export interface PrivacySummary {
  dataSubjectId: string;
  email: string;
  registeredAt: string;
  supportedRequestTypes: PrivacyRequestType[];
  openRequestCount: number;
  policyCopyKeys: Record<string, string>;
}

export interface PrivacyRequestSummary {
  requestId: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface PrivacyTimelineEvent {
  status: string;
  occurredAt: string;
  messageKey: string;
}

export interface LegalHoldOutcome {
  active: boolean;
  affectedActions: string[];
  reasonCategory: string | null;
  messageKey: string | null;
}

export interface ReceiptMetadata {
  available: boolean;
  path: string | null;
}

export interface ExportMetadata {
  status: PrivacyExportStatus;
  path: string | null;
}

export interface PrivacyRequestDetail {
  request: PrivacyRequestSummary;
  timeline: PrivacyTimelineEvent[];
  legalHold: LegalHoldOutcome;
  receipt: ReceiptMetadata;
  export: ExportMetadata;
}

export interface CompletionReceipt {
  receiptId: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  submittedAt: string;
  completedAt: string;
  completedActions: string[];
  blockedActions: string[];
  legalHold: LegalHoldOutcome;
  correlationId: string;
}

@Injectable({ providedIn: 'root' })
export class PrivacyService {
  private readonly http = inject(HttpClient);
  private overviewSequence = 0;
  private detailSequence = 0;

  readonly summary = signal<PrivacySummary | null>(null);
  readonly requests = signal<PrivacyRequestSummary[]>([]);
  readonly selectedRequest = signal<PrivacyRequestDetail | null>(null);
  readonly receipt = signal<CompletionReceipt | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly submitting = signal(false);
  readonly receiptLoading = signal(false);
  readonly downloading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly noticeKey = signal<string | null>(null);

  loadOverview(preferredRequestId?: string, quiet = false): void {
    const sequence = ++this.overviewSequence;
    if (!quiet) this.loading.set(true);
    this.errorKey.set(null);

    forkJoin({
      summary: this.http.get<PrivacySummary>('/me/privacy/summary'),
      requests: this.http.get<PrivacyRequestSummary[]>('/me/privacy/requests')
    }).subscribe({
      next: ({ summary, requests }) => {
        if (sequence !== this.overviewSequence) return;
        this.summary.set(summary);
        this.requests.set(requests ?? []);
        this.loading.set(false);

        const currentId = this.selectedRequest()?.request.requestId;
        const nextId = preferredRequestId
          ?? (currentId && requests.some(item => item.requestId === currentId) ? currentId : undefined)
          ?? requests[0]?.requestId;
        if (nextId) {
          this.loadDetail(nextId, quiet);
        } else {
          this.selectedRequest.set(null);
          this.receipt.set(null);
        }
      },
      error: () => {
        if (sequence !== this.overviewSequence) return;
        this.loading.set(false);
        if (!quiet) this.errorKey.set('Unable to load privacy requests.');
      }
    });
  }

  loadDetail(requestId: string, quiet = false): void {
    const sequence = ++this.detailSequence;
    if (!quiet) this.detailLoading.set(true);
    this.errorKey.set(null);
    this.receipt.set(null);

    this.http.get<PrivacyRequestDetail>(`/me/privacy/requests/${encodeURIComponent(requestId)}`).subscribe({
      next: detail => {
        if (sequence !== this.detailSequence) return;
        this.selectedRequest.set(detail);
        this.detailLoading.set(false);
      },
      error: () => {
        if (sequence !== this.detailSequence) return;
        this.detailLoading.set(false);
        if (!quiet) this.errorKey.set('Unable to load privacy request details.');
      }
    });
  }

  createRequest(requestType: PrivacyRequestType): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.errorKey.set(null);
    this.noticeKey.set(null);

    this.http.post<PrivacyRequestSummary>('/me/privacy/requests', { requestType })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: request => {
          this.noticeKey.set('Privacy request submitted.');
          this.loadOverview(request.requestId);
        },
        error: (error: HttpErrorResponse) => {
          this.errorKey.set(this.errorFor(error, 'Unable to submit the privacy request.'));
        }
      });
  }

  loadReceipt(requestId: string): void {
    if (this.receiptLoading()) return;
    this.receiptLoading.set(true);
    this.errorKey.set(null);

    this.http.get<CompletionReceipt>(`/me/privacy/requests/${encodeURIComponent(requestId)}/receipt`)
      .pipe(finalize(() => this.receiptLoading.set(false)))
      .subscribe({
        next: receipt => this.receipt.set(receipt),
        error: (error: HttpErrorResponse) => {
          this.errorKey.set(this.errorFor(error, 'Unable to load the completion receipt.'));
        }
      });
  }

  downloadExport(requestId: string): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.errorKey.set(null);

    this.http.get(`/me/privacy/requests/${encodeURIComponent(requestId)}/export`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: response => this.saveDownload(response, requestId),
        error: (error: HttpErrorResponse) => {
          this.errorKey.set(this.errorFor(error, 'Unable to download the privacy export.'));
        }
      });
  }

  clearNotice(): void {
    this.noticeKey.set(null);
  }

  clear(): void {
    this.overviewSequence++;
    this.detailSequence++;
    this.summary.set(null);
    this.requests.set([]);
    this.selectedRequest.set(null);
    this.receipt.set(null);
    this.loading.set(false);
    this.detailLoading.set(false);
    this.errorKey.set(null);
    this.noticeKey.set(null);
  }

  private saveDownload(response: HttpResponse<Blob>, requestId: string): void {
    if (!response.body) {
      this.errorKey.set('Unable to download the privacy export.');
      return;
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(disposition);
    const filename = match?.[1] ? decodeURIComponent(match[1].trim()) : `privacy-export-${requestId}.json`;
    const url = URL.createObjectURL(response.body);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    this.noticeKey.set('Privacy export downloaded.');
  }

  private errorFor(error: HttpErrorResponse, fallback: string): string {
    const code = error.error?.code;
    if (code === 'PRIVACY_EXPORT_NOT_AVAILABLE') return 'No authorized export is available yet.';
    if (code === 'PRIVACY_EXPORT_NOT_READY') return 'The privacy export is still being prepared.';
    if (code === 'PRIVACY_RECEIPT_NOT_READY') return 'The completion receipt is not ready yet.';
    if (code === 'PRIVACY_REQUEST_NOT_FOUND') return 'The privacy request could not be found.';
    return fallback;
  }
}
