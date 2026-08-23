'use client';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      console.warn("Firestore Permission Warning:", error.message);
      toast({
        variant: 'destructive',
        title: 'অনুমতির সীমাবদ্ধতা (Permission Error)',
        description:
          'দুঃখিত, এই তথ্যে প্রবেশ করার জন্য আপনার অ্যাকাউন্টের প্রয়োজনীয় পারমিশন নেই।',
        duration: 5000,
      });
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  return null;
}
