import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { BackupRestoreService } from '../../core/services/backup-restore.service';
import { DialogService } from '../../core/services/dialog.service';
import {
  AppBackupPayload,
  BackupRestoreMode,
  LiveDataCounts
} from '../../core/models/app-backup.model';
import {
  BACKUP_REMINDER_INTERVAL_DAYS,
  BackupReminderService,
  BackupReminderStatus
} from '../../core/services/backup-reminder.service';
import {
  pickBackupJsonFile,
  supportsModernBackupFilePicker
} from '../../core/utils/backup-file-picker.util';

/** Above this size, reading/parsing may freeze the tab on low-end PCs. */
const MAX_BACKUP_UPLOAD_BYTES = 80 * 1024 * 1024;

@Component({
  selector: 'app-data-backup',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingComponent],
  templateUrl: './data-backup.component.html',
  styleUrls: ['./data-backup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataBackupComponent implements OnInit {
  @ViewChild('backupFileInput') backupFileInput?: ElementRef<HTMLInputElement>;

  includeTrades = true;
  includeUserSettings = true;
  restoreMode: BackupRestoreMode = 'merge';
  monthlyReminderEnabled = true;
  reminderIntervalDays = BACKUP_REMINDER_INTERVAL_DAYS;

  isExporting = false;
  isRestoring = false;
  isReadingFile = false;
  isWipingData = false;
  isDragOver = false;
  wipeResetSettings = true;
  liveDataCounts: LiveDataCounts = {
    expenseCount: 0,
    categoryCount: 0,
    tradeCount: 0
  };
  /** Chromium/Edge: opens picker on Desktop first to avoid frozen Downloads folder. */
  useModernFilePicker = supportsModernBackupFilePicker();
  pendingBackup: AppBackupPayload | null = null;
  pendingFileName = '';
  lastExportAt: string | null = null;
  reminderStatus: BackupReminderStatus | null = null;
  reminderMessage = '';

  constructor(
    private backupRestoreService: BackupRestoreService,
    private backupReminderService: BackupReminderService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refreshReminderState();
    void this.refreshLiveDataCounts();
  }

  private async refreshLiveDataCounts(): Promise<void> {
    try {
      this.liveDataCounts = await this.backupRestoreService.getLiveDataCounts();
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to load data counts:', error);
    }
  }

  onReminderToggle(): void {
    this.backupReminderService.setReminderEnabled(this.monthlyReminderEnabled);
    this.refreshReminderState();
  }

  private refreshReminderState(): void {
    this.monthlyReminderEnabled = this.backupReminderService.isReminderEnabled();
    this.lastExportAt = this.backupReminderService.getLastBackupAt();
    this.reminderStatus = this.backupReminderService.getStatus();
    this.reminderMessage = this.backupReminderService.getStatusMessage();
    this.cdr.markForCheck();
  }

  async downloadBackup(): Promise<void> {
    if (this.isExporting) {
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const payload = await this.backupRestoreService.exportAndDownload({
        includeTrades: this.includeTrades,
        includeUserSettings: this.includeUserSettings
      });

      this.refreshReminderState();

      await this.dialogService.success(
        `Backup saved with ${payload.data.expenses.length} expenses, ${payload.data.categories.length} categories` +
          (this.includeTrades ? `, and ${payload.data.trades?.length ?? 0} trades` : '') +
          '. Keep this file in a safe place (cloud drive or email).',
        'Backup downloaded'
      );
    } catch (error) {
      console.error('Backup export failed:', error);
      await this.dialogService.error(
        error instanceof Error ? error.message : 'Could not create backup. Try again.',
        'Backup failed'
      );
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  openBackupFileDialog(): void {
    void this.openBackupFileDialogAsync();
  }

  private async openBackupFileDialogAsync(): Promise<void> {
    try {
      if (this.useModernFilePicker) {
        const file = await pickBackupJsonFile();
        if (file) {
          await this.processBackupFile(file);
        }
        return;
      }
    } catch (error) {
      console.warn('Modern file picker failed, falling back:', error);
    }

    this.backupFileInput?.nativeElement.click();
  }

  onBackupFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    void this.processBackupFile(file).finally(() => {
      input.value = '';
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
    this.cdr.markForCheck();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    this.cdr.markForCheck();
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.processBackupFile(file);
    }
    this.cdr.markForCheck();
  }

  private async processBackupFile(file: File): Promise<void> {
    if (this.isReadingFile) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.json')) {
      await this.dialogService.warning('Please choose a .json backup file.');
      return;
    }

    if (file.size > MAX_BACKUP_UPLOAD_BYTES) {
      await this.dialogService.error(
        'This backup file is very large. Try a smaller export or move the file to a local folder (not OneDrive-synced) and use drag-and-drop here.',
        'File too large'
      );
      return;
    }

    this.isReadingFile = true;
    this.cdr.markForCheck();

    try {
      const text = await file.text();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const payload = this.backupRestoreService.parseBackupFile(text);
      this.pendingBackup = payload;
      this.pendingFileName = file.name;
    } catch (error) {
      console.error('Backup parse failed:', error);
      await this.dialogService.error(
        error instanceof Error ? error.message : 'Invalid backup file.',
        'Cannot read backup'
      );
    } finally {
      this.isReadingFile = false;
      this.cdr.markForCheck();
    }
  }

  clearPendingBackup(): void {
    this.pendingBackup = null;
    this.pendingFileName = '';
    this.cdr.markForCheck();
  }

  async restorePendingBackup(): Promise<void> {
    if (!this.pendingBackup || this.isRestoring) {
      return;
    }

    const summary = this.backupRestoreService.summarizeBackup(this.pendingBackup);
    const modeLabel =
      this.restoreMode === 'merge'
        ? 'Merge — add or update records from the file; existing data not in the file stays.'
        : 'Replace — delete all your current expenses, categories, and trades in the cloud, then import the file.';

    const confirmed = await this.dialogService.confirm(
      `${modeLabel}\n\nBackup from ${this.formatDate(summary.exportedAt)}:\n` +
        `• ${summary.categoryCount} categories\n` +
        `• ${summary.expenseCount} expenses\n` +
        `• ${summary.tradeCount} trades` +
        (summary.hasSettings ? '\n• User settings included' : '') +
        '\n\nContinue?',
      this.restoreMode === 'replace' ? 'Replace all data?' : 'Restore backup?'
    );

    if (!confirmed) {
      return;
    }

    if (this.restoreMode === 'replace') {
      const doubleCheck = await this.dialogService.confirm(
        'This will permanently remove your current cloud data for this account before importing. This cannot be undone.\n\nAre you absolutely sure?',
        'Final confirmation'
      );
      if (!doubleCheck) {
        return;
      }
    }

    this.isRestoring = true;
    this.cdr.markForCheck();

    try {
      const result = await this.backupRestoreService.restoreFromBackup(
        this.pendingBackup,
        this.restoreMode
      );

      let message = `Restored ${result.categoriesWritten} categories and ${result.expensesWritten} expenses`;
      if (result.tradesWritten > 0) {
        message += `, ${result.tradesWritten} trades`;
      }
      if (result.settingsRestored) {
        message += ', and settings';
      }
      message += '. Your app should update in a few seconds.';

      this.pendingBackup = null;
      this.pendingFileName = '';

      await this.dialogService.success(message, 'Restore complete');
    } catch (error) {
      console.error('Restore failed:', error);
      await this.dialogService.error(
        error instanceof Error ? error.message : 'Restore failed. Check your connection and try again.',
        'Restore failed'
      );
    } finally {
      this.isRestoring = false;
      this.cdr.markForCheck();
    }
  }

  async wipeAllUserData(): Promise<void> {
    if (this.isWipingData) {
      return;
    }

    const { expenseCount, categoryCount, tradeCount } = this.liveDataCounts;
    const totalRecords = expenseCount + categoryCount + tradeCount;

    if (totalRecords === 0 && !this.wipeResetSettings) {
      await this.dialogService.warning('There is no cloud data to delete for this account.');
      return;
    }

    const proceed = await this.dialogService.confirm(
      `Delete ALL cloud data for this account?\n\n` +
        `• ${expenseCount} expenses\n` +
        `• ${categoryCount} categories\n` +
        `• ${tradeCount} trades` +
        (this.wipeResetSettings ? '\n• Budget & app settings reset to defaults' : ''),
      'Delete all data?'
    );
    if (!proceed) {
      return;
    }

    const downloadNow = await this.dialogService.confirm(
      'Download a backup file before deleting? (Recommended)',
      'Backup first?'
    );
    if (downloadNow) {
      await this.downloadBackup();
    }

    const confirmed = await this.dialogService.confirm(
      'This permanently deletes your data from Firebase. You cannot undo this.\n\nContinue?',
      'Confirm deletion'
    );
    if (!confirmed) {
      return;
    }

    const typed = await this.dialogService.prompt(
      'Type DELETE (in capitals) to confirm wiping all your data.',
      'Final confirmation',
      '',
      'text',
      'DELETE',
      'Confirmation'
    );
    if (typed?.trim() !== 'DELETE') {
      await this.dialogService.warning('Deletion cancelled — confirmation text did not match.');
      return;
    }

    this.isWipingData = true;
    this.cdr.markForCheck();

    try {
      const result = await this.backupRestoreService.wipeAllUserData({
        resetSettings: this.wipeResetSettings
      });

      this.pendingBackup = null;
      this.pendingFileName = '';

      await this.dialogService.success(
        `Removed ${result.expensesDeleted} expenses, ${result.categoriesDeleted} categories, and ${result.tradesDeleted} trades` +
          (result.settingsReset ? '. Settings were reset.' : '.') +
          '\n\nThe app will refresh as Firebase syncs.',
        'All data deleted'
      );

      await this.refreshLiveDataCounts();
    } catch (error) {
      console.error('Wipe user data failed:', error);
      await this.dialogService.error(
        error instanceof Error ? error.message : 'Could not delete all data. Try again.',
        'Delete failed'
      );
    } finally {
      this.isWipingData = false;
      this.cdr.markForCheck();
    }
  }

  formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}