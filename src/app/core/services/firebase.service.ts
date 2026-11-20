import { Injectable, inject } from '@angular/core';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  DocumentData,
  QuerySnapshot,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { Firestore } from '@angular/fire/firestore';
import { Expense } from '../models/expense.model';
import { Category } from '../models/category.model';
import { Trade } from '../models/trade.model';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

const FIRESTORE_BATCH_LIMIT = 450;

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private firestore = inject(Firestore);
  private expensesSubject = new BehaviorSubject<Expense[]>([]);
  private categoriesSubject = new BehaviorSubject<Category[]>([]);
  private tradesSubject = new BehaviorSubject<Trade[]>([]);
  private userSettingsSubject = new BehaviorSubject<any>({});
  private loadingSubject = new BehaviorSubject<boolean>(false);
  
  // Store unsubscribe functions for real-time listeners
  private expensesUnsubscribe?: () => void;
  private categoriesUnsubscribe?: () => void;
  private tradesUnsubscribe?: () => void;
  private activeDataUserId: string | null = null;

  public expenses$ = this.expensesSubject.asObservable();
  public categories$ = this.categoriesSubject.asObservable();
  public trades$ = this.tradesSubject.asObservable();
  public userSettings$ = this.userSettingsSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();

  /** True only during the first Firebase bootstrap while core data is still empty. */
  get hasCoreDataCached(): boolean {
    return (
      this.expensesSubject.value.length > 0 || this.categoriesSubject.value.length > 0
    );
  }

  get hasTradesCached(): boolean {
    return this.tradesSubject.value.length > 0;
  }

  getPageLoading$(options: { requireTrades?: boolean } = {}): Observable<boolean> {
    const { requireTrades = false } = options;
    return combineLatest([
      this.loading$,
      this.expenses$,
      this.categories$,
      this.trades$
    ]).pipe(
      map(([loading, expenses, categories, trades]) => {
        if (!loading) {
          return false;
        }
        if (requireTrades) {
          return trades.length === 0;
        }
        return expenses.length === 0 && categories.length === 0;
      }),
      distinctUntilChanged()
    );
  }

  constructor(private authService: AuthService) {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        const userChanged = this.activeDataUserId !== null && this.activeDataUserId !== user.uid;
        if (userChanged) {
          this.clearCachedUserData();
        }
        this.activeDataUserId = user.uid;
        void this.loadData();
        return;
      }

      this.activeDataUserId = null;
      this.clearCachedUserData();
    });
  }

  private clearCachedUserData(): void {
    this.cleanupListeners();
    this.expensesSubject.next([]);
    this.categoriesSubject.next([]);
    this.tradesSubject.next([]);
    this.userSettingsSubject.next({});
  }

  // Load all data from Firebase
  private async loadData() {
    this.loadingSubject.next(true);
    try {
      await Promise.all([
        this.loadExpenses(),
        this.loadCategories(),
        this.loadTrades(),
        this.loadUserSettings()
      ]);
      
      // Set up real-time listeners for automatic updates
      this.setupRealTimeListeners();
    } finally {
      this.loadingSubject.next(false);
    }
  }

  // Set up real-time listeners
  private setupRealTimeListeners() {
    const userId = this.authService.getCurrentUserId();
    if (!userId) return;

    // Clean up existing listeners first
    this.cleanupListeners();

    // Set up real-time listener for expenses
    const expensesRef = collection(this.firestore, 'expenses');
    const expensesQuery = query(
      expensesRef, 
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );
    
    this.expensesUnsubscribe = onSnapshot(
      expensesQuery,
      (querySnapshot) => {
        const expenses: Expense[] = [];
        querySnapshot.forEach((doc) => {
          expenses.push({ id: doc.id, ...doc.data() } as Expense);
        });
        this.expensesSubject.next(expenses);
      },
      (error) => {
        console.error('Expenses real-time listener error:', error);
      }
    );

    // Set up real-time listener for categories
    const categoriesRef = collection(this.firestore, 'categories');
    const categoriesQuery = query(categoriesRef, where('userId', '==', userId));
    
    this.categoriesUnsubscribe = onSnapshot(categoriesQuery, (querySnapshot) => {
      const categories: Category[] = [];
      querySnapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() } as Category);
      });
      this.categoriesSubject.next(categories);
    });

    // Set up real-time listener for trades
    const tradesRef = collection(this.firestore, 'trades');
    const tradesQuery = query(
      tradesRef, 
      where('userId', '==', userId)
      // Note: Removed orderBy to avoid requiring composite index
      // Sorting is done in memory instead
    );
    
    this.tradesUnsubscribe = onSnapshot(tradesQuery, (querySnapshot) => {
      const trades: Trade[] = [];
      querySnapshot.forEach((doc) => {
        const tradeData = doc.data() as any;
        // Ensure isProfit is properly converted to boolean
        const isProfitValue = tradeData['isProfit'];
        const isProfit = isProfitValue !== undefined 
          ? (typeof isProfitValue === 'boolean' ? isProfitValue : isProfitValue === true || isProfitValue === 'true')
          : true;
        
        trades.push({ 
          id: doc.id, 
          ...tradeData,
          amount: tradeData['amount'] || 0,
          indexValue: tradeData['indexValue'] || 0,
          isProfit: isProfit
        } as Trade);
      });
      
      // Sort by date descending in memory
      trades.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Descending order
      });
      this.tradesSubject.next(trades);
    }, (error) => {
      console.error('Error in trades snapshot listener:', error);
    });
  }

  // Clean up real-time listeners
  private cleanupListeners() {
    if (this.expensesUnsubscribe) {
      this.expensesUnsubscribe();
      this.expensesUnsubscribe = undefined;
    }
    if (this.categoriesUnsubscribe) {
      this.categoriesUnsubscribe();
      this.categoriesUnsubscribe = undefined;
    }
    if (this.tradesUnsubscribe) {
      this.tradesUnsubscribe();
      this.tradesUnsubscribe = undefined;
    }
  }

  // Expenses Operations
  async loadExpenses(): Promise<Expense[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      
      if (!userId) {
        this.expensesSubject.next([]);
        return [];
      }

      const expensesRef = collection(this.firestore, 'expenses');
      const q = query(
        expensesRef, 
        where('userId', '==', userId),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const expenses: Expense[] = [];
      querySnapshot.forEach((doc) => {
        expenses.push({ id: doc.id, ...doc.data() } as Expense);
      });
      
      this.expensesSubject.next(expenses);
      return expenses;
    } catch (error) {
      console.error('Error loading expenses:', error);
      return [];
    }
  }

  private async resolveUserId(timeoutMs = 8000): Promise<string> {
    const immediate = this.authService.getCurrentUserId();
    if (immediate) {
      return immediate;
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('User not authenticated. Please sign in again.'));
      }, timeoutMs);

      const subscription = this.authService.currentUser$.subscribe((user) => {
        if (user === undefined) {
          return;
        }
        clearTimeout(timer);
        subscription.unsubscribe();
        if (user) {
          resolve(user.uid);
        } else {
          reject(new Error('User not authenticated. Please sign in again.'));
        }
      });
    });
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

      operation
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async addExpense(expense: Omit<Expense, 'id'>): Promise<string> {
    try {
      const userId = await this.resolveUserId();

      const expensesRef = collection(this.firestore, 'expenses');
      const expenseWithUserId = {
        ...expense,
        userId,
        createdAt: new Date().toISOString()
      };

      const docRef = await this.withTimeout(
        addDoc(expensesRef, expenseWithUserId),
        30_000,
        'Saving timed out. Check your connection and try again.'
      );

      return docRef.id;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw error;
    }
  }

  async updateExpense(expense: Expense): Promise<void> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const expenseRef = doc(this.firestore, 'expenses', expense.id);
      
      // Check if document exists first
      const docSnap = await getDoc(expenseRef);
      if (!docSnap.exists()) {
        const { id, ...expenseData } = expense;
        const expenseWithUserId = { ...expenseData, userId };
        await setDoc(expenseRef, expenseWithUserId, { merge: false });
      } else if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to update this expense.');
      } else {
        const { id, ...expenseData } = expense;
        const expenseWithUserId = { ...expenseData, userId };
        await updateDoc(expenseRef, expenseWithUserId);
      }
      
      // Real-time listener will automatically update the cache
      // No need to manually update cache here to avoid duplicates
      
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }

  private documentBelongsToUser(data: DocumentData | undefined, userId: string): boolean {
    return !!data && data['userId'] === userId;
  }

  private requireCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  }

  /**
   * Deletes only documents that belong to the given user (batched).
   */
  async deleteCollectionForUser(collectionName: string, userId: string): Promise<number> {
    const ref = collection(this.firestore, collectionName);
    const q = query(ref, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    let deleted = 0;

    for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
      let batchCount = 0;

      for (const snap of chunk) {
        if (!this.documentBelongsToUser(snap.data(), userId)) {
          console.warn(
            `Skipped ${collectionName}/${snap.id}: userId mismatch (expected ${userId})`
          );
          continue;
        }
        batch.delete(snap.ref);
        batchCount++;
      }

      if (batchCount > 0) {
        await batch.commit();
        deleted += batchCount;
      }
    }

    return deleted;
  }

  async deleteExpense(expenseId: string): Promise<void> {
    try {
      const userId = this.requireCurrentUserId();
      const expenseRef = doc(this.firestore, 'expenses', expenseId);
      const docSnap = await getDoc(expenseRef);

      if (!docSnap.exists()) {
        return;
      }

      if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to delete this expense.');
      }

      await deleteDoc(expenseRef);
      
      // Real-time listener will automatically update the cache
      // No need to manually update cache here to avoid duplicates
      
    } catch (error) {
      console.error('Error deleting expense:', error);
      // Don't throw error for non-existent documents
      if (error instanceof Error && error.message && error.message.includes('does not exist')) {
        console.warn('Document not found - likely a local-only expense');
        return;
      }
      throw error;
    }
  }

  /** Delete many expense docs in Firestore batches (much faster than one-by-one). */
  async deleteExpensesByIds(expenseIds: string[]): Promise<number> {
    if (expenseIds.length === 0) {
      return 0;
    }

    const userId = this.requireCurrentUserId();
    const uniqueIds = [...new Set(expenseIds.filter((id) => !!id))];
    let deleted = 0;

    try {
      for (let i = 0; i < uniqueIds.length; i += FIRESTORE_BATCH_LIMIT) {
        const batch = writeBatch(this.firestore);
        const chunk = uniqueIds.slice(i, i + FIRESTORE_BATCH_LIMIT);
        let batchCount = 0;

        for (const id of chunk) {
          const expenseRef = doc(this.firestore, 'expenses', id);
          const docSnap = await getDoc(expenseRef);
          if (!docSnap.exists()) {
            continue;
          }
          if (!this.documentBelongsToUser(docSnap.data(), userId)) {
            console.warn(`Skipped expense ${id}: not owned by current user`);
            continue;
          }
          batch.delete(expenseRef);
          batchCount++;
        }

        if (batchCount > 0) {
          await batch.commit();
          deleted += batchCount;
        }
      }
      return deleted;
    } catch (error) {
      console.error('Error batch deleting expenses:', error);
      throw error;
    }
  }

  // Helper method to migrate local expenses to Firebase
  async migrateLocalExpenses(localExpenses: any[]): Promise<void> {
    try {
      for (const expense of localExpenses) {
        // Skip if expense already has a Firebase ID (starts with Firebase-generated pattern)
        if (expense.id && expense.id.length > 20) {
          continue;
        }
        
        // Create new expense in Firebase
        const { id, ...expenseData } = expense;
        await this.addExpense(expenseData);
      }
    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  }

  // Helper method to check if an ID is Firebase-generated
  isFirebaseId(id: string): boolean {
    return Boolean(id && id.length > 20); // Firebase IDs are typically 20+ characters
  }

  // Categories Operations
  async loadCategories(): Promise<Category[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        this.categoriesSubject.next([]);
        return [];
      }

      const categoriesRef = collection(this.firestore, 'categories');
      const q = query(categoriesRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      
      const categories: Category[] = [];
      querySnapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() } as Category);
      });
      
      this.categoriesSubject.next(categories);
      return categories;
    } catch (error) {
      console.error('Error loading categories:', error);
      return [];
    }
  }

  async addCategory(category: Omit<Category, 'id'>): Promise<string> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const categoriesRef = collection(this.firestore, 'categories');
      const categoryWithUserId = { ...category, userId };
      const docRef = await addDoc(categoriesRef, categoryWithUserId);
      
      // Real-time listener will automatically update the cache
      // No need to manually update cache here to avoid duplicates
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  }

  async updateCategory(category: Category): Promise<void> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const categoryRef = doc(this.firestore, 'categories', category.id);
      
      // Check if document exists first
      const docSnap = await getDoc(categoryRef);
      if (!docSnap.exists()) {
        const { id, ...categoryData } = category;
        const categoryWithUserId = { ...categoryData, userId };
        await setDoc(categoryRef, categoryWithUserId, { merge: false });
      } else if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to update this category.');
      } else {
        const { id, ...categoryData } = category;
        const categoryWithUserId = { ...categoryData, userId };
        await updateDoc(categoryRef, categoryWithUserId);
      }
      
      // Real-time listener will automatically update the cache
      // No need to manually update cache here to avoid duplicates
      
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  async deleteCategory(categoryId: string): Promise<void> {
    try {
      const userId = this.requireCurrentUserId();
      const categoryRef = doc(this.firestore, 'categories', categoryId);
      const docSnap = await getDoc(categoryRef);

      if (!docSnap.exists()) {
        return;
      }

      if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to delete this category.');
      }

      await deleteDoc(categoryRef);
      
      // Real-time listener will automatically update the cache
      // No need to manually update cache here to avoid duplicates
      
    } catch (error) {
      console.error('Error deleting category:', error);
      // Don't throw error for non-existent documents
      if (error instanceof Error && error.message.includes('does not exist')) {
        console.warn('Category not found - likely a local-only category');
        // Real-time listener will handle the update
        return;
      }
      throw error;
    }
  }

  // User Settings Operations (per-user document — legacy `default` is migrated once)
  private getDefaultUserSettings(): Record<string, unknown> {
    return {
      budgetLimit: 0,
      emergencyFund: 0,
      vacationFund: 0,
      theme: 'light',
      currency: '₹'
    };
  }

  private getUserSettingsDocRef(userId: string) {
    return doc(this.firestore, 'userSettings', userId);
  }

  async loadUserSettings(): Promise<any> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        return this.getDefaultUserSettings();
      }

      const userSettingsRef = this.getUserSettingsDocRef(userId);
      const userSnap = await getDoc(userSettingsRef);

      if (userSnap.exists()) {
        const settings = userSnap.data();
        this.userSettingsSubject.next(settings);
        return settings;
      }

      const legacyRef = doc(this.firestore, 'userSettings', 'default');
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const legacy = legacySnap.data();
        await setDoc(userSettingsRef, { ...legacy, migratedFromLegacyDefault: true }, { merge: true });
        this.userSettingsSubject.next(legacy);
        return legacy;
      }

      const defaultSettings = this.getDefaultUserSettings();
      await this.saveUserSettings(defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error('Error loading user settings:', error);
      return this.getDefaultUserSettings();
    }
  }

  async saveUserSettings(settings: any): Promise<void> {
    try {
      const userId = this.requireCurrentUserId();
      const settingsRef = this.getUserSettingsDocRef(userId);
      await setDoc(settingsRef, { ...settings, userId }, { merge: true });

      this.userSettingsSubject.next(settings);
    } catch (error) {
      console.error('Error saving user settings:', error);
      throw error;
    }
  }

  async resetUserSettingsForCurrentUser(): Promise<void> {
    await this.saveUserSettings(this.getDefaultUserSettings());
  }


  // Utility methods
  async getExpensesByCategory(categoryId: string): Promise<Expense[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) return [];

      const expensesRef = collection(this.firestore, 'expenses');
      const q = query(
        expensesRef, 
        where('userId', '==', userId),
        where('categoryId', '==', categoryId)
      );
      const querySnapshot = await getDocs(q);
      
      const expenses: Expense[] = [];
      querySnapshot.forEach((doc) => {
        expenses.push({ id: doc.id, ...doc.data() } as Expense);
      });
      
      return expenses;
    } catch (error) {
      console.error('Error getting expenses by category:', error);
      return [];
    }
  }

  async getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) return [];

      const expensesRef = collection(this.firestore, 'expenses');
      const q = query(
        expensesRef, 
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const expenses: Expense[] = [];
      querySnapshot.forEach((doc) => {
        expenses.push({ id: doc.id, ...doc.data() } as Expense);
      });
      
      return expenses;
    } catch (error) {
      console.error('Error getting expenses by date range:', error);
      return [];
    }
  }

  // Trades Operations
  async loadTrades(): Promise<Trade[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      
      if (!userId) {
        this.tradesSubject.next([]);
        return [];
      }

      // Ensure real-time listener is set up if not already
      if (!this.tradesUnsubscribe) {
        this.setupRealTimeListeners();
      }

      const tradesRef = collection(this.firestore, 'trades');
      const q = query(
        tradesRef, 
        where('userId', '==', userId)
        // Note: Removed orderBy to avoid requiring composite index
        // Sorting is done in memory instead
      );
      const querySnapshot = await getDocs(q);
      
      const trades: Trade[] = [];
      querySnapshot.forEach((doc) => {
        const tradeData = doc.data() as any;
        // Ensure isProfit is properly converted to boolean
        const isProfitValue = tradeData['isProfit'];
        const isProfit = isProfitValue !== undefined 
          ? (typeof isProfitValue === 'boolean' ? isProfitValue : isProfitValue === true || isProfitValue === 'true')
          : true;
        
        trades.push({ 
          id: doc.id, 
          ...tradeData,
          isProfit: isProfit
        } as Trade);
      });
      
      // Sort by date descending in memory
      trades.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Descending order
      });
      
      this.tradesSubject.next(trades);
      return trades;
    } catch (error) {
      console.error('Error loading trades:', error);
      return [];
    }
  }

  async addTrade(trade: Omit<Trade, 'id'>): Promise<string> {
    try {
      const userId = this.authService.getCurrentUserId();
      
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const tradesRef = collection(this.firestore, 'trades');
      const tradeWithUserId = { 
        ...trade, 
        userId,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(tradesRef, tradeWithUserId);
      return docRef.id;
    } catch (error) {
      console.error('Error adding trade:', error);
      throw error;
    }
  }

  async updateTrade(trade: Trade): Promise<void> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const tradeRef = doc(this.firestore, 'trades', trade.id);
      const docSnap = await getDoc(tradeRef);
      if (!docSnap.exists()) {
        const { id, ...tradeData } = trade;
        const tradeWithUserId = { ...tradeData, userId };
        await setDoc(tradeRef, tradeWithUserId, { merge: false });
      } else if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to update this trade.');
      } else {
        const { id, ...tradeData } = trade;
        const tradeWithUserId = { ...tradeData, userId };
        await updateDoc(tradeRef, tradeWithUserId);
      }
    } catch (error) {
      console.error('Error updating trade:', error);
      throw error;
    }
  }

  async deleteTrade(tradeId: string): Promise<void> {
    try {
      const userId = this.requireCurrentUserId();
      const tradeRef = doc(this.firestore, 'trades', tradeId);
      const docSnap = await getDoc(tradeRef);

      if (!docSnap.exists()) {
        return;
      }

      if (!this.documentBelongsToUser(docSnap.data(), userId)) {
        throw new Error('You do not have permission to delete this trade.');
      }

      await deleteDoc(tradeRef);
    } catch (error) {
      console.error('Error deleting trade:', error);
      throw error;
    }
  }

  async getTradesByDateRange(startDate: string, endDate: string): Promise<Trade[]> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) return [];

      const tradesRef = collection(this.firestore, 'trades');
      // Use only userId filter to avoid composite index requirement
      // Date filtering and sorting will be done in memory
      const q = query(
        tradesRef, 
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      
      const trades: Trade[] = [];
      querySnapshot.forEach((doc) => {
        const tradeData = doc.data() as any;
        // Ensure isProfit is properly converted to boolean
        const isProfitValue = tradeData['isProfit'];
        const isProfit = isProfitValue !== undefined 
          ? (typeof isProfitValue === 'boolean' ? isProfitValue : isProfitValue === true || isProfitValue === 'true')
          : true;
        
        const trade = { 
          id: doc.id, 
          ...tradeData,
          isProfit: isProfit
        } as Trade;
        // Filter by date range in memory
        if (trade.date >= startDate && trade.date <= endDate) {
          trades.push(trade);
        }
      });
      
      // Sort by date descending in memory
      trades.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Descending order
      });
      
      return trades;
    } catch (error) {
      console.error('Error getting trades by date range:', error);
      return [];
    }
  }
} 