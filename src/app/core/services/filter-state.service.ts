import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface FilterState {
  selectedPeriod: string;
  selectedMonth: string;
  selectedYear: string;
  customStartDate: string;
  customEndDate: string;
  selectedMonthOnly?: string;
  selectedYearOnly?: string;
  /** Analysis date preset id (thisMonth, thisYear, custom, …) */
  selectedDatePreset?: string;
  /** Shared multi-category filter (empty = all) */
  selectedCategoryIds?: string[];
  /** Reports single category mirror */
  filterCategory?: string;
  filterYear?: string;
  filterMonth?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FilterStateService {
  private readonly defaultState: FilterState = {
    selectedPeriod: 'all',
    selectedMonth: new Date().getMonth().toString(),
    selectedYear: new Date().getFullYear().toString(),
    customStartDate: '',
    customEndDate: '',
    selectedMonthOnly: '',
    selectedYearOnly: '',
    selectedDatePreset: 'thisMonth',
    selectedCategoryIds: [],
    filterCategory: '',
    filterYear: '',
    filterMonth: ''
  };

  private filterStateSubject = new BehaviorSubject<FilterState>(this.defaultState);

  public filterState$ = this.filterStateSubject.asObservable();

  constructor() {
    this.loadFilterState();
  }

  updateFilterState(newState: Partial<FilterState>): void {
    const currentState = this.filterStateSubject.value;
    const updatedState = { ...currentState, ...newState };
    this.filterStateSubject.next(updatedState);
    this.saveFilterState(updatedState);
  }

  getFilterState(): FilterState {
    return this.filterStateSubject.value;
  }

  clearFilterState(): void {
    this.filterStateSubject.next({ ...this.defaultState });
    this.saveFilterState(this.defaultState);
  }

  getSelectedCategoryIds(): string[] {
    return [...(this.getFilterState().selectedCategoryIds ?? [])];
  }

  private saveFilterState(state: FilterState): void {
    try {
      localStorage.setItem('expenseTracker_filterState', JSON.stringify(state));
    } catch (error) {
      console.error('Error saving filter state to localStorage:', error);
    }
  }

  private loadFilterState(): void {
    try {
      const savedState = localStorage.getItem('expenseTracker_filterState');
      if (savedState) {
        const state = { ...this.defaultState, ...JSON.parse(savedState) };
        this.filterStateSubject.next(state);
      }
    } catch (error) {
      console.error('Error loading filter state from localStorage:', error);
    }
  }

  isCustomDateRangeActive(): boolean {
    const state = this.getFilterState();
    return state.selectedPeriod === 'custom' &&
      !!state.customStartDate &&
      !!state.customEndDate;
  }

  getCustomDateRange(): { startDate: string; endDate: string } | null {
    const state = this.getFilterState();
    if (this.isCustomDateRangeActive()) {
      return {
        startDate: state.customStartDate,
        endDate: state.customEndDate
      };
    }
    return null;
  }

  getCurrentPeriodFilter(): string {
    return this.getFilterState().selectedPeriod;
  }
}