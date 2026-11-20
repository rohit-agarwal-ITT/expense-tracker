import { Injectable, inject } from '@angular/core';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { Firestore } from '@angular/fire/firestore';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { BackupReminderService } from './backup-reminder.service';
import { Expense } from '../models/expense.model';
import { Category } from '../models/category.model';
import { Trade } from '../models/trade.model';
import {
  APP_BACKUP_FORMAT_VERSION,
  AppBackupData,
  AppBackupPayload,
  BackupFileSummary,
  BackupRestoreMode,
  BackupRestoreResult,
  LiveDataCounts,
  WipeUserDataResult
} from '../models/app-backup.model';

const BATCH_SIZE = 450;

export interface BackupExportOptions {
  includeTrades?: boolean;
  includeUserSettings?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BackupRestoreService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private firebaseService = inject(FirebaseService);
  private backupReminderService = inject(BackupReminderService);

  async buildBackupPayload(options: BackupExportOptions = {}): Promise<AppBackupPayload> {
    const includeTrades = options.includeTrades !== false;
    const includeUserSettings = options.includeUserSettings !== false;

    const [expenses, categories, trades, userSettings] = await Promise.all([
      firstValueFrom(this.firebaseService.expenses$.pipe(take(1))),
      firstValueFrom(this.firebaseService.categories$.pipe(take(1))),
      includeTrades
        ? firstValueFrom(this.firebaseService.trades$.pipe(take(1)))
        : Promise.resolve([] as Trade[]),
      includeUserSettings
        ? firstValueFrom(this.firebaseService.userSettings$.pipe(take(1)))
        : Promise.resolve({})
    ]);

    const user = this.authService.getCurrentUser();

    return {
      version: APP_BACKUP_FORMAT_VERSION,
      app: 'expense-tracker',
      exportedAt: new Date().toISOString(),
      exportedBy: user?.email ?? undefined,
      data: {
        expenses: expenses.map((e) => this.stripUserFields(e)),
        categories: categories.map((c) => this.stripUserFields(c)),
        trades: includeTrades ? trades.map((t) => this.stripUserFields(t)) : [],
        userSettings: includeUserSettings ? this.clonePlain(userSettings) : undefined
      }
    };
  }

