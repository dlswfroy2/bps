'use client';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { UserRole } from './user';
import { defaultPermissions } from './permissions';


export async function signUp(email: string, password: string): Promise<{ success: boolean; role?: UserRole; error?: string }> {
  const auth = getAuth();
  const db = getFirestore();
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Create the Auth user first so we are "isAuthed()" for Firestore rules
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Now check if the system already has any users (to allow first admin)
    const usersRef = collection(db, 'users');
    const anyUserQuery = query(usersRef, limit(1));
    const anyUserSnapshot = await getDocs(anyUserQuery).catch(() => ({ empty: false })); // If permission denied, assume not empty
    const isSystemEmpty = anyUserSnapshot.empty;

    // 3. Check if this email is in the staff list
    const staffRef = collection(db, 'staff');
    const staffQuery = query(staffRef, where('email', '==', normalizedEmail), limit(1));
    const staffSnapshot = await getDocs(staffQuery);
    const isStaff = !staffSnapshot.empty;

    // Security Gate: Reject if not staff AND not the very first user
    if (!isSystemEmpty && !isStaff) {
      // Clean up: Delete the newly created auth user because they aren't authorized
      await deleteUser(user);
      return { 
        success: false, 
        error: 'আপনার ইমেইলটি অনুমোদিত শিক্ষক তালিকায় পাওয়া যায়নি। দয়া করে এডমিনের সাথে যোগাযোগ করুন।' 
      };
    }

    let role: UserRole = 'teacher';
    let displayName = email.split('@')[0];

    // If first user, make admin. Otherwise teacher.
    if (isSystemEmpty) {
        role = 'admin';
        displayName = 'System Admin';
    } else if (isStaff) {
        const staffData = staffSnapshot.docs[0].data();
        displayName = staffData.nameBn || displayName;
    }

    // 4. Create the user document in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: normalizedEmail,
      role: role,
      displayName: displayName,
      isOnline: true,
      permissions: defaultPermissions[role] || [],
      lastLoginAt: serverTimestamp(),
    });

    return { success: true, role: role };

  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
        return { success: false, error: 'এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা আছে। দয়া করে সরাসরি লগইন করুন।' };
    }
    if (error.code === 'auth/weak-password') {
        return { success: false, error: 'পাসওয়ার্ডটি অন্তত ৬ অক্ষরের হতে হবে।' };
    }
    if (error.code === 'auth/invalid-email') {
        return { success: false, error: 'অনুগ্রহ করে সঠিক ইমেইল এড্রেস লিখুন।' };
    }
    return { success: false, error: error.message || 'নিবন্ধন সম্পন্ন করা সম্ভব হয়নি।' };
  }
}

export async function signIn(email: string, password: string, role: UserRole): Promise<{ success: boolean; error?: string }> {
  const auth = getAuth();
  const db = getFirestore();
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // ধাপ ১: Firebase-এ login করার আগেই email দিয়ে Firestore-এ role চেক করা
    // এতে ভুল role হলে Firebase auth state কখনোই set হবে না
    const usersRef = collection(db, 'users');
    const roleCheckQuery = query(usersRef, where('email', '==', normalizedEmail), limit(1));
    const roleCheckSnap = await getDocs(roleCheckQuery).catch(() => null);

    if (roleCheckSnap && !roleCheckSnap.empty) {
      const existingRole = roleCheckSnap.docs[0].data().role;
      if (existingRole !== role) {
        return {
          success: false,
          error: `আপনি "${role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষক'}" সেকশন থেকে লগইন করতে পারবেন না। সঠিক লগইন অপশন বেছে নিন।`,
        };
      }
    }

    // ধাপ ২: role সঠিক হলে তারপর Firebase-এ login করা
    const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const user = userCredential.user;

    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
        await firebaseSignOut(auth);
        return { success: false, error: 'আপনার কোনো প্রোফাইল পাওয়া যায়নি। দয়া করে পুনরায় সাইন আপ করুন।' };
    }

    const userData = userDoc.data();
    if (userData.role !== role) {
      await firebaseSignOut(auth);
      return { success: false, error: `আপনি "${role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষক'}" সেকশন থেকে লগইন করতে পারবেন না। সঠিক লগইন অপশন বেছে নিন।` };
    }

    await setDoc(userDocRef, { 
      isOnline: true,
      lastLoginAt: serverTimestamp() 
    }, { merge: true });

    return { success: true };
  } catch (error: any) {
     const authErrorCodes = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-email', 'auth/user-disabled'];
     if (authErrorCodes.includes(error.code)) {
      return { success: false, error: 'আপনার ইমেইল অথবা পাসওয়ার্ডটি সঠিক নয়।' };
    }
    return { success: false, error: error.message || 'লগইন করা যায়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।' };
  }
}

export async function signOut() {
  const auth = getAuth();
  const db = getFirestore();
  const user = auth.currentUser;
  
  if (user) {
    const userDocRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userDocRef, { isOnline: false });
    } catch (e) {
      console.log("Logout: Online status update skipped.");
    }
  }
  
  return firebaseSignOut(auth);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user || !user.email) {
    return { success: false, error: 'ব্যবহারকারী লগইন করা নেই।' };
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return { success: true };
  } catch (error: any) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      return { success: false, error: 'আপনার বর্তমান পাসওয়ার্ডটি ভুল।' };
    }
    return { success: false, error: 'পাসওয়ার্ড পরিবর্তন করা যায়নি।' };
  }
}
