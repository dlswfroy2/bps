
'use client';

// This is a list of available permissions in the system.
export const availablePermissions = [
  { id: 'view:dashboard', label: 'ড্যাশবোর্ড দেখুন' },
  
  { id: 'view:students', label: 'শিক্ষার্থী তালিকা দেখুন' },
  { id: 'manage:students', label: 'শিক্ষার্থী যোগ করার অনুমতি' },
  { id: 'special:edit-student', label: 'স্পেশাল পারমিশন: শিক্ষার্থী এডিট করুন' },
  { id: 'special:delete-student', label: 'স্পেশাল পারমিশন: শিক্ষার্থী ডিলিট করুন' },
  { id: 'upload:students', label: 'এক্সেল দিয়ে শিক্ষার্থী আপলোড (ভর্তি)' },
  { id: 'view:student-profile', label: 'শিক্ষার্থী প্রোফাইল সার্চ করুন' },

  { id: 'manage:admissions', label: 'অনলাইন ভর্তি আবেদন ম্যানেজ করুন' },

  { id: 'view:staff', label: 'শিক্ষক ও কর্মচারী তালিকা দেখুন' },
  { id: 'manage:staff', label: 'শিক্ষক ও কর্মচারী ম্যানেজ করুন' },
  { id: 'manage:staff-attendance', label: 'স্টাফ হাজিরা ও ছুটি ম্যানেজ (ইনপুট)' },
  { id: 'manage:staff-attendance-delete', label: 'স্টাফ হাজিরা রেকর্ড ডিলিট করার অনুমতি' },
  { id: 'view:staff-attendance-report', label: 'স্টাফ হাজিরা ও ছুটির রিপোর্ট দেখুন' },

  { id: 'manage:attendance', label: 'শিক্ষার্থীর হাজিরা ম্যানেজ করুন' },
  { id: 'input:quick-roll-attendance', label: 'রোল ইনপুট দিয়ে দ্রুত হাজিরা' },
  { id: 'view:missed-attendance', label: 'বকেয়া হাজিরা দেখুন' },
  { id: 'input:missed-attendance', label: 'বকেয়া হাজিরা গ্রহণ করুন' },
  { id: 'view:absent-student-list', label: 'অনুপস্থিত শিক্ষার্থীর তালিকা দেখুন' },

  { id: 'manage:lesson-plans', label: 'লেসন প্ল্যান ও প্রগ্রেস ম্যানেজ করুন' },
  { id: 'view:syllabus-mgmt', label: 'সিলেবাস ব্যবস্থাপনা দেখুন' },
  { id: 'manage:syllabus', label: 'সিলেবাস তৈরি ও পরিবর্তন করুন' },
  { id: 'view:syllabus-tracker', label: 'সিলেবাস ট্র্যাকার (মনিটরিং) দেখুন' },

  { id: 'view:notices', label: 'নোটিশ বোর্ড দেখুন' },
  { id: 'manage:notices', label: 'নোটিশ বোর্ড ব্যবস্থাপনা (প্রকাশ ও নিয়ন্ত্রণ)' },

  { id: 'input:results', label: 'ফলাফল ও নম্বর ইনপুট (নির্ধারিত বিষয়)' },
  { id: 'manage:results', label: 'ফলাফল ও নম্বর ম্যানেজ (সকল বিষয় ও নিয়ন্ত্রণ)' },
  { id: 'manage:full-marks', label: 'বিষয় ও পূর্ণমান ব্যবস্থাপনা' },
  { id: 'upload:marks', label: 'এক্সেল দিয়ে ফলাফল আপলোড' },
  { id: 'view:merit-list', label: 'মেধা তালিকা দেখুন' },
  { id: 'promote:students', label: 'প্রমোশন ম্যানেজ করুন' },
  { id: 'manage:special-results', label: 'বিশেষ পরীক্ষা ম্যানেজ করুন' },
  
  { id: 'view:public-records', label: 'রেকর্ড শাখা দেখুন' },
  { id: 'manage:public-records', label: 'রেকর্ড শাখা ম্যানেজ করুন' },
  
  { id: 'view:accounts', label: 'হিসাব শাখা দেখুন' },
  { id: 'collect:fees', label: 'বেতন আদায় করুন' },
  { id: 'manage:fee-setup', label: 'শিক্ষার্থীর ফি নির্ধারণ (সেটআপ)' },
  { id: 'special:edit-transaction', label: 'স্পেশাল পারমিশন: আদায়/আয়-ব্যয় এডিট করুন' },
  { id: 'special:delete-transaction', label: 'স্পেশাল পারমিশন: আদায়/আয়-ব্যয় ডিলিট করুন' },
  { id: 'view:collection-report', label: 'বেতন আদায়ের রিপোর্ট দেখুন' },
  { id: 'view:expense-report', label: 'ব্যয়ের রিপোর্ট দেখুন' },
  { id: 'view:accounts-monthly-report', label: 'মাসিক আয়-ব্যয় রিপোর্ট দেখুন' },
  { id: 'view:cashbook-ledger', label: 'ক্যাশবুক ও খতিয়ান দেখুন' },
  { id: 'manage:transactions', label: 'সাধারণ লেনদেন ম্যানেজ করুন' },
  
  { id: 'manage:documents', label: 'ডকুমেন্ট ম্যানেজ করুন' },
  { id: 'view:archive', label: 'নথিপত্র (ডিজিটাল আর্কাইভ) দেখুন' },
  { id: 'manage:archive', label: 'ডিজিটাল আর্কাইভ (নথিপত্র) ম্যানেজ করুন' },
  { id: 'view:routines', label: 'রুটিন দেখুন' },
  { id: 'manage:routines', label: 'রুটিন ম্যানেজ করুন' },
  { id: 'view:proxy-classes', label: 'বদলি ক্লাস দেখুন' },
  { id: 'manage:proxy-classes', label: 'বদলি ক্লাস ম্যানেজ করুন' },

  { id: 'send:messaging', label: 'মেসেজ পাঠানো' },
  { id: 'manage:messaging', label: 'মেসেজ ম্যানেজ করুন' },

  { id: 'manage:settings', label: 'সেটিংস ম্যানেজ করুন' },
];

export const defaultPermissions: { [key: string]: string[] } = {
  admin: availablePermissions.map(p => p.id),
  teacher: [
    'view:dashboard',
    'view:students',
    'view:student-profile',
    'manage:admissions',
    'view:staff',
    'manage:staff-attendance',
    'view:staff-attendance-report',
    'manage:attendance',
    'input:quick-roll-attendance',
    'view:missed-attendance',
    'view:absent-student-list',
    'manage:lesson-plans',
    'view:syllabus-mgmt',
    'view:notices',
    'manage:notices',
    'input:results', 
    'view:merit-list',
    'promote:students',
    'manage:special-results',
    'view:public-records',
    'view:accounts',
    'collect:fees',
    'manage:fee-setup',
    'view:collection-report',
    'view:expense-report',
    'view:accounts-monthly-report',
    'view:cashbook-ledger',
    'view:routines',
    'view:proxy-classes',
    'manage:documents',
    'view:archive',
    'send:messaging'
  ],
};
