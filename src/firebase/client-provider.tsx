'use client';
import { ReactNode, useMemo, useEffect, useState } from 'react';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, Firestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

import { firebaseConfig } from './config';
import { FirebaseProvider } from './provider';

/**
 * Singleton instances to prevent re-initialization.
 * Using global window object to persist across HMR reloads in development.
 */
declare global {
  interface Window {
    __FIREBASE_APP__?: FirebaseApp;
    __FIREBASE_FIRESTORE__?: Firestore;
    __FIREBASE_AUTH__?: Auth;
  }
}

function getFirebaseInstances() {
  if (typeof window === 'undefined') return null;

  if (!window.__FIREBASE_APP__) {
    if (!getApps().length) {
      window.__FIREBASE_APP__ = initializeApp(firebaseConfig);
    } else {
      window.__FIREBASE_APP__ = getApp();
    }
  }

  const app = window.__FIREBASE_APP__;

  if (!window.__FIREBASE_FIRESTORE__) {
    /**
     * Modern Firestore Initialization (SDK v11+)
     * Using localCache instead of deprecated enableIndexedDbPersistence to prevent
     * INTERNAL ASSERTION FAILED errors in workstation environments.
     */
    window.__FIREBASE_FIRESTORE__ = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true, // Required for Cloud Workstations and stability
    });

    // Set log level to 'silent' to reduce noise in console
    setLogLevel('silent');
  }

  if (!window.__FIREBASE_AUTH__) {
    window.__FIREBASE_AUTH__ = getAuth(app);
  }

  return {
    app: window.__FIREBASE_APP__,
    firestore: window.__FIREBASE_FIRESTORE__,
    auth: window.__FIREBASE_AUTH__,
  };
}

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  const instances = useMemo(() => getFirebaseInstances(), []);

  useEffect(() => {
    // Initialization is now handled inside getFirebaseInstances for v11+ stability
    setIsInitialized(true);
  }, [instances]);

  if (!instances || !isInitialized) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-indigo-50 font-kalpurush">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="font-black text-primary animate-pulse">সার্ভারের সাথে সংযোগ স্থাপন করা হচ্ছে...</p>
        </div>
      </div>
    );
  }

  return (
    <FirebaseProvider
      app={instances.app}
      firestore={instances.firestore}
      auth={instances.auth}
    >
      {children}
    </FirebaseProvider>
  );
}