  downloadBackup(payload: AppBackupPayload, fileName?: string): void {
    const datePart = payload.exportedAt.split('T')[0];
    const name = fileName ?? `expense-tracker-backup-${datePart}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  async exportAndDownload(options?: BackupExportOptions): Promise<AppBackupPayload> {
    const payload = await this.buildBackupPayload(options);
    this.downloadBackup(payload);
    this.backupReminderService.recordBackup(payload.exportedAt);
    return payload;
  }

  parseBackupFile(text: string): AppBackupPayload {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('The file is not valid JSON. Choose an Expense Tracker backup file.');
    }

    const payload = this.normalizeBackupPayload(raw);
    if (!payload) {
      throw new Error(
        'Unrecognized backup format. Use a file exported from Expense Tracker (Backup page or Dashboard export).'
      );
    }
    return payload;
  }

  summarizeBackup(payload: AppBackupPayload): BackupFileSummary {
    return {
      exportedAt: payload.exportedAt,
      expenseCount: payload.data.expenses?.length ?? 0,
      categoryCount: payload.data.categories?.length ?? 0,
      tradeCount: payload.data.trades?.length ?? 0,
      hasSettings: !!payload.data.userSettings && Object.keys(payload.data.userSettings).length > 0,
      isLegacyFormat: false
    };
  }

  async restoreFromBackup(
    payload: AppBackupPayload,
    mode: BackupRestoreMode
  ): Promise<BackupRestoreResult> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      throw new Error('You must be signed in to restore a backup.');
    }

    const categories = this.sanitizeCategories(payload.data.categories ?? []);
    const expenses = this.sanitizeExpenses(payload.data.expenses ?? []);
    const trades = this.sanitizeTrades(payload.data.trades ?? []);

    const result: BackupRestoreResult = {
      categoriesWritten: 0,
      expensesWritten: 0,
      tradesWritten: 0,
      settingsRestored: false
    };

    if (mode === 'replace') {
      result.deletedBeforeImport = {
        expenses: await this.firebaseService.deleteCollectionForUser('expenses', userId),
        categories: await this.firebaseService.deleteCollectionForUser('categories', userId),
        trades: await this.firebaseService.deleteCollectionForUser('trades', userId)
      };
    }

    result.categoriesWritten = await this.writeDocuments('categories', categories, userId);
    result.expensesWritten = await this.writeDocuments('expenses', expenses, userId);
    result.tradesWritten = await this.writeDocuments('trades', trades, userId);

    if (payload.data.userSettings && Object.keys(payload.data.userSettings).length > 0) {
      await this.firebaseService.saveUserSettings(payload.data.userSettings);
      result.settingsRestored = true;
    }

    return result;
  }

  async getLiveDataCounts(): Promise<LiveDataCounts> {
    const [expenses, categories, trades] = await Promise.all([
      firstValueFrom(this.firebaseService.expenses$.pipe(take(1))),
      firstValueFrom(this.firebaseService.categories$.pipe(take(1))),
      firstValueFrom(this.firebaseService.trades$.pipe(take(1)))
    ]);

    return {
      expenseCount: expenses.length,
      categoryCount: categories.length,
      tradeCount: trades.length
    };
  }

  /**
   * Permanently deletes all Firestore data for the signed-in user (batched deletes).
   */
  async wipeAllUserData(options: { resetSettings?: boolean } = {}): Promise<WipeUserDataResult> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      throw new Error('You must be signed in to delete your data.');
    }

    const resetSettings = options.resetSettings !== false;

    const [expensesDeleted, categoriesDeleted, tradesDeleted] = await Promise.all([
      this.firebaseService.deleteCollectionForUser('expenses', userId),
      this.firebaseService.deleteCollectionForUser('categories', userId),
      this.firebaseService.deleteCollectionForUser('trades', userId)
    ]);

    let settingsReset = false;
    if (resetSettings) {
      await this.firebaseService.resetUserSettingsForCurrentUser();
      settingsReset = true;
    }

    return {
      expensesDeleted,
      categoriesDeleted,
      tradesDeleted,
      settingsReset
    };
  }

  private normalizeBackupPayload(raw: unknown): AppBackupPayload | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const record = raw as Record<string, unknown>;

    if (record['app'] === 'expense-tracker' && record['data'] && typeof record['data'] === 'object') {
      const data = record['data'] as AppBackupData;
      return {
        version: typeof record['version'] === 'number' ? record['version'] : APP_BACKUP_FORMAT_VERSION,
        app: 'expense-tracker',
        exportedAt: typeof record['exportedAt'] === 'string' ? record['exportedAt'] : new Date().toISOString(),
        exportedBy: typeof record['exportedBy'] === 'string' ? record['exportedBy'] : undefined,
        data: {
          expenses: Array.isArray(data.expenses) ? data.expenses : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          trades: Array.isArray(data.trades) ? data.trades : [],
          userSettings:
            data.userSettings && typeof data.userSettings === 'object'
              ? (data.userSettings as Record<string, unknown>)
              : undefined
        }
      };
    }

    if (Array.isArray(record['expenses']) && Array.isArray(record['categories'])) {
      return {
        version: APP_BACKUP_FORMAT_VERSION,
        app: 'expense-tracker',
        exportedAt:
          typeof record['exportDate'] === 'string' ? record['exportDate'] : new Date().toISOString(),
        data: {
          expenses: record['expenses'] as Expense[],
          categories: record['categories'] as Category[],
          trades: Array.isArray(record['trades']) ? (record['trades'] as Trade[]) : []
        }
      };
    }

    return null;
  }

  private stripUserFields<T extends { userId?: string }>(item: T): T {
    const { userId, ...rest } = item;
    return rest as T;
  }

  private clonePlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private sanitizeCategories(categories: Category[]): Category[] {
    return categories
      .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon
      }));
  }

  private sanitizeExpenses(expenses: Expense[]): Expense[] {
    return expenses
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.categoryId === 'string' &&
          typeof e.amount === 'number' &&
          typeof e.date === 'string'
      )
      .map((e) => ({ ...e }));
  }

  private sanitizeTrades(trades: Trade[]): Trade[] {
    return trades
      .filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.symbol === 'string' &&
          typeof t.amount === 'number' &&
          typeof t.date === 'string'
      )
      .map((t) => ({ ...t }));
  }

  private async writeDocuments<T extends { id: string }>(
    collectionName: string,
    items: T[],
    userId: string
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    let written = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.firestore);
      const chunk = items.slice(i, i + BATCH_SIZE);
      let batchCount = 0;

      for (const item of chunk) {
        const { id, ...rest } = item;
        if (!id) {
          continue;
        }
        const docRef = doc(this.firestore, collectionName, id);
        const existing = await getDoc(docRef);
        if (existing.exists()) {
          const ownerId = existing.data()['userId'] as string | undefined;
          if (ownerId !== userId) {
            console.warn(
              `Skipped restore ${collectionName}/${id}: belongs to another user`
            );
            continue;
          }
        }
        batch.set(docRef, { ...rest, userId }, { merge: false });
        batchCount++;
      }

      if (batchCount > 0) {
        await batch.commit();
        written += batchCount;
      }
    }

    return written;
  }
}