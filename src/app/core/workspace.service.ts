import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

const STORAGE_KEY = 'llm-council.activeWorkspaceId';

export interface WorkspaceSummary {
  tenantId: string;
  tenantKey: string;
  name: string;
  type: string;
  role: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private http = inject(HttpClient);

  readonly workspaces = signal<WorkspaceSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedWorkspaceId = signal<string | null>(this.loadStoredWorkspace());
  readonly activeWorkspace = computed(() => {
    const selected = this.selectedWorkspaceId();
    return this.workspaces().find(w => w.tenantId === selected)
      ?? this.workspaces().find(w => w.active)
      ?? this.workspaces()[0]
      ?? null;
  });

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const selected = this.selectedWorkspaceId();
    const url = selected
      ? `/me/workspaces?activeWorkspaceId=${encodeURIComponent(selected)}`
      : '/me/workspaces';
    this.http.get<WorkspaceSummary[]>(url).subscribe({
      next: rows => {
        this.workspaces.set(rows);
        if (selected && !rows.some(w => w.tenantId === selected)) {
          this.select(null);
        } else if (!selected) {
          const active = rows.find(w => w.active) ?? rows.find(w => w.type === 'PERSONAL') ?? rows[0];
          if (active) this.select(active.tenantId);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load workspaces');
        this.loading.set(false);
      }
    });
  }

  select(tenantId: string | null): void {
    this.selectedWorkspaceId.set(tenantId);
    try {
      if (tenantId) {
        localStorage.setItem(STORAGE_KEY, tenantId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Best-effort preference only. Server-side membership validation is authoritative.
    }
  }

  headerValue(): string | null {
    return this.selectedWorkspaceId();
  }

  private loadStoredWorkspace(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
