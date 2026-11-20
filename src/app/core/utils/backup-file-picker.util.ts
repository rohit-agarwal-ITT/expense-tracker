/**
 * Windows Downloads (often OneDrive-linked) can freeze the legacy file input dialog.
 * Chromium's showOpenFilePicker uses a different shell and supports startIn: 'desktop'.
 */

const BACKUP_PICKER_TYPES = [
  {
    description: 'Expense Tracker backup',
    accept: {
      'application/json': ['.json']
    }
  }
] as const;

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options: {
      types?: typeof BACKUP_PICKER_TYPES;
      multiple?: boolean;
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemFileHandle[]>;
  };

export function supportsModernBackupFilePicker(): boolean {
  return typeof (window as FilePickerWindow).showOpenFilePicker === 'function';
}

/**
 * Opens a file picker starting on Desktop when supported (avoids slow Downloads on Windows).
 */
export async function pickBackupJsonFile(): Promise<File | null> {
  const w = window as FilePickerWindow;
  if (!w.showOpenFilePicker) {
    return null;
  }

  try {
    const handles = await w.showOpenFilePicker({
      types: [...BACKUP_PICKER_TYPES],
      multiple: false,
      startIn: 'desktop'
    });
    const handle = handles[0];
    if (!handle) {
      return null;
    }
    return await handle.getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}