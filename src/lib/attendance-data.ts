'use client';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  Firestore,
  setDoc,
  orderBy,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type AttendanceStatus = 'present' | 'absent';

export interface StudentAttendance {
  studentId: string;
  status: AttendanceStatus;
}

export interface DailyAttendance {
  id?: string;
  date: string; // YYYY-MM-DD
  academicYear: string;
  className: string;
  attendance: StudentAttendance[];
}

const ATTENDANCE_COLLECTION = 'attendance';

export const getAttendanceFromStorage = async (db: Firestore): Promise<DailyAttendance[]> => {
  const q = query(collection(db, ATTENDANCE_COLLECTION), orderBy('date', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyAttendance));
  } catch (e: any) {
    if (e.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: ATTENDANCE_COLLECTION,
            operation: 'list',
        } satisfies SecurityRuleContext));
    }
    console.error("Error getting attendance:", e);
    return [];
  }
};

/**
 * Saves daily attendance. Uses a deterministic ID to support offline writes.
 */
export const saveDailyAttendance = (db: Firestore, record: DailyAttendance) => {
  // Deterministic ID for offline stability (Format: 2026-03-01_6_2026)
  const docId = `${record.date}_${record.className}_${record.academicYear}`;
  const docRef = doc(db, ATTENDANCE_COLLECTION, docId);

  const dataToSave = {
    ...record,
    updatedAt: new Date().toISOString()
  };
  delete (dataToSave as any).id;

  // We do NOT await here in the calling components to allow immediate offline UI updates.
  // setDoc with merge: true handles both creates and updates seamlessly while offline.
  return setDoc(docRef, dataToSave, { merge: true }).catch(async (serverError: any) => {
    console.error("Error saving attendance:", serverError);
    if (serverError.code === 'permission-denied') {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'write',
        requestResourceData: dataToSave,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    }
    throw serverError;
  });
};

/**
 * Deletes a daily attendance record.
 * Handles both deterministic IDs and legacy random IDs.
 */
export const deleteDailyAttendance = async (db: Firestore, date: string, className: string, academicYear: string) => {
  const docId = `${date}_${className}_${academicYear}`;
  const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
  
  try {
    // 1. Try deleting the primary deterministic ID record
    await deleteDoc(docRef);
    
    // 2. Query and delete any potential duplicate or legacy random-ID records for the same day/class
    const q = query(
      collection(db, ATTENDANCE_COLLECTION),
      where("date", "==", date),
      where("className", "==", className),
      where("academicYear", "==", academicYear)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => {
        // Only add to batch if it wasn't already deleted by the first deleteDoc call
        if (d.id !== docId) {
          batch.delete(d.ref);
        }
      });
      await batch.commit();
    }
  } catch (serverError: any) {
    if (serverError.code === 'permission-denied') {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    }
    throw serverError;
  }
};

export const getAttendanceForDate = async (db: Firestore, date: string, academicYear: string): Promise<DailyAttendance[]> => {
    const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where("date", "==", date),
        where("academicYear", "==", academicYear)
    );
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyAttendance));
    } catch (e: any) {
        console.error("Error getting attendance for date:", e);
        return [];
    }
}

export const getAttendanceForClassAndDate = async (db: Firestore, date: string, className: string, academicYear: string): Promise<DailyAttendance | undefined> => {
    const docId = `${date}_${className}_${academicYear}`;
    const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
    
    try {
        // Try looking for predictable ID first (faster and offline-friendly)
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as DailyAttendance;
        }

        // Fallback for older random-id based records
        const q = query(
            collection(db, ATTENDANCE_COLLECTION),
            where("date", "==", date),
            where("className", "==", className),
            where("academicYear", "==", academicYear)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const first = querySnapshot.docs[0];
            return { id: first.id, ...first.data() } as DailyAttendance;
        }
        return undefined;
    } catch(e: any) {
        // Log but don't throw blocking error for offline
        console.log("Offline or error during fetch:", e.message);
        return undefined;
    }
};

export interface StudentConsecutiveAbsence {
    studentId: string;
    absentDays: number;
    lastAbsentDate: string;
}

export const getConsecutiveAbsences = async (db: Firestore, className: string, academicYear: string): Promise<StudentConsecutiveAbsence[]> => {
    const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where("academicYear", "==", academicYear),
        where("className", "==", className)
    );

    try {
        const snap = await getDocs(q);
        const allRecords = snap.docs.map(d => d.data() as DailyAttendance);
        if (allRecords.length === 0) return [];

        const sortedRecords = allRecords.sort((a, b) => b.date.localeCompare(a.date));
        const studentAbsenceMap = new Map<string, number>();
        const studentLastDateMap = new Map<string, string>();
        
        const allStudentIds = new Set<string>();
        sortedRecords.forEach(r => r.attendance.forEach(a => allStudentIds.add(a.studentId)));

        allStudentIds.forEach(studentId => {
            let consecutive = 0;
            for (const record of sortedRecords) {
                const att = record.attendance.find(a => a.studentId === studentId);
                if (att) {
                    if (att.status === 'absent') consecutive++;
                    else if (att.status === 'present') break;
                } else break;
            }
            if (consecutive >= 3) {
                studentAbsenceMap.set(studentId, consecutive);
                studentLastDateMap.set(studentId, sortedRecords[0].date);
            }
        });

        return Array.from(studentAbsenceMap.entries()).map(([studentId, count]) => ({
            studentId,
            absentDays: count,
            lastAbsentDate: studentLastDateMap.get(studentId) || '',
        }));
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: ATTENDANCE_COLLECTION, 
                operation: 'list' 
            } satisfies SecurityRuleContext));
        }
        console.error("Error checking consecutive absences:", e);
        return [];
    }
}