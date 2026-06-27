import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * Top-level route table.
 *
 *  - / and unknown paths fall through to the dashboard guard.
 *  - /login, /signup, /locked, /maintenance are the public allow-list.
 *  - Lazy-loaded components keep the initial bundle small.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup.component').then(m => m.SignupComponent)
  },
  {
    path: 'locked',
    loadComponent: () =>
      import('./pages/locked/locked.component').then(m => m.LockedComponent)
  },
  {
    path: 'maintenance',
    loadComponent: () =>
      import('./pages/maintenance/maintenance.component').then(m => m.MaintenanceComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'privacy',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/privacy/privacy-center.component').then(m => m.PrivacyCenterComponent)
  },
  { path: '**', redirectTo: 'dashboard' }
];
