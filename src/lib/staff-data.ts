
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  Firestore,
  DocumentData,
  WithFieldValue,
  getDoc,
  getDocs,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type Staff = {
  id: string; // Firestore IDs are strings
  employeeId: string;
  nameBn: string;
  nameEn?: string;
  fatherNameBn?: string;
  motherNameBn?: string;
  dob?: Date;
  designation: string;
  subject?: string;
  mobile: string;
  email?: string;
  joinDate: Date;
  education?: string;
  address?: string;
  photoUrl: string;
  isActive: boolean;
  staffType: 'teacher' | 'staff';
  // Firestore specific fields
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

// Data from form won't have id or timestamps
export type NewStaffData = Omit<Staff, 'id' | 'createdAt' | 'updatedAt' | 'employeeId'>;
export type UpdateStaffData = Partial<Omit<Staff, 'id' | 'createdAt' | 'updatedAt'>>;

// To handle data from Firestore
export const staffFromDoc = (doc: DocumentData): Staff => {
    const data = doc.data();

    return {
        id: doc.id,
        ...data,
        nameBn: data.nameBn || '',
        nameEn: data.nameEn || '',
        joinDate: data.joinDate instanceof Timestamp ? data.joinDate.toDate() : data.joinDate,
        dob: data.dob instanceof Timestamp ? data.dob.toDate() : data.dob,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    } as Staff;
}

export const getStaff = async (db: Firestore): Promise<Staff[]> => {
    const staffQuery = query(collection(db, "staff"), orderBy("nameBn"));
    try {
        const querySnapshot = await getDocs(staffQuery);
        return querySnapshot.docs.map(doc => staffFromDoc(doc));
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'staff',
                operation: 'list',
            }));
        }
        console.error("Error getting staff:", e);
        return [];
    }
};

export const getStaffById = async (db: Firestore, id: string): Promise<Staff | undefined> => {
    const docRef = doc(db, 'staff', id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return staffFromDoc(docSnap);
        }
        return undefined;
    } catch(e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            }));
        }
        console.error("Error getting staff by ID:", e);
        return undefined;
    }
};

export const addStaff = async (db: Firestore, staffData: NewStaffData) => {
  const staffRef = doc(collection(db, 'staff'));
  const year = staffData.joinDate.getFullYear();
  
  // For offline stability, try to get count but don't block
  let serial = 'XX';
  try {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year + 1, 0, 1);
      const q = query(collection(db, 'staff'), where('joinDate', '>=', startOfYear), where('joinDate', '<', endOfYear));
      const querySnapshot = await getDocs(q);
      serial = (querySnapshot.size + 1).toString().padStart(2, '0');
  } catch (e) {
      serial = Math.floor(Math.random() * 90 + 10).toString(); // Fallback random serial if offline
  }

  const employeeId = `${year}${serial}`;
  
  const dataToSave: WithFieldValue<DocumentData> = {
    ...staffData,
    email: staffData.email ? staffData.email.toLowerCase().trim() : '',
    employeeId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (staffData.joinDate) {
    dataToSave.joinDate = Timestamp.fromDate(staffData.joinDate);
  }
  if (staffData.dob) {
    dataToSave.dob = Timestamp.fromDate(staffData.dob);
  }

  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key] === undefined) {
      delete dataToSave[key];
    }
  });

  return setDoc(staffRef, dataToSave)
    .catch(async (serverError) => {
      console.error("Error adding staff:", serverError);
      const permissionError = new FirestorePermissionError({
        path: 'staff',
        operation: 'create',
        requestResourceData: dataToSave,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateStaff = (db: Firestore, id: string, staffData: UpdateStaffData) => {
  const docRef = doc(db, 'staff', id);

  const dataToUpdate: WithFieldValue<DocumentData> = {
    ...staffData,
    updatedAt: serverTimestamp(),
  };

  if (staffData.email) {
      dataToUpdate.email = staffData.email.toLowerCase().trim();
  }

  if (staffData.joinDate) {
    dataToUpdate.joinDate = Timestamp.fromDate(staffData.joinDate);
  } else if (staffData.hasOwnProperty('joinDate') && staffData.joinDate === undefined) {
    dataToUpdate.joinDate = null;
  }
  
  if (staffData.dob) {
    dataToUpdate.dob = Timestamp.fromDate(staffData.dob);
  } else if (staffData.hasOwnProperty('dob') && staffData.dob === undefined) {
    dataToUpdate.dob = null;
  }

  Object.keys(dataToUpdate).forEach(key => {
    if (dataToUpdate[key] === undefined) {
      delete dataToUpdate[key];
    }
  });

  return updateDoc(docRef, dataToUpdate)
    .catch(async (serverError) => {
        console.error("Error updating staff:", serverError);
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: dataToUpdate,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteStaff = (db: Firestore, id: string) => {
  const docRef = doc(db, 'staff', id);
  return deleteDoc(docRef)
    .catch(async (serverError) => {
        console.error("Error deleting staff:", serverError);
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
            requestResourceData: { id },
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
};
