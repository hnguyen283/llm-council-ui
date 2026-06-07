import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MissingTranslationHandler, MissingTranslationHandlerParams, provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { TRANSLATE_HTTP_LOADER_CONFIG, TranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export class EnglishKeyMissingTranslationHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    return params.key;
  }
}

/**
 * Application-wide provider configuration.
 *
 * Wires the router with the declared route table, configures the HTTP
 * client to run the authentication interceptor on every outbound call,
 * and enables event coalescing for change detection so user input does
 * not cause redundant tick passes.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: TRANSLATE_HTTP_LOADER_CONFIG,
      useValue: { prefix: '/i18n/', suffix: '.json' }
    },
    ...provideTranslateService({
      lang: 'en',
      fallbackLang: 'en',
      useDefaultLang: true,
      loader: {
        provide: TranslateLoader,
        useClass: TranslateHttpLoader
      },
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: EnglishKeyMissingTranslationHandler
      }
    })
  ]
};
