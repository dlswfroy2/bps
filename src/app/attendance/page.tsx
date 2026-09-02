'use client';

import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Student } from '@/lib/student-data';
import { 
    getAttendanceFromStorage, 
    DailyAttendance, 
    saveDailyAttendance, 
    getAttendanceForClassAndDate, 
    StudentAttendance, 
    AttendanceStatus, 
    getConsecutiveAbsences, 
    StudentConsecutiveAbsence,
    deleteDailyAttendance
} from '@/lib/attendance-data';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, orderBy, FirestoreError, getDocs, writeBatch } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Button } from '@/components/ui/button';
import { Label } from "@/components/ui/label";
import { isHoliday, Holiday, getHolidays } from '@/lib/holiday-data';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDate, isSameMonth, isSameYear } from 'date-fns';
import { bn } from 'date-fns/locale';
import { DatePicker } from '@/components/ui/date-picker';
import { useAuth } from '@/hooks/useAuth';
import { 
    Edit2, CalendarX, Check, 
    CalendarDays, CalendarCheck, Plus, Save, Loader2, 
    ListChecks, ChevronRight, UserX, Printer, Wifi, WifiOff, Trash2,
    Info
} from 'lucide-react';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import Image from 'next/image';

// --- Constants ---
const BENGALI_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const classNamesMap: { [key: string]: string } = { 
    '6': 'ষষ্ঠ শ্রেণি', 
    '7': 'সপ্তম শ্রেণি', 
    '8': 'অষ্টম শ্রেণি', 
    '9': 'নবম শ্রেণি', 
    '10': 'দশম শ্রেণি' 
};

function toBengaliNumber(str: string | number | undefined | null) {
  if (!str && str !== 0) return '';
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
}

// --- Connectivity Hook ---
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// --- Helper Components ---

const SchoolPrintHeader = ({ title, schoolInfo, startDate, endDate }: { title: string, schoolInfo: any, startDate?: Date, endDate?: Date }) => (
    <div className="hidden print:block text-black mb-8 border-b-4 border-emerald-800 pb-4 font-kalpurush">
        <div className="flex items-center gap-6 justify-center">
            {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={70} height={70} className="object-contain" />}
            <div className="text-center">
                <h1 className="text-3xl font-black uppercase text-emerald-950">{schoolInfo.name}</h1>
                <p className="text-sm font-bold text-slate-700">{schoolInfo.address}</p>
                <div className="mt-2 inline-block bg-emerald-50 px-6 py-0.5 rounded-full border-2 border-emerald-800">
                    <h2 className="text-lg font-black uppercase">
                        {title}
                        {startDate && endDate && (
                            <span className="ml-2">
                                ({format(startDate, 'dd/MM/yyyy', { locale: bn })} হতে {format(endDate, 'dd/MM/yyyy', { locale: bn })} পর্যন্ত)
                            </span>
                        )}
                    </h2>
                </div>
            </div>
        </div>
    </div>
);

// --- Monthly Grid Register Component ---

const MonthlyAttendanceGrid = ({ 
    classId, 
    students, 
    selectedDate,
    viewDate,
    onRefresh,
    onDateChange
}: { 
    classId: string, 
    students: Student[], 
    selectedDate: Date | undefined,
    viewDate: Date,
    onRefresh: () => void,
    onDateChange: (d: Date) => void
}) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.role === 'admin';
    const canManageAttendance = hasPermission('manage:attendance');
    
    // Scroll Sync Refs
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const isFirstLoad = useRef(true);

    // Default reference date for calendar calculation
    const monthStart = useMemo(() => startOfMonth(viewDate), [viewDate]);
    const monthEnd = useMemo(() => endOfMonth(viewDate), [viewDate]);
    const daysInMonth = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

    // Highlight only the specific selected day in the current month view
    const activeDay = useMemo(() => {
        if (selectedDate && isSameMonth(selectedDate, viewDate) && isSameYear(selectedDate, viewDate)) {
            return getDate(selectedDate);
        }
        return null;
    }, [selectedDate, viewDate]);

    const [monthRecords, setMonthRecords] = useState<DailyAttendance[]>([]);
    const [currentStatusMap, setCurrentStatusMap] = useState<Map<string, AttendanceStatus>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeHoliday, setActiveHoliday] = useState<Holiday | undefined>(undefined);
    const [holidays, setHolidays] = useState<string[]>([]);

    const inputRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const fetchData = useCallback(async (isBackground = false) => {
        if (!db || !user) return;
        if (!isBackground) setIsLoading(true);
        else setIsRefreshing(true);

        try {
            const startStr = format(monthStart, 'yyyy-MM-dd');
            const endStr = format(monthEnd, 'yyyy-MM-dd');
            
            const q = query(
                collection(db, 'attendance'),
                where('academicYear', '==', selectedYear),
                where('className', '==', classId),
                where('date', '>=', startStr),
                where('date', '<=', endStr)
            );
            
            const [attSnap, holidayList] = await Promise.all([
                getDocs(q),
                getHolidays(db)
            ]);

            const records = attSnap.docs.map(doc => doc.data() as DailyAttendance);
            setMonthRecords(records);
            setHolidays(holidayList.map(h => h.date));
            
            if (selectedDate) {
                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                const todayRecord = records.find(r => r.date === dateStr);
                const statusMap = new Map<string, AttendanceStatus>();
                if (todayRecord) {
                    todayRecord.attendance.forEach(a => statusMap.set(a.studentId, a.status));
                }
                setCurrentStatusMap(statusMap);

                const holidayToday = await isHoliday(db, dateStr);
                setActiveHoliday(holidayToday);
            }
            
            isFirstLoad.current = false;
        } catch (e) {
            console.error("Fetch Data Error:", e);
        }
        setIsLoading(false);
        setIsRefreshing(false);
    }, [db, user, classId, selectedYear, selectedDate, monthStart, monthEnd]);

    useEffect(() => { 
        fetchData(); 
    }, [fetchData]);

    // Handle Scroll Sync
    const handleScrollSync = (source: 'top' | 'table') => {
        const top = topScrollRef.current;
        const table = tableContainerRef.current;
        if (!top || !table) return;
        if (source === 'top') {
            table.scrollLeft = top.scrollLeft;
        } else {
            top.scrollLeft = table.scrollLeft;
        }
    };

    const handleSave = async () => {
        if (!db || !user || isSaving || !selectedDate) return;
        
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayOfWeek = selectedDate.getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        if (isWeekend) { toast({ variant: "destructive", title: "সাপ্তাহিক ছুটিতে হাজিরা বন্ধ।" }); return; }
        if (activeHoliday) { toast({ variant: "destructive", title: `আজ ${activeHoliday.description}।` }); return; }

        setIsSaving(true);
        try {
            const attendanceData: StudentAttendance[] = students.map(student => ({
                studentId: student.id,
                status: currentStatusMap.get(student.id) || 'absent'
            }));

            const dailyAttendance: DailyAttendance = {
                date: dateStr,
                academicYear: selectedYear,
                className: classId,
                attendance: attendanceData,
            };

            await saveDailyAttendance(db, dailyAttendance);
            toast({ title: "হাজিরা সংরক্ষিত হয়েছে", description: `${format(selectedDate, 'PPP', { locale: bn })} এর তথ্য সেভ হয়েছে।` });
            fetchData(true); 
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDay = async (targetDate: Date) => {
        if (!db) return;
        const targetDateStr = format(targetDate, 'yyyy-MM-dd');
        onDateChange(targetDate);

        try {
            await deleteDailyAttendance(db, targetDateStr, classId, selectedYear);
            toast({ title: "সফল", description: "হাজিরা রেকর্ডটি মুছে ফেলা হয়েছে।" });
            fetchData(true);
        } catch (e) {}
    };

    const handleDeleteMonth = async () => {
        if (!db || !isAdmin) return;
        setIsLoading(true);
        try {
            const startStr = format(monthStart, 'yyyy-MM-dd');
            const endStr = format(monthEnd, 'yyyy-MM-dd');
            const q = query(
                collection(db, 'attendance'),
                where('academicYear', '==', selectedYear),
                where('className', '==', classId),
                where('date', '>=', startStr),
                where('date', '<=', endStr)
            );
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            toast({ title: 'পুরো মাসের হাজিরা তথ্য মুছে ফেলা হয়েছে' });
            fetchData();
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    };

    const toggleStatus = (studentId: string, status: AttendanceStatus, index: number) => {
        setCurrentStatusMap(prev => {
            const next = new Map(prev);
            next.set(studentId, status);
            return next;
        });

        if (index < students.length - 1) {
            const nextId = students[index + 1].id;
            inputRefs.current[`present-${nextId}`]?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, studentId: string, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            toggleStatus(studentId, 'present', index);
        } else if (e.key === 'ArrowDown') {
            if (index < students.length - 1) {
                const nextId = students[index + 1].id;
                const type = e.currentTarget.id.startsWith('present') ? 'present' : 'absent';
                inputRefs.current[`${type}-${nextId}`]?.focus();
            }
        } else if (e.key === 'ArrowUp') {
            if (index > 0) {
                const prevId = students[index - 1].id;
                const type = e.currentTarget.id.startsWith('present') ? 'present' : 'absent';
                inputRefs.current[`${type}-${prevId}`]?.focus();
            }
        }
    };

    // Presence calculations
    const getStudentTotalPresent = useCallback((studentId: string) => {
        let count = 0;
        daysInMonth.forEach(day => {
            const d = getDate(day);
            const isSelected = d === activeDay;
            if (isSelected) {
                if (currentStatusMap.get(studentId) === 'present') count++;
            } else {
                const ds = format(day, 'yyyy-MM-dd');
                const record = monthRecords.find(r => r.date === ds);
                const att = record?.attendance.find(a => a.studentId === studentId);
                if (att?.status === 'present') count++;
            }
        });
        return count;
    }, [daysInMonth, activeDay, currentStatusMap, monthRecords]);

    const getDayTotalPresent = useCallback((day: Date) => {
        const d = getDate(day);
        const isSelected = d === activeDay;
        if (isSelected) {
            let count = 0;
            currentStatusMap.forEach(status => {
                if (status === 'present') count++;
            });
            return count;
        } else {
            const ds = format(day, 'yyyy-MM-dd');
            const record = monthRecords.find(r => r.date === ds);
            return record?.attendance.filter(a => a.status === 'present').length || 0;
        }
    }, [activeDay, currentStatusMap, monthRecords]);

    if (isLoading && isFirstLoad.current) return <div className="p-20 text-center italic"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" /> ডাটা লোড হচ্ছে...</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative">
            <style jsx global>{`
                .attendance-table th, .attendance-table td {
                    border: 1px solid black !important;
                }
                .permanent-scroll::-webkit-scrollbar {
                    height: 12px;
                    display: block;
                }
                .permanent-scroll::-webkit-scrollbar-track {
                    background: #f1f1f1;
                }
                .permanent-scroll::-webkit-scrollbar-thumb {
                    background: #2418ff;
                    border-radius: 10px;
                }
            `}</style>

            {isRefreshing && (
                <div className="absolute top-0 right-0 z-[100] p-2 no-print">
                    <div className="bg-primary/90 text-white px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-right-4">
                        <Loader2 className="h-3 w-3 animate-spin" /> রিফ্রেশ হচ্ছে...
                    </div>
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-center bg-primary/5 p-4 rounded-xl border-2 border-primary/10 gap-4 no-print">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg"><CalendarCheck className="h-5 w-5 text-primary" /></div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h3 className="font-black text-lg text-slate-800">মাসিক হাজিরা রেজিস্টার</h3>
                            {isAdmin && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50" title="পুরো মাসের ডাটা মুছুন">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="font-kalpurush">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-rose-700 font-black">পুরো মাসের হাজিরা মুছতে চান?</AlertDialogTitle>
                                            <AlertDialogDescription className="font-bold text-base">
                                                আপনি কি {classNamesMap[classId]} শ্রেণির **{BENGALI_MONTHS[viewDate.getMonth()]}** মাসের সকল হাজিরা রেকর্ড স্থায়ীভাবে মুছে ফেলতে চান? এটি আর ফিরে পাওয়া যাবে না।
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel className="font-bold">না, ফিরে যাই</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteMonth} className="bg-destructive text-white font-black">হ্যাঁ, সব মুছুন</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                        <p className="text-xs font-bold text-muted-foreground">{BENGALI_MONTHS[viewDate.getMonth()]} {toBengaliNumber(selectedYear)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeDay && (
                        <p className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            আজকের কলাম: {toBengaliNumber(activeDay)} তারিখ
                        </p>
                    )}
                    <Button onClick={handleSave} disabled={isSaving || !selectedDate || isOffDay(selectedDate, holidays)} className="font-black shadow-lg">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        হাজিরা সেভ করুন
                    </Button>
                </div>
            </div>

            <div className="relative group">
                <div 
                    ref={topScrollRef}
                    onScroll={() => handleScrollSync('top')}
                    className="overflow-x-auto permanent-scroll no-print mb-1 h-3"
                    style={{ width: '100%' }}
                >
                    <div style={{ width: `${(daysInMonth.length * 96) + 390}px`, height: '1px' }} />
                </div>

                <div 
                    ref={tableContainerRef}
                    onScroll={() => handleScrollSync('table')}
                    className="table-container attendance-table !max-h-[600px] border rounded-lg overflow-auto relative permanent-scroll"
                >
                    <Table className="border-separate border-spacing-0 min-w-max">
                        <TableHeader className="sticky top-0 z-40">
                            <TableRow className="border-t-2 border-b-2 border-black bg-slate-100 h-20">
                                <TableHead className="w-14 text-center font-black border-r-2 border-black bg-slate-200 sticky left-0 z-[60] text-black">রোল</TableHead>
                                <TableHead className="min-w-[180px] font-black border-r-2 border-black bg-slate-200 sticky left-14 z-[60] text-black">শিক্ষার্থীর নাম</TableHead>
                                {daysInMonth.map(day => {
                                    const d = getDate(day);
                                    const isSelected = d === activeDay;
                                    const isOff = isOffDay(day, holidays);
                                    
                                    return (
                                        <TableHead key={d} className={cn(
                                            "w-24 text-center border-r border-black/20 p-0 group/header relative",
                                            isSelected ? "bg-blue-600 text-white z-20" : "bg-slate-100 text-black",
                                            isOff && !isSelected && "bg-rose-50 text-rose-400"
                                        )}>
                                            <div className="flex flex-col items-center justify-center h-full py-1">
                                                <span className="text-base font-black leading-none">{toBengaliNumber(d)}</span>
                                                <span className="text-[9px] font-bold opacity-70 mt-0.5 uppercase">{format(day, 'EEEE', { locale: bn })}</span>
                                                
                                                <div className="flex justify-center items-center gap-1.5 mt-1 transition-opacity no-print">
                                                    {canManageAttendance && (
                                                        <Button 
                                                            variant="secondary" 
                                                            size="icon" 
                                                            className="h-5 w-5 rounded-md bg-white shadow-sm border border-slate-300 text-blue-600 hover:bg-blue-50"
                                                            onClick={(e) => { e.stopPropagation(); onDateChange(day); }}
                                                            title="এডিট"
                                                        >
                                                            <Edit2 className="h-2.5 w-2.5" />
                                                        </Button>
                                                    )}
                                                    {isAdmin && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button 
                                                                    variant="destructive" 
                                                                    size="icon" 
                                                                    className="h-5 w-5 rounded-md shadow-sm border border-rose-300"
                                                                    title="মুছুন"
                                                                >
                                                                    <Trash2 className="h-2.5 w-2.5" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="font-kalpurush">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="text-rose-700">হাজিরা মুছতে চান?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="font-bold">
                                                                        আপনি কি {format(day, 'd MMMM', { locale: bn })} এর হাজিরা রেকর্ড মুছে ফেলতে চান?
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="font-bold">বাতিল</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteDay(day)} className="bg-destructive font-black">হ্যাঁ, মুছুন</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </div>
                                        </TableHead>
                                    );
                                })}
                                <TableHead className="w-20 text-center font-black border-l-2 border-black bg-slate-200 sticky right-0 z-[60] text-black shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">মোট উপস্থিত</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {students.map((student, sIdx) => (
                                <TableRow key={student.id} className="h-8 hover:bg-slate-50 transition-colors">
                                    <TableCell className="text-center font-black border-r-2 border-black bg-white sticky left-0 z-30">{toBengaliNumber(student.roll)}</TableCell>
                                    <TableCell className="font-black border-r-2 border-black bg-white sticky left-14 z-30 whitespace-nowrap px-3 text-[11px] text-slate-800">{student.studentNameBn}</TableCell>
                                    {daysInMonth.map(day => {
                                        const d = getDate(day);
                                        const isSelected = d === activeDay;
                                        const recordDateStr = format(day, 'yyyy-MM-dd');
                                        const isOff = isOffDay(day, holidays);
                                        
                                        if (isSelected) {
                                            const status = currentStatusMap.get(student.id);
                                            return (
                                                <TableCell key={d} className="p-0 border-r border-black/20 bg-blue-50/50">
                                                    <div className="flex gap-0 h-8 w-24">
                                                        <button
                                                            id={`present-${student.id}`}
                                                            ref={el => { inputRefs.current[`present-${student.id}`] = el; }}
                                                            className={cn(
                                                                "flex-1 h-full text-base font-black transition-all border-r border-blue-200",
                                                                status === 'present' ? "bg-emerald-600 text-white shadow-inner" : "hover:bg-emerald-50 text-emerald-600"
                                                            )}
                                                            onClick={() => toggleStatus(student.id, 'present', sIdx)}
                                                            onKeyDown={e => handleKeyDown(e, student.id, sIdx)}
                                                        >
                                                            P
                                                        </button>
                                                        <button
                                                            id={`absent-${student.id}`}
                                                            ref={el => { inputRefs.current[`absent-${student.id}`] = el; }}
                                                            className={cn(
                                                                "flex-1 h-full text-base font-black transition-all",
                                                                status === 'absent' ? "bg-rose-600 text-white shadow-inner" : "hover:bg-rose-50 text-rose-600"
                                                            )}
                                                            onClick={() => toggleStatus(student.id, 'absent', sIdx)}
                                                            onKeyDown={e => handleKeyDown(e, student.id, sIdx)}
                                                        >
                                                            A
                                                        </button>
                                                    </div>
                                                </TableCell>
                                            );
                                        }

                                        const record = monthRecords.find(r => r.date === recordDateStr);
                                        const att = record?.attendance.find(a => a.studentId === student.id);
                                        
                                        return (
                                            <TableCell key={d} className={cn(
                                                "text-center p-0 border-r border-black/20 text-base font-black",
                                                isOff && "bg-rose-50/30",
                                                att?.status === 'present' && "text-emerald-700 bg-emerald-50/50",
                                                att?.status === 'absent' && "text-rose-700 bg-rose-50/50"
                                            )}>
                                                {att?.status === 'present' ? 'P' : att?.status === 'absent' ? 'A' : ''}
                                            </TableCell>
                                        );
                                    })}
                                    <TableCell className="text-center font-black border-l-2 border-black bg-white sticky right-0 z-30 text-blue-700 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">
                                        {toBengaliNumber(getStudentTotalPresent(student.id))}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 z-40">
                            <TableRow className="h-10 border-t-2 border-black bg-slate-200">
                                <TableCell colSpan={2} className="text-right pr-4 font-black bg-slate-200 sticky left-0 z-50 border-r-2 border-black">
                                    মোট উপস্থিত:
                                </TableCell>
                                {daysInMonth.map(day => (
                                    <TableCell key={getDate(day)} className="text-center font-black border-r border-black/20 text-blue-700">
                                        {toBengaliNumber(getDayTotalPresent(day))}
                                    </TableCell>
                                ))}
                                <TableCell className="sticky right-0 z-50 border-l-2 border-black bg-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]"></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </div>
            
            <div className="p-4 bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl flex items-start gap-3 no-print">
                <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] font-bold text-blue-900 space-y-1">
                    <p>• প্রতিটি তারিখের কলামে <strong>Edit</strong> বাটনে ক্লিক করে ওই দিনের হাজিরা নিতে পারবেন।</p>
                    <p>• নীল কলামটি বর্তমান নির্বাচিত তারিখ নির্দেশ করে। এখানে P = উপস্থিত এবং A = অনুপস্থিত।</p>
                    <p>• কিবোর্ড টিপস: <strong>Enter</strong> চাপলে শিক্ষার্থী উপস্থিত হবে এবং ফোকাস নিচের জনের ঘরে চলে যাবে।</p>
                </div>
            </div>
        </div>
    );
};

const isOffDay = (date: Date, holidays: string[]) => {
    const d = date.getDay();
    const ds = format(date, 'yyyy-MM-dd');
    return d === 5 || d === 6 || holidays.includes(ds);
};

// --- Sub Tabs Components ---

const AttendanceSheet = ({ 
    classId, 
    students, 
    date,
    viewDate,
    onRefresh,
    onDateChange
}: { 
    classId: string, 
    students: Student[], 
    date: Date | undefined,
    viewDate: Date,
    onRefresh: () => void,
    onDateChange: (d: Date) => void
}) => {
    return (
        <MonthlyAttendanceGrid 
            classId={classId} 
            students={students} 
            selectedDate={date} 
            viewDate={viewDate}
            onRefresh={onRefresh} 
            onDateChange={onDateChange}
        />
    );
};

const DigitalAttendanceTab = ({ allStudents, date, onDateChange }: { allStudents: Student[], date: Date | undefined, onDateChange: (d: Date) => void }) => {
    const { selectedYear } = useAcademicYear();
    const [viewDate, setViewDate] = useState<Date>(new Date());
    
    // Sync view context if an external date selection is made (e.g. from missed attendance list)
    useEffect(() => {
        if (date) setViewDate(date);
    }, [date]);

    const studentsForYear = useMemo(() => {
        return allStudents.filter(student => student.academicYear === selectedYear);
    }, [allStudents, selectedYear]);

    const classes = ['6', '7', '8', '9', '10'];

    const getStudentsByClass = (className: string): Student[] => {
        return studentsForYear.filter((student) => student.className === className).sort((a, b) => a.roll - b.roll);
    };

    const formattedDate = date ? format(date, "EEEE, d MMMM yyyy", { locale: bn }) : "তারিখ নির্বাচন করুন";
    const currentMonthIdx = viewDate.getMonth();

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl border shadow-sm gap-4 no-print">
                <div className="space-y-1">
                    <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" /> হাজিরা তারিখ: <span className="text-primary">{formattedDate}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Label className="font-black text-xs whitespace-nowrap">মাস পরিবর্তন করুন:</Label>
                    <Select 
                        value={currentMonthIdx.toString()} 
                        onValueChange={(val) => {
                            const nextDate = new Date(viewDate);
                            nextDate.setMonth(parseInt(val));
                            setViewDate(nextDate);
                        }}
                    >
                        <SelectTrigger className="w-40 bg-white shadow-sm font-bold text-primary h-9">
                            <SelectValue placeholder="মাস নির্বাচন" />
                        </SelectTrigger>
                        <SelectContent className="font-kalpurush">
                            {BENGALI_MONTHS.map((m, i) => (
                                <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Tabs defaultValue="6">
                <TabsList className="grid w-full grid-cols-5 h-auto flex-wrap bg-muted p-1">
                    {classes.map((className) => (
                        <TabsTrigger key={className} value={className} className="py-2.5 text-xs sm:text-sm font-black">
                            {classNamesMap[className]}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {classes.map((className) => (
                    <TabsContent key={className} value={className}>
                        <Card className="border-none shadow-none bg-transparent">
                            <CardContent className="p-0">
                                {getStudentsByClass(className).length === 0 ? (
                                    <div className="p-20 text-center text-muted-foreground italic border-4 border-dashed rounded-3xl opacity-50 bg-white">
                                        এই শ্রেণিতে কোনো শিক্ষার্থী নেই।
                                    </div>
                                ) : (
                                    <AttendanceSheet 
                                        classId={className} 
                                        students={getStudentsByClass(className)} 
                                        date={date}
                                        viewDate={viewDate}
                                        onRefresh={() => {}}
                                        onDateChange={onDateChange}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};

const QuickRollAttendanceTab = ({ allStudents, date, onDateChange }: { allStudents: Student[], date: Date | undefined, onDateChange: (d: Date) => void }) => {
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [selectedClass, setSelectedClass] = useState<string>('6');
    const [rollsInput, setRollsInput] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const rollCount = useMemo(() => {
        if (!rollsInput.trim()) return 0;
        const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
        const parts = rollsInput.split(/[\s,]+/);
        const uniqueRolls = new Set();
        parts.forEach(p => {
            const val = parseInt(bnToEn(p.trim()), 10);
            if (!isNaN(val)) uniqueRolls.add(val);
        });
        return uniqueRolls.size;
    }, [rollsInput]);

    const handleSave = async () => {
        if (!db || !user || !selectedClass || !date) return;
        
        setIsProcessing(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

            let activeHoliday = undefined;
            try { activeHoliday = await isHoliday(db, dateStr); } catch (e) { }

            if (isWeekend || activeHoliday) {
                toast({ 
                    variant: "destructive", 
                    title: "আজ ছুটি!", 
                    description: activeHoliday ? `আজ ${activeHoliday.description} তাই হাজিরা নেওয়া বন্ধ আছে।` : "আজ সাপ্তাহিক ছুটি তাই হাজিরা নেওয়া বন্ধ আছে।" 
                });
                setIsProcessing(false);
                return;
            }

            if (!isConfirming) {
                let existing = undefined;
                try { existing = await getAttendanceForClassAndDate(db, dateStr, selectedClass, selectedYear); } catch (e) { }
                
                if (existing) {
                    setIsConfirming(true);
                    toast({ 
                        variant: 'destructive', 
                        title: 'হাজিরা ইতিমধ্যে নেওয়া হয়েছে!', 
                        description: 'আবার এন্টার দিন অথবা সেভ বাটনে ক্লিক করুন নতুনভাবে সেভ করার জন্য।' 
                    });
                    setIsProcessing(false);
                    return;
                }
            }

            const classStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === selectedClass);
            
            if (classStudents.length === 0) {
                toast({ variant: 'destructive', title: 'এই শ্রেণিতে কোনো শিক্ষার্থী নেই' });
                setIsProcessing(false);
                return;
            }

            const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
            const inputRolls = rollsInput
                .split(/[\s,]+/)
                .map(r => parseInt(bnToEn(r.trim()), 10))
                .filter(r => !isNaN(r));

            const attendanceData: StudentAttendance[] = classStudents.map(student => ({
                studentId: student.id,
                status: (student.roll !== undefined && inputRolls.includes(student.roll)) ? 'present' : 'absent'
            }));

            const dailyAttendance: DailyAttendance = {
                date: dateStr,
                academicYear: selectedYear,
                className: selectedClass,
                attendance: attendanceData,
            };

            await saveDailyAttendance(db, dailyAttendance);
            
            toast({ 
                title: isConfirming ? 'হাজিরা সফলভাবে আপডেট হয়েছে' : 'হাজিরা সফলভাবে সংরক্ষিত হয়েছে', 
                description: `${toBengaliNumber(inputRolls.length)} জন উপস্থিত এবং বাকিরা অনুপস্থিত হিসেবে গণ্য হয়েছে।` 
            });
            setRollsInput('');
            setIsConfirming(false);
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else {
            if (isConfirming) setIsConfirming(false);
        }
    };

    return (
        <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            <Card className={cn(
                "border-2 transition-all duration-300 shadow-lg",
                isConfirming ? "border-rose-500 ring-4 ring-rose-100" : "border-primary/10"
            )}>
                <CardHeader className={cn("transition-colors duration-300", isConfirming ? "bg-rose-50" : "bg-primary/5")}>
                    <CardTitle className={cn("text-xl flex items-center gap-2", isConfirming && "text-rose-700")}>
                        {isConfirming ? <Plus className="h-6 w-6 animate-bounce" /> : <Plus className="h-5 w-5" />}
                        {isConfirming ? "পূর্বের হাজিরা রিপ্লেস করতে চান?" : "রোল ইনপুট দিয়ে দ্রুত হাজিরা"}
                    </CardTitle>
                    <CardDescription className={cn(isConfirming && "text-rose-600 font-bold")}>
                        {isConfirming 
                            ? "এই শ্রেণির হাজিরা আজ আগে একবার নেওয়া হয়েছে। আবার সেভ করলে আগের তথ্য মুছে যাবে।" 
                            : "তারিখ ও শ্রেণি সিলেক্ট করে উপস্থিত শিক্ষার্থীদের রোল নম্বরগুলো লিখুন। বাকিরা স্বয়ংক্রিয়ভাবে অনুপস্থিত হবে।"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                        <div className="space-y-2">
                            <Label className="font-black text-primary">তারিখ নির্বাচন</Label>
                            <DatePicker value={date} onChange={(d) => { d && onDateChange(d); setIsConfirming(false); }} />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-black text-primary">শ্রেণি নির্বাচন করুন</Label>
                            <Select value={selectedClass} onValueChange={(val) => { setSelectedClass(val); setIsConfirming(false); }}>
                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center mb-1">
                            <Label className="font-bold text-primary">উপস্থিত রোল নম্বরসমূহ (কমা বা স্পেস দিয়ে লিখুন)</Label>
                            {rollCount > 0 && (
                                <Badge className="bg-emerald-600 font-black animate-in zoom-in duration-300">
                                    মোট: {toBengaliNumber(rollCount)} জন
                                </Badge>
                            )}
                        </div>
                        <Textarea 
                            placeholder="উদা: ১, ২, ৫, ১০, ১২..." 
                            className={cn(
                                "min-h-[150px] text-lg font-black tracking-widest leading-relaxed transition-all",
                                isConfirming ? "border-rose-400 bg-rose-50/50" : "focus:ring-primary"
                            )}
                            value={rollsInput}
                            onChange={e => setRollsInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <div className="flex justify-between items-center mt-1">
                            <p className="text-[10px] text-muted-foreground italic font-bold">*** বাংলা বা ইংরেজি উভয় অংকেই রোল নম্বর লেখা যাবে।</p>
                            {isConfirming && (
                                <p className="text-xs font-black text-rose-600 animate-pulse flex items-center gap-1">
                                    <Plus className="h-3 w-3" /> আবার এন্টার দিলে সেভ হবে
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 gap-4">
                        {isConfirming && (
                            <Button variant="outline" onClick={() => setIsConfirming(false)} className="px-8 h-14 font-bold border-rose-200 text-rose-700 hover:bg-rose-50">
                                বাতিল
                            </Button>
                        )}
                        <Button 
                            onClick={handleSave} 
                            disabled={isProcessing || !rollsInput.trim() || !date}
                            className={cn(
                                "px-12 h-14 text-lg font-black shadow-xl transition-all",
                                isConfirming ? "bg-rose-600 hover:bg-rose-700 animate-in zoom-in-95" : "bg-primary"
                            )}
                        >
                            {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2" />}
                            {isConfirming ? "হ্যাঁ, নতুনভাবে সেভ করুন" : "হাজিরা সেভ করুন"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const MonthlySummaryBoard = ({ allStudents }: { allStudents: Student[] }) => {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const db = useFirestore();
    const { schoolInfo } = useSchoolInfo();
    const { selectedYear } = useAcademicYear();
    const { user } = useAuth();
    const { toast } = useToast();
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());
    const [attendanceData, setAttendanceData] = useState<DailyAttendance[]>([]);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const classes = ['6', '7', '8', '9', '10'];
    const isAdmin = user?.role === 'admin';

    const fetchSummaryData = useCallback(async () => {
        if (!db) return;
        setIsLoading(true);
        try {
            const year = parseInt(selectedYear);
            const month = parseInt(selectedMonth);
            const start = format(new Date(year, month, 1), 'yyyy-MM-dd');
            const end = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');

            const [attSnap, holidayList] = await Promise.all([
                getDocs(query(collection(db, 'attendance'), where('academicYear', '==', selectedYear))),
                getHolidays(db)
            ]);

            const allAttRecords = attSnap.docs.map(d => d.data() as DailyAttendance);
            const filteredAtt = allAttRecords.filter(r => r.date >= start && r.date <= end);

            setAttendanceData(filteredAtt);
            setHolidays(holidayList.map(h => h.date));
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [db, selectedYear, selectedMonth]);

    useEffect(() => { fetchSummaryData(); }, [fetchSummaryData]);

    const handleDeleteRecord = async (date: string, className: string) => {
        if (!db || !isAdmin) return;
        try {
            await deleteDailyAttendance(db, date, className, selectedYear);
            toast({ title: 'হাজিরা রেকর্ড মুছে ফেলা হয়েছে' });
            fetchSummaryData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteFullDay = async (date: string) => {
        if (!db || !isAdmin) return;
        try {
            const batch = writeBatch(db);
            const q = query(
                collection(db, 'attendance'),
                where("date", "==", date),
                where("academicYear", "==", selectedYear)
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            
            toast({ title: 'পুরো দিনের সকল হাজিরা রেকর্ড মুছে ফেলা হয়েছে' });
            fetchSummaryData();
        } catch (e) {
            console.error(e);
        }
    };

    const days = useMemo(() => {
        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth);
        const totalDays = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: totalDays }, (_, i) => i + 1);
    }, [selectedYear, selectedMonth]);

    const boardData = useMemo(() => {
        return days.map(day => {
            const dStr = format(new Date(parseInt(selectedYear), parseInt(selectedMonth), day), 'yyyy-MM-dd');
            const dObj = new Date(dStr);
            const isWeekend = dObj.getDay() === 5 || dObj.getDay() === 6;
            const isHolidayDay = holidays.includes(dStr);

            const row: any = { day, dateStr: dStr, isWeekend, isHolidayDay, totalPresent: 0, totalStudents: 0 };
            
            classes.forEach(cls => {
                const attRecord = attendanceData.find(r => r.date === dStr && r.className === cls);
                const classStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === cls);
                
                const presentCount = attRecord ? attRecord.attendance.filter(a => a.status === 'present').length : null;
                row[cls] = presentCount;
                if (presentCount !== null) {
                    row.totalPresent += presentCount;
                    row.totalStudents += classStudents.length;
                }
            });

            row.presentPercent = row.totalStudents > 0 ? (row.totalPresent / row.totalStudents) * 100 : 0;
            row.absentPercent = 100 - row.presentPercent;

            return row;
        });
    }, [days, attendanceData, holidays, selectedYear, selectedMonth, allStudents]);

    return (
        <div className="mt-4 space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 p-4 bg-white border-2 border-primary/10 rounded-xl shadow-sm no-print">
                <div className="space-y-2 flex-1 w-full max-w-xs">
                    <Label className="font-black text-primary block text-base">মাস নির্বাচন করুন</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="bg-white font-bold h-11 text-lg border-2"><SelectValue placeholder="মাস" /></SelectTrigger>
                        <SelectContent>
                            {BENGALI_MONTHS.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => window.print()} className="font-black h-11 px-10 shadow-md text-lg">
                    <Printer className="mr-2 h-4 w-4" /> বোর্ড প্রিন্ট করুন
                </Button>
            </div>

            <Card className="border-2 border-primary/20 shadow-xl overflow-hidden printable-area bg-white text-black p-0 sm:p-10">
                <style jsx global>{`
                    @media print {
                        @page { size: A4 landscape; margin: 0.4in !important; }
                        .printable-area { padding: 0 !important; margin: 0 !important; border: none !important; }
                        .printable-area table tr { height: 28px !important; }
                        .printable-area table td, .printable-area table th { padding: 2px 4px !important; font-size: 14px !important; border: 1px solid black !important; }
                        .no-print { display: none !important; }
                    }
                `}</style>
                <SchoolPrintHeader 
                    title={`মাসিক হাজিরা সারাংশ - ${BENGALI_MONTHS[parseInt(selectedMonth)]} ${toBengaliNumber(selectedYear)}`} 
                    schoolInfo={schoolInfo} 
                />
                
                <CardContent className="p-0">
                    <div className="table-container max-h-[600px] overflow-auto print:max-h-none print:overflow-visible">
                        <Table className="min-w-[1000px] border-separate border-spacing-0 border-collapse print:min-w-full">
                            <TableHeader className="sticky top-0 z-30 print:bg-white print:static">
                                <TableRow className="h-16 print:h-8">
                                    <TableHead className="text-center font-black border-r border-b w-48 bg-muted z-40 sticky left-0 shadow-[2px_0_0px_rgba(0,0,0,0.1)] print:static print:bg-white print:shadow-none print:border-black text-[14px]">তারিখ ও বার</TableHead>
                                    {classes.map(cls => (
                                        <TableHead key={cls} className="text-center font-black border-r border-b text-[14px] leading-tight print:border-black">{classNamesMap[cls]}</TableHead>
                                    ))}
                                    <TableHead className="text-center font-black border-r border-b bg-indigo-50 text-indigo-900 print:bg-white print:text-black print:border-black text-[14px]">মোট</TableHead>
                                    <TableHead className="text-center font-black border-r border-b bg-emerald-50 text-emerald-900 print:bg-white print:text-black print:border-black text-[14px]">শতকরা উপস্থিত</TableHead>
                                    <TableHead className="text-center font-black border-b bg-rose-50 text-rose-900 print:bg-white print:text-black print:border-black text-[14px]">শতকরা অনুপস্থিত</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={9} className="text-center py-24 italic text-lg font-bold">বিশ্লেষণ করা হচ্ছে...</TableCell></TableRow>
                                ) : boardData.map((row, i) => {
                                    const dObj = new Date(row.dateStr);
                                    const fullDateStr = format(dObj, 'dd-MM-yyyy');
                                    const dayName = format(dObj, 'EEEE', { locale: bn });
                                    const isOff = row.isWeekend || row.isHolidayDay;
                                    
                                    return (
                                        <TableRow key={i} className={cn(
                                            "h-12 transition-colors print:border-black",
                                            isOff ? "bg-red-100 hover:bg-red-200 print:bg-gray-100" : "hover:bg-slate-50"
                                        )}>
                                            <TableCell className={cn(
                                                "text-center font-black border-r whitespace-nowrap sticky left-0 z-20 shadow-[2px_0_0px_rgba(0,0,0,0.1)] print:static print:shadow-none print:border-black text-[14px] group/row",
                                                isOff ? "text-red-700 bg-red-200 print:bg-gray-100" : "text-slate-600 bg-white"
                                            )}>
                                                <div className="flex items-center justify-between gap-2 px-2">
                                                    <span>{toBengaliNumber(fullDateStr)} {dayName}</span>
                                                    {isAdmin && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <button className="text-rose-500 opacity-0 group-hover/row:opacity-100 transition-opacity no-print" title="পুরো দিন মুছুন">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="font-kalpurush">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="text-rose-700 font-black">পুরো দিনের সব হাজিরা মুছতে চান?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="font-bold text-base leading-relaxed">
                                                                        আপনি কি {toBengaliNumber(fullDateStr)} তারিখের **সকল শ্রেণির** হাজিরা রেকর্ড স্থায়ীভাবে মুছে ফেলতে চান? এটি আর ফিরে পাওয়া যাবে না।
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="font-bold">না, ফিরে যাই</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteFullDay(row.dateStr)} className="bg-destructive text-white font-black">হ্যাঁ, সব মুছুন</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </TableCell>
                                            {classes.map(cls => {
                                                const hasData = row[cls] !== null;
                                                return (
                                                    <TableCell key={cls} className="text-center font-black border-r border-b print:border-black text-base group relative">
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span>{hasData ? toBengaliNumber(row[cls]) : '-'}</span>
                                                            {hasData && isAdmin && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <button className="h-4 w-4 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity no-print" title="রেকর্ড মুছুন">
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent className="font-kalpurush">
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle className="text-rose-700 font-black">নিশ্চিত তো?</AlertDialogTitle>
                                                                            <AlertDialogDescription className="font-bold">
                                                                                আপনি কি {classNamesMap[cls]} শ্রেণির {toBengaliNumber(fullDateStr)} তারিখের হাজিরা রেকর্ডটি পুরোপুরি মুছে ফেলতে চান?
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel className="font-bold">না</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => handleDeleteRecord(row.dateStr, cls)} className="bg-destructive text-white">হ্যাঁ, মুছুন</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                )
                                            })}
                                            <TableCell className="text-center font-black border-r border-b bg-indigo-50/30 text-indigo-700 print:bg-white print:text-black print:border-black text-base">
                                                {row.totalPresent > 0 ? toBengaliNumber(row.totalPresent) : '-'}
                                            </TableCell>
                                            <TableCell className="text-center font-black border-r border-b bg-emerald-50/30 text-emerald-700 print:bg-white print:text-black print:border-black text-base">
                                                {row.totalPresent > 0 ? toBengaliNumber(row.presentPercent.toFixed(1)) + '%' : '-'}
                                            </TableCell>
                                            <TableCell className="text-center font-black border-b bg-rose-50/30 text-rose-700 print:bg-white print:text-black print:border-black text-base">
                                                {row.totalPresent > 0 ? toBengaliNumber(row.absentPercent.toFixed(1)) + '%' : '-'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const MissedAttendanceTab = ({ onTakeAttendance }: { onTakeAttendance: (date: Date) => void }) => {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    const [selectedClass, setSelectedClass] = useState<string>('6');
    const [selectedMonth, setSelectedMonth] = useState<string>(BENGALI_MONTHS[new Date().getMonth()]);
    const [missedDays, setMissedDays] = useState<Date[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isClient, setIsClient] = useState(false);

    const canTakeMissedAttendance = hasPermission('input:missed-attendance');

    useEffect(() => { setIsClient(true); }, []);

    const fetchMissedAttendance = useCallback(async () => {
        if (!db || !isClient) return;
        setIsLoading(true);
        try {
            const monthIndex = BENGALI_MONTHS.indexOf(selectedMonth);
            const year = parseInt(selectedYear);
            
            const start = new Date(year, monthIndex, 1);
            const end = new Date(year, monthIndex + 1, 0);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (start > today) {
                setMissedDays([]);
                setIsLoading(false);
                return;
            }

            const realEnd = end > today ? today : end;
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(realEnd, 'yyyy-MM-dd');

            const allDatesInMonth = eachDayOfInterval({ start, end: realEnd });
            const holidaysData = await getHolidays(db);
            const holidayDates = holidaysData.map(h => h.date);

            const q = query(
                collection(db, 'attendance'),
                where('academicYear', '==', selectedYear),
                where('className', '==', selectedClass)
            );
            const snap = await getDocs(q);
            const takenDates = snap.docs
                .map(doc => doc.data().date)
                .filter(d => d >= startStr && d <= endStr);

            const missed = allDatesInMonth.filter(date => {
                const ds = format(date, 'yyyy-MM-dd');
                const isWeekend = date.getDay() === 5 || date.getDay() === 6;
                const isHolidayDay = holidayDates.includes(ds);
                return !isWeekend && !isHolidayDay && !takenDates.includes(ds);
            });

            setMissedDays(missed.sort((a, b) => b.getTime() - a.getTime()));
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'তথ্য আনা সম্ভব হয়নি' });
        }
        setIsLoading(false);
    }, [db, isClient, selectedClass, selectedMonth, selectedYear, toast]);

    useEffect(() => {
        if (isClient) fetchMissedAttendance();
    }, [fetchMissedAttendance, isClient]);

    if (!isClient) return null;

    return (
        <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-white/50 items-end no-print">
                <div className="space-y-2">
                    <Label className="font-bold text-primary">শ্রেণি নির্বাচন</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="font-bold text-primary">মাস নির্বাচন</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {BENGALI_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={fetchMissedAttendance} disabled={isLoading} className="h-9 font-black text-xs">বকেয়া হাজিরা দেখুন</Button>
            </div>

            <Card className="border-2 border-amber-100 shadow-lg">
                <CardHeader className="bg-amber-50/50">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-amber-800 flex items-center gap-2">
                                <CalendarX className="h-5 w-5" /> বকেয়া হাজিরার তালিকা (Missed Days)
                            </CardTitle>
                            <CardDescription>স্কুল খোলা থাকা সত্ত্বেও যেসব দিনে হাজিরা নেওয়া হয়নি</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-white text-amber-800 border-amber-200 font-black h-8 px-4">
                            মোট বকেয়া: {toBengaliNumber(missedDays.length)} দিন
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-12 text-center italic text-muted-foreground flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>বিশ্লেষণ করা হচ্ছে...</span>
                        </div>
                    ) : missedDays.length === 0 ? (
                        <div className="p-12 text-center text-emerald-600 font-black text-lg">
                            অসাধারণ! এই মাসে এখন পর্যন্ত সকল কার্যদিবসের হাজিরা সম্পন্ন হয়েছে।
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="w-20 text-center">ক্রমিক</TableHead>
                                    <TableHead>তারিখ</TableHead>
                                    <TableHead>বার</TableHead>
                                    <TableHead className="text-right">কার্যক্রম</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {missedDays.map((date, idx) => (
                                    <TableRow key={date.getTime()} className="hover:bg-amber-50/50 h-12">
                                        <TableCell className="text-center font-bold">{toBengaliNumber(idx + 1)}</TableCell>
                                        <TableCell className="font-black text-slate-700">{format(date, 'd MMMM yyyy', { locale: bn })}</TableCell>
                                        <TableCell className="font-bold text-muted-foreground">{format(date, 'EEEE', { locale: bn })}</TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                size="sm" 
                                                onClick={() => {
                                                    if (canTakeMissedAttendance) onTakeAttendance(date);
                                                    else toast({ variant: 'destructive', title: 'দুঃখিত, আপনার এটি করার অনুমতি নেই।' });
                                                }} 
                                                className="bg-amber-600 hover:bg-amber-700 font-bold h-8 text-[10px]"
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> পুনরায় হাজিরা নিন
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

const AbsentStudentListTab = ({ allStudents }: { allStudents: Student[] }) => {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    const [selectedMonth, setSelectedMonth] = useState<string>(BENGALI_MONTHS[new Date().getMonth()]);
    const [selectedClass, setSelectedClass] = useState<string>('6');
    const [absentData, setAbsentData] = useState<{student: Student, count: number}[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAbsentees = useCallback(async () => {
        if (!db || !selectedClass) return;
        setIsLoading(true);
        try {
            const monthIndex = BENGALI_MONTHS.indexOf(selectedMonth);
            const year = parseInt(selectedYear);
            const start = format(new Date(year, monthIndex, 1), 'yyyy-MM-dd');
            const end = format(new Date(year, monthIndex + 1, 0), 'yyyy-MM-dd');

            const q = query(
                collection(db, 'attendance'),
                where('academicYear', '==', selectedYear),
                where('className', '==', selectedClass)
            );
            const snap = await getDocs(q);
            const records = snap.docs
                .map(doc => doc.data() as DailyAttendance)
                .filter(r => r.date >= start && r.date <= end);

            const studentsInClass = allStudents.filter(s => s.academicYear === selectedYear && s.className === selectedClass);
            
            const results = studentsInClass.map(student => {
                let count = 0;
                records.forEach(r => {
                    const att = r.attendance.find(a => a.studentId === student.id);
                    if (att?.status === 'absent') count++;
                });
                return { student, count };
            }).filter(res => res.count > 0).sort((a, b) => (Number(a.student.roll) || 0) - (Number(b.student.roll) || 0));

            setAbsentData(results);
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    }, [db, selectedClass, selectedMonth, selectedYear, allStudents]);

    useEffect(() => { fetchAbsentees(); }, [fetchAbsentees]);

    return (
        <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-white/50 items-end no-print">
                <div className="space-y-2">
                    <Label className="font-bold text-primary">শ্রেণি নির্বাচন</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="font-bold text-primary">মাস নির্বাচন</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {BENGALI_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={fetchAbsentees} disabled={isLoading} className="h-9 font-black text-xs">তথ্য রিফ্রেশ করুন</Button>
            </div>

            <Card className="border-2 border-rose-100 shadow-md">
                <CardHeader className="bg-rose-50/30 border-b">
                    <CardTitle className="text-rose-700 flex items-center gap-2">
                        <UserX className="h-5 w-5" /> অনুপস্থিত শিক্ষার্থীর তালিকা ({selectedMonth})
                    </CardTitle>
                    <CardDescription>মাসে অন্তত ১ দিন অনুপস্থিত শিক্ষার্থীদের তালিকা</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-20 text-center italic text-muted-foreground flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>বিশ্লেষণ করা হচ্ছে...</span>
                        </div>
                    ) : absentData.length === 0 ? (
                        <div className="p-20 text-center text-emerald-600 font-black text-lg italic">
                            এই মাসে কোনো শিক্ষার্থী অনুপস্থিত ছিল না।
                        </div>
                    ) : (
                        <div className="table-container">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-16 text-center font-black">রোল</TableHead>
                                        <TableHead className="font-black">নাম ও মোবাইল</TableHead>
                                        <TableHead className="text-center font-black">অনুপস্থিত দিন</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {absentData.map(({ student, count }) => (
                                        <TableRow key={student.id} className="hover:bg-rose-50 transition-colors h-14">
                                            <TableCell className="text-center font-black text-lg">{toBengaliNumber(student.roll)}</TableCell>
                                            <TableCell>
                                                <p className="font-black text-slate-800">{student.studentNameBn}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground">{student.guardianMobile || '-'}</p>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="destructive" className="font-black px-4 h-7 text-sm">{toBengaliNumber(count)} দিন</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

const AbsenceAlertsTab = ({ allStudents }: { allStudents: Student[] }) => {
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    const [selectedClass, setSelectedClass] = useState('6');
    const [alerts, setAlerts] = useState<StudentConsecutiveAbsence[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAlerts = useCallback(async () => {
        if (!db || !selectedClass) return;
        setIsLoading(true);
        const data = await getConsecutiveAbsences(db, selectedClass, selectedYear);
        
        const sortedData = data.sort((a, b) => {
            const studentA = allStudents.find(s => s.id === a.studentId);
            const studentB = allStudents.find(s => s.id === b.studentId);
            const rollA = Number(studentA?.roll) || 0;
            const rollB = Number(studentB?.roll) || 0;
            return rollA - rollB;
        });

        setAlerts(sortedData);
        setIsLoading(false);
    }, [db, selectedClass, selectedYear, allStudents]);

    useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-white/50 no-print">
                <div className="space-y-2 flex-1">
                    <Label className="font-bold text-primary">শ্রেণি নির্বাচন করুন</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={fetchAlerts} disabled={isLoading} className="h-9 font-black text-xs">রিফ্রেশ করুন</Button>
            </div>

            <Card className="border-2 border-red-100 shadow-lg overflow-hidden">
                <CardHeader className="bg-red-50/50 border-b">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-red-900 flex items-center gap-2">
                                <Plus className="h-5 w-5" /> অনুপস্থিতি সতর্কবার্তা (Absence Alerts)
                            </CardTitle>
                            <CardDescription>টানা ৩ দিন বা তার বেশি অনুপস্থিত শিক্ষার্থীদের তালিকা</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-20 text-center italic flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>বিশ্লেষণ করা হচ্ছে...</span>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="p-20 text-center text-emerald-600 font-black text-lg italic">টানা অনুপস্থিত কোনো শিক্ষার্থী পাওয়া যায়নি।</div>
                    ) : (
                        <div className="table-container">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-16 text-center font-black">ক্রমিক</TableHead>
                                        <TableHead className="w-16 text-center font-black">রোল</TableHead>
                                        <TableHead className="font-black">নাম ও মোবাইল</TableHead>
                                        <TableHead className="text-center font-black">অনুপস্থিতি (টানা)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {alerts.map((alert, idx) => {
                                        const student = allStudents.find(s => s.id === alert.studentId);
                                        return (
                                            <TableRow key={alert.studentId} className="h-14 hover:bg-rose-50/50">
                                                <TableCell className="text-center font-bold">{toBengaliNumber(idx + 1)}</TableCell>
                                                <TableCell className="text-center font-black text-lg">{toBengaliNumber(student?.roll || '-')}</TableCell>
                                                <TableCell>
                                                    <p className="font-black text-slate-800">{student?.studentNameBn}</p>
                                                    <p className="text-[10px] font-bold text-muted-foreground">{student?.guardianMobile || '-'}</p>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="destructive" className="font-black text-sm px-4 h-7">{toBengaliNumber(alert.absentDays)} দিন</Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

const ReportSheet = ({ classId, students, startDate, endDate }: { classId: string, students: Student[], startDate?: Date, endDate?: Date }) => {
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { schoolInfo } = useSchoolInfo();
    const { user } = useAuth();
    const [reportData, setReportData] = useState<StudentReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user) return;

        const fetchAttendance = async () => {
            setIsLoading(true);
            try {
                const allAttendanceFromDb = await getAttendanceFromStorage(db);
                const allAttendanceForClass = allAttendanceFromDb.filter(
                    att => att.academicYear === selectedYear && att.className === classId
                );

                const allAttendance = allAttendanceForClass.filter(att => {
                    if (!startDate || !endDate) return true;
                    const attDate = new Date(att.date);
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    return attDate >= start && attDate <= end;
                });
                
                const studentReports = students.map(student => {
                    let presentDays = 0;
                    let absentDays = 0;

                    allAttendance.forEach(dailyRecord => {
                        const studentAttendance = dailyRecord.attendance.find(a => a.studentId === student.id);
                        if (studentAttendance) {
                            if (studentAttendance.status === 'present') presentDays++;
                            else absentDays++;
                        }
                    });

                    return {
                        student: student,
                        presentDays,
                        absentDays,
                        totalDays: allAttendance.length,
                    };
                });

                setReportData(studentReports);
            } catch (e) {
                console.error(e);
            }
            setIsLoading(false);
        }

        fetchAttendance();
    }, [classId, students, selectedYear, db, user, startDate, endDate]);

    if (isLoading) return <div className="p-12 text-center italic text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" /> <span>রিপোর্ট তৈরি হচ্ছে...</span></div>;

    if (students.length === 0) return <p className="text-center text-muted-foreground p-8">এই শ্রেণিতে কোনো শিক্ষার্থী নেই।</p>;

    return (
        <div className="p-0 sm:p-10 bg-white text-black font-kalpurush printable-area min-h-screen">
            <style jsx global>{`
                @media print {
                    @page { size: A4 portrait; margin: 0.4in !important; }
                    .printable-area { padding: 0 !important; margin: 0 !important; }
                    .printable-area table tr { height: 32px !important; }
                    .printable-area table td, .printable-area table th { padding: 4px 8px !important; border: 1px solid black !important; font-size: 14px !important; }
                    .no-print { display: none !important; }
                }
            `}</style>
            <SchoolPrintHeader 
                title={`${classNamesMap[classId]} শ্রেণির হাজিরা রিপোর্ট`} 
                schoolInfo={schoolInfo} 
                startDate={startDate}
                endDate={endDate}
            />
            
            <div className="table-container !max-h-none !overflow-visible border-black">
                <Table className="border-collapse border-black print:border-black print:border">
                    <TableHeader className="bg-muted/50 sticky top-0 z-10 print:static print:bg-white">
                        <TableRow className="print:border-black h-12">
                            <TableHead className="w-20 text-center font-black print:border-black print:border text-base">রোল</TableHead>
                            <TableHead className="font-black print:border-black print:border text-base">শিক্ষার্থীর নাম ও মোবাইল</TableHead>
                            <TableHead className="text-center font-black print:border-black print:border text-base">মোট কার্যদিবস</TableHead>
                            <TableHead className="text-center font-black print:border-black print:border text-base">উপস্থিত</TableHead>
                            <TableHead className="text-center font-black print:border-black print:border text-base">অনুপস্থিত</TableHead>
                            <TableHead className="text-right font-black print:border-black print:border text-base">উপস্থিতি (%)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reportData.map(report => (
                            <TableRow key={report.student.id} className="hover:bg-accent/5 transition-colors print:border-black h-12">
                                <TableCell className="text-center font-black print:border-black print:border text-base">{toBengaliNumber(report.student.roll)}</TableCell>
                                <TableCell className="print:border-black print:border text-base">
                                    <p className="font-bold text-slate-700">{report.student.studentNameBn}</p>
                                    <p className="text-[12px] text-muted-foreground font-bold">{report.student.guardianMobile || '-'}</p>
                                </TableCell>
                                <TableCell className="text-center font-medium print:border-black print:border text-base">{toBengaliNumber(report.totalDays)}</TableCell>
                                <TableCell className="text-center text-emerald-600 font-black print:border-black print:border text-base">{toBengaliNumber(report.presentDays)}</TableCell>
                                <TableCell className="text-center text-rose-600 font-black print:border-black print:border text-base">{toBengaliNumber(report.absentDays)}</TableCell>
                                <TableCell className="text-right font-black text-emerald-700 print:border-black print:border text-base">
                                    {report.totalDays > 0 ? 
                                        toBengaliNumber(((report.presentDays / report.totalDays) * 100).toFixed(1)) + '%' 
                                        : 'N/A'
                                    }
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

const AttendanceReportTab = ({ allStudents }: { allStudents: Student[] }) => {
    const { selectedYear } = useAcademicYear();
    const [reportType, setReportType] = useState<'class' | 'monthly'>('monthly');
    const [startDate, setStartDate] = useState<Date | undefined>(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const [endDate, setEndDate] = useState<Date | undefined>(new Date());
    
    const studentsForYear = useMemo(() => {
        return allStudents.filter(student => student.academicYear === selectedYear);
    }, [allStudents, selectedYear]);
    const classes = ['6', '7', '8', '9', '10'];

    const getStudentsByClass = (className: string): Student[] => {
        return studentsForYear.filter((student) => student.className === className);
    };

    return (
        <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            <Tabs value={reportType} onValueChange={(v: any) => setReportType(v)}>
                <TabsList className="bg-slate-200/50 p-1 mb-4 h-12 w-full max-w-md no-print">
                    <TabsTrigger value="monthly" className="font-black flex-1 h-full">মাসিক হাজিরা বোর্ড</TabsTrigger>
                    <TabsTrigger value="class" className="font-black flex-1 h-full">শ্রেণিভিত্তিক রিপোর্ট</TabsTrigger>
                </TabsList>

                <TabsContent value="monthly">
                    <MonthlySummaryBoard allStudents={studentsForYear} />
                </TabsContent>

                <TabsContent value="class" className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4 p-4 border-2 border-dashed rounded-lg items-end bg-white/50 no-print">
                        <div className="w-full space-y-2 flex-1">
                            <Label className="font-bold text-primary flex items-gap-2">শুরুর তারিখ</Label>
                            <DatePicker value={startDate} onChange={setStartDate} placeholder="শুরুর তারিখ" />
                        </div>
                        <div className="w-full space-y-2 flex-1">
                            <Label className="font-bold text-primary flex items-gap-2">শেষের তারিখ</Label>
                            <DatePicker value={endDate} onChange={setEndDate} placeholder="শেষের তারিখ" />
                        </div>
                        <Button onClick={() => window.print()} className="font-black h-10 px-8 shadow-md">
                            <Printer className="mr-2 h-4 w-4" /> রিপোর্ট প্রিন্ট
                        </Button>
                    </div>
                    <Tabs defaultValue="6">
                        <TabsList className="grid w-full grid-cols-5 h-auto flex-wrap bg-muted p-1 no-print">
                            {classes.map((className) => (
                                <TabsTrigger key={className} value={className} className="py-2 text-xs sm:text-sm font-black">
                                    {classNamesMap[className]}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {classes.map((className) => (
                            <TabsContent key={className} value={className}>
                                <Card className="border-2 border-primary/5 shadow-md bg-white">
                                    <CardContent className="p-0">
                                        <ReportSheet classId={className} students={getStudentsByClass(className)} startDate={startDate} endDate={endDate} />
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        ))}
                    </Tabs>
                </TabsContent>
            </Tabs>
        </div>
    );
};

// --- Main Page Component ---

export default function AttendancePage() {
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    const { selectedYear } = useAcademicYear();
    const [isClient, setIsClient] = useState(false);
    const isOnline = useOnlineStatus();
    
    const [activeSection, setActiveSection] = useState('digital-attendance');
    const [attendanceDate, setAttendanceDate] = useState<Date | undefined>(undefined);

    useEffect(() => { setIsClient(true); }, []);

    useEffect(() => {
        if (!db || !user) return;
        setIsLoading(true);
        const studentsQuery = query(collection(db, "students"), orderBy("roll"));

        const unsubscribe = onSnapshot(studentsQuery, (querySnapshot) => {
            const studentsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), dob: doc.data().dob?.toDate(), })) as Student[];
            setAllStudents(studentsData);
            setIsLoading(false);
        }, (error: FirestoreError) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'students', operation: 'list' }));
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, user]);

    const canInputQuickRoll = hasPermission('input:quick-roll-attendance');
    const canViewMissedAttendance = hasPermission('view:missed-attendance');
    const canViewAbsentList = hasPermission('view:absent-student-list');

    const handleTakeMissedAttendance = (date: Date) => {
        setAttendanceDate(date);
        setActiveSection('digital-attendance');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const sidebarItems = useMemo(() => {
        const items = [
            { id: 'digital-attendance', label: 'ডিজিটাল হাজিরা', icon: CalendarCheck, color: 'text-indigo-600 bg-indigo-50' },
        ];
        if (canInputQuickRoll) {
            items.push({ id: 'quick-roll', label: 'রোল ইনপুট', icon: Plus, color: 'text-emerald-600 bg-emerald-50' });
        }
        items.push({ id: 'report', label: 'রিপোর্ট ও বোর্ড', icon: ListChecks, color: 'text-violet-600 bg-violet-50' });
        
        if (canViewAbsentList) {
            items.push({ id: 'absent-list', label: 'অনুপস্থিত শিক্ষার্থীর তালিকা', icon: UserX, color: 'text-rose-600 bg-rose-50' });
        }
        if (canViewMissedAttendance) {
            items.push({ id: 'missed-attendance', label: 'বকেয়া হাজিরা', icon: CalendarX, color: 'text-amber-600 bg-amber-50' });
        }
        
        items.push({ id: 'alerts', label: 'সতর্কবার্তা', icon: Plus, color: 'text-rose-600 bg-rose-50' });
        
        return items;
    }, [canInputQuickRoll, canViewMissedAttendance, canViewAbsentList]);
    
    if (!isClient) return null;

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-10 pb-40">
                <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row gap-8">
                    {/* Sidebar Navigation */}
                    <aside className="w-full md:w-64 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
                        <div className="mb-6 px-4 hidden md:block">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">হাজিরা ব্যবস্থাপনা</h2>
                            <Badge className={cn(
                                "mt-2 font-black text-[10px] px-3 gap-1",
                                isOnline ? "bg-emerald-600" : "bg-rose-600"
                            )}>
                                {isOnline ? <><Wifi className="h-3 w-3" /> অনলাইন</> : <><WifiOff className="h-3 w-3" /> অফলাইন (লোকাল)</>}
                            </Badge>
                        </div>
                        <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">
                            {sidebarItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={cn(
                                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit",
                                        activeSection === item.id 
                                            ? "bg-white shadow-md text-primary scale-105" 
                                            : "text-muted-foreground hover:bg-slate-200/50"
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

                    {/* Content Area */}
                    <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4">
                        <div className="p-4 sm:p-6 lg:p-8 flex-1">
                            {!isOnline && (
                                <div className="mb-6 p-4 bg-rose-50 border-2 border-dashed border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 animate-pulse no-print">
                                    <WifiOff className="h-6 w-6" />
                                    <p className="font-black">আপনি অফলাইনে আছেন। আপনার দেওয়া হাজিরাগুলো এই ডিভাইসে সংরক্ষিত হচ্ছে এবং ইন্টারনেট সংযোগ পাওয়া মাত্রই সিঙ্ক হবে।</p>
                                </div>
                            )}
                            {isLoading && allStudents.length === 0 ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-64 w-full" />
                                </div>
                            ) : (
                                <>
                                    <div className="mb-6 border-b pb-4 no-print">
                                        <h2 className="text-2xl font-black text-slate-800">
                                            {sidebarItems.find(i => i.id === activeSection)?.label}
                                        </h2>
                                        {isClient && <p className="text-xs font-bold text-muted-foreground mt-1">শিক্ষাবর্ষ: {toBengaliNumber(selectedYear)}</p>}
                                    </div>

                                    {activeSection === 'digital-attendance' && <DigitalAttendanceTab allStudents={allStudents} date={attendanceDate} onDateChange={setAttendanceDate} />}
                                    {activeSection === 'quick-roll' && <QuickRollAttendanceTab allStudents={allStudents} date={attendanceDate} onDateChange={setAttendanceDate} />}
                                    {activeSection === 'report' && <AttendanceReportTab allStudents={allStudents} />}
                                    {activeSection === 'absent-list' && <AbsentStudentListTab allStudents={allStudents} />}
                                    {activeSection === 'missed-attendance' && <MissedAttendanceTab onTakeAttendance={handleTakeMissedAttendance} />}
                                    {activeSection === 'alerts' && <AbsenceAlertsTab allStudents={allStudents} />}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

interface StudentReport {
    student: Student;
    presentDays: number;
    absentDays: number;
    totalDays: number;
}
