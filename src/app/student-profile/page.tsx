'use client';

import { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import Image from 'next/image';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, Timestamp } from 'firebase/firestore';
import { Student, studentFromDoc, isFemale, getStudentPlaceholderImage, sanitizePhotoUrl } from '@/lib/student-data';
import { DailyAttendance } from '@/lib/attendance-data';
import { FeeCollection, feeCollectionFromDoc } from '@/lib/fees-data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, User, Banknote, CalendarCheck, AlertTriangle, Printer, LayoutGrid, Info, MapPin, Loader2, TrendingUp, Award, Target, Star, Wallet, ListChecks, CheckCircle2, XCircle, ListTodo, GraduationCap, UserRound, Users, Phone, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, eachDayOfInterval } from 'date-fns';
import { bn } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { getAllResults } from '@/lib/results-data';
import { getSubjects } from '@/lib/subjects';
import { processStudentResults } from '@/lib/results-calculation';
import { getExams } from '@/lib/exam-data';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

const BENGALI_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const classNamesMap: { [key: string]: string } = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম'
};

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const religionMapBn: Record<string, string> = {
    'islam': 'ইসলাম', 'hinduism': 'হিন্দু', 'buddhism': 'বৌদ্ধ', 'christianity': 'খ্রিস্টান', 'other': 'অন্যান্য'
};

const getAutoComment = (percentage: number, subjectName: string) => {
    if (percentage < 33) return `${subjectName} বিষয়ের ভিত্তি বেশ দুর্বল। নিয়মিত অনুশীলন এবং বিশেষ ক্লাস প্রয়োজন।`;
    if (percentage < 45) return `${subjectName} বিষয়ে কাঙ্ক্ষিত ফলাফল আসেনি। মৌলিক ধারণাগুলো আরও ঝালাই করতে হবে।`;
    if (percentage < 60) return `ফলাফল ভালো হয়েছে, তবে ${subjectName} বিষয়ে আরও উন্নতির সুযোগ রয়েছে।`;
    if (percentage < 75) return `${subjectName} বিষয়ে পারফরম্যান্স চমৎকার। ধারাবাহিকতা বজায় রাখলে আরও ভালো করবে।`;
    if (percentage < 85) return `খুবই উৎসাহব্যঞ্জক ফলাফল! ${subjectName} বিষয়ে তুমি ক্লাসের অন্যতম সেরা।`;
    return `${subjectName} বিষয়ে তোমার দখল অসাধারণ। এই মেধা ভবিষ্যতেও বজায় রাখো।`;
};

const AttendanceHeatmap = ({ records, year, holidays }: { records: DailyAttendance[], year: string, holidays: string[] }) => {
    const monthIndices = Array.from({ length: 12 }, (_, i) => i);
    const dayLabels = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

    return (
        <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-primary/30">
            <div className="flex gap-6 min-w-max p-2">
                {monthIndices.map(monthIdx => {
                    const monthStart = new Date(parseInt(year), monthIdx, 1);
                    const monthEnd = new Date(parseInt(year), monthIdx + 1, 0);
                    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
                    
                    const weeks: (Date | null)[][] = [Array(7).fill(null)];
                    let currentWeekIdx = 0;
                    
                    daysInMonth.forEach(day => {
                        const dayOfWeek = day.getDay();
                        if (dayOfWeek === 0 && weeks[currentWeekIdx].some(d => d !== null)) {
                            currentWeekIdx++;
                            weeks[currentWeekIdx] = Array(7).fill(null);
                        }
                        weeks[currentWeekIdx][dayOfWeek] = day;
                    });

                    return (
                        <div 
                            key={monthIdx} 
                            className="flex flex-col border-[4px] border-black rounded-xl p-3 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] h-fit"
                        >
                            <div className="text-center font-black text-base mb-2 text-primary border-b-[3px] border-black pb-1 bg-primary/5 -mx-3 -mt-3 rounded-t-lg pt-1">
                                {BENGALI_MONTHS[monthIdx]}
                            </div>
                            <div className="flex gap-2">
                                <div className="grid grid-rows-7 gap-1 shrink-0">
                                    {dayLabels.map(label => (
                                        <div key={label} className="h-5 flex items-center text-[9px] font-black text-muted-foreground border-r-2 border-dashed border-slate-200 pr-1">
                                            {label}
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="flex gap-1">
                                    {weeks.map((week, wIdx) => (
                                        <div key={wIdx} className="grid grid-rows-7 gap-1">
                                            {week.map((day, dIdx) => {
                                                if (!day) return <div key={dIdx} className="w-5 h-5 bg-slate-50/20 rounded-sm border border-dashed border-slate-100" />;
                                                
                                                const dateStr = format(day, 'yyyy-MM-dd');
                                                const record = records.find(r => r.date === dateStr);
                                                const isHolidayDay = holidays.includes(dateStr);
                                                const isWeekend = day.getDay() === 5 || day.getDay() === 6;

                                                let colorClass = "bg-slate-100 hover:bg-slate-200";
                                                let statusText = "রেকর্ড নেই";
                                                
                                                if (isHolidayDay || isWeekend) {
                                                    colorClass = "bg-yellow-400 shadow-sm hover:bg-yellow-500 ring-1 ring-yellow-500/20";
                                                    statusText = isWeekend ? "সাপ্তাহিক ছুটি" : "সরকারি ছুটি";
                                                }

                                                if (record) {
                                                    const att = record.attendance.find(a => !!a);
                                                    if (att?.status === 'present') {
                                                        colorClass = "bg-green-600 shadow-md hover:bg-green-700 ring-2 ring-green-600/30";
                                                        statusText = "উপস্থিত";
                                                    } else if (att?.status === 'absent') {
                                                        colorClass = "bg-red-600 shadow-md hover:bg-red-700 ring-2 ring-red-600/30";
                                                        statusText = "অনুপস্থিত";
                                                    }
                                                }

                                                return (
                                                    <TooltipProvider key={dIdx}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div className={cn(
                                                                    "w-5 h-5 rounded-sm transition-all cursor-pointer border border-black/5 flex items-center justify-center text-[7px] font-black text-black", 
                                                                    colorClass
                                                                )}>
                                                                    {toBengaliNumber(day.getDate())}
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="font-kalpurush">
                                                                <p className="text-sm font-black">{format(day, 'PPP', { locale: bn })}</p>
                                                                <p className="text-xs font-bold">{statusText}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function StudentProfileSearchContent() {
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const { schoolInfo } = useSchoolInfo();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isMounted, setIsMounted] = useState(false);
    const [roll, setRoll] = useState<string>('');
    const [className, setClassName] = useState<string>('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [studentData, setStudentData] = useState<Student | null>(null);
    const [attendanceRecords, setAttendanceRecords] = useState<DailyAttendance[]>([]);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [paidMonths, setPaidMonths] = useState<string[]>([]);
    const [feeHistory, setFeeHistory] = useState<FeeCollection[]>([]);
    const [academicProgress, setAcademicProgress] = useState<any[]>([]);
    const [isProgressLoading, setIsProgressLoading] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState('details');

    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted && !authLoading && user) {
            const urlRoll = searchParams.get('roll');
            const urlClass = searchParams.get('class');
            if (urlRoll && urlClass) {
                setRoll(urlRoll);
                setClassName(urlClass);
                setTimeout(() => {
                    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                    handleSearch(fakeEvent, urlRoll, urlClass);
                }, 100);
            }
        }
    }, [isMounted, authLoading, user, searchParams]);

    useEffect(() => {
        if (isMounted && !authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router, isMounted]);

    const handleSearch = async (e: React.FormEvent, overrideRoll?: string, overrideClass?: string) => {
        e.preventDefault();
        const searchRoll = overrideRoll || roll;
        const searchClass = overrideClass || className;

        if (!db || !searchRoll || !searchClass || !user) {
            toast({ variant: 'destructive', title: 'অনুগ্রহ করে রোল এবং শ্রেণি পূরণ করুন।' });
            return;
        }

        setIsLoading(true);
        try {
            const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
            const rollEn = parseInt(bnToEn(searchRoll), 10);

            if (isNaN(rollEn)) {
                toast({ variant: 'destructive', title: 'ভুল রোল নম্বর' });
                setIsLoading(false);
                return;
            }

            const studentQuery = query(
                collection(db, 'students'),
                where('academicYear', '==', selectedYear),
                where('className', '==', searchClass),
                where('roll', '==', rollEn)
            );
            const studentSnap = await getDocs(studentQuery).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'students', operation: 'list' }));
                throw err;
            });

            if (studentSnap.empty) {
                toast({ variant: 'destructive', title: 'শিক্ষার্থী পাওয়া যায়নি।' });
                setIsLoading(false);
                return;
            }

            const foundStudent = studentFromDoc(studentSnap.docs[0]);
            setStudentData(foundStudent);

            const holidaySnap = await getDocs(collection(db, 'holidays')).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'holidays', operation: 'list' }));
                throw err;
            });
            setHolidays(holidaySnap.docs.map(d => d.data().date));

            const attQuery = query(
                collection(db, 'attendance'),
                where('academicYear', '==', selectedYear),
                where('className', '==', searchClass)
            );
            const attSnap = await getDocs(attQuery).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'attendance', operation: 'list' }));
                throw err;
            });
            const records = attSnap.docs.map(doc => {
                const data = doc.data();
                const studentAtt = data.attendance?.find((a: any) => a.studentId === foundStudent.id);
                return {
                    ...data,
                    attendance: studentAtt ? [studentAtt] : [] 
                } as DailyAttendance;
            });
            setAttendanceRecords(records);

            const feeQuery = query(
                collection(db, 'feeCollections'),
                where('studentId', '==', foundStudent.id),
                where('academicYear', '==', selectedYear)
            );
            const feeSnap = await getDocs(feeQuery).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'feeCollections', operation: 'list' }));
                throw err;
            });
            const feeRecords = feeSnap.docs.map(feeCollectionFromDoc).filter((f): f is FeeCollection => f !== null);
            setFeeHistory(feeRecords.sort((a, b) => b.collectionDate.getTime() - a.collectionDate.getTime()));
            
            const monthsPaid = new Set<string>();
            feeRecords.forEach(record => {
                BENGALI_MONTHS.forEach(m => {
                    if (record.description?.includes(m)) monthsPaid.add(m);
                });
            });
            setPaidMonths(Array.from(monthsPaid));

            // Fetch Academic Progress
            setIsProgressLoading(true);
            const exams = await getExams(db, selectedYear);
            const progressData = [];
            
            const classStudentsQuery = query(
                collection(db, 'students'),
                where('academicYear', '==', selectedYear),
                where('className', '==', foundStudent.className)
            );
            const classStudentsSnap = await getDocs(classStudentsQuery).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'students', operation: 'list' }));
                throw err;
            });
            const classStudents = classStudentsSnap.docs.map(studentFromDoc);

            for (const exam of exams) {
                if (!exam.classes.includes(foundStudent.className)) continue;
                
                const allResults = await getAllResults(db, selectedYear, exam.name);
                const classRes = allResults.filter(r => r.className === foundStudent.className);
                if (classRes.length === 0) continue;

                const subs = getSubjects(foundStudent.className, foundStudent.group).filter(s => s.isExamSubject !== false);
                const results = processStudentResults(classStudents, classRes, subs);
                const studentResult = results.find(r => r.student.id === foundStudent.id);

                if (studentResult) {
                    const subjectStats = subs.map(subject => {
                        const subjectMarks = results.map(r => r.subjectResults.get(subject.name)?.marks || 0);
                        const classMax = Math.max(...subjectMarks);
                        const classAvg = subjectMarks.reduce((a, b) => a + b, 0) / subjectMarks.length;
                        
                        const myResult = studentResult.subjectResults.get(subject.name);
                        const obtained = myResult?.marks || 0;
                        const percentage = (obtained / subject.fullMarks) * 100;

                        return {
                            subjectName: subject.name,
                            fullMarks: subject.fullMarks,
                            obtained,
                            grade: myResult?.grade || '-',
                            classMax,
                            classAvg: parseFloat(classAvg.toFixed(1)),
                            comment: getAutoComment(percentage, subject.name)
                        };
                    });

                    progressData.push({
                        exam: exam.name,
                        gpa: studentResult.gpa,
                        marks: studentResult.totalMarks,
                        rank: studentResult.isPass ? studentResult.meritPosition : 0,
                        isPass: studentResult.isPass,
                        subjectStats
                    });
                }
            }
            setAcademicProgress(progressData);
            setIsProgressLoading(false);

            setShowProfile(true);
            setActiveProfileTab('details');
        } catch (error: any) {
            console.error("Search Error:", error);
            setIsProgressLoading(false);
        } finally {
            setIsLoading(false);
        }
    };

    const attendanceStats = useMemo(() => {
        let present = 0;
        let total = 0;
        attendanceRecords.forEach(r => {
            if (r.attendance.length > 0) {
                total++;
                if (r.attendance[0].status === 'present') present++;
            }
        });
        return { present, absent: total - present, total };
    }, [attendanceRecords]);

    const attendancePercentage = attendanceStats.total > 0 ? (attendanceStats.present / attendanceStats.total) * 100 : 0;

    const duesSummary = useMemo(() => {
        if (!studentData) return { tuitionDue: 0, tuitionDueMonths: [], examDues: [], otherDues: 0 };
        
        let effectiveMonthlyFee = studentData.monthlyFee || 0;
        if (studentData.feeCategory === 'half-free') effectiveMonthlyFee = Math.floor(effectiveMonthlyFee / 2);
        else if (studentData.feeCategory === 'full-free') effectiveMonthlyFee = 0;

        const currentMonthIdx = new Date().getMonth();
        const tuitionDueMonths = BENGALI_MONTHS.filter((m, idx) => idx <= currentMonthIdx && !paidMonths.includes(m));
        const tuitionDueAmount = tuitionDueMonths.length * effectiveMonthlyFee;
        
        const examDues: any[] = [];
        const paidCats = new Set<string>();
        feeHistory.forEach(c => c.breakdown && Object.entries(c.breakdown).forEach(([k, v]) => { if (v && v > 0) paidCats.add(k); }));
        
        [{ key: 'examFeeHalfYearly', label: 'অর্ধ-বার্ষিক' }, { key: 'examFeeAnnual', label: 'বার্ষিক' }, { key: 'examFeePreNirbachoni', label: 'প্রাক-নির্বাচনী' }, { key: 'examFeeNirbachoni', label: 'নির্বাচনী' }].forEach(ex => {
            const val = studentData[ex.key as keyof Student] as number;
            if (val && val > 0 && !paidCats.has(ex.key)) examDues.push({ label: ex.label, amount: val });
        });
        
        let otherDues = 0;
        ['sessionFee', 'admissionFee', 'scoutFee', 'developmentFee', 'libraryFee', 'tiffinFee', 'otherFee'].forEach(k => {
            const val = studentData[k as keyof Student] as number;
            if (val && val > 0 && !paidCats.has(k)) otherDues += val;
        });
        return { tuitionDue: tuitionDueAmount, tuitionDueMonths, examDues, otherDues };
    }, [studentData, paidMonths, feeHistory]);

    if (!isMounted || authLoading) {
        return (
            <div className="flex min-h-screen w-full flex-col">
                <Header />
                <main className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-indigo-50 font-kalpurush">
            <div className="no-print w-full flex flex-col">
                <Header />
                <main className="flex flex-1 flex-col items-center justify-center p-4 min-h-[calc(100vh-64px)] pb-80">
                    <Card className="w-full max-w-lg shadow-xl border-2 border-primary/10">
                        <CardHeader className="text-center bg-primary/5 rounded-t-lg">
                            <CardTitle className="text-2xl text-primary font-black">
                                {isEn ? 'Student Profile Search' : 'শিক্ষার্থী প্রোফাইল অনুসন্ধান'}
                            </CardTitle>
                            <CardDescription>
                                {isEn ? 'View student details with roll and class' : 'রোল এবং শ্রেণি দিয়ে শিক্ষার্থীর বিস্তারিত তথ্য দেখুন'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={(e) => handleSearch(e)} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="roll" className="font-bold">{isEn ? 'Roll Number' : 'রোল নম্বর'}</Label>
                                        <Input id="roll" value={roll} onChange={e => setRoll(e.target.value)} required placeholder={isEn ? "Ex: 1" : "উদা: ১"} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="class" className="font-bold">{isEn ? 'Class' : 'শ্রেণি'}</Label>
                                        <Select value={className} onValueChange={setClassName} required>
                                            <SelectTrigger id="class" className="bg-white">
                                                <SelectValue placeholder={isEn ? "Select Class" : "শ্রেণি নির্বাচন"} />
                                            </SelectTrigger>
                                            <SelectContent position="item-aligned">
                                                {Object.entries(classNamesMap).map(([id, label]) => (
                                                    <SelectItem key={id} value={id}>
                                                        {isEn ? `Class ${id}` : `${label} শ্রেণি`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Button type="submit" className="w-full h-12 text-lg shadow-md font-black" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <><Search className="mr-2 h-5 w-5" /> <span>{isEn ? 'View Information' : 'তথ্য দেখুন'}</span></>}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </main>
            </div>

            <Dialog open={showProfile} onOpenChange={setShowProfile}>
                <DialogContent className="sm:max-w-6xl h-[95vh] flex flex-col p-0 no-print font-kalpurush border-none shadow-2xl overflow-hidden rounded-2xl">
                    <DialogHeader className="p-6 bg-white border-b-2 border-slate-200">
                        <div className="flex flex-col sm:flex-row gap-6 items-start">
                            <div className="flex flex-col items-center gap-3 shrink-0">
                                <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full border-4 border-primary/20 p-1 shadow-lg">
                                    <div className="relative h-full w-full rounded-full overflow-hidden bg-muted">
                                        <Image 
                                            src={studentData ? (sanitizePhotoUrl(studentData.photoUrl, studentData.gender) || getStudentPlaceholderImage(studentData.gender)) : getStudentPlaceholderImage()} 
                                            alt={studentData?.studentNameBn || 'Student'} 
                                            fill 
                                            className="object-cover" 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 w-full overflow-hidden">
                                <div className="mb-4 text-center sm:text-left">
                                    <DialogTitle className="text-3xl font-black text-slate-900">
                                        {studentData ? studentData.studentNameBn : 'শিক্ষার্থী প্রোফাইল'}
                                    </DialogTitle>
                                    <DialogDescription className="text-sm font-bold text-muted-foreground">
                                        রোল: {studentData ? toBengaliNumber(studentData.roll) : ''} | {studentData ? classNamesMap[studentData.className] : ''} শ্রেণি | আইডি: {studentData ? toBengaliNumber(studentData.generatedId || '') : ''}
                                    </DialogDescription>
                                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-black h-7 px-4">
                                            ক্যাটাগরি: {studentData?.feeCategory === 'half-free' ? 'হাফ-ফ্রি' : studentData?.feeCategory === 'full-free' ? 'ফুল-ফ্রি' : 'সাধারণ'}
                                        </Badge>
                                        {studentData?.isStipendReceiver && (
                                            <Badge className="bg-yellow-400 text-yellow-950 font-black h-7 px-4 flex items-center gap-1.5 shadow-sm">
                                                <Star className="h-3.5 w-3.5 fill-current" /> উপবৃত্তিপ্রাপ্ত
                                            </Badge>
                                        )}
                                        <Button variant="outline" size="sm" className="h-7 font-black border-slate-300 text-slate-600 hover:bg-slate-50" onClick={() => window.print()}>
                                            <Printer className="h-3.5 w-3.5 mr-1.5" /> প্রিন্ট রিপোর্ট
                                        </Button>
                                    </div>
                                </div>
                                
                                <Tabs value={activeProfileTab} onValueChange={setActiveProfileTab} className="w-full">
                                    <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/30 p-1 mb-0 rounded-b-none border-b-0">
                                        <TabsTrigger value="details" className="font-black text-[10px] sm:text-sm data-[state=active]:shadow-md"><Info className="h-4 w-4 mr-1.5" /> তথ্য</TabsTrigger>
                                        <TabsTrigger value="academic_stats" className="font-black text-[10px] sm:text-sm data-[state=active]:shadow-md"><Award className="h-4 w-4 mr-1.5" /> প্রগতি</TabsTrigger>
                                        <TabsTrigger value="attendance_stats" className="font-black text-[10px] sm:text-sm data-[state=active]:shadow-md"><CalendarCheck className="h-4 w-4 mr-1.5" /> হাজিরা</TabsTrigger>
                                        <TabsTrigger value="fees_stats" className="font-black text-[10px] sm:text-sm data-[state=active]:shadow-md"><Banknote className="h-4 w-4 mr-1.5" /> বেতন</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        </div>
                    </DialogHeader>

                    {studentData && (
                        <div className="flex-1 overflow-y-auto bg-slate-100/50 p-6 sm:p-10">
                            <Tabs value={activeProfileTab} onValueChange={setActiveProfileTab} className="w-full">
                                <TabsContent value="details" className="mt-0 space-y-6 animate-in fade-in duration-500 pb-20">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Personal Info */}
                                        <Card className="border-[4px] border-black rounded-xl bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                                            <CardHeader className="bg-primary/5 border-b-2 border-black/10">
                                                <CardTitle className="text-lg font-black flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" /> {isEn ? 'Personal Information' : 'ব্যক্তিগত তথ্য'}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6 space-y-3 font-bold text-sm">
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Full Name (Bangla):' : 'পূর্ণ নাম (বাংলা):'}</span> <span>{studentData.studentNameBn}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Name (English):' : 'নাম (ইংরেজি):'}</span> <span>{studentData.studentNameEn || '-'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Date of Birth:' : 'জন্ম তারিখ:'}</span> <span>{studentData.dob ? toBengaliNumber(format(new Date(studentData.dob), "dd-MM-yyyy")) : '-'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Birth Reg. No:' : 'জন্ম নিবন্ধন:'}</span> <span>{toBengaliNumber(studentData.birthRegNo || '-')}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Gender:' : 'লিঙ্গ:'}</span> <span>{studentData.gender === 'male' ? (isEn ? 'Male' : 'পুরুষ') : studentData.gender === 'female' ? (isEn ? 'Female' : 'মহিলা') : studentData.gender || '-'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Religion:' : 'ধর্ম:'}</span> <span>{religionMapBn[studentData.religion?.toLowerCase() || ''] || studentData.religion || 'অন্যান্য'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Section/Group:' : 'বিভাগ/শাখা:'}</span> <span className="capitalize">{studentData.group || (isEn ? 'General' : 'সাধারণ')}</span></div>
                                                {studentData.optionalSubject && <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? 'Optional Subject:' : 'ঐচ্ছিক বিষয়:'}</span> <span>{studentData.optionalSubject}</span></div>}
                                            </CardContent>
                                        </Card>

                                        {/* Guardian Info */}
                                        <Card className="border-[4px] border-black rounded-xl bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                                            <CardHeader className="bg-primary/5 border-b-2 border-black/10">
                                                <CardTitle className="text-lg font-black flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {isEn ? 'Guardian Information' : 'অভিভাবকের তথ্য'}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6 space-y-3 font-bold text-sm">
                                                <div className="flex justify-between border-b pb-2"><span>{isEn ? "Father's Name (Bangla):" : "পিতার নাম (বাংলা):"}</span> <span>{studentData.fatherNameBn}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? "Father's Name (English):" : "পিতার নাম (ইংরেজি):"}</span> <span>{studentData.fatherNameEn || '-'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span>{isEn ? "Father's NID:" : "পিতার NID:"}</span> <span>{toBengaliNumber(studentData.fatherNid || '-')}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span>{isEn ? "Mother's Name (Bangla):" : "মাতার নাম (বাংলা):"}</span> <span>{studentData.motherNameBn}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground font-medium">{isEn ? "Mother's Name (English):" : "মাতার নাম (ইংরেজি):"}</span> <span>{studentData.motherNameEn || '-'}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span>{isEn ? "Mother's NID:" : "মাতার NID:"}</span> <span>{toBengaliNumber(studentData.motherNid || '-')}</span></div>
                                                <div className="flex justify-between border-b pb-2"><span>{isEn ? "Guardian Mobile:" : "অভিভাবক মোবাইল:"}</span> <span className="text-primary font-black">{toBengaliNumber(studentData.guardianMobile || '-')}</span></div>
                                                <div className="flex justify-between"><span>{isEn ? "Student Mobile:" : "শিক্ষার্থী মোবাইল:"}</span> <span>{toBengaliNumber(studentData.studentMobile || '-')}</span></div>
                                            </CardContent>
                                        </Card>

                                        {/* Academic Record */}
                                        <Card className="border-[4px] border-black rounded-xl bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                                            <CardHeader className="bg-blue-50 border-b-2 border-black/10">
                                                <CardTitle className="text-lg font-black flex items-center gap-2"><GraduationCap className="h-5 w-5 text-blue-700" /> অ্যাকাডেমিক রেকর্ড</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6 space-y-3 font-bold text-sm">
                                                <div className="flex flex-col gap-1 border-b pb-2">
                                                    <span className="text-muted-foreground font-medium text-xs">পূর্ববর্তী বিদ্যালয়:</span>
                                                    <span>{studentData.previousSchool || '-'}</span>
                                                </div>
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-muted-foreground font-medium">{isEn ? "Registration No:" : "রেজিষ্ট্রেশন নম্বর:"}</span>
                                                    <span className="font-black text-blue-800">{toBengaliNumber(studentData.prevRegNo || '-')}</span>
                                                </div>
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-muted-foreground font-medium">{isEn ? "Passing Year:" : "পাসের সন:"}</span>
                                                    <span>{toBengaliNumber(studentData.prevPassingYear || '-')}</span>
                                                </div>
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-muted-foreground font-medium">{isEn ? "Board:" : "বোর্ড:"}</span>
                                                    <span>{studentData.prevBoard || '-'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground font-medium">উপবৃত্তি পায় কি না:</span>
                                                    <span className={cn("font-black", studentData.isStipendReceiver ? "text-emerald-700" : "text-slate-400")}>
                                                        {studentData.isStipendReceiver ? (isEn ? 'Yes' : 'হ্যাঁ') : (isEn ? 'No' : 'না')}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Address Info */}
                                        <Card className="border-[4px] border-black rounded-xl bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                                            <CardHeader className="bg-emerald-50 border-b-2 border-black/10">
                                                <CardTitle className="text-lg font-black flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-700" /> বর্তমান ও স্থায়ী ঠিকানা</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6 space-y-6">
                                                <div className="p-3 bg-slate-50 rounded-lg border-2 border-dashed">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">{isEn ? "PRESENT ADDRESS" : "বর্তমান ঠিকানা"}</p>
                                                    <p className="text-sm font-bold leading-relaxed">
                                                        গ্রাম: {studentData.presentVillage || '-'}, ইউনিয়ন: {studentData.presentUnion || '-'}<br/>
                                                        {isEn ? "Post Office:" : "ডাকঘর:"} {studentData.presentPostOffice || '-'}, {isEn ? "Upazila:" : "উপজেলা:"} {studentData.presentUpazila || 'বীরগঞ্জ'}<br/>
                                                        {isEn ? "District:" : "জেলা:"} {studentData.presentDistrict || 'দিনাজপুর'}
                                                    </p>
                                                </div>
                                                <div className="p-3 bg-slate-50 rounded-lg border-2 border-dashed">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">স্থায়ী ঠিকানা</p>
                                                    <p className="text-sm font-bold leading-relaxed">
                                                        গ্রাম: {studentData.permanentVillage || '-'}, ইউনিয়ন: {studentData.permanentUnion || '-'}<br/>
                                                        {isEn ? "Post Office:" : "ডাকঘর:"} {studentData.permanentPostOffice || '-'}, {isEn ? "Upazila:" : "উপজেলা:"} {studentData.permanentUpazila || 'বীরগঞ্জ'}<br/>
                                                        {isEn ? "District:" : "জেলা:"} {studentData.permanentDistrict || 'দিনাজপুর'}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>

                                <TabsContent value="academic_stats" className="mt-0 space-y-8 animate-in fade-in duration-500">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {academicProgress.length > 0 ? (
                                            academicProgress.map((p, i) => (
                                                <Card key={i} className="border-[4px] border-black rounded-xl bg-white p-4 text-center shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
                                                    <p className="text-[10px] font-black text-violet-700 uppercase mb-2">{p.exam}</p>
                                                    <p className="text-3xl font-black text-slate-900">GPA: {toBengaliNumber(p.gpa.toFixed(2))}</p>
                                                    <div className="mt-2 flex justify-center gap-2">
                                                        <Badge variant="outline" className="font-black border-black/20">মার্কস: {toBengaliNumber(p.marks)}</Badge>
                                                        {p.rank > 0 && <Badge className="bg-violet-600 font-black">মেধাস্থান: {toBengaliNumber(p.rank)}</Badge>}
                                                    </div>
                                                </Card>
                                            ))
                                        ) : (
                                            <div className="col-span-full py-12 bg-white border-[4px] border-black border-dashed rounded-xl text-center">
                                                <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                                <p className="font-black text-muted-foreground italic">এই বছরের পরীক্ষার রেজাল্ট এখনো এন্ট্রি হয়নি।</p>
                                            </div>
                                        )}
                                    </div>

                                    {academicProgress.length > 0 && (
                                        <div className="space-y-6">
                                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                                <Target className="h-6 w-6 text-primary" /> বিষয়ভিত্তিক ফলাফল বিশ্লেষণ
                                            </h3>
                                            <Accordion type="single" collapsible className="space-y-4">
                                                {academicProgress.map((examData, eIdx) => (
                                                    <AccordionItem key={eIdx} value={`exam-${eIdx}`} className="border-[4px] border-black rounded-2xl bg-white shadow-[8px_8px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                                                        <AccordionTrigger className="px-6 py-4 hover:no-underline bg-primary/5">
                                                            <div className="flex justify-between items-center w-full pr-6">
                                                                <span className="font-black text-lg text-primary">{examData.exam}</span>
                                                                <Badge className="font-black bg-primary">GPA: {toBengaliNumber(examData.gpa.toFixed(2))}</Badge>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="p-6 space-y-6">
                                                            <div className="grid grid-cols-1 gap-6">
                                                                {examData.subjectStats.map((sub: any, sIdx: number) => {
                                                                    const obtainedPercent = (sub.obtained / sub.fullMarks) * 100;
                                                                    return (
                                                                        <div key={sIdx} className="space-y-3 p-4 border-2 border-slate-100 rounded-xl bg-slate-50/50">
                                                                            <div className="flex justify-between items-center">
                                                                                <Badge variant="outline" className="font-black border-black bg-white">{sub.subjectName}</Badge>
                                                                                <Badge className={cn("font-black", sub.obtained >= (sub.fullMarks * 0.33) ? "bg-emerald-600" : "bg-rose-600")}>গ্রেড: {sub.grade}</Badge>
                                                                            </div>
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                                                                                    <div className={cn("h-full transition-all duration-1000", sub.obtained >= (sub.fullMarks * 0.33) ? "bg-primary" : "bg-rose-500")} style={{ width: `${obtainedPercent}%` }} />
                                                                                </div>
                                                                                <span className="font-black text-sm whitespace-nowrap">{toBengaliNumber(sub.obtained)} / {toBengaliNumber(sub.fullMarks)}</span>
                                                                            </div>
                                                                            <div className="bg-white p-3 rounded-lg border border-dashed text-xs font-bold text-slate-700 italic">
                                                                                "{sub.comment}"
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                ))}
                                            </Accordion>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="attendance_stats" className="mt-0 space-y-8 animate-in fade-in duration-500">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                        <Card className="border-[4px] border-black rounded-xl p-6 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] text-center">
                                            <p className="text-[10px] font-black text-emerald-700 uppercase mb-1">মোট উপস্থিত</p>
                                            <p className="text-4xl font-black">{toBengaliNumber(attendanceStats.present)} দিন</p>
                                        </Card>
                                        <Card className="border-[4px] border-black rounded-xl p-6 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] text-center">
                                            <p className="text-[10px] font-black text-rose-700 uppercase mb-1">অনুপস্থিত</p>
                                            <p className="text-4xl font-black">{toBengaliNumber(attendanceStats.absent)} দিন</p>
                                        </Card>
                                        <Card className="border-[4px] border-black rounded-xl p-6 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] text-center">
                                            <p className="text-[10px] font-black text-blue-700 uppercase mb-1">উপস্থিতির হার</p>
                                            <p className="text-4xl font-black">{toBengaliNumber(attendancePercentage.toFixed(1))}%</p>
                                            <Progress value={attendancePercentage} className="h-2 mt-3" />
                                        </Card>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                            <LayoutGrid className="h-5 w-5 text-primary" /> বার্ষিক হাজিরা ক্যালেন্ডার ({toBengaliNumber(selectedYear)})
                                        </h3>
                                        <AttendanceHeatmap records={attendanceRecords} year={selectedYear} holidays={holidays} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="fees_stats" className="mt-0 space-y-8 animate-in fade-in duration-500">
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                            <Wallet className="h-5 w-5 text-primary" /> ডিজিটাল বেতন কার্ড (Jan-Dec)
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                            {BENGALI_MONTHS.map((month, idx) => {
                                                const isPaid = paidMonths.includes(month);
                                                const isFuture = idx > new Date().getMonth();
                                                return (
                                                    <div key={month} className={cn(
                                                        "flex flex-col items-center justify-center p-3 rounded-2xl border-[3px] font-black transition-all",
                                                        isPaid ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-[4px_4px_0px_rgba(16,185,129,0.2)]" : 
                                                        isFuture ? "border-slate-200 bg-slate-50 text-slate-400 opacity-60" :
                                                        "border-rose-500 bg-rose-50 text-rose-800 shadow-[4px_4px_0px_rgba(244,63,94,0.2)] animate-pulse"
                                                    )}>
                                                        <span className="text-[11px] mb-2">{month}</span>
                                                        {isPaid ? (
                                                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                        ) : isFuture ? (
                                                            <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-dashed" />
                                                        ) : (
                                                            <XCircle className="h-5 w-5 text-rose-500" />
                                                        )}
                                                        <Badge variant="outline" className={cn(
                                                            "h-4 text-[7px] font-black px-1.5 border-none mt-2",
                                                            isPaid ? "bg-emerald-600 text-white" : isFuture ? "bg-slate-300 text-white" : "bg-rose-600 text-white"
                                                        )}>
                                                            {isPaid ? 'পরিশোধিত' : isFuture ? 'অপেক্ষমান' : 'বকেয়া'}
                                                        </Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <Card className="border-[4px] border-black rounded-xl bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)]">
                                            <CardHeader className="bg-primary/5 border-b-2 border-black/10">
                                                <CardTitle className="text-sm font-black flex items-center gap-2"><ListChecks className="h-4 w-4" /> অন্যান্য ফি এর অবস্থা</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6 space-y-3 font-bold text-sm">
                                                {[
                                                    { label: 'সেশন ফি', key: 'sessionFee' },
                                                    { label: 'পরীক্ষা ফি (বার্ষিক)', key: 'examFeeAnnual' },
                                                    { label: 'ভর্তি ফি', key: 'admissionFee' },
                                                    { label: 'অন্যান্য ফি', key: 'otherFee' }
                                                ].map(item => {
                                                    const amount = studentData[item.key as keyof Student] as number;
                                                    const isPaid = feeHistory.some(f => f.breakdown && (f.breakdown[item.key as keyof typeof f.breakdown] ?? 0) > 0);
                                                    return (
                                                        <div key={item.key} className="flex justify-between items-center border-b pb-2 last:border-0">
                                                            <span>{item.label}:</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-slate-800">{toBengaliNumber(amount || 0)} ৳</span>
                                                                {amount === 0 ? <Badge className="bg-blue-600 text-[8px]">মওকুফ</Badge> : isPaid ? <Badge className="bg-emerald-600 text-[8px]">পরিশোধিত</Badge> : <Badge variant="destructive" className="text-[8px]">বকেয়া</Badge>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </CardContent>
                                        </Card>

                                        <div className="space-y-4">
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                                <Banknote className="h-5 w-5 text-primary" /> সাম্প্রতিক লেনদেন
                                            </h3>
                                            <div className="border-[4px] border-black rounded-xl overflow-hidden bg-white shadow-[6px_6px_0px_rgba(0,0,0,0.1)] max-h-[250px] overflow-y-auto">
                                                <Table>
                                                    <TableHeader className="bg-primary/5 sticky top-0 z-10 shadow-sm">
                                                        <TableRow className="border-b-[3px] border-black">
                                                            <TableHead className="font-black text-black">তারিখ</TableHead>
                                                            <TableHead className="font-black text-black text-right">পরিমাণ</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {feeHistory.length === 0 ? (
                                                            <TableRow><TableCell colSpan={2} className="text-center py-12 font-bold text-muted-foreground">কোনো তথ্য নেই।</TableCell></TableRow>
                                                        ) : (
                                                            feeHistory.map((fee) => (
                                                                <TableRow key={fee.id} className="border-b-2 border-slate-100 last:border-0 hover:bg-slate-50">
                                                                    <TableCell className="font-bold text-xs">{format(fee.collectionDate, 'dd/MM/yyyy', { locale: bn })}</TableCell>
                                                                    <TableCell className="font-black text-right text-emerald-700">{toBengaliNumber(fee.totalAmount)} ৳</TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Printable Area - Redesigned to match the provided layout */}
            {studentData && (
                <div className="hidden print:block printable-area bg-white text-black p-4 font-kalpurush w-full box-border border-[6px] border-double border-black/30">
                    <style jsx global>{`
                        @media print {
                            @page {
                                size: A4;
                                margin: 0.4in !important;
                            }
                            .printable-area {
                                position: absolute !important;
                                top: 0 !important;
                                left: 0 !important;
                                width: 100% !important;
                                min-height: 100% !important;
                                padding: 8mm !important;
                                box-sizing: border-box !important;
                                border: 6px double rgba(0, 0, 0, 0.3) !important;
                                display: block !important;
                            }
                        }
                    `}</style>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b-4 border-[#2d572c] pb-2 mb-6">
                        <div className="relative w-16 h-16">
                             {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={64} height={64} className="object-contain" />}
                        </div>
                        <div className="text-center flex-grow">
                            <h1 className="text-3xl font-black text-[#2d572c] mb-0.5">{schoolInfo.name}</h1>
                            <p className="text-base font-bold text-slate-700">{schoolInfo.address}</p>
                            <div className="mt-2 inline-block border-2 border-[#2d572c] px-6 py-0.5 rounded-full bg-[#f0faf9]">
                                <h2 className="text-lg font-black uppercase text-[#2d572c]">{isEn ? `Student Progress & Profile Report - ${selectedYear}` : `শিক্ষার্থী প্রগতি ও প্রোফাইল রিপোর্ট - ${toBengaliNumber(selectedYear)}`}</h2>
                            </div>
                        </div>
                        <div className="w-16 h-16"></div>
                    </div>

                    {/* Student Info Section */}
                    <div className="flex justify-between items-start gap-8 mb-6">
                        <div className="flex-1 space-y-2.5 font-bold text-sm">
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">{isEn ? "Student Name" : "শিক্ষার্থীর নাম"}</span>
                                <span className="font-black">: {studentData.studentNameBn}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">{isEn ? "Roll & Class" : "রোল ও শ্রেণি"}</span>
                                <span className="font-black">: {toBengaliNumber(studentData.roll)}, {classNamesMap[studentData.className]} শ্রেণি</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">{isEn ? "Student ID" : "শিক্ষার্থী আইডি"}</span>
                                <span className="font-black">: {toBengaliNumber(studentData.generatedId || '-')}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">পিতার নাম</span>
                                <span className="font-black">: {studentData.fatherNameBn}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">{isEn ? "Mother's Name" : "মাতার নাম"}</span>
                                <span className="font-black">: {studentData.motherNameBn}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                                <span className="w-32 text-slate-600">{isEn ? "Mobile No." : "মোবাইল নম্বর"}</span>
                                <span className="font-black">: {toBengaliNumber(studentData.guardianMobile || '-')}</span>
                            </div>
                        </div>
                        <div className="w-28 h-36 border-2 border-slate-200 p-0.5 rounded overflow-hidden shadow-sm shrink-0">
                            <Image src={sanitizePhotoUrl(studentData.photoUrl, studentData.gender) || getStudentPlaceholderImage(studentData.gender)} alt="Profile" width={112} height={144} className="object-cover w-full h-full" />
                        </div>
                    </div>

                    {/* Stats Section */}
                    <div className="grid grid-cols-2 gap-8 mb-6">
                        {/* Attendance Card */}
                        <div className="space-y-2">
                            <h3 className="text-lg font-black text-slate-800 border-l-4 border-[#2418ff] pl-2">{isEn ? "Attendance Statistics" : "হাজিরা পরিসংখ্যান"}</h3>
                            <div className="border-[2px] border-black rounded-2xl p-4 bg-white shadow-md space-y-2 font-bold text-xs">
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                                    <span className="text-slate-600">{isEn ? "Total Working Days:" : "মোট কার্যদিবস:"}</span>
                                    <span className="font-black">{toBengaliNumber(attendanceStats.total)} দিন</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                                    <span className="text-emerald-700">মোট উপস্থিত:</span>
                                    <span className="font-black text-emerald-700">{toBengaliNumber(attendanceStats.present)} {isEn ? "days" : "দিন"}</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1 text-rose-600">
                                    <span>মোট অনুপস্থিত:</span>
                                    <span className="font-black">{toBengaliNumber(attendanceStats.absent)} {isEn ? "days" : "দিন"}</span>
                                </div>
                                <div className="flex justify-between pt-1 font-black text-blue-700">
                                    <span>উপস্থিতির হার:</span>
                                    <span className="text-sm">{toBengaliNumber(attendancePercentage.toFixed(1))}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Dues Card */}
                        <div className="space-y-2">
                            <h3 className="text-lg font-black text-slate-800 border-l-4 border-[#2d572c] pl-2">বকেয়া পাওনা</h3>
                            <div className="border-[2px] border-black rounded-2xl p-4 bg-white shadow-md space-y-2 font-bold text-xs">
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1 text-rose-600">
                                    <span>বকেয়া বেতন:</span>
                                    <span className="font-black">{toBengaliNumber(duesSummary.tuitionDue)} ৳</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1 text-amber-600">
                                    <span>পরীক্ষার ফি:</span>
                                    <span className="font-black">{toBengaliNumber(duesSummary.examDues.reduce((a, d) => a + d.amount, 0))} ৳</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-1 text-blue-600">
                                    <span>অন্যান্য ফি:</span>
                                    <span className="font-black">{toBengaliNumber(duesSummary.otherDues)} ৳</span>
                                </div>
                                <div className="flex justify-between pt-1 font-black text-emerald-800">
                                    <span>সর্বমোট পাওনা:</span>
                                    <span className="text-sm">{toBengaliNumber(duesSummary.tuitionDue + duesSummary.otherDues + duesSummary.examDues.reduce((a, d) => a + d.amount, 0))} ৳</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Academic Results Table */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-black text-slate-800 border-l-4 border-violet-700 pl-2">অ্যাকাডেমিক ফলাফল (পরীক্ষাভিত্তিক)</h3>
                        <div className="border-[2px] border-black rounded-lg overflow-hidden">
                            <table className="w-full text-center border-collapse text-xs">
                                <thead className="bg-slate-100">
                                    <tr className="border-b-[2px] border-black h-10">
                                        <th className="border-r-[1.5px] border-black font-black px-4 text-left">{isEn ? "Exam Name" : "পরীক্ষার নাম"}</th>
                                        <th className="border-r-[1.5px] border-black font-black px-4">{isEn ? "Total Marks" : "মোট নম্বর"}</th>
                                        <th className="border-r-[1.5px] border-black font-black px-4">GPA</th>
                                        <th className="font-black px-4 text-right">{isEn ? "Position" : "মেধাস্থান"}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {academicProgress.length > 0 ? academicProgress.map((p, i) => (
                                        <tr key={i} className="border-b-[1px] border-slate-300 h-10 font-bold">
                                            <td className="border-r-[1.5px] border-black text-left px-6">{p.exam}</td>
                                            <td className="border-r-[1.5px] border-black font-black">{toBengaliNumber(p.marks)}</td>
                                            <td className="border-r-[1.5px] border-black font-black text-blue-800">{toBengaliNumber(p.gpa.toFixed(2))}</td>
                                            <td className="text-right px-6 font-black">{p.rank > 0 ? toBengaliNumber(p.rank) : '-'}</td>
                                        </tr>
                                    )) : (
                                        <tr className="h-16">
                                            <td colSpan={4} className="italic text-muted-foreground text-center">এখন পর্যন্ত কোনো ফলাফল নেই।</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Signatures Footer - Reduced mt to fit on one page */}
                    <div className="mt-12 flex justify-between px-16">
                        <div className="text-center w-40 border-t-[1.5px] border-black pt-1 font-black text-sm">{isEn ? "Class Teacher's Signature" : "শ্রেণি শিক্ষকের স্বাক্ষর"}</div>
                        <div className="text-center w-40 border-t-[1.5px] border-black pt-1 font-black text-sm">{isEn ? "Headmaster's Signature" : "প্রধান শিক্ষকের স্বাক্ষর"}</div>
                    </div>
                    
                    <div className="mt-8 text-center text-[9px] text-slate-400 border-t border-dashed pt-2 flex justify-between">
                         <span>Digital Management Portal | বীরগঞ্জ পৌর উচ্চ বিদ্যালয়</span>
                         <span>রিপোর্ট জেনারেট: {format(new Date(), 'PPpp', { locale: bn })}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function StudentProfileSearchPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen w-full items-center justify-center bg-indigo-50"><p>লোড হচ্ছে...</p></div>}>
            <StudentProfileSearchContent />
        </Suspense>
    );
}