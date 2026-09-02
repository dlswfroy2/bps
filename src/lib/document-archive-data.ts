
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

export interface ArchiveFolder {
  id: string;
  name: string;
  createdAt: Date;
}

export interface ArchivedDocument {
  id: string;
  title: string;
  fileData: string; // Base64 Data URI
  mimeType: string;
  fileName: string;
  uploaderName: string;
  uploaderUid: string;
  folderId?: string; // Links to ArchiveFolder
  createdAt: Date;
}

export type NewArchiveFolder = Omit<ArchiveFolder, 'id' | 'createdAt'>;
export type NewArchivedDocument = Omit<ArchivedDocument, 'id' | 'createdAt'>;

const DOC_COLLECTION = 'archivedDocuments';
const FOLDER_COLLECTION = 'archiveFolders';

/**
 * Saves a new folder.
 */
export const saveArchiveFolder = async (db: Firestore, data: NewArchiveFolder) => {
    const docRef = doc(collection(db, FOLDER_COLLECTION));
    const dataToSave = {
        ...data,
        createdAt: serverTimestamp(),
    };
    return setDoc(docRef, dataToSave).catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: FOLDER_COLLECTION,
            operation: 'create',
            requestResourceData: data,
        }));
        throw serverError;
    });
};

/**
 * Fetches all folders.
 */
export const getArchiveFolders = async (db: Firestore): Promise<ArchiveFolder[]> => {
    const q = query(collection(db, FOLDER_COLLECTION), orderBy('createdAt', 'asc'));
    try {
        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            } as ArchiveFolder;
        });
    } catch (e) {
        console.error(e);
        return [];
    }
};

/**
 * Deletes a folder.
 */
export const deleteArchiveFolder = async (db: Firestore, id: string) => {
    return deleteDoc(doc(db, FOLDER_COLLECTION, id)).catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: FOLDER_COLLECTION,
            operation: 'delete',
        }));
    });
};

/**
 * Saves a new document to the archive.
 */
export const saveArchivedDocument = async (db: Firestore, data: NewArchivedDocument) => {
    const docRef = doc(collection(db, DOC_COLLECTION));
    const dataToSave = {
        ...data,
        createdAt: serverTimestamp(),
    };

    return setDoc(docRef, dataToSave)
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: DOC_COLLECTION,
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
    const q = query(collection(db, DOC_COLLECTION), orderBy('createdAt', 'desc'));
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
                path: DOC_COLLECTION,
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
    return deleteDoc(doc(db, DOC_COLLECTION, id)).catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: DOC_COLLECTION,
            operation: 'delete',
        } satisfies SecurityRuleContext));
    });
};
