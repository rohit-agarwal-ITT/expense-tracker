import { FilterState } from '../services/filter-state.service';

export interface ResolvedDateRange {
  startDate: string;
  endDate: string;
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Inclusive YYYY-MM-DD range from shared filter state (empty = all time). */
export function resolveDateRangeFromFilterState(state: FilterState): ResolvedDateRange {
  if (state.selectedPeriod === 'all') {
    return { startDate: '', endDate: '' };
  }

  const now = new Date();

  switch (state.selectedPeriod) {
    case 'monthly': {
      const monthIndex = parseInt(state.selectedMonth, 10);
      const year = parseInt(state.selectedYear, 10);
      if (Number.isNaN(monthIndex) || Number.isNaN(year)) {
        return { startDate: '', endDate: '' };
      }
      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0);
      return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
    }
    case 'yearly': {
      const year = now.getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
    }
    case 'last30': {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return { startDate: formatDateInput(start), endDate: formatDateInput(now) };
    }
    case 'last7': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { startDate: formatDateInput(start), endDate: formatDateInput(now) };
    }
    case 'custom':
      return {
        startDate: state.customStartDate || '',
        endDate: state.customEndDate || ''
      };
    case 'monthOnly': {
      if (state.selectedMonthOnly && state.selectedYearOnly) {
        if (state.customStartDate && state.customEndDate) {
          return {
            startDate: state.customStartDate,
            endDate: state.customEndDate
          };
        }
        const monthIndex = parseInt(state.selectedMonthOnly, 10);
        const year = parseInt(state.selectedYearOnly, 10);
        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 0);
        return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
      }
      return { startDate: '', endDate: '' };
    }
    default:
      if (state.customStartDate || state.customEndDate) {
        return {
          startDate: state.customStartDate || '',
          endDate: state.customEndDate || ''
        };
      }
      return { startDate: '', endDate: '' };
  }
}

export function expenseMatchesDateRange(expenseDate: string, range: ResolvedDateRange): boolean {
  const date = expenseDate.split('T')[0];
  if (range.startDate && date < range.startDate) {
    return false;
  }
  if (range.endDate && date > range.endDate) {
    return false;
  }
  return true;
}

export function monthReportOverlapsRange(
  year: number,
  month: number,
  range: ResolvedDateRange
): boolean {
  if (!range.startDate && !range.endDate) {
    return true;
  }
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  if (range.endDate && monthStart > range.endDate) {
    return false;
  }
  if (range.startDate && monthEnd < range.startDate) {
    return false;
  }
  return true;
}

export function periodFromDatePreset(preset: string): string {
  switch (preset) {
    case 'all':
      return 'all';
    case 'thisMonth':
      return 'monthly';
    case 'thisYear':
      return 'yearly';
    case 'last30':
      return 'last30';
    case 'last7':
      return 'last7';
    case 'thisQuarter':
    case 'lastYear':
    case 'custom':
      return 'custom';
    default:
      return 'custom';
  }
}

export function inferDatePresetFromState(state: FilterState): string {
  if (state.selectedDatePreset) {
    return state.selectedDatePreset;
  }
  switch (state.selectedPeriod) {
    case 'all':
      return 'all';
    case 'monthly':
      return 'thisMonth';
    case 'yearly':
      return 'thisYear';
    case 'last30':
      return 'last30';
    case 'last7':
      return 'last7';
    default:
      return 'custom';
  }
}