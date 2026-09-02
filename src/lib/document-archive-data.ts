
'use client';
/**
 * @fileOverview Official documents archive data services.
 * Handles storing PDF/Word files as Base64 text directly in Firestore.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  Firestore,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export interface ArchivedDocument {
  id: string;
  title: string;
  fileData: string; // Base64 Data URI
  mimeType: string;
  fileName: string;
  uploaderName: string;
  uploaderUid: string;
  createdAt: Date;
}

export type NewArchivedDocument = Omit<ArchivedDocument, 'id' | 'createdAt'>;

const COLLECTION_NAME = 'archivedDocuments';

/**
 * Saves a new document to the archive.
 */
export const saveArchivedDocument = async (db: Firestore, data: NewArchivedDocument) => {
    const docRef = doc(collection(db, COLLECTION_NAME));
    const dataToSave = {
        ...data,
        createdAt: serverTimestamp(),
    };

    return setDoc(docRef, dataToSave)
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: COLLECTION_NAME,
                operation: 'create',
                requestResourceData: { title: data.title, fileName: data.fileName },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });
};

/**
 * Fetches all archived documents.
 */
export const getArchivedDocuments = async (db: Firestore): Promise<ArchivedDocument[]> => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    try {
        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            } as ArchivedDocument;
        });
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTION_NAME,
                operation: 'list',
            } satisfies SecurityRuleContext));
        }
        return [];
    }
};

/**
 * Deletes a document from the archive.
 */
export const deleteArchivedDocument = async (db: Firestore, id: string) => {
    return deleteDoc(doc(db, COLLECTION_NAME, id)).catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTION_NAME,
            operation: 'delete',
        } satisfies SecurityRuleContext));
    });
};
