import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  formatIndianCurrency,
  formatIndianLakhs,
  shouldAbbreviateInLakhs
} from '../../../core/utils/currency-format.util';

@Component({
  selector: 'app-indian-currency',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'indian-currency-host',
    '[attr.role]': 'canToggle ? "button" : null',
    '[attr.tabindex]': 'canToggle ? 0 : null',
    '[attr.title]': 'tooltip',
    '[class.clickable]': 'canToggle'
  },
  template: `{{ displayText }}`,
  styles: [`
    :host {
      display: inline-block;
      position: relative;
      z-index: 2;
      pointer-events: auto;
      color: inherit;
      -webkit-text-fill-color: currentColor;
      font-size: inherit;
      font-weight: inherit;
      line-height: inherit;
      letter-spacing: inherit;
    }

    :host.clickable {
      cursor: pointer;
      border-bottom: 1px dashed transparent;
      transition: border-color 0.15s ease;
    }

    :host.clickable:hover {
      border-bottom-color: currentColor;
    }
  `]
})
export class IndianCurrencyComponent implements AfterViewInit, OnDestroy {
  @Input() amount = 0;
  @Input() abbreviate = true;
  @Input() maximumFractionDigits = 2;
  @Input() showSymbol = true;

  showFullAmount = false;

  private readonly onHostClick = (event: Event) => this.toggleAmount(event);
  private readonly onHostKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      this.toggleAmount(event);
    }
  };

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    const host = this.elementRef.nativeElement;

    this.ngZone.runOutsideAngular(() => {
      host.addEventListener('click', this.onHostClick);
      host.addEventListener('keydown', this.onHostKeydown);
    });
  }

  ngOnDestroy(): void {
    const host = this.elementRef.nativeElement;
    host.removeEventListener('click', this.onHostClick);
    host.removeEventListener('keydown', this.onHostKeydown);
  }

  get canToggle(): boolean {
    return this.abbreviate && shouldAbbreviateInLakhs(this.amount);
  }

  get tooltip(): string | null {
    if (!this.canToggle) {
      return null;
    }

    return this.showFullAmount
      ? 'Click to show abbreviated amount'
      : 'Click to show full amount';
  }

  get displayText(): string {
    let text: string;

    if (this.canToggle && !this.showFullAmount) {
      text = formatIndianLakhs(this.amount, 2);
    } else {
      text = formatIndianCurrency(this.amount, this.maximumFractionDigits);
    }

    return this.showSymbol ? text : text.replace('₹', '');
  }

  private toggleAmount(event: Event): void {
    if (!this.canToggle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.showFullAmount = !this.showFullAmount;

    // Update only this component without triggering parent change detection.
    this.cdr.detectChanges();
  }
}
