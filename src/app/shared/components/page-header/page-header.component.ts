import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="page-header">
      <div class="page-header__content">
        <div class="page-header__text">
          <h1 class="page-header__title">{{ title }}</h1>
          <p class="page-header__subtitle" *ngIf="subtitle">{{ subtitle }}</p>
        </div>
        <div class="page-header__actions" *ngIf="hasActions">
          <ng-content select="[headerActions]"></ng-content>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      background: var(--gradient-header-hero);
      border-radius: var(--radius-lg);
      padding: var(--space-8);
      margin-bottom: var(--space-6);
      box-shadow: var(--shadow-lg);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .page-header__content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-8);
    }

    .page-header__text {
      flex: 1;
      min-width: 0;
    }

    .page-header__title {
      color: white;
      font-size: var(--text-3xl);
      font-weight: var(--font-weight-bold);
      margin: 0 0 var(--space-2) 0;
      letter-spacing: -0.025em;
      line-height: 1.2;
    }

    .page-header__subtitle {
      color: rgba(255, 255, 255, 0.9);
      font-size: var(--text-base);
      margin: 0;
      font-weight: var(--font-weight-normal);
    }

    .page-header__actions {
      display: flex;
      gap: var(--space-4);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .page-header__actions ::ng-deep .action-btn {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 0.875rem 1.75rem;
      border-radius: var(--radius-md);
      font-size: 0.9375rem;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      backdrop-filter: blur(10px);
      text-decoration: none;
    }

    .page-header__actions ::ng-deep .action-btn:hover {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.2) 100%);
      transform: translateY(-1px);
    }

    .page-header__actions ::ng-deep .action-btn.primary {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.15) 100%);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .page-header__actions ::ng-deep .action-icon {
      font-size: var(--text-lg);
    }

    @media (max-width: 768px) {
      .page-header__content {
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        gap: var(--space-6);
      }

      .page-header__actions {
        justify-content: center;
      }

      .page-header__title {
        font-size: var(--text-2xl);
      }
    }
  `]
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() hasActions = true;
}
