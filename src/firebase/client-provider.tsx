'use client';
import { ReactNode, useMemo, useEffect, useState } from 'react';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, Firestore, enableIndexedDbPersistence, setLogLevel } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

import { firebaseConfig } from './config';
import { FirebaseProvider } from './provider';

// Singleton instances to prevent re-initialization
// We use a module-level object to persist these instances across re-renders
// and hot module replacements (HMR) during development.
const firebaseInstances: {
  app?: FirebaseApp;
  firestore?: Firestore;
  auth?: Auth;
} = {};

function getFirebaseInstances() {
  if (typeof window === 'undefined') return null;

  if (!firebaseInstances.app) {
    if (!getApps().length) {
      firebaseInstances.app = initializeApp(firebaseConfig);
    } else {
      firebaseInstances.app = getApp();
    }
  }

  if (!firebaseInstances.firestore) {
    // Use initializeFirestore with force long polling for better workstation compatibility
    // and stability in cloud environments.
    firebaseInstances.firestore = initializeFirestore(firebaseInstances.app, {
      experimentalForceLongPolling: true,
    });

    // Set log level to 'silent' to suppress SDK connectivity warnings and errors in console
    // which helps in reducing unnecessary noise during development.
    setLogLevel('silent');
  }

  if (!firebaseInstances.auth) {
    firebaseInstances.auth = getAuth(firebaseInstances.app);
  }

  return {
    app: firebaseInstances.app,
    firestore: firebaseInstances.firestore,
    auth: firebaseInstances.auth,
  };
}

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  const instances = useMemo(() => getFirebaseInstances(), []);

  useEffect(() => {
    if (typeof window !== 'undefined' && instances?.firestore && !isInitialized) {
      // Enable offline persistence with a safe check
      enableIndexedDbPersistence(instances.firestore)
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn('Firestore persistence failed: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.warn('Firestore persistence failed: Browser not supported');
          }
        })
        .finally(() => {
          setIsInitialized(true);
        });
    } else {
        setIsInitialized(true);
    }
  }, [instances, isInitialized]);

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
