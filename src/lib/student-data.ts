
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  Firestore,
  DocumentData,
  WithFieldValue,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type Student = {
  id: string; // Firestore IDs are strings
  generatedId?: string;
  roll: number;
  className: string;
  academicYear: string;
  studentNameBn: string;
  studentNameEn?: string;
  fatherNameBn: string;
  fatherNameEn?: string;
  motherNameBn: string;
  motherNameEn?: string;
  dob?: Date; // Form uses Date
  birthRegNo?: string;
  guardianMobile?: string;
  studentMobile?: string;
  fatherNid?: string;
  motherNid?: string;
  gender?: string;
  religion?: string;
  group?: string;
  optionalSubject?: string;
  presentVillage?: string;
  presentUnion?: string;
  presentPostOffice?: string;
  presentUpazila?: string;
  presentDistrict?: string;
  permanentVillage?: string;
  permanentUnion?: string;
  permanentPostOffice?: string;
  permanentUpazila?: string;
  permanentDistrict?: string;
  photoUrl: string;
  balance?: number;
  isStipendReceiver?: boolean;
  
  // Academic History Fields
  previousSchool?: string;
  prevRegNo?: string;
  prevPassingYear?: string;
  prevBoard?: string;

  // Fee related fields (Targets for setup)
  monthlyFee?: number;
  examFeeHalfYearly?: number;
  examFeeAnnual?: number;
  examFeePreNirbachoni?: number;
  examFeeNirbachoni?: number;
  sessionFee?: number;
  admissionFee?: number;
  scoutFee?: number;
  developmentFee?: number;
  libraryFee?: number;
  tiffinFee?: number;
  otherFee?: number;
  feeCategory?: 'general' | 'half-free' | 'full-free';
  village?: string;
  address?: string;
  _promoStatus?: string | boolean;
  // Firestore specific fields
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

// Data from form won't have id or timestamps
export type NewStudentData = Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'roll'> & { roll?: number };
export type UpdateStudentData = Partial<NewStudentData>;

// Helpers for gender identification
export const isMale = (g: string | undefined | null) => {
    if (!g) return false;
    const gl = g.trim().toLowerCase();
    return gl === 'male' || gl === 'পুরুষ' || gl === 'ছাত্র' || gl === 'boy' || gl === 'm';
};

export const isFemale = (g: string | undefined | null) => {
    if (!g) return false;
    const gl = g.trim().toLowerCase();
    return gl === 'female' || gl === 'মহিলা' || gl === 'ছাত্রী' || gl === 'girl' || gl === 'f';
};

/**
 * Returns a specific face-based placeholder image URL
 */
export const getStudentPlaceholderImage = (gender?: string) => {
    if (isFemale(gender)) return 'https://picsum.photos/seed/student-female-face/200/200';
    return 'https://picsum.photos/seed/student-male-face/200/200';
};

/**
 * Sanitizes the photoUrl. If it's an old random placeholder (like a staircase or landscape),
 * it returns empty so the UI can use the correct gender-based face.
 */
export const sanitizePhotoUrl = (url: string | undefined | null, gender?: string): string => {
    if (!url || typeof url !== 'string') return '';
    
    // If it's a data URI (base64 image), it's a valid intentional photo
    if (url.startsWith('data:')) return url;

    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const urlObj = new URL(fullUrl);
        
        // Handle picsum.photos logic specifically to filter out generic placeholders
        if (urlObj.hostname.includes('picsum.photos')) {
            const genericSeeds = ['1', '2', '3', 'student', 'school', '123', 'abc'];
            const pathParts = urlObj.pathname.split('/');
            const seed = pathParts[2]; 

            if (genericSeeds.includes(seed)) {
                return '';
            }
        }
        return url;
    } catch (e) {
        return '';
    }
};

// To handle data from Firestore
export const studentFromDoc = (doc: DocumentData): Student => {
    const data = doc.data();
    let generatedId = data.generatedId;

    if (!generatedId && data.academicYear && data.className && data.roll) {
      const year = String(data.academicYear).slice(-2);
      const classNum = String(data.className).padStart(2, '0');
      const studentSerial = data.roll.toString().padStart(4, '0');
      generatedId = `${year}${classNum}${studentSerial}`;
    }

    const photoUrl = sanitizePhotoUrl(data.photoUrl, data.gender);

    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const studentNameBn = (isEn && data.studentNameEn && data.studentNameEn.trim()) ? data.studentNameEn.trim() : data.studentNameBn;
    const fatherNameBn = (isEn && data.fatherNameEn && data.fatherNameEn.trim()) ? data.fatherNameEn.trim() : data.fatherNameBn;
    const motherNameBn = (isEn && data.motherNameEn && data.motherNameEn.trim()) ? data.motherNameEn.trim() : data.motherNameBn;

    return {
        id: doc.id,
        ...data,
        studentNameBn,
        fatherNameBn,
        motherNameBn,
        photoUrl,
        generatedId,
        dob: data.dob instanceof Timestamp ? data.dob.toDate() : data.dob,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    } as Student;
}

export const getStudents = async (db: Firestore): Promise<Student[]> => {
    const studentsQuery = query(collection(db, "students"), orderBy("roll"));
    try {
        const querySnapshot = await getDocs(studentsQuery);
        return querySnapshot.docs.map(doc => studentFromDoc(doc));
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'students',
                operation: 'list',
            }));
        }
        console.error("Error getting students:", e);
        return [];
    }
};

export const getStudentById = async (db: Firestore, id: string): Promise<Student | undefined> => {
    const docRef = doc(db, 'students', id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return studentFromDoc(docSnap);
        }
        return undefined;
    } catch(e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            }));
        }
        console.error("Error getting student by ID:", e);
        return undefined;
    }
};

export const addStudent = (db: Firestore, studentData: NewStudentData) => {
  let generatedId = studentData.generatedId;
  
  if (!generatedId && studentData.academicYear && studentData.className && studentData.roll) {
    const year = String(studentData.academicYear).slice(-2);
    const classNum = String(studentData.className).padStart(2, '0');
    const studentSerial = (studentData.roll as number).toString().padStart(4, '0');
    generatedId = `${year}${classNum}${studentSerial}`;
  }
  
  const studentRef = doc(collection(db, 'students'));
  const dataToSave: WithFieldValue<DocumentData> = {
    ...studentData,
    generatedId,
    balance: studentData.balance || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (studentData.dob) {
    dataToSave.dob = Timestamp.fromDate(studentData.dob);
  }

  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key] === undefined) {
      delete dataToSave[key];
    }
  });

  // Non-blocking setDoc for offline stability
  setDoc(studentRef, dataToSave)
    .catch(async (serverError) => {
      console.error("Error adding student:", serverError);
      const permissionError = new FirestorePermissionError({
        path: 'students',
        operation: 'create',
        requestResourceData: dataToSave,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
    
  return Promise.resolve(studentRef.id);
};

export const updateStudent = (db: Firestore, id: string, studentData: UpdateStudentData) => {
  const docRef = doc(db, 'students', id);
  const dataToUpdate: WithFieldValue<DocumentData> = {
    ...studentData,
    updatedAt: serverTimestamp(),
  };

  if (studentData.dob) {
    dataToUpdate.dob = Timestamp.fromDate(studentData.dob);
  } else if (studentData.hasOwnProperty('dob') && studentData.dob === undefined) {
    dataToUpdate.dob = null;
  }

  Object.keys(dataToUpdate).forEach(key => {
    if (dataToUpdate[key] === undefined) {
      delete dataToUpdate[key];
    }
  });

  // Non-blocking updateDoc
  updateDoc(docRef, dataToUpdate)
    .catch(async (serverError) => {
        console.error("Error updating student:", serverError);
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: dataToUpdate,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
    
  return Promise.resolve();
};

export const deleteStudent = (db: Firestore, id: string) => {
  const docRef = doc(db, 'students', id);
  // Non-blocking deleteDoc
  deleteDoc(docRef)
    .catch(async (serverError) => {
        console.error("Error deleting student:", serverError);
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
    
  return Promise.resolve();
};
