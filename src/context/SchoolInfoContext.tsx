'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback } from 'react';
import { getSchoolInfo, saveSchoolInfo, SchoolInfo, defaultSchoolInfo } from '@/lib/school-info';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot, FirestoreError } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/components/GoogleTranslateProvider';

type SchoolInfoContextType = {
  schoolInfo: SchoolInfo;
  updateSchoolInfo: (newInfo: Partial<SchoolInfo>) => Promise<void>;
  isLoading: boolean;
};

const SchoolInfoContext = createContext<SchoolInfoContextType | undefined>(undefined);

export function SchoolInfoProvider({ children }: { children: ReactNode }) {
  const db = useFirestore();
  const { user } = useAuth();
  const { currentLang } = useLanguage();
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(defaultSchoolInfo);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db) {
        setIsLoading(false);
        return;
    };

    const docRef = doc(db, 'school', 'info');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            setSchoolInfo({ ...defaultSchoolInfo, ...docSnap.data() } as SchoolInfo);
        } else {
            if (user?.role === 'admin') {
                saveSchoolInfo(db, defaultSchoolInfo).catch(console.error);
            }
            setSchoolInfo(defaultSchoolInfo);
        }
        setIsLoading(false);
    }, async (error: FirestoreError) => {
        if (error.code === 'permission-denied') return;
        const permissionError = new FirestorePermissionError({
          path: 'school/info',
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, user]);

  const updateSchoolInfo = useCallback(async (newInfo: Partial<SchoolInfo>) => {
    if (!db) return Promise.reject("Firestore not initialized");
    const updatedInfo = { ...schoolInfo, ...newInfo };
    return saveSchoolInfo(db, updatedInfo);
  }, [db, schoolInfo]);

  const effectiveSchoolInfo = useMemo(() => {
    if (currentLang === 'en' && schoolInfo.nameEn) {
      return {
        ...schoolInfo,
        name: schoolInfo.nameEn,
      };
    }
    return schoolInfo;
  }, [schoolInfo, currentLang]);

  const value = useMemo(() => ({
    schoolInfo: effectiveSchoolInfo,
    updateSchoolInfo,
    isLoading
  }), [effectiveSchoolInfo, updateSchoolInfo, isLoading]);

  return (
    <SchoolInfoContext.Provider value={value}>
      {children}
    </SchoolInfoContext.Provider>
  );
}

export function useSchoolInfo() {
  const context = useContext(SchoolInfoContext);
  if (context === undefined) {
    throw new Error('useSchoolInfo must be used within a SchoolInfoProvider');
  }
  return context;
}