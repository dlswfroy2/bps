
'use client';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
  Firestore,
  DocumentData,
  WithFieldValue,
  updateDoc
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'cash' | 'bank';

export interface Transaction {
  id: string;
  date: Date;
  type: TransactionType;
  method: PaymentMethod;
  accountHead: string;
  description: string;
  amount: number;
  academicYear: string;
  voucherNo?: string;
  checkNo?: string;
  feeCollectionId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type NewTransactionData = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

const TRANSACTIONS_COLLECTION = 'transactions';

export const transactionFromDoc = (doc: DocumentData): Transaction => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        method: data.method || 'cash',
        date: data.date.toDate(),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    } as Transaction;
}

export const getTransactions = async (db: Firestore, academicYear: string): Promise<Transaction[]> => {
    const transactionsQuery = query(
        collection(db, TRANSACTIONS_COLLECTION),
        where("academicYear", "==", academicYear)
    );
    try {
        const querySnapshot = await getDocs(transactionsQuery);
        return querySnapshot.docs.map(transactionFromDoc);
    } catch (e: any) {
        console.error("Error getting transactions:", e);
        return [];
    }
};

export const addTransaction = (db: Firestore, transactionData: NewTransactionData) => {
  const docRef = doc(collection(db, TRANSACTIONS_COLLECTION));
  const dataToSave: WithFieldValue<DocumentData> = {
    ...transactionData,
    date: Timestamp.fromDate(transactionData.date),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key] === undefined || dataToSave[key] === '') {
      delete dataToSave[key];
    }
  });

  // Non-blocking setDoc for offline stability
  setDoc(docRef, dataToSave)
    .catch(async (serverError) => {
      console.error("Error adding transaction:", serverError);
      const permissionError = new FirestorePermissionError({
        path: TRANSACTIONS_COLLECTION,
        operation: 'create',
        requestResourceData: dataToSave,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
    
  return Promise.resolve(docRef.id);
};

export const deleteTransaction = (db: Firestore, id: string) => {
  const docRef = doc(db, TRANSACTIONS_COLLECTION, id);
  // Non-blocking deleteDoc
  deleteDoc(docRef)
    .catch(async (serverError) => {
        console.error("Error deleting transaction:", serverError);
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
  return Promise.resolve();
};
