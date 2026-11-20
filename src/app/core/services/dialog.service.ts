import { Injectable } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';

export interface DialogConfig {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'confirm' | 'list';
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'number' | 'date' | 'email' | 'password' | 'color';
  inputValue?: string;
  inputPlaceholder?: string;
  inputLabel?: string;
  options?: Array<{ value: string; label: string; icon?: string }>;
  selectedValue?: string;
  fields?: Array<{
    name: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'email' | 'password' | 'color' | 'select';
    value: string;
    placeholder?: string;
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
  expenses?: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryId: string;
  }>;
  trades?: Array<{
    id: string;
    symbol: string;
    indexValue: number;
    tradeType: 'call' | 'put';
    isProfit: boolean;
    amount: number;
    date: string;
    notes?: string;
  }>;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  totalAmount?: number;
}

export interface DialogResult {
  confirmed: boolean;
  value?: string;
  selectedOption?: string;
  fieldValues?: { [key: string]: string };
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private dialogSubject = new BehaviorSubject<DialogConfig | null>(null);
  private resultSubject = new BehaviorSubject<DialogResult | null>(null);

  public dialog$ = this.dialogSubject.asObservable();
  public result$ = this.resultSubject.asObservable();

  /** Only one dialog may wait for a result at a time (avoids stale popups after tab switch). */
  private activeWaiter?: Subscription;
  private releasePendingWait?: (result: DialogResult) => void;

  private dismissActiveDialog(releaseValue?: DialogResult): void {
    if (this.releasePendingWait) {
      this.releasePendingWait(releaseValue ?? { confirmed: false });
      this.releasePendingWait = undefined;
    }
    this.activeWaiter?.unsubscribe();
    this.activeWaiter = undefined;
    this.dialogSubject.next(null);
    this.resultSubject.next(null);
  }

  private openDialog(config: DialogConfig): Promise<DialogResult> {
    this.dismissActiveDialog();
    this.dialogSubject.next(config);

    return new Promise<DialogResult>((resolve) => {
      this.releasePendingWait = resolve;

      this.activeWaiter = this.resultSubject
        .pipe(
          filter((r): r is DialogResult => r !== null),
          take(1)
        )
        .subscribe((result) => {
          this.releasePendingWait = undefined;
          this.activeWaiter = undefined;
          this.dialogSubject.next(null);
          this.resultSubject.next(null);
          resolve(result);
        });
    });
  }

  alert(message: string, title: string = 'Information'): Promise<void> {
    return this.openDialog({
      title,
      message,
      type: 'info',
      confirmText: 'OK'
    }).then(() => undefined);
  }

  success(message: string, title: string = 'Success'): Promise<void> {
    return this.openDialog({
      title,
      message,
      type: 'success',
      confirmText: 'OK'
    }).then(() => undefined);
  }

  warning(message: string, title: string = 'Warning'): Promise<void> {
    return this.openDialog({
      title,
      message,
      type: 'warning',
      confirmText: 'OK'
    }).then(() => undefined);
  }

  error(message: string, title: string = 'Error'): Promise<void> {
    return this.openDialog({
      title,
      message,
      type: 'error',
      confirmText: 'OK'
    }).then(() => undefined);
  }

  confirm(message: string, title: string = 'Confirm'): Promise<boolean> {
    return this.openDialog({
      title,
      message,
      type: 'confirm',
      confirmText: 'Yes',
      cancelText: 'No'
    }).then((result) => result.confirmed);
  }

  prompt(
    message: string,
    title: string = 'Input Required',
    defaultValue: string = '',
    inputType: 'text' | 'number' | 'date' | 'email' | 'password' = 'text',
    placeholder: string = '',
    label: string = ''
  ): Promise<string | null> {
    return this.openDialog({
      title,
      message,
      type: 'confirm',
      confirmText: 'OK',
      cancelText: 'Cancel',
      inputType,
      inputValue: defaultValue,
      inputPlaceholder: placeholder,
      inputLabel: label
    }).then((result) => (result.confirmed ? result.value ?? null : null));
  }

  select(
    message: string,
    title: string = 'Select Option',
    options: Array<{ value: string; label: string; icon?: string }>,
    selectedValue?: string
  ): Promise<string | null> {
    return this.openDialog({
      title,
      message,
      type: 'confirm',
      confirmText: 'OK',
      cancelText: 'Cancel',
      options,
      selectedValue
    }).then((result) => (result.confirmed ? result.selectedOption ?? null : null));
  }

  form(
    fields: Array<{
      name: string;
      label: string;
      type: 'text' | 'number' | 'date' | 'email' | 'password' | 'color' | 'select';
      value: string;
      placeholder?: string;
      required?: boolean;
      options?: Array<{ value: string; label: string }>;
    }>,
    title: string = 'Edit',
    message: string = 'Please fill in the details:'
  ): Promise<{ [key: string]: string } | null> {
    return this.openDialog({
      title,
      message,
      type: 'confirm',
      fields,
      confirmText: 'Save',
      cancelText: 'Cancel'
    }).then((result) => (result.confirmed ? result.fieldValues ?? null : null));
  }

  handleResult(result: DialogResult): void {
    this.resultSubject.next(result);
  }

  showExpenseList(
    expenses: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      categoryId: string;
    }>,
    categoryName: string,
    categoryIcon?: string,
    categoryColor?: string,
    message?: string,
    totalAmount?: number
  ): Promise<void> {
    return this.openDialog({
      title: categoryName,
      message: message || '',
      type: 'list',
      confirmText: 'Close',
      expenses,
      categoryName,
      categoryIcon,
      categoryColor,
      totalAmount
    }).then(() => undefined);
  }

  showTradeList(
    trades: Array<{
      id: string;
      symbol: string;
      indexValue: number;
      tradeType: 'call' | 'put';
      isProfit: boolean;
      amount: number;
      date: string;
      notes?: string;
    }>,
    title: string,
    message?: string,
    totalAmount?: number
  ): Promise<void> {
    return this.openDialog({
      title,
      message: message || '',
      type: 'list',
      confirmText: 'Close',
      trades,
      totalAmount
    }).then(() => undefined);
  }

  close(): void {
    this.dismissActiveDialog();
  }
}