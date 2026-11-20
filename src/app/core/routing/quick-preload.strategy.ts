import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Preload every lazy route as soon as the router registers it (parallel downloads).
 * Faster tab switches than waiting for PreloadAllModules idle window.
 */
@Injectable({ providedIn: 'root' })
export class QuickPreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.redirectTo) {
      return of(null);
    }
    return load();
  }
}