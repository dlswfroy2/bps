'use client';

import Image from 'next/image';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deleteStudent, Student, studentFromDoc, isMale, isFemale, getStudentPlaceholderImage, sanitizePhotoUrl, addStudent, updateStudent } from '@/lib/student-data';
import { 
    Eye, FilePen, Trash2, LayoutGrid, List, UserRound, Search, 
    GraduationCap, MapPin, Users, Phone, Info, ChevronRight, 
    Printer, FileText, Loader2, Plus, AlertCircle, BookOpen, Briefcase, FileUp, Download, RefreshCw, XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, orderBy, FirestoreError, where, getDocs, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Separator } from '@/components/ui/separator';

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const classNamesMap: { [key: string]: string } = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম',
};

const classRomanMap: { [key: string]: string } = {
    '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
};

const religionMapBn: Record<string, string> = {
    'islam': 'ইসলাম', 'hinduism': 'হিন্দু', 'buddhism': 'বৌদ্ধ', 'christianity': 'খ্রিস্টান', 'other': 'অন্যান্য'
};

const sidebarItems = [
    { id: 'list', label: 'শিক্ষার্থী তালিকা', icon: List, color: 'text-primary bg-primary/10' },
    { id: 'print', label: 'প্রিন্ট তালিকা', icon: Printer, color: 'text-emerald-600 bg-emerald-50' },
    { id: 'esif', label: 'ESIF ফরম', icon: FileText, color: 'text-blue-600 bg-blue-50' },
];

const ESIFRow = ({ student, index }: { student: Student, index: number }) => {
    const dobStr = student.dob ? format(new Date(student.dob), 'dd-MM-yyyy') : '';
    const religion = (student.religion || '').toLowerCase();
    const isIslam = religion.includes('islam') || religion.includes('ইসলাম');
    const relCode = isIslam ? '111' : '112';
    
    const common = ['101', '102', '107', '108', '109', '154'];
    let groupCodes: string[] = [];
    let fourthSubject = '';
    let fourthCode = '';

    const grp = (student.group || '').toLowerCase();
    if (grp.includes('science') || grp.includes('বিজ্ঞান')) {
        groupCodes = ['136', '137', '138', '150'];
        if (student.optionalSubject?.includes('কৃষি')) {
            fourthSubject = 'AGRICULTURE';
            fourthCode = '134';
        } else if (student.optionalSubject?.includes('উচ্চতর')) {
            fourthSubject = 'H. MATH';
            fourthCode = '126';
        }
    } else if (grp.includes('arts') || grp.includes('মানবিক')) {
        groupCodes = ['153', '110', '140', '127'];
        fourthSubject = 'AGRICULTURE';
        fourthCode = '134';
    } else if (grp.includes('commerce') || grp.includes('ব্যবসায়')) {
        groupCodes = ['146', '152', '143', '127'];
        fourthSubject = 'AGRICULTURE';
        fourthCode = '134';
    } else {
        groupCodes = ['127', '150'];
        fourthSubject = 'AGRICULTURE';
        fourthCode = '134';
    }

    const allCodes = [...common, ...groupCodes].sort().join(',');

    return (
        <TableRow className="border-b border-black h-16 print:h-14" style={{ breakInside: 'avoid' }}>
            <TableCell className="border-r border-black text-center font-bold p-1 text-[11px]">{index.toString().padStart(2, '0')}</TableCell>
            <TableCell className="border-r border-black p-1 text-[11px] font-bold leading-tight">
                <p className="uppercase">{student.studentNameEn || student.studentNameBn}</p>
                <p className="uppercase mt-1">{student.fatherNameEn || student.fatherNameBn}</p>
                <p className="uppercase mt-1">{student.motherNameEn || student.motherNameBn}</p>
            </TableCell>
            <TableCell className="border-r border-black text-center p-1 text-[11px] font-bold">
                <p>{dobStr}</p>
                <p className="uppercase mt-2">{isMale(student.gender) ? 'MALE' : isFemale(student.gender) ? 'FEMALE' : 'N/A'}</p>
            </TableCell>
            <TableCell className="border-r border-black text-center p-1 text-[11px] font-bold uppercase">
                <p className="font-black">{student.group || 'GENERAL'}</p>
                <p className="mt-2">{isIslam ? 'ISLAM' : 'HINDUISM'}</p>
            </TableCell>
            <TableCell className="border-r border-black text-center p-1 text-[11px] font-bold uppercase">
                <p>{student.prevPassingYear || '.'}</p>
                <p className="mt-1">{student.prevRegNo || '.'}</p>
                <p className="text-[9px] mt-1">{student.prevBoard || '.'}</p>
            </TableCell>
            <TableCell className="border-r border-black p-2 text-[12px] font-black tracking-wider text-center max-w-[200px] break-words">
                {allCodes}
            </TableCell>
            <TableCell className="border-r border-black text-center p-1 font-black text-sm">{relCode}</TableCell>
            <TableCell className="text-center p-1 text-[10px] font-black leading-tight uppercase">
                <p className="mb-1">{fourthSubject}</p>
                <p className="text-lg">{fourthCode}</p>
            </TableCell>
        </TableRow>
    );
};

function StudentListContent() {
  const searchParams = useSearchParams();
  const targetClass = searchParams.get('class');
  const targetStudentId = searchParams.get('studentId');

  const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { selectedYear } = useAcademicYear();
  const { schoolInfo } = useSchoolInfo();
  const [studentToView, setStudentToView] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState('6');
  const db = useFirestore();
  const { user, hasPermission } = useAuth();
  
  const canEditStudent = hasPermission('special:edit-student');
  const canDeleteStudent = hasPermission('special:delete-student');
  
  const [isMounted, setIsMounted] = useState(false);
  const [activeSection, setActiveSection] = useState('list');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterReligion, setFilterReligion] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Upload States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());

  const normalizeReligion = useCallback((r: string | undefined | null) => {
    const str = (r || '').toLowerCase().trim();
    if (str === 'islam' || str === 'ইসলাম') return 'islam';
    if (str === 'hindu' || str === 'হিন্দু' || str === 'hinduism') return 'hindu';
    if (str.includes('christ') || str.includes('খ্রিস্টান') || str.includes('খ্রিষ্টান') || str.includes('খিষ্টান')) return 'christian';
    return 'other';
  }, []);

  const classStats = useMemo(() => {
    const relCounts: Record<string, number> = { all: 0, islam: 0, hinduism: 0, christianity: 0, other: 0 };
    const genCounts: Record<string, number> = { all: 0, male: 0, female: 0 };
    const grpCounts: Record<string, number> = { all: 0, science: 0, arts: 0, commerce: 0 };
    
    const studentsInClass = allStudents.filter(s => s.academicYear === selectedYear && s.className === activeTab);
    
    relCounts.all = studentsInClass.length;
    genCounts.all = studentsInClass.length;
    grpCounts.all = studentsInClass.length;

    studentsInClass.forEach(s => {
      const normRel = normalizeReligion(s.religion);
      if (normRel === 'islam') relCounts.islam++;
      else if (normRel === 'hindu') relCounts.hinduism++;
      else if (normRel === 'christian') relCounts.christianity++;
      else relCounts.other++;

      if (isMale(s.gender)) genCounts.male++;
      else if (isFemale(s.gender)) genCounts.female++;

      const g = (s.group || '').toLowerCase();
      if (g === 'science' || g === 'বিজ্ঞান') grpCounts.science++;
      else if (g === 'arts' || g === 'মানবিক') grpCounts.arts++;
      else if (g === 'commerce' || g === 'ব্যবসায় শিক্ষা') grpCounts.commerce++;
    });

    return { religion: relCounts, gender: genCounts, group: grpCounts };
  }, [allStudents, selectedYear, activeTab, normalizeReligion]);

  const filteredStudents = useMemo(() => {
    let filtered = allStudents.filter(s => s.academicYear === selectedYear);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const nameBn = (s.studentNameBn || '').toLowerCase();
        const nameEn = (s.studentNameEn || '').toLowerCase();
        const rollStr = (s.roll || '').toString();
        const idStr = (s.generatedId || '').toLowerCase();
        return nameBn.includes(q) || nameEn.includes(q) || rollStr.includes(bnToEn(q)) || idStr.includes(q);
      });
    }

    if (filterGender !== 'all') {
      filtered = filtered.filter(s => filterGender === 'male' ? isMale(s.gender) : isFemale(s.gender));
    }
    
    if (filterReligion !== 'all') {
      filtered = filtered.filter(s => normalizeReligion(s.religion) === filterReligion);
    }

    if (filterGroup !== 'all') {
        filtered = filtered.filter(s => (s.group || '').toLowerCase().includes(filterGroup));
    }

    return filtered;
  }, [allStudents, selectedYear, searchQuery, filterGender, filterReligion, filterGroup, normalizeReligion]);

  const getStudentsByClass = useCallback((className: string) => {
    return filteredStudents.filter(student => student.className === className);
  }, [filteredStudents]);

  const classes = ['6', '7', '8', '9', '10'];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (targetClass) {
        setActiveTab(targetClass);
    }
  }, [targetClass]);

  // Reset filters when switching classes or year
  useEffect(() => {
    setFilterGender('all');
    setFilterReligion('all');
    setFilterGroup('all');
    setSearchQuery('');
  }, [activeTab, selectedYear]);

  useEffect(() => {
    if (!db || !user) return;
    setIsLoading(true);

    const studentsQuery = query(
      collection(db, "students"), 
      orderBy("roll")
    );

    const unsubscribe = onSnapshot(studentsQuery, (querySnapshot) => {
      const studentsData = querySnapshot.docs.map(studentFromDoc);
      setAllStudents(studentsData);
      setIsLoading(false);
    }, (error: FirestoreError) => {
      if (error.code === 'permission-denied') return;
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'students',
        operation: 'list',
      }));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, user]);

  useEffect(() => {
    if (targetStudentId && !isLoading && isMounted) {
        const timer = setTimeout(() => {
            const element = document.getElementById(`student-row-${targetStudentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [targetStudentId, isLoading, isMounted]);

  const handleDeleteStudent = (studentId: string) => {
    if (!db) return;
    if (!canDeleteStudent) {
        toast({ variant: 'destructive', title: 'দুঃখিত, আপনার এটি করার অনুমতি নেই।' });
        return;
    }
    deleteStudent(db, studentId).then(() => {
        toast({ title: "শিক্ষার্থী ডিলিট হয়েছে" });
    }).catch(() => {});
  };

  const handleDeleteAll = async () => {
    if (!db || !user) return;
    const studentsToDelete = getStudentsByClass(activeTab);
    if (studentsToDelete.length === 0) return;

    setIsDeletingAll(true);
    try {
        const batch = writeBatch(db);
        studentsToDelete.forEach((student) => {
            batch.delete(doc(db, 'students', student.id));
        });

        await batch.commit();
        toast({ title: "সফল", description: `${classNamesMap[activeTab]} শ্রেণির সকল শিক্ষার্থী ডিলিট হয়েছে।` });
    } catch (e: any) {
        console.error("Bulk Delete Error:", e);
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'students',
                operation: 'delete',
            } satisfies SecurityRuleContext));
        }
    } finally {
        setIsDeletingAll(false);
    }
  };

  const handleDownloadSample = () => {
    const studentsInClass = allStudents
      .filter(s => s.academicYear === selectedYear && s.className === activeTab)
      .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));

    const headers = [
      'Generated ID (DO NOT CHANGE)', 'Roll', 'Name (Bengali)', 'Name (English)', 'Father Name (Bengali)', 'Father Name (English)', 
      'Mother Name (Bengali)', 'Mother Name (English)', 'Father NID', 'Mother NID', 'Birth Reg No', 'Guardian Mobile', 'Date of Birth (DD-MM-YYYY)', 
      'Gender', 'Religion', 'Group', 'Optional Subject', 'Village', 'Union', 'Post Office'
    ];

    const data = studentsInClass.map(s => [
      s.generatedId || '',
      s.roll,
      s.studentNameBn || '',
      s.studentNameEn || '',
      s.fatherNameBn || '',
      s.fatherNameEn || '',
      s.motherNameBn || '',
      s.motherNameEn || '',
      s.fatherNid || '',
      s.motherNid || '',
      s.birthRegNo || '',
      s.guardianMobile || '',
      s.dob ? format(new Date(s.dob), 'dd-MM-yyyy') : '',
      s.gender || 'male',
      s.religion || 'islam',
      s.group || 'general',
      s.optionalSubject || '',
      s.presentVillage || '',
      s.presentUnion || '',
      s.presentPostOffice || ''
    ]);

    if (data.length === 0) {
        data.push(['', '1', 'আব্দুর রহিম', 'Abdur Rahim', 'করিম মিয়া', 'Karim Mia', 'রহিমা বেগম', 'Rahima Begum', '', '', '', '01700000000', '01-01-2010', 'male', 'islam', 'general', '', 'চরপাড়া', 'বীরগঞ্জ', 'বীরগঞ্জ']);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `Student_List_Class_${activeTab}_${selectedYear}.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
            toast({ variant: 'destructive', title: 'ফাইলটি খালি', description: 'এক্সেল ফাইলে কোনো তথ্য পাওয়া যায়নি।' });
            setIsUploading(false);
            return;
        }

        let updatedCount = 0;
        let addedCount = 0;

        for (const row of data as any[]) {
            const rowId = String(row['Generated ID (DO NOT CHANGE)'] || '').trim();
            const studentData: any = {
                academicYear: selectedYear,
                className: activeTab,
                roll: parseInt(bnToEn(String(row['Roll'] || row['রোল'] || '0'))),
                studentNameBn: String(row['Name (Bengali)'] || row['নাম (বাংলা)'] || ''),
                studentNameEn: String(row['Name (English)'] || row['নাম (ইংরেজি)'] || ''),
                fatherNameBn: String(row['Father Name (Bengali)'] || row['পিতার নাম (বাংলা)'] || ''),
                fatherNameEn: String(row['Father Name (English)'] || row['পিতার নাম (ইংরেজি)'] || ''),
                motherNameBn: String(row['Mother Name (Bengali)'] || row['মাতার নাম (বাংলা)'] || ''),
                motherNameEn: String(row['Mother Name (English)'] || row['মাতার নাম (ইংরেজি)'] || ''),
                fatherNid: String(row['Father NID'] || row['পিতার এনআইডি'] || ''),
                motherNid: String(row['Mother NID'] || row['মাতার এনআইডি'] || ''),
                birthRegNo: String(row['Birth Reg No'] || row['জন্ম নিবন্ধন'] || ''),
                guardianMobile: String(row['Guardian Mobile'] || row['মোবাইল'] || ''),
                gender: String(row['Gender'] || row['লিঙ্গ'] || 'male').trim().toLowerCase(),
                religion: String(row['Religion'] || row['ধর্ম'] || 'islam').trim().toLowerCase(),
                group: String(row['Group'] || row['গ্রুপ'] || 'general').trim().toLowerCase(),
                optionalSubject: String(row['Optional Subject'] || row['ঐচ্ছিক বিষয়'] || '').trim(),
                presentVillage: String(row['Village'] || row['গ্রাম'] || '').trim(),
                presentUnion: String(row['Union'] || row['ইউনিয়ন'] || '').trim(),
                presentPostOffice: String(row['Post Office'] || row['ডাকঘর'] || '').trim(),
            };

            const dobVal = row['Date of Birth (DD-MM-YYYY)'] || row['Date of Birth (YYYY-MM-DD)'] || row['জন্ম তারিখ'];
            if (dobVal) {
                let dobDate: Date | null = null;
                
                if (dobVal instanceof Date) {
                    dobDate = dobVal;
                } else if (typeof dobVal === 'string' || typeof dobVal === 'number') {
                    const dobStr = String(dobVal).trim();
                    const parts = dobStr.split(/[-/.]/);
                    if (parts.length === 3) {
                        let d, m, y;
                        if (parts[0].length === 4) { 
                            y = parseInt(parts[0], 10);
                            m = parseInt(parts[1], 10) - 1;
                            d = parseInt(parts[2], 10);
                        } else { 
                            d = parseInt(parts[0], 10);
                            m = parseInt(parts[1], 10) - 1;
                            y = parseInt(parts[2], 10);
                            if (y < 100) y += (y > 30 ? 1900 : 2000);
                        }
                        
                        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                            if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
                                dobDate = new Date(y, m, d);
                            }
                        }
                    }
                    
                    if (!dobDate || isNaN(dobDate.getTime())) {
                        const fallback = new Date(dobStr);
                        if (!isNaN(fallback.getTime())) dobDate = fallback;
                    }
                }
                
                if (dobDate && !isNaN(dobDate.getTime())) {
                    dobDate.setHours(12, 0, 0, 0); 
                    studentData.dob = dobDate;
                }
            }

            if (!studentData.studentNameBn) continue;

            const existingStudent = rowId ? allStudents.find(s => s.generatedId === rowId) : null;

            if (existingStudent) {
                await updateStudent(db, existingStudent.id, studentData);
                updatedCount++;
            } else {
                await addStudent(db, studentData);
                addedCount++;
            }
        }

        toast({ 
            title: 'আপলোড সম্পন্ন', 
            description: `${updatedCount} জন আপডেট এবং ${addedCount} জন নতুন শিক্ষার্থী যোগ করা হয়েছে।` 
        });
        setIsUploadOpen(false);
      } catch (error) {
        console.error("Upload Error:", error);
        toast({ variant: 'destructive', title: 'ত্রুটি', description: 'ফাইলটি প্রসেস করা সম্ভব হয়নি।' });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  if (!isMounted) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
      <Header />
      <main className="flex-1 p-4 md:p-10 pb-40">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row gap-8">
            <aside className="w-full md:w-64 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
                <h2 className="text-2xl font-black mb-6 px-4 hidden md:block text-slate-900 tracking-tight">শিক্ষার্থী মডিউল</h2>
                <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">
                    {sidebarItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit",
                                activeSection === item.id ? "bg-white shadow-md text-primary scale-105" : "text-muted-foreground hover:bg-slate-200/50"
                            )}
                        >
                            <div className={cn("p-1.5 rounded-lg shrink-0", activeSection === item.id ? item.color : "bg-muted")}>
                                <item.icon className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-black">{item.label}</span>
                            {activeSection === item.id && <ChevronRight className="ml-auto h-4 w-4 hidden md:block" />}
                        </button>
                    ))}
                </div>
            </aside>

            <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4">
                <div className="p-4 sm:p-6 lg:p-8 flex-1">
                    <div className="mb-6 border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <UserRound className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black text-slate-800">{sidebarItems.find(i => i.id === activeSection)?.label}</CardTitle>
                                <p className="text-xs font-bold text-muted-foreground notranslate" translate="no">{isEn ? `Academic Year: ${selectedYear} | Class: Class ${activeTab}` : `শিক্ষাবর্ষ: ${toBengaliNumber(selectedYear)} | শ্রেণি: ${classNamesMap[activeTab]} শ্রেণি`}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {activeSection === 'list' && (
                                <>
                                    <div className="relative w-full md:w-64">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="search"
                                            placeholder="নাম, রোল বা আইডি দিয়ে খুঁজুন..."
                                            className="pl-9 h-10 bg-white border-2"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex bg-muted p-1 rounded-xl">
                                        <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 shadow-none" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button>
                                        <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 shadow-none" onClick={() => setViewMode('grid')}><LayoutGrid className="h-4 w-4" /></Button>
                                    </div>
                                    {hasPermission('upload:students') && (
                                        <Button variant="outline" className="font-black border-2 border-primary text-primary" onClick={() => setIsUploadOpen(true)}>
                                            <FileUp className="mr-2 h-4 w-4" /> Excel আপলোড
                                        </Button>
                                    )}
                                </>
                            )}
                            {activeSection === 'print' && (
                                <Button variant="outline" className="font-black border-2 border-primary text-primary" onClick={() => window.print()}>
                                    <Printer className="mr-2 h-4 w-4" /> প্রিন্ট তালিকা
                                </Button>
                            )}
                            {activeSection === 'esif' && (
                                <Button className="font-black shadow-lg" onClick={() => window.print()}>
                                    <Printer className="mr-2 h-4 w-4" /> ফরম প্রিন্ট করুন
                                </Button>
                            )}
                        </div>
                    </div>

                    {activeSection === 'list' && (
                        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-muted/20 rounded-2xl border-2 border-dashed border-primary/10 no-print">
                            <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} className="h-9 px-3 rounded-lg border-2 bg-white text-xs font-bold text-blue-700 outline-none notranslate" translate="no">
                                <option value="all">{isEn ? `Students (${classStats.gender.all})` : `ছাত্র-ছাত্রী (${toBengaliNumber(classStats.gender.all)})`}</option>
                                <option value="male">{isEn ? `Male (${classStats.gender.male})` : `ছাত্র (${toBengaliNumber(classStats.gender.male)})`}</option>
                                <option value="female">{isEn ? `Female (${classStats.gender.female})` : `ছাত্রী (${toBengaliNumber(classStats.gender.female)})`}</option>
                            </select>
                            <select value={filterReligion} onChange={(e) => setFilterReligion(e.target.value)} className="h-9 px-3 rounded-lg border-2 bg-white text-xs font-bold text-primary outline-none notranslate" translate="no">
                                <option value="all">{isEn ? `All Religions (${classStats.religion.all})` : `সকল ধর্ম (${toBengaliNumber(classStats.religion.all)})`}</option>
                                <option value="islam">{isEn ? `Islam (${classStats.religion.islam})` : `ইসলাম (${toBengaliNumber(classStats.religion.islam)})`}</option>
                                <option value="hindu">{isEn ? `Hindu (${classStats.religion.hinduism})` : `হিন্দু (${toBengaliNumber(classStats.religion.hinduism)})`}</option>
                                <option value="christian">{isEn ? `Christian (${classStats.religion.christianity})` : `খ্রিস্টান (${toBengaliNumber(classStats.religion.christianity)})`}</option>
                                <option value="other">{isEn ? `Other (${classStats.religion.other})` : `অন্যান্য (${toBengaliNumber(classStats.religion.other)})`}</option>
                            </select>
                            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="h-9 px-3 rounded-lg border-2 bg-white text-xs font-bold text-emerald-700 outline-none notranslate" translate="no">
                                <option value="all">{isEn ? `All Groups (${classStats.group.all})` : `সকল বিভাগ (${toBengaliNumber(classStats.group.all)})`}</option>
                                <option value="science">{isEn ? `Science (${classStats.group.science})` : `বিজ্ঞান (${toBengaliNumber(classStats.group.science)})`}</option>
                                <option value="arts">{isEn ? `Humanities (${classStats.group.arts})` : `মানবিক (${toBengaliNumber(classStats.group.arts)})`}</option>
                                <option value="commerce">{isEn ? `Business Studies (${classStats.group.commerce})` : `ব্যবসায় শিক্ষা (${toBengaliNumber(classStats.group.commerce)})`}</option>
                            </select>
                            
                            <div className="ml-auto flex items-center gap-2">
                                {canDeleteStudent && getStudentsByClass(activeTab).length > 0 && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-9 font-black border-rose-200 text-rose-600 hover:bg-rose-50" disabled={isDeletingAll}>
                                                {isDeletingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                                                সব ডিলিট করুন
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="font-kalpurush">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="text-rose-700 font-black flex items-center gap-2"><AlertCircle /> চূড়ান্ত সতর্কতা!</AlertDialogTitle>
                                                <AlertDialogDescription className="font-bold text-base leading-relaxed">
                                                    আপনি কি নিশ্চিতভাবে {classNamesMap[activeTab]} শ্রেণির এই {toBengaliNumber(getStudentsByClass(activeTab).length)} জন শিক্ষার্থীর তথ্য পুরোপুরি মুছে ফেলতে চান? এটি স্থায়ীভাবে ডাটাবেস থেকে ডিলিট হয়ে যাবে।
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="font-bold">বাতিল</AlertDialogCancel><AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black">হ্যাঁ, সব মুছুন</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                {hasPermission('manage:students') && (
                                    <Link href="/add-student"><Button size="sm" className="h-9 font-black shadow-md"><Plus className="mr-1.5 h-4 w-4" /> নতুন শিক্ষার্থী</Button></Link>
                                )}
                            </div>
                        </div>
                    )}

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="no-print">
                        <TabsList className="grid w-full grid-cols-5 h-12 bg-slate-100 p-1 rounded-2xl mb-8">
                            {classes.map((c) => (
                                <TabsTrigger key={c} value={c} className="font-black text-xs sm:text-sm rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md notranslate" translate="no">
                                    {isEn ? `Class ${c}` : `${classNamesMap[c]} শ্রেণি`} 
                                    <Badge variant="secondary" className="ml-2 h-5 bg-primary/10 text-primary border-none hidden sm:inline-flex notranslate" translate="no">
                                        {isEn ? allStudents.filter(s => s.academicYear === selectedYear && s.className === c).length : toBengaliNumber(allStudents.filter(s => s.academicYear === selectedYear && s.className === c).length)}
                                    </Badge>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="font-bold text-muted-foreground">শিক্ষার্থী তালিকা লোড হচ্ছে...</p>
                        </div>
                    ) : (
                        <>
                            {activeSection === 'list' && (
                                <div className="animate-in fade-in duration-500">
                                    {getStudentsByClass(activeTab).length === 0 ? (
                                        <div className="py-20 text-center text-muted-foreground border-4 border-dashed rounded-3xl opacity-40 flex flex-col items-center">
                                            <XCircle className="h-16 w-16 mx-auto mb-3 text-rose-300" />
                                            <p className="text-xl font-black">কোনো শিক্ষার্থী পাওয়া যায়নি</p>
                                            {(filterGender !== 'all' || filterReligion !== 'all' || filterGroup !== 'all' || searchQuery) && (
                                                <Button 
                                                    variant="link" 
                                                    className="mt-2 font-bold text-primary"
                                                    onClick={() => {
                                                        setFilterGender('all');
                                                        setFilterReligion('all');
                                                        setFilterGroup('all');
                                                        setSearchQuery('');
                                                    }}
                                                >
                                                    <RefreshCw className="h-4 w-4 mr-1.5" /> সকল ফিল্টার পরিষ্কার করুন
                                                </Button>
                                            )}
                                        </div>
                                    ) : viewMode === 'grid' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
                                            {getStudentsByClass(activeTab).map((student) => (
                                                <Card key={student.id} className={cn("overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative border-2", student.id === targetStudentId && "ring-4 ring-yellow-400 border-yellow-500")}>
                                                    <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 z-10">
                                                        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-white shadow-lg border hover:bg-slate-50" onClick={() => setStudentToView(student)}><Eye className="h-4 w-4" /></Button>
                                                        {canEditStudent && <Link href={`/edit-student/${student.id}`}><Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-white shadow-lg border hover:bg-slate-50 text-blue-600"><FilePen className="h-4 w-4" /></Button></Link>}
                                                    </div>
                                                    <div className="p-5 flex flex-col items-center text-center">
                                                        <Avatar className="h-20 w-20 border-4 border-white shadow-lg mb-3">
                                                            <AvatarImage src={sanitizePhotoUrl(student.photoUrl, student.gender) || getStudentPlaceholderImage(student.gender)} className="object-cover" />
                                                            <AvatarFallback className="bg-primary/5 font-black text-xl">S</AvatarFallback>
                                                        </Avatar>
                                                        <h3 className="font-black text-base text-slate-800 line-clamp-1 leading-tight">{student.studentNameBn}</h3>
                                                        <p className="text-[10px] font-black text-primary mt-1">রোল: {toBengaliNumber(student.roll)} | আইডি: {toBengaliNumber(student.generatedId || '')}</p>
                                                    </div>
                                                    <div className="bg-slate-50 px-4 py-2.5 flex justify-between items-center text-[10px] font-bold text-muted-foreground border-t border-dashed">
                                                        <span className="truncate max-w-[60%]">পিতা: {student.fatherNameBn}</span>
                                                        <span className="text-primary">{toBengaliNumber(student.guardianMobile || '')}</span>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="table-container shadow-xl border-2">
                                            <Table>
                                                <TableHeader className="bg-muted/50 sticky top-0 z-20">
                                                    <TableRow className="h-14">
                                                        <TableHead className="font-black text-center w-16">রোল</TableHead>
                                                        <TableHead className="font-black text-center w-16">ছবি</TableHead>
                                                        <TableHead className="font-black">নাম ও আইডি</TableHead>
                                                        <TableHead className="font-black">পিতা-মাতার নাম</TableHead>
                                                        <TableHead className="font-black">মোবাইল নম্বর</TableHead>
                                                        <TableHead className="text-right pr-8 font-black">কার্যক্রম</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {getStudentsByClass(activeTab).map((student) => (
                                                        <TableRow key={student.id} id={`student-row-${student.id}`} className={cn("transition-colors h-16 hover:bg-primary/5", student.id === targetStudentId && "bg-yellow-50")}>
                                                            <TableCell className="font-black text-center text-lg">{toBengaliNumber(student.roll)}</TableCell>
                                                            <TableCell className="text-center">
                                                                <Avatar className="h-10 w-10 border shadow-sm mx-auto">
                                                                    <AvatarImage src={sanitizePhotoUrl(student.photoUrl, student.gender) || getStudentPlaceholderImage(student.gender)} className="object-cover" />
                                                                    <AvatarFallback className="font-black text-xs">S</AvatarFallback>
                                                                </Avatar>
                                                            </TableCell>
                                                            <TableCell>
                                                                <p className="font-black text-slate-800">{student.studentNameBn}</p>
                                                                <p className="text-[10px] font-bold text-primary italic uppercase tracking-tighter">ID: {toBengaliNumber(student.generatedId || '-')}</p>
                                                            </TableCell>
                                                            <TableCell>
                                                                <p className="text-xs font-bold text-slate-600">পিতা: {student.fatherNameBn}</p>
                                                                <p className="text-xs font-bold text-slate-500">মাতা: {student.motherNameBn}</p>
                                                            </TableCell>
                                                            <TableCell className="text-xs font-black text-slate-700">{toBengaliNumber(student.guardianMobile || student.studentMobile || '-')}</TableCell>
                                                            <TableCell className="text-right pr-6">
                                                                <div className="flex justify-end gap-1.5">
                                                                    <Button variant="outline" size="icon" className="h-8 w-8 bg-white border-2 hover:bg-slate-50" onClick={() => setStudentToView(student)} title="দেখুন"><Eye className="h-4 w-4" /></Button>
                                                                    {canEditStudent && <Link href={`/edit-student/${student.id}`}><Button variant="outline" size="icon" className="h-8 w-8 text-blue-600 bg-white border-2 hover:bg-blue-50" title="এডিট"><FilePen className="h-4 w-4" /></Button></Link>}
                                                                    {canDeleteStudent && (
                                                                        <AlertDialog>
                                                                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                                                            <AlertDialogContent className="font-kalpurush">
                                                                                <AlertDialogHeader><AlertDialogTitle className="text-rose-700 font-black">নিশ্চিত তো?</AlertDialogTitle><AlertDialogDescription className="font-bold">এই শিক্ষার্থীকে স্থায়ীভাবে মুছে ফেলা হবে।</AlertDialogDescription></AlertDialogHeader>
                                                                                <AlertDialogFooter>
                                                                                    <AlertDialogCancel className="font-bold">বাতিল</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteStudent(student.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black">ডিলিট করুন</AlertDialogAction>
                                                                                </AlertDialogFooter>
                                                                            </AlertDialogContent>
                                                                        </AlertDialog>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeSection === 'print' && (
                                <div className="printable-area bg-white text-black font-kalpurush w-full box-border">
                                    <style jsx global>{`
                                        @media print {
                                            @page {
                                                size: A4;
                                                margin: 0.5in !important;
                                            }
                                            .printable-area {
                                                position: absolute !important;
                                                top: 0 !important;
                                                left: 0 !important;
                                                padding: 0 !important;
                                                margin: 0 !important;
                                                width: 100% !important;
                                            }
                                        }
                                    `}</style>
                                    <header className="text-center border-b-2 border-black pb-3 mb-6 flex flex-col items-center">
                                        {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="Logo" className="w-16 h-16 object-contain mb-1" />}
                                        <h1 className="text-2xl font-black">{schoolInfo.name}</h1>
                                        <p className="text-xs font-bold">{schoolInfo.address}</p>
                                        <div className="mt-2 inline-block border border-black px-6 py-0.5 rounded-full font-black text-sm uppercase">শিক্ষার্থী বিস্তারিত তালিকা - {toBengaliNumber(selectedYear)}</div>
                                        <p className="text-sm font-black mt-1">শ্রেণি: {classNamesMap[activeTab]} শ্রেণি</p>
                                    </header>
                                    <div className="w-full">
                                        <table className="w-full border-collapse border-[1.5px] border-black text-[9px]">
                                            <thead>
                                                <tr className="bg-slate-100">
                                                    <th className="border border-black p-0.5 w-[5%] text-center">ছবি</th>
                                                    <th className="border border-black p-0.5 w-[10%] text-center">আইডি নং</th>
                                                    <th className="border border-black p-0.5 w-[4%] text-center">রোল</th>
                                                    <th className="border border-black p-0.5 w-[18%] text-left pl-1">শিক্ষার্থীর নাম</th>
                                                    <th className="border border-black p-0.5 w-[15%] text-left pl-1">পিতার নাম</th>
                                                    <th className="border border-black p-0.5 w-[15%] text-left pl-1">মাতার নাম</th>
                                                    <th className="border border-black p-0.5 w-[9%] text-center">জন্ম তারিখ</th>
                                                    <th className="border border-black p-0.5 w-[7%] text-center">লিঙ্গ/ধর্ম</th>
                                                    <th className="border border-black p-0.5 w-[10%] text-center">মোবাইল নং</th>
                                                    <th className="border border-black p-0.5 w-[7%] text-left pl-1">ঠিকানা</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {getStudentsByClass(activeTab).map(s => (
                                                    <tr key={s.id} className="h-10 border border-black" style={{ breakInside: 'avoid' }}>
                                                        <td className="border border-black text-center p-0.5">
                                                            <div className="h-8 w-8 mx-auto relative overflow-hidden">
                                                                <img src={sanitizePhotoUrl(s.photoUrl, s.gender) || getStudentPlaceholderImage(s.gender)} alt="Photo" className="object-cover h-full w-full" />
                                                            </div>
                                                        </td>
                                                        <td className="border border-black text-center font-bold text-[10px] break-words">{toBengaliNumber(s.generatedId || '-')}</td>
                                                        <td className="border border-black text-center font-black text-[10px]">{toBengaliNumber(s.roll)}</td>
                                                        <td className="border border-black font-bold text-[10px] leading-tight px-1 break-words">
                                                            <p>{s.studentNameBn}</p>
                                                            <p className="text-[8px] uppercase text-slate-600">{s.studentNameEn || '-'}</p>
                                                        </td>
                                                        <td className="border border-black font-bold text-[10px] leading-tight px-1 break-words">
                                                            <p>{s.fatherNameBn}</p>
                                                            <p className="text-[8px] uppercase text-slate-600">{s.fatherNameEn || '-'}</p>
                                                        </td>
                                                        <td className="border border-black font-bold text-[10px] leading-tight px-1 break-words">
                                                            <p>{s.motherNameBn}</p>
                                                            <p className="text-[8px] uppercase text-slate-600">{s.motherNameEn || '-'}</p>
                                                        </td>
                                                        <td className="border border-black text-center text-[10px]">{s.dob ? toBengaliNumber(format(new Date(s.dob), 'dd-MM-yyyy')) : '-'}</td>
                                                        <td className="border border-black text-center text-[9px] leading-tight break-words">
                                                            <p>{s.gender === 'male' || s.gender === 'পুরুষ' ? 'পুরুষ' : 'মহিলা'}</p>
                                                            <p>{religionMapBn[s.religion?.toLowerCase() || ''] || s.religion}</p>
                                                        </td>
                                                        <td className="border border-black text-center font-black text-[10px]">{toBengaliNumber(s.guardianMobile || '-')}</td>
                                                        <td className="border border-black text-[8px] leading-tight px-1 break-words">
                                                            গ্রাম: {s.presentVillage || '-'}<br/>ডাকঘর: {s.presentPostOffice || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <footer className="mt-16 flex justify-between px-10 no-screen">
                                        <div className="text-center w-48 border-t-2 border-black pt-1 font-black uppercase text-xs">Accountant</div>
                                        <div className="text-center w-48 border-t-2 border-black pt-1 font-black uppercase text-xs">Headmaster</div>
                                    </footer>
                                </div>
                            )}

                            {activeSection === 'esif' && (
                                <div className="space-y-6 animate-in zoom-in-95 duration-500">
                                    <style jsx global>{`
                                        @media print {
                                            @page {
                                                size: A4 landscape;
                                                margin: 0.5in !important;
                                            }
                                        }
                                    `}</style>
                                    {['6', '8', '9'].includes(activeTab) ? (
                                        <div className="esif-container printable-area bg-white p-8 border-[4px] border-black rounded-[32px] shadow-2xl overflow-x-auto min-w-fit print:p-0 print:border-none print:shadow-none print:min-w-full">
                                            <div className="w-full mx-auto bg-white p-4">
                                                <header className="text-center mb-6">
                                                    <h1 className="text-4xl font-black mb-1 uppercase">{schoolInfo.nameEn || "BIRGANJ POURO HIGH SCHOOL"}</h1>
                                                    <p className="text-sm font-bold border-b-2 border-black inline-block px-4 pb-0.5 uppercase tracking-widest">ESIF STUDENT REGISTRATION FORM</p>
                                                    <h2 className="text-xl font-black mt-2">Class {classRomanMap[activeTab]} Registration - {selectedYear}</h2>
                                                </header>
                                                <Table className="border-collapse border-2 border-black w-full min-w-[800px] print:min-w-full print:w-full">
                                                    <TableHeader>
                                                        <TableRow className="bg-slate-50 border-b-2 border-black">
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 w-12 text-black text-[12px]">SL NO</TableHead>
                                                            <TableHead className="border-r-2 border-black font-black p-1 w-72 text-black text-[11px] text-center">Candidate Name, Father And Mother Name</TableHead>
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 w-32 text-black text-[11px]">Date of Birth And Sex</TableHead>
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 w-32 text-black text-[11px]">GROUP, RELIGION</TableHead>
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 w-44 text-black text-[10px]">JSC/JDC PASSING YEAR, ROLL & BOARDS' NAME</TableHead>
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 text-black text-[11px]">Subject Code</TableHead>
                                                            <TableHead className="border-r-2 border-black text-center font-black p-1 w-20 text-black text-[10px]">Religion Subject</TableHead>
                                                            <TableHead className="text-center font-black p-1 w-32 text-black text-[11px]">4th Subject and code</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {getStudentsByClass(activeTab).length === 0 ? (
                                                            <TableRow><TableCell colSpan={8} className="text-center py-20 italic">No Students Found.</TableCell></TableRow>
                                                        ) : (
                                                            getStudentsByClass(activeTab).map((s, idx) => (
                                                                <ESIFRow key={s.id} student={s} index={idx + 1} />
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    ) : (
                                        <Card className="p-20 text-center border-4 border-dashed rounded-[32px] bg-amber-50/30">
                                            <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4 opacity-40" />
                                            <h3 className="text-2xl font-black text-amber-900">Registration is only for classes 6, 8, and 9</h3>
                                        </Card>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
      </main>

      {/* Batch Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-md font-kalpurush">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" /> শিক্ষার্থী তালিকা আপলোড
            </DialogTitle>
            <DialogDescription className="font-bold">
              {classNamesMap[activeTab]} শ্রেণির শিক্ষার্থীদের তথ্য এক্সেল ফাইলে আপলোড করুন।
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className="p-4 bg-muted/20 border-2 border-dashed border-primary/20 rounded-2xl text-center space-y-3">
              <p className="text-xs font-bold text-muted-foreground">নমুনা ফাইলে বর্তমানে থাকা সকল শিক্ষার্থীর তথ্য দেওয়া আছে। কোনো তথ্য সংশোধন বা নতুন ঘর পূরণ করে আপলোড করুন।</p>
              <Button variant="outline" size="sm" onClick={handleDownloadSample} className="font-black border-primary text-primary">
                <Download className="mr-2 h-4 w-4" /> নমুনা ফাইল ডাউনলোড (বর্তমান তালিকাসহ)
              </Button>
            </div>

            <div className="space-y-3">
              <Label className="font-bold">এক্সেল ফাইল নির্বাচন করুন</Label>
              <div 
                className="h-32 border-4 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-primary/30 transition-all group"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="font-black text-sm text-primary">আপলোড হচ্ছে...</span>
                  </div>
                ) : (
                  <>
                    <FileUp className="h-10 w-10 text-slate-300 group-hover:text-primary transition-colors" />
                    <span className="font-bold text-slate-400 mt-2">ফাইল এখানে ড্রপ করুন অথবা ক্লিক করুন</span>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".xlsx, .xls"
                />
              </div>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-amber-800 leading-tight">
                    * 'Generated ID' কলামটি কোনোভাবেই পরিবর্তন করবেন না। এটি বিদ্যমান শিক্ষার্থীদের চিহ্নিত করতে ব্যবহার করা হয়। নতুন শিক্ষার্থীদের জন্য ওই ঘরটি ফাঁকা রাখুন।
                </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsUploadOpen(false)} className="font-bold">বন্ধ করুন</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student View Dialog */}
      <Dialog open={!!studentToView} onOpenChange={(isOpen) => !isOpen && setStudentToView(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto font-kalpurush p-0 border-none shadow-2xl rounded-2xl">
             {studentToView && (
                <>
                    <DialogHeader className="flex-row items-center gap-6 p-6 bg-primary text-white border-b-0 shrink-0">
                        <Avatar className="h-24 w-24 border-4 border-white shadow-xl overflow-hidden shrink-0">
                            <AvatarImage src={sanitizePhotoUrl(studentToView.photoUrl, studentToView.gender) || getStudentPlaceholderImage(studentToView.gender)} />
                            <AvatarFallback className="text-3xl font-black bg-white/20">S</AvatarFallback>
                        </Avatar>
                        <div className="overflow-hidden text-left">
                            <DialogTitle className="text-3xl font-black mb-1">{studentToView.studentNameBn}</DialogTitle>
                            <DialogDescription className="text-white/80 font-bold text-lg">
                                রোল: {toBengaliNumber(studentToView.roll)} | {classNamesMap[studentToView.className] || studentToView.className} শ্রেণি | আইডি: {toBengaliNumber(studentToView.generatedId || '-')}
                            </DialogDescription>
                        </div>
                    </DialogHeader>
                    <div className="p-8 space-y-10 bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <section className="space-y-4">
                                <h3 className="font-black text-xl text-primary flex items-center gap-2 border-b-2 border-primary/10 pb-2"><UserRound className="h-6 w-6" /> ব্যক্তিগত তথ্য</h3>
                                <div className="grid grid-cols-1 gap-y-3 text-sm font-bold text-slate-700">
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">নাম (ইংরেজি):</span> <span>{studentToView.studentNameEn || '-'}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">জন্ম তারিখ:</span> <span>{studentToView.dob ? toBengaliNumber(format(new Date(studentToView.dob), "dd-MM-yyyy")) : '-'}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">জন্ম নিবন্ধন:</span> <span>{toBengaliNumber(studentToView.birthRegNo || '-')}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">লিঙ্গ:</span> <span>{studentToView.gender === 'male' || studentToView.gender === 'পুরুষ' ? 'পুরুষ' : 'মহিলা'}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">ধর্ম:</span> <span>{religionMapBn[studentToView.religion?.toLowerCase() || ''] || studentToView.religion || '-'}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">বিভাগ/শাখা:</span> <span className="capitalize">{studentToView.group || 'সাধারণ'}</span></div>
                                    {studentToView.optionalSubject && <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">ঐচ্ছিক বিষয়:</span> <span>{studentToView.optionalSubject}</span></div>}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-black text-xl text-primary flex items-center gap-2 border-b-2 border-primary/10 pb-2"><Users className="h-6 w-6" /> অভিভাবকের তথ্য</h3>
                                <div className="grid grid-cols-1 gap-y-3 text-sm font-bold text-slate-700">
                                    <div className="flex flex-col gap-0.5 border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium text-xs">পিতার নাম:</span> <span className="font-black">{studentToView.fatherNameBn}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">পিতার NID:</span> <span>{toBengaliNumber(studentToView.fatherNid || '-')}</span></div>
                                    <div className="flex flex-col gap-0.5 border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium text-xs">মাতার নাম:</span> <span className="font-black">{studentToView.motherNameBn}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">মাতার NID:</span> <span>{toBengaliNumber(studentToView.motherNid || '-')}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground font-medium text-primary">মোবাইল (অভিভাবক):</span> <span className="font-black text-primary">{toBengaliNumber(studentToView.guardianMobile || '-')}</span></div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-black text-xl text-blue-600 flex items-center gap-2 border-b-2 border-blue-100 pb-2"><GraduationCap className="h-6 w-6" /> অ্যাকাডেমিক রেকর্ড</h3>
                                <div className="grid grid-cols-1 gap-y-3 text-sm font-bold text-slate-700">
                                    <div className="flex flex-col gap-1 border-b border-dashed pb-2"><span className="text-muted-foreground font-medium text-xs">পূর্ববর্তী বিদ্যালয়:</span> <span>{studentToView.previousSchool || '-'}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">রেজিষ্ট্রেশন নম্বর:</span> <span className="font-black text-blue-700">{toBengaliNumber(studentToView.prevRegNo || '-')}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">পাসের সন:</span> <span>{toBengaliNumber(studentToView.prevPassingYear || '-')}</span></div>
                                    <div className="flex justify-between border-b border-dashed pb-1.5"><span className="text-muted-foreground font-medium">বোর্ড:</span> <span>{studentToView.prevBoard || '-'}</span></div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="font-black text-xl text-emerald-600 flex items-center gap-2 border-b-2 border-emerald-100 pb-2"><MapPin className="h-6 w-6" /> বর্তমান ও স্থায়ী ঠিকানা</h3>
                                <div className="space-y-4">
                                    <div className="p-3 bg-slate-50 rounded-lg border-2 border-dashed">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">বর্তমান ঠিকানা</p>
                                        <p className="text-xs font-bold leading-relaxed">
                                            গ্রাম: {studentToView.presentVillage || '-'}, ইউ: {studentToView.presentUnion || '-'}<br/>
                                            ডাকঘর: {studentToView.presentPostOffice || '-'}, উপজেলা: {studentToView.presentUpazila || 'বীরগঞ্জ'}<br/>
                                            জেলা: {studentToView.presentDistrict || 'দিনাজপুর'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg border-2 border-dashed">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">স্থায়ী ঠিকানা</p>
                                        <p className="text-xs font-bold leading-relaxed">
                                            গ্রাম: {studentToView.permanentVillage || '-'}, ইউ: {studentToView.permanentUnion || '-'}<br/>
                                            ডাকঘর: {studentToView.permanentPostOffice || '-'}, উপজেলা: {studentToView.permanentUpazila || 'বীরগঞ্জ'}<br/>
                                            জেলা: {studentToView.permanentDistrict || 'দিনাজপুর'}
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                    <DialogFooter className="p-4 bg-slate-50 border-t shrink-0">
                        <Button variant="ghost" className="w-full font-bold h-10" onClick={() => setStudentToView(null)}>বন্ধ করুন</Button>
                    </DialogFooter>
                </>
             )}
        </DialogContent>
    </Dialog>
    </div>
  );
}

export default function StudentListPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] items-center justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>}>
      <StudentListContent />
    </Suspense>
  );
}
