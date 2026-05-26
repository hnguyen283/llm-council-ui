import { Injectable, signal } from '@angular/core';

/**
 * Locale codes accepted by the backend. The strings must match the
 * locale columns recognised by the prompt service; adding a new locale
 * here without a matching column in the source data will simply fall
 * back to the default locale at lookup time.
 */
export type LocaleCode = 'en_US' | 'vn_VN';

/** Display metadata for the language switcher chip. */
export interface LocaleOption {
  code: LocaleCode;
  /** Human-readable label shown in tooltips and accessibility text. */
  label: string;
  /** Short label shown on the toggle button itself. */
  short: string;
}

/** Locale options exposed by the in-app language switcher. */
export const LOCALES: LocaleOption[] = [
  { code: 'en_US', label: 'English',    short: 'EN' },
  { code: 'vn_VN', label: 'Tiếng Việt', short: 'VN' }
];

/** Browser-storage key used to persist the chosen locale across sessions. */
const STORAGE_KEY = 'llm-council.locale';

/** Locale used when no preference is recorded in browser storage. */
const DEFAULT_LOCALE: LocaleCode = 'en_US';

/**
 * Singleton service that holds the active UI locale and forwards it
 * to the backend on every job submission.
 *
 * The current value is exposed as a signal so components re-render
 * automatically when the user switches language. The choice is
 * persisted to browser storage so reloads keep the previous selection.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly _locale = signal<LocaleCode>(this.readInitial());

  /** Readable signal that emits the active locale. */
  readonly locale = this._locale.asReadonly();

  /** Synchronous accessor for non-reactive callers. */
  current(): LocaleCode {
    return this._locale();
  }

  /** Switches to the supplied locale and persists the choice. */
  set(code: LocaleCode): void {
    if (code === this._locale()) return;
    this._locale.set(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode etc. */ }
  }

  /** Cycles through the available locales for the simple chip switcher. */
  cycle(): void {
    const i = LOCALES.findIndex(l => l.code === this._locale());
    const next = LOCALES[(i + 1) % LOCALES.length];
    this.set(next.code);
  }

  /**
   * Reads the persisted locale from browser storage, falling back to
   * the default when nothing is stored or the stored value is unknown.
   */
  private readInitial(): LocaleCode {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && LOCALES.some(l => l.code === v)) return v as LocaleCode;
    } catch { /* private mode etc. */ }
    return DEFAULT_LOCALE;
  }
}
