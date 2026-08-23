'use client';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  Firestore,
  setDoc,
  FirestoreError,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type StaffAttendanceStatus = 'present' | 'leave';
export type LeaveType = 'CL' | 'SL' | 'EL' | 'DL' | 'Other';

export interface StaffMemberAttendance {
  staffId: string;
  status: StaffAttendanceStatus;
  leaveType?: LeaveType;
  checkIn?: string;
  checkOut?: string;
  note?: string;
  entryTime?: string; // System time when marked
  exitTime?: string;  // System time when checkout saved
}

export interface StaffDailyAttendance {
  id?: string;
  date: string; // YYYY-MM-DD
  attendance: StaffMemberAttendance[];
}

const COLLECTION = 'staffAttendance';

export const getStaffAttendanceByDate = async (db: Firestore, date: string): Promise<StaffDailyAttendance | undefined> => {
    const q = query(collection(db, COLLECTION), where("date", "==", date));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            return { id: docSnap.id, ...docSnap.data() } as StaffDailyAttendance;
        }
        return undefined;
    } catch (e: any) {
        console.error("Error getting staff attendance:", e);
        return undefined;
    }
};

export const saveStaffAttendance = (db: Firestore, record: StaffDailyAttendance) => {
    const docId = record.date; // Use date as ID to prevent duplicates
    const docRef = doc(db, COLLECTION, docId);
    
    // Clean up record data to ensure only relevant fields are saved
    const cleanedAttendance = record.attendance.map(a => {
        const item: any = { 
            staffId: a.staffId, 
            status: a.status 
        };
        if (a.leaveType) item.leaveType = a.leaveType;
        if (a.checkIn) item.checkIn = a.checkIn;
        if (a.checkOut) item.checkOut = a.checkOut;
        if (a.note) item.note = a.note;
        if (a.entryTime) item.entryTime = a.entryTime;
        if (a.exitTime) item.exitTime = a.exitTime;
        return item;
    });

    const dataToSave = {
        date: record.date,
        attendance: cleanedAttendance
    };

    return setDoc(docRef, dataToSave, { merge: true }).catch(async (serverError: any) => {
        const permissionError = new FirestorePermissionError({
            path: COLLECTION,
            operation: 'write',
            requestResourceData: dataToSave,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw permissionError;
    });
};

export const getStaffAttendanceForRange = async (db: Firestore, startDate: string, endDate: string): Promise<StaffDailyAttendance[]> => {
    const q = query(
        collection(db, COLLECTION),
        where("date", ">=", startDate),
        where("date", "<=", endDate)
    );
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffDailyAttendance));
    } catch (e: any) {
        console.error("Error getting staff attendance range:", e);
        return [];
    }
}
