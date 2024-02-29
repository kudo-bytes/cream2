import { Injectable, inject } from '@angular/core';
import { Observable, concatMap, forkJoin, from, map, of, switchMap} from 'rxjs';
import { collection, deleteDoc, doc, DocumentReference, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, writeBatch } from '@angular/fire/firestore';
import { IBudget, IExpense } from '../models/budget.interface';
import { IBudgetTitleAndId } from 'src/app/core/models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private firestore: Firestore = inject(Firestore);
  
  public createBudget(userId: string, budget: Omit<IBudget, 'id' | 'expenses'>, expenses: Omit<IExpense, 'id'>[]): Observable<IBudget> {
    const budgetDocRef = doc(collection(this.firestore, `users/${userId}/budgets`));
    const addBudget$ = from(setDoc(budgetDocRef, budget));
		
    const expensesChain$ = this.addExpensesToBudget(budgetDocRef, expenses);

    return this.finalizeBudgetCreation(addBudget$, expensesChain$, budget, budgetDocRef.id);
  }


  private addExpensesToBudget(budgetDocRef: DocumentReference, expenses: Omit<IExpense, 'id'>[]): Observable<IExpense[]> {
    const expenseObservables = expenses.map(expense => {
      const expenseDocRef = doc(collection(this.firestore, `${budgetDocRef.path}/expenses`));
      const expenseWithId = {
        ...expense,
        id: expenseDocRef.id,
      };
      
      return from(setDoc(expenseDocRef, expenseWithId)).pipe(
        map(() => expenseWithId)
      );
    });
  
    return forkJoin(expenseObservables);
  }

  private finalizeBudgetCreation(addBudget$: Observable<void>, expensesChain$: Observable<IExpense[]>, budget: Omit<IBudget, 'id' | 'expenses'>, budgetId: string): Observable<IBudget> {
    return addBudget$.pipe(
        concatMap(() => expensesChain$),
        map(expensesWithId => ({
            ...budget,
            expenses: expensesWithId,
            id: budgetId,
        }))
    );
  }

  public getBudget(userId: string, budgetId: string): Observable<any> {
    const budgetDocRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}`); 
    return from(getDoc(budgetDocRef)).pipe(
      switchMap(budgetSnap => {
        if (!budgetSnap.exists()) {
          return of(null);
        }

        const expensesQuery = query(
          collection(this.firestore, `users/${userId}/budgets/${budgetId}/expenses`),
          orderBy('orderIndex')
        );

        return from(getDocs(expensesQuery)).pipe(
          map(querySnapshot => {
            const expenses = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { ...budgetSnap.data(), id: budgetId, expenses };
          })
        );
      })
    );
  }

  public updateBudget(userId: string, budgetId: string, budgetData: Partial<IBudget>): Observable<any> {
    const budgetDocRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}`);

    return from(updateDoc(budgetDocRef, budgetData)).pipe(
      map(() => ({ budgetData })),
    );
  }

  public getBudgetsTitlesAndIds(userId: string): Observable<IBudgetTitleAndId[]> {
    const budgetsCol = collection(this.firestore, `users/${userId}/budgets`);
    
    return from(getDocs(budgetsCol)).pipe(
      map(querySnapshot => {
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          title: doc.data()['title']
        }));
      })
    );
  }

  public updateExpensesOrder(userId: string, budgetId: string, expenses: IExpense[]): Observable<any> {
    const batch = writeBatch(this.firestore);
    expenses.forEach(expense => {
      const expenseRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}/expenses/${expense.id}`);
      batch.update(expenseRef, { orderIndex: expense.orderIndex });
    });
    
    return from(batch.commit());
  }

  public updateExpenseTitle(userId: string, budgetId: string, expenseId: string, newTitle: string): Observable<any> {
    const expenseRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}/expenses/${expenseId}`);

    return from(updateDoc(expenseRef, { title: newTitle })).pipe(
      switchMap(() =>
        from(getDoc(expenseRef)).pipe(
          map((snapshot) => ({
            expenseId: snapshot.id,
            newTitle: snapshot.exists() ? (snapshot.data() as IExpense).title : '',
          }))
        )
      )
    );
  }

  public updateExpenseAmount(userId: string, budgetId: string, expenseId: string, newAmount: number, newBalance: number): Observable<any> {
    const expenseRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}/expenses/${expenseId}`);

    return from(updateDoc(expenseRef, { amount: newAmount, balance: newBalance })).pipe(
      switchMap(() =>
        from(getDoc(expenseRef)).pipe(
          map((snapshot) => ({
            expenseId: snapshot.id,
            newAmount: snapshot.data()!['amount'],
            newBalance: snapshot.data()!['balance'],
          }))
        )
      )
    );
  }

  public deleteExpense(userId: string, budgetId: string, expenseId: string): Observable<any> {
    const expenseRef = doc(this.firestore, `users/${userId}/budgets/${budgetId}/expenses/${expenseId}`);

    return from(deleteDoc(expenseRef));
  }

  public addExpense(userId: string, budgetId: string): Observable<IExpense> {
    // Reference to the expenses collection for a specific budget
    const expensesCollectionRef = collection(this.firestore, `users/${userId}/budgets/${budgetId}/expenses`);

    // Create a new document reference in the expenses collection
    const expenseDocRef = doc(expensesCollectionRef);

    // Determine the orderIndex by fetching current expenses
    const expensesQuery = query(expensesCollectionRef);
    const getOrderIndex$ = from(getDocs(expensesQuery)).pipe(
      map(querySnapshot => querySnapshot.size + 1) // Assuming orderIndex starts at 1 and increments
    );

    return getOrderIndex$.pipe(
      switchMap(orderIndex => {
        // New expense object with Firebase auto-generated ID, and initial values
        const newExpense: Omit<IExpense, 'id'> & { id: string } = {
          id: expenseDocRef.id,
          title: 'New',
          amount: 0,
          balance: 0,
          orderIndex: orderIndex,
        };

        // Save the new expense to Firestore
        return from(setDoc(expenseDocRef, newExpense)).pipe(
          // Return the newly created expense
          map(() => newExpense)
        );
      })
    );
  }
}
