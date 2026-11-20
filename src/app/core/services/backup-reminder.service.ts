import { Injectable } from '@angular/core';

const STORAGE_LAST_BACKUP = 'expense-tracker-last-backup-at';
const STORAGE_REMINDER_ENABLED = 'expense-tracker-backup-reminder-enabled';
const STORAGE_SNOOZE_UNTIL = 'expense-tracker-backup-reminder-snooze-until';
const STORAGE_PROMPT_DATE = 'expense-tracker-backup-reminder-prompt-date';

/** Remind if no backup in this many days (monthly). */
export const BACKUP_REMINDER_INTERVAL_DAYS = 30;
export const BACKUP_REMINDER_SNOOZE_DAYS = 7;

export interface BackupReminderStatus {
  enabled: boolean;
  lastBackupAt: string | null;
  daysSinceLastBackup: number | null;
  isDue: boolean;
  daysOverdue: number;
  snoozedUntil: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class BackupReminderService {
  isReminderEnabled(): boolean {
    const stored = localStorage.getItem(STORAGE_REMINDER_ENABLED);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  }

  setReminderEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_REMINDER_ENABLED, enabled ? 'true' : 'false');
  }

  getLastBackupAt(): string | null {
    return localStorage.getItem(STORAGE_LAST_BACKUP);
  }

  recordBackup(isoTimestamp: string = new Date().toISOString()): void {
    localStorage.setItem(STORAGE_LAST_BACKUP, isoTimestamp);
    localStorage.removeItem(STORAGE_SNOOZE_UNTIL);
  }

  snooze(days: number = BACKUP_REMINDER_SNOOZE_DAYS): void {
    const until = new Date();
    until.setDate(until.getDate() + days);
    localStorage.setItem(STORAGE_SNOOZE_UNTIL, until.toISOString());
  }

  getSnoozeUntil(): string | null {
    return localStorage.getItem(STORAGE_SNOOZE_UNTIL);
  }

  getStatus(): BackupReminderStatus {
    const enabled = this.isReminderEnabled();
    const lastBackupAt = this.getLastBackupAt();
    const daysSinceLastBackup = this.daysSince(lastBackupAt);
    const isDue = enabled && this.isBackupDue(lastBackupAt);
    const daysOverdue =
      daysSinceLastBackup === null
        ? BACKUP_REMINDER_INTERVAL_DAYS
        : Math.max(0, daysSinceLastBackup - BACKUP_REMINDER_INTERVAL_DAYS);

    return {
      enabled,
      lastBackupAt,
      daysSinceLastBackup,
      isDue,
      daysOverdue,
      snoozedUntil: this.getSnoozeUntil()
    };
  }

  getStatusMessage(): string {
    const { lastBackupAt, daysSinceLastBackup, isDue, daysOverdue } = this.getStatus();

    if (!lastBackupAt) {
      return isDue
        ? 'You have not downloaded a backup from this browser yet. A monthly backup helps you recover if cloud data is lost.'
        : 'No backup recorded on this device yet.';
    }

    const lastLabel = this.formatMediumDate(lastBackupAt);
    if (!isDue) {
      const daysLeft = BACKUP_REMINDER_INTERVAL_DAYS - (daysSinceLastBackup ?? 0);
      return `Last backup on this device: ${lastLabel}. Next reminder in about ${Math.max(0, daysLeft)} day(s).`;
    }

    if (daysOverdue <= 0) {
      return `Last backup: ${lastLabel}. It is time for your monthly backup.`;
    }

    return `Last backup: ${lastLabel} (${daysSinceLastBackup} days ago). You are ${daysOverdue} day(s) past the monthly reminder.`;
  }

  shouldShowReminder(): boolean {
    if (!this.isReminderEnabled()) {
      return false;
    }

    if (this.isSnoozed()) {
      return false;
    }

    if (!this.isBackupDue(this.getLastBackupAt())) {
      return false;
    }

    const today = this.todayKey();
    const lastPrompt = localStorage.getItem(STORAGE_PROMPT_DATE);
    if (lastPrompt === today) {
      return false;
    }

    return true;
  }

  markPromptShownToday(): void {
    localStorage.setItem(STORAGE_PROMPT_DATE, this.todayKey());
  }

  private isBackupDue(lastBackupAt: string | null): boolean {
    if (!lastBackupAt) {
      return true;
    }
    const days = this.daysSince(lastBackupAt);
    return days === null || days >= BACKUP_REMINDER_INTERVAL_DAYS;
  }

  private isSnoozed(): boolean {
    const until = this.getSnoozeUntil();
    if (!until) {
      return false;
    }
    const untilDate = new Date(until);
    return !Number.isNaN(untilDate.getTime()) && untilDate.getTime() > Date.now();
  }

  private daysSince(iso: string | null): number | null {
    if (!iso) {
      return null;
    }
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) {
      return null;
    }
    const ms = Date.now() - then.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  private todayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private formatMediumDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleDateString('en-IN', { dateStyle: 'medium' });
  }
}