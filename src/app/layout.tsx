
import type {Metadata} from 'next';
import { Noto_Sans_Bengali, PT_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AcademicYearProvider } from '@/context/AcademicYearContext';
import { SchoolInfoProvider } from '@/context/SchoolInfoContext';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { AuthProvider } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { APP_ICON_URL, defaultSchoolInfo } from '@/lib/school-info';

export const metadata: Metadata = {
  title: `${defaultSchoolInfo.name} - ম্যানেজমেন্ট সিস্টেম`,
  description: 'বীরগঞ্জ পৌর উচ্চ বিদ্যালয়ের একটি কেন্দ্রীয় শিক্ষা ব্যবস্থাপনা পোর্টাল।',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: APP_ICON_URL,
    shortcut: APP_ICON_URL,
    apple: APP_ICON_URL,
  }
};

const noto_sans_bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  weight: ['400', '700'],
  variable: '--font-noto-sans-bengali',
});

const pt_sans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});

import { GoogleTranslateProvider } from '@/components/GoogleTranslateProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body className={cn("font-body antialiased", noto_sans_bengali.variable, pt_sans.variable)}>
        <FirebaseClientProvider>
          <GoogleTranslateProvider>
            <AuthProvider>
              <SchoolInfoProvider>
                <AcademicYearProvider>
                  {children}
                </AcademicYearProvider>
              </SchoolInfoProvider>
            </AuthProvider>
          </GoogleTranslateProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
