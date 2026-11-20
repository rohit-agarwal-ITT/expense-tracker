import { Category } from './category.model';
import { Expense } from './expense.model';
import { Trade } from './trade.model';

export const APP_BACKUP_FORMAT_VERSION = 1;

export interface AppBackupData {
  expenses: Expense[];
  categories: Category[];
  trades?: Trade[];
  userSettings?: Record<string, unknown>;
}

export interface AppBackupPayload {
  version: number;
  app: 'expense-tracker';
  exportedAt: string;
  exportedBy?: string;
  data: AppBackupData;
}

export type BackupRestoreMode = 'merge' | 'replace';

export interface BackupRestoreResult {
  categoriesWritten: number;
  expensesWritten: number;
  tradesWritten: number;
  settingsRestored: boolean;
  deletedBeforeImport?: {
    categories: number;
    expenses: number;
    trades: number;
  };
}

export interface BackupFileSummary {
  exportedAt: string;
  expenseCount: number;
  categoryCount: number;
  tradeCount: number;
  hasSettings: boolean;
  isLegacyFormat: boolean;
}

export interface LiveDataCounts {
  expenseCount: number;
  categoryCount: number;
  tradeCount: number;
}

export interface WipeUserDataResult {
  expensesDeleted: number;
  categoriesDeleted: number;
  tradesDeleted: number;
  settingsReset: boolean;
}