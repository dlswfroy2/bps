'use client';

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useFirestore } from '@/firebase';
import { User, userFromDoc } from '@/lib/user';
import { defaultPermissions } from '@/lib/permissions';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  hasPermission: (permissionId: string) => boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useFirebaseAuth();
  const db = useFirestore();
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) return;

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (fbUser) {
        const userDocRef = doc(db, 'users', fbUser.uid);
        
        unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = userFromDoc(docSnap);
            if (!userData.permissions || userData.permissions.length === 0) {
              userData.permissions = defaultPermissions[userData.role] || [];
            }
            setUser(userData);
            setLoading(false);
          } else {
            setUser(null);
            setLoading(false);
          }
        }, (error) => {
            if (error.code === 'permission-denied') return;
            console.error("Auth snapshot error:", error);
            setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
      unsubscribeAuth();
    };
  }, [auth, db]);

  const hasPermission = useCallback((permissionId: string): boolean => {
    if (loading || !user) {
      return false;
    }
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permissionId) ?? false;
  }, [user, loading]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}