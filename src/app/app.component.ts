import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocaleService } from './core/locale.service';

/**
 * Root component of the single-page application.
 *
 * Renders only the router outlet so the active route component owns
 * the entire visual surface. Cross-cutting concerns such as authentication
 * and HTTP plumbing are wired up in the application configuration rather
 * than here so the root stays as small as possible.
 *
 * @author Nguyen Dong Hung
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent {
  private readonly locale = inject(LocaleService);
}
