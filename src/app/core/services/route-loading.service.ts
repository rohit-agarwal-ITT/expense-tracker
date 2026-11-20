import { Injectable } from '@angular/core';
import {
  Router,
  NavigationStart,
  NavigationEnd,
  NavigationCancel,
  NavigationError
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';

/** Delay before showing fullscreen route loader (avoids flash on fast navigations). */
const ROUTE_LOADER_DELAY_MS = 120;
const ROUTE_LOADER_MAX_MS = 1000;

@Injectable({
  providedIn: 'root'
})
export class RouteLoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private maxLoaderTimer: ReturnType<typeof setTimeout> | null = null;
  private navigationDepth = 0;
  private navigationStartedAt = 0;

  constructor(private router: Router) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigationDepth++;
        this.navigationStartedAt = Date.now();
        this.scheduleLoader();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.navigationDepth = Math.max(0, this.navigationDepth - 1);
        this.clearLoader();
      }
    });
  }

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  private scheduleLoader(): void {
    if (this.pendingTimer !== null) {
      return;
    }

    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.navigationDepth > 0) {
        this.loadingSubject.next(true);
        this.armMaxLoaderTimeout();
      }
    }, ROUTE_LOADER_DELAY_MS);
  }

  private armMaxLoaderTimeout(): void {
    if (this.maxLoaderTimer !== null) {
      return;
    }
    const elapsed = Date.now() - this.navigationStartedAt;
    const remaining = Math.max(0, ROUTE_LOADER_MAX_MS - elapsed);
    this.maxLoaderTimer = setTimeout(() => {
      this.maxLoaderTimer = null;
      this.loadingSubject.next(false);
    }, remaining);
  }

  private clearLoader(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.maxLoaderTimer !== null) {
      clearTimeout(this.maxLoaderTimer);
      this.maxLoaderTimer = null;
    }
    this.loadingSubject.next(false);
  }
}