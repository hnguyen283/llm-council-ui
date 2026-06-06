import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Locale codes accepted by the backend. These values still match the
 * prompt-service locale columns and the `/jobs` request contract.
 */
export type LocaleCode = 'en_US' | 'vn_VN';
export type UiLanguageCode = 'en' | 'vi';

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
  { code: 'vn_VN', label: 'Tieng Viet', short: 'VI' }
];

const LEGACY_LOCALE_STORAGE_KEY = 'llm-council.locale';
const LANGUAGE_STORAGE_KEY = 'llm-council.ui-language';

/**
 * Singleton service that owns UI language and backend locale mapping.
 *
 * UI translation catalogs use standard language tags (`en`, `vi`), while
 * job submission keeps the existing backend locale contract (`en_US`,
 * `vn_VN`). The service also migrates the legacy locale storage value so
 * current users keep their previous language preference.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly _language = signal<UiLanguageCode>(this.readInitialLanguage());

  /** Readable signal that emits the active UI language. */
  readonly language = this._language.asReadonly();

  /** Readable signal that emits the active backend job locale. */
  readonly locale = signal<LocaleCode>(this.toBackendLocale(this._language()));

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs(['en', 'vi']);
    this.translate.setDefaultLang('en');
    this.useLanguage(this._language(), false);
  }

  /** Synchronous accessor for non-reactive callers that need the backend locale. */
  current(): LocaleCode {
    return this.locale();
  }

  /** Synchronous accessor for non-reactive callers that need the UI language. */
  currentLanguage(): UiLanguageCode {
    return this._language();
  }

  /** Switches to the supplied locale/language and persists the choice. */
  set(code: LocaleCode | UiLanguageCode | string): void {
    const lang = this.normalizeLanguage(code);
    if (lang === this._language()) return;
    this.useLanguage(lang, true);
  }

  /** Cycles through the available locales for the simple chip switcher. */
  cycle(): void {
    const i = LOCALES.findIndex(l => l.code === this.locale());
    const next = LOCALES[(i + 1) % LOCALES.length];
    this.set(next.code);
  }

  instant(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  private readInitialLanguage(): UiLanguageCode {
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) return this.normalizeLanguage(savedLanguage);

      const legacyLocale = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
      if (legacyLocale) return this.normalizeLanguage(legacyLocale);
    } catch { /* private mode etc. */ }

    const languages = this.browserLanguages();
    if (languages.some(lang => lang === 'vi' || lang.startsWith('vi-') || lang === 'vn' || lang.startsWith('vn-'))) {
      return 'vi';
    }
    return 'en';
  }

  private useLanguage(lang: UiLanguageCode, persist: boolean): void {
    const locale = this.toBackendLocale(lang);
    this._language.set(lang);
    this.locale.set(locale);
    this.translate.use(lang);
    document.documentElement.lang = lang;
    if (!persist) return;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, locale);
    } catch { /* private mode etc. */ }
  }

  private normalizeLanguage(code: LocaleCode | UiLanguageCode | string): UiLanguageCode {
    const normalized = String(code).trim().toLowerCase().replace('_', '-');
    if (normalized === 'vn-vn' || normalized === 'vi-vn' || normalized === 'vi' || normalized === 'vn' || normalized.startsWith('vi-')) {
      return 'vi';
    }
    return 'en';
  }

  private toBackendLocale(lang: UiLanguageCode): LocaleCode {
    return lang === 'vi' ? 'vn_VN' : 'en_US';
  }

  private browserLanguages(): string[] {
    const nav = window.navigator;
    const values = Array.isArray(nav.languages) && nav.languages.length > 0
      ? nav.languages
      : [nav.language];
    return values.filter(Boolean).map(value => value.toLowerCase());
  }
}
