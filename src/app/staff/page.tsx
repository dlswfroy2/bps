'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { deleteStaff, Staff, staffFromDoc } from '@/lib/staff-data';
import { 
    Eye, FilePen, Trash2, Clock, Calendar, Briefcase, Check, X, Search, 
    Loader2, List, ClipboardCheck, FileBarChart, ChevronRight, Plus, 
    Printer, Save, RotateCcw, Edit2, CheckCircle2, UserX, UserCheck, Users, LogIn, LogOut, AlertTriangle, LayoutGrid, User, BookOpen, TrendingUp, CalendarDays, MapPin, GraduationCap
} from 'lucide-react';
import Link from 'next/link';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, orderBy, FirestoreError, getDocs, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isAfter, isBefore } from 'date-fns';
import { bn } from 'date-fns/locale';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StaffDailyAttendance, StaffMemberAttendance, getStaffAttendanceByDate, saveStaffAttendance, getStaffAttendanceForRange, LeaveType } from '@/lib/staff-attendance-data';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { getHolidays, isHoliday, Holiday } from '@/lib/holiday-data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { getFullRoutine, ClassRoutine } from '@/lib/routine-data';

// --- Constants ---
const LEAVE_TYPES: { id: LeaveType; label: string; color: string }[] = [
    { id: 'CL', label: 'নৈমিত্তিক (CL)', color: 'bg-blue-100 text-blue-700' },
    { id: 'SL', label: 'অসুস্থতা (SL)', color: 'bg-rose-100 text-rose-700' },
    { id: 'EL', label: 'অর্জিত (EL)', color: 'bg-emerald-100 text-emerald-700' },
    { id: 'DL', label: 'দায়িত্বকালীন (DL)', color: 'bg-amber-100 text-amber-700' },
    { id: 'Other', label: 'অন্যান্য', color: 'bg-slate-100 text-slate-700' },
];

const TEACHER_ORDER = [
    'আনিছুর রহমান',
    'নীলা রায়',
    'জান্নাতুন',
    'যুধিষ্ঠির চন্দ্র রায়',
    'ধনঞ্জয় কুমার রায়',
    'মো: আরিফুর রহমান',
    'মোছা: ওবায়দা আক্তার',
    'সারমিন আক্তার',
    'মোছা: শান্তি আরা',
    'মো :মাহাবুর রহমান'
];

const STAFF_ORDER = [
    'মো: আবুল কালাম',
    'মো: রাকিবুল ইসলাম',
    'মোছা: নুর নেহার বেগম'
];

const dayMap = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const periodLabels = ["১ম", "২য়", "৩য়", "৪র্থ", "৫ম", "৬ষ্ঠ"];
const classNamesMap: { [key: string]: string } = { '6': 'ষষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম' };

function toBengaliNumber(str: string | number) {
  if (!str && str !== 0) return '';
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
}

const convertToEnglishDigits = (str: string) => {
    if (!str) return '';
    const bnToEn: Record<string, string> = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    let result = str.replace(/[০-৯]/g, (d) => bnToEn[d]);
    result = result.replace(/এএম/g, 'AM').replace(/পিএম/g, 'PM');
    return result;
};

const getSystemTimeEn = () => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const ensureAmPm = (timeStr: string, defaultType: 'AM' | 'PM') => {
    const cleaned = convertToEnglishDigits(timeStr).trim().toUpperCase();
    if (!cleaned) return '';
    if (cleaned.includes('AM') || cleaned.includes('PM')) return cleaned;
    return `${cleaned} ${defaultType}`;
};

const parseSubjectTeacher = (cell: string): { subject: string, teacher: string | null } => {
    if (!cell) return { subject: '', teacher: null };
    const trimmedCell = cell.trim();
    if (!trimmedCell.includes(' - ')) {
        return { subject: trimmedCell, teacher: null };
    }
    const parts = trimmedCell.split(' - ');
    const teacher = parts.pop()?.trim() || null;
    const subject = parts.join(' - ').trim();
    return { subject, teacher };
};


const isEnActive = () => typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');

const getStaffDisplayName = (staff?: Staff | null) => {
    if (!staff) return '';
    const isEn = isEnActive();
    if (isEn && staff.nameEn && staff.nameEn.trim()) {
        return staff.nameEn.trim();
    }
    return staff.nameBn || '';
};

// --- Sub Tab: Staff Profile Section ---
const StaffProfileTab = ({ staffList, academicYear }: { staffList: Staff[], academicYear: string }) => {
    const db = useFirestore();
    const { toast } = useToast();
    const [selectedStaffId, setSelectedStaffId] = useState<string>('');
    const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
    const [endDate, setEndDate] = useState<Date | undefined>(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState<StaffDailyAttendance[]>([]);
    const [routineRecords, setRoutineRecords] = useState<ClassRoutine[]>([]);
    const [holidays, setHolidays] = useState<string[]>([]);

    const selectedStaff = useMemo(() => staffList.find(s => s.id === selectedStaffId), [staffList, selectedStaffId]);

    const fetchData = useCallback(async () => {
        if (!db || !selectedStaffId || !startDate || !endDate) return;
        setIsLoading(true);
        try {
            const [attRes, routineRes, holidayRes] = await Promise.all([
                getStaffAttendanceForRange(db, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')),
                getFullRoutine(db, academicYear),
                getHolidays(db)
            ]);
            setAttendanceData(attRes);
            setRoutineRecords(routineRes);
            setHolidays(holidayRes.map(h => h.date));
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    }, [db, selectedStaffId, startDate, endDate, academicYear]);

    useEffect(() => {
        if (selectedStaffId) fetchData();
    }, [fetchData, selectedStaffId]);

    const teacherRoutineInfo = useMemo(() => {
        if (!selectedStaff || selectedStaff.staffType !== 'teacher' || routineRecords.length === 0) return null;
        
        const teacherName = selectedStaff.nameBn.trim();
        const dailySchedule: Record<string, any[]> = {};
        const subjectSet = new Set<string>();
        let totalClasses = 0;

        routineRecords.forEach(routine => {
            const day = routine.day;
            if (!dailySchedule[day]) dailySchedule[day] = Array(6).fill(null);
            
            routine.periods.forEach((cell, idx) => {
                const { subject, teacher: routineTeacher } = parseSubjectTeacher(cell);
                
                if (routineTeacher) {
                    const teachersInCell = routineTeacher.split('/').map(t => t.trim()).filter(Boolean);
                    
                    const isMatch = teachersInCell.some(t => 
                        teacherName.includes(t) || t.includes(teacherName)
                    );

                    if (isMatch) {
                        dailySchedule[day][idx] = { className: routine.className, subject };
                        subjectSet.add(subject);
                        totalClasses++;
                    }
                }
            });
        });

        return { dailySchedule, subjects: Array.from(subjectSet), totalClasses };
    }, [selectedStaff, routineRecords]);

    const attStats = useMemo(() => {
        if (!selectedStaffId || !attendanceData || !startDate || !endDate) return { present: 0, leave: 0, absent: 0, total: 0 };
        
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        let present = 0, leave = 0, absent = 0, totalWorkDays = 0;

        daysInRange.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isWeekend = day.getDay() === 5 || day.getDay() === 6;
            const isHolidayDay = holidays.includes(dateStr);
            
            if (!isWeekend && !isHolidayDay && !isBefore(day, new Date(2020, 0, 1)) && !isAfter(day, new Date())) {
                totalWorkDays++;
                const record = attendanceData.find(r => r.date === dateStr);
                const att = record?.attendance.find(a => a.staffId === selectedStaffId);
                if (att) {
                    if (att.status === 'present') present++;
                    else if (att.status === 'leave') leave++;
                } else {
                    absent++;
                }
            }
        });

        return { present, leave, absent, total: totalWorkDays };
    }, [selectedStaffId, attendanceData, holidays, startDate, endDate]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end p-6 border-2 border-primary/10 rounded-2xl bg-white shadow-sm">
                <div className="space-y-2 md:col-span-1">
                    <Label className="font-black text-primary flex items-center gap-2"><User className="h-4 w-4" /> শিক্ষক বা কর্মচারী নির্বাচন করুন</Label>
                    <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                        <SelectTrigger className="h-11 bg-slate-50 border-2 font-bold"><SelectValue placeholder="নাম সিলেক্ট করুন" /></SelectTrigger>
                        <SelectContent>
                            {staffList.map(s => (
                                <SelectItem key={s.id} value={s.id}>{getStaffDisplayName(s)} ({s.designation})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="font-bold">হাতে</Label>
                    <DatePicker value={startDate} onChange={setStartDate} />
                </div>
                <div className="space-y-2">
                    <Label className="font-bold">পর্যন্ত</Label>
                    <DatePicker value={endDate} onChange={setEndDate} />
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="font-bold text-muted-foreground">প্রোফাইল লোড হচ্ছে...</p>
                </div>
            ) : selectedStaff ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="border-[4px] border-black rounded-3xl overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                            <div className="h-24 bg-primary relative">
                                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                                    <Avatar className="h-28 w-28 border-4 border-white shadow-xl">
                                        <AvatarImage src={selectedStaff.photoUrl} className="object-cover" />
                                        <AvatarFallback className="bg-muted text-2xl font-black">{selectedStaff.nameBn.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                </div>
                            </div>
                            <CardContent className="pt-16 text-center pb-8">
                                <h2 className="text-2xl font-black text-slate-900">{getStaffDisplayName(selectedStaff)}</h2>
                                <p className="font-bold text-primary mb-4">{selectedStaff.designation}</p>
                                <div className="flex justify-center gap-2">
                                    <Badge variant="outline" className="bg-primary/5 font-black border-primary/20">{selectedStaff.employeeId}</Badge>
                                    <Badge variant="outline" className={cn("font-black", selectedStaff.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200")}>
                                        {selectedStaff.isActive ? 'সক্রিয়' : 'অনিবন্ধিত'}
                                    </Badge>
                                </div>
                                <div className="mt-6 space-y-3 text-left bg-slate-50 p-4 rounded-xl border">
                                    {selectedStaff.staffType === 'teacher' && (
                                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                                            <Briefcase className="h-4 w-4 text-primary" /> <span>বিষয়: {selectedStaff.subject || 'N/A'}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                                        <Clock className="h-4 w-4 text-primary" /> <span>যোগদান: {toBengaliNumber(format(new Date(selectedStaff.joinDate), "dd-MM-yyyy", { locale: bn }))}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                                        <ChevronRight className="h-4 w-4 text-primary" /> <span>মোবাইল: {toBengaliNumber(selectedStaff.mobile)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-[4px] border-black rounded-3xl bg-white shadow-[8px_8px_0px_rgba(0,0,0,0.1)]">
                            <CardHeader className="bg-emerald-50 border-b-[3px] border-black">
                                <CardTitle className="text-lg font-black flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-700" /> হাজিরা সারসংক্ষেপ</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-emerald-100 rounded-xl text-center border-2 border-emerald-200">
                                        <p className="text-[10px] font-black uppercase text-emerald-700">উপস্থিত</p>
                                        <p className="text-2xl font-black text-emerald-950">{toBengaliNumber(attStats.present)} দিন</p>
                                    </div>
                                    <div className="p-3 bg-rose-100 rounded-xl text-center border-2 border-rose-200">
                                        <p className="text-[10px] font-black uppercase text-rose-700">অনুপস্থিত</p>
                                        <p className="text-2xl font-black text-rose-950">{toBengaliNumber(attStats.absent)} দিন</p>
                                    </div>
                                    <div className="p-3 bg-blue-100 rounded-xl text-center border-2 border-blue-200">
                                        <p className="text-[10px] font-black uppercase text-blue-700">ছুটি (Leave)</p>
                                        <p className="text-2xl font-black text-blue-950">{toBengaliNumber(attStats.leave)} দিন</p>
                                    </div>
                                    <div className="p-3 bg-slate-100 rounded-xl text-center border-2 border-slate-200">
                                        <p className="text-[10px] font-black uppercase text-slate-600">মোট কর্মদিবস</p>
                                        <p className="text-2xl font-black text-slate-900">{toBengaliNumber(attStats.total)} দিন</p>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <div className="flex justify-between text-xs font-black mb-1">
                                        <span>উপস্থিতির হার</span>
                                        <span className="text-emerald-700">{toBengaliNumber(attStats.total > 0 ? ((attStats.present / attStats.total) * 100).toFixed(1) : 0)}%</span>
                                    </div>
                                    <Progress value={attStats.total > 0 ? (attStats.present / attStats.total) * 100 : 0} className="h-2" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        {/* Weekly class schedule is only for teachers */}
                        {selectedStaff.staffType === 'teacher' && (
                            <Card className="border-[4px] border-black rounded-3xl bg-white shadow-[8px_8px_0px_rgba(0,0,0,0.1)]">
                                <CardHeader className="bg-primary/5 border-b-[3px] border-black flex flex-row justify-between items-center">
                                    <div>
                                        <CardTitle className="text-xl font-black flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> সাপ্তাহিক ক্লাস সিডিউল</CardTitle>
                                        <CardDescription className="font-bold">রুটিন অনুযায়ী ক্লাস লোড</CardDescription>
                                    </div>
                                    <Badge variant="secondary" className="font-black text-base h-10 px-6 bg-primary text-white shadow-md">মোট ক্লাস: {toBengaliNumber(teacherRoutineInfo?.totalClasses || 0)} টি</Badge>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    {teacherRoutineInfo?.totalClasses === 0 ? (
                                        <div className="p-12 text-center border-2 border-dashed rounded-2xl italic text-muted-foreground font-bold">রুটিনে এই শিক্ষকের কোনো ক্লাস পাওয়া যায়নি।</div>
                                    ) : (
                                        <div className="space-y-8">
                                            <div className="p-4 bg-muted/20 rounded-2xl border-2 border-dashed">
                                                <p className="text-xs font-black text-muted-foreground uppercase mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4" /> নিয়মিত পাঠদানের বিষয়সমূহ:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {teacherRoutineInfo?.subjects.map(s => <Badge key={s} className="font-black bg-white text-primary border-2 border-primary/20 h-auto py-1 px-4">{s}</Badge>)}
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto rounded-xl border-2 border-black">
                                                <Table>
                                                    <TableHeader className="bg-slate-100">
                                                        <TableRow className="h-12 border-b-2 border-black">
                                                            <TableHead className="font-black text-black border-r-2 border-black text-center w-24">বার</TableHead>
                                                            {periodLabels.map(p => <TableHead key={p} className="text-center font-black text-black border-r last:border-0 text-xs">{p} পিরিয়ড</TableHead>)}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার"].map(day => (
                                                            <TableRow key={day} className="h-16 hover:bg-slate-50 border-b last:border-0 transition-colors">
                                                                <TableCell className="font-black border-r-2 border-black text-center bg-gray-50/50">{day}</TableCell>
                                                                {teacherRoutineInfo?.dailySchedule[day]?.map((period, pIdx) => (
                                                                    <TableCell key={pIdx} className="text-center border-r last:border-0 p-1">
                                                                        {period ? (
                                                                            <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-primary/5 border border-primary/20 h-full min-h-[50px]">
                                                                                <span className="font-black text-[11px] leading-tight text-blue-900 mb-1">{period.subject}</span>
                                                                                <Badge variant="outline" className="h-auto py-0.5 px-2 text-[8px] font-black border-slate-300 whitespace-nowrap">
                                                                                    {classNamesMap[period.className] || period.className} শ্রেণি
                                                                                </Badge>
                                                                            </div>
                                                                        ) : <span className="text-muted-foreground/30">-</span>}
                                                                    </TableCell>
                                                                ))}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        <Card className="border-[4px] border-black rounded-3xl bg-white shadow-[8px_8px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                            <CardHeader className="bg-muted/30 border-b-[3px] border-black">
                                <CardTitle className="text-lg font-black flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-slate-800" /> সময়সীমার মধ্যে হাজিরা রেকর্ড</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[400px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                            <TableRow>
                                                <TableHead className="font-bold pl-6">তারিখ ও বার</TableHead>
                                                <TableHead className="text-center font-bold">অবস্থা</TableHead>
                                                <TableHead className="text-center font-bold">সময় (আগমণ - প্রস্থান)</TableHead>
                                                <TableHead className="text-right pr-6 font-bold">রেকর্ডকৃত</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {attendanceData.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-20 italic">তথ্য পাওয়া যায়নি</TableCell></TableRow>
                                            ) : (
                                                attendanceData.sort((a,b) => b.date.localeCompare(a.date)).map(record => {
                                                    const att = record.attendance.find(a => a.staffId === selectedStaffId);
                                                    const dateObj = new Date(record.date.replace(/-/g, '/'));
                                                    return (
                                                        <TableRow key={record.id} className="h-12 border-b last:border-0 hover:bg-slate-50">
                                                            <TableCell className="pl-6">
                                                                <span className="font-bold">{toBengaliNumber(format(dateObj, 'dd-MM-yyyy'))}</span>
                                                                <span className="text-[10px] ml-2 text-muted-foreground">({format(dateObj, 'EEEE', { locale: bn })})</span>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {att ? (
                                                                    <Badge className={att.status === 'present' ? "bg-emerald-600" : "bg-blue-600"}>
                                                                        {att.status === 'present' ? 'উপস্থিত' : 'ছুটি'}
                                                                    </Badge>
                                                                ) : <Badge variant="destructive">অনুপস্থিত</Badge>}
                                                            </TableCell>
                                                            <TableCell className="text-center font-black text-[11px] text-blue-900">
                                                                {att?.status === 'present' ? `${toBengaliNumber(att.checkIn || '-')} হতে ${toBengaliNumber(att.checkOut || '-')}` : '-'}
                                                            </TableCell>
                                                            <TableCell className="text-right pr-6 text-[10px] font-bold text-muted-foreground">
                                                                {toBengaliNumber(att?.entryTime || '-')}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/10 rounded-3xl border-4 border-dashed">
                    <User className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-xl font-black">শিক্ষক বা কর্মচারী নির্বাচন করুন</p>
                    <p className="font-bold">বিস্তারিত প্রোফাইল এবং হাজিরা রিপোর্ট দেখতে স্টাফ সিলেক্ট করুন।</p>
                </div>
            )}
        </div>
    );
};

export default function StaffListPage() {
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [staffToView, setStaffToView] = useState<Staff | null>(null);
  const db = useFirestore();
  const [isClient, setIsClient] = useState(false);
  const { user, hasPermission } = useAuth();
  const { schoolInfo } = useSchoolInfo();
  const { selectedYear } = useAcademicYear();
  
  const canManageStaff = hasPermission('manage:staff');
  const canManageAttendance = hasPermission('manage:staff-attendance');
  const canDeleteAttendanceEntry = hasPermission('manage:staff-attendance-delete');
  const canViewAttendanceReport = hasPermission('view:staff-attendance-report');

  const [activeSection, setActiveSection] = useState('list');
  const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dailyAttendance, setDailyAttendance] = useState<StaffDailyAttendance | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [activeHoliday, setActiveHoliday] = useState<Holiday | undefined>(undefined);
  
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [currentAction, setCurrentAction] = useState<'arrival' | 'departure' | 'leave'>('arrival');
  const [tempEntry, setTempEntry] = useState<StaffMemberAttendance | null>(null);

  const [reportStartDate, setReportStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [reportEndDate, setReportEndDate] = useState<Date | undefined>(new Date());
  const [rangeRecords, setRangeRecords] = useState<StaffDailyAttendance[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!db || !user || !isClient) return;
    setIsLoading(true);

    const staffQuery = query(collection(db, "staff"), orderBy("nameBn", "asc"));

    const unsubscribe = onSnapshot(staffQuery, (querySnapshot) => {
      const staffData = querySnapshot.docs.map(staffFromDoc);
      setAllStaff(staffData);
      setIsLoading(false);
    }, (error: FirestoreError) => {
      if (error.code === 'permission-denied') return;
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'staff', operation: 'list' }));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, user, isClient]);

  const fetchAttendance = useCallback(async () => {
    if (!db || !selectedDate) return;
    setIsAttendanceLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    const holidayToday = await isHoliday(db, dateStr);
    setActiveHoliday(holidayToday);

    const record = await getStaffAttendanceByDate(db, dateStr);
    setDailyAttendance(record || { date: dateStr, attendance: [] });
    setSelectedStaffId('');
    setTempEntry(null);
    setIsAttendanceLoading(false);
  }, [db, selectedDate]);

  useEffect(() => {
    if (canManageAttendance && activeSection === 'attendance' && isClient) {
        fetchAttendance();
    }
  }, [fetchAttendance, canManageAttendance, activeSection, isClient]);

  const isWeekend = selectedDate ? (selectedDate.getDay() === 5 || selectedDate.getDay() === 6) : false;
  const isOffDay = isWeekend || !!activeHoliday;

  const handleStaffSelect = (id: string) => {
      if (isOffDay) return;
      setSelectedStaffId(id);
      const existing = dailyAttendance?.attendance.find(a => a.staffId === id);
      if (existing) {
          setTempEntry({ ...existing });
          if (existing.status === 'leave') {
              setCurrentAction('leave');
          } else if (existing.checkIn) {
              setCurrentAction('departure'); 
          } else {
              setCurrentAction('arrival');
          }
      } else {
          setTempEntry({ staffId: id, status: 'present', checkIn: '10:30 AM' });
          setCurrentAction('arrival');
      }
  };

  const handleActionChange = (action: 'arrival' | 'departure' | 'leave') => {
      if (!tempEntry) return;
      setCurrentAction(action);
      if (action === 'leave') {
          setTempEntry({ ...tempEntry, status: 'leave', leaveType: tempEntry.leaveType || 'CL', checkIn: undefined, checkOut: undefined });
      } else if (action === 'arrival') {
          setTempEntry({ ...tempEntry, status: 'present', checkIn: tempEntry.checkIn || '10:30 AM', leaveType: undefined });
      } else if (action === 'departure') {
          setTempEntry({ ...tempEntry, status: 'present', checkOut: tempEntry.checkOut || '04:00 PM', leaveType: undefined });
      }
  };

  const handleSaveIndividualAttendance = async () => {
      if (!db || !dailyAttendance || !tempEntry || !selectedStaffId || isOffDay) return;
      
      setIsAttendanceLoading(true);
      try {
          const sysTime = getSystemTimeEn();
          const nextAtt = [...dailyAttendance.attendance];
          const idx = nextAtt.findIndex(a => a.staffId === selectedStaffId);
          
          let updatedEntry: StaffMemberAttendance;
          const processedEntry = { ...tempEntry };
          if (processedEntry.checkIn) processedEntry.checkIn = ensureAmPm(processedEntry.checkIn, 'AM');
          if (processedEntry.checkOut) processedEntry.checkOut = ensureAmPm(processedEntry.checkOut, 'PM');

          if (idx > -1) {
              const prev = nextAtt[idx];
              if (currentAction === 'arrival') {
                  updatedEntry = { ...processedEntry, entryTime: prev.entryTime || sysTime };
              } else if (currentAction === 'departure') {
                  updatedEntry = { ...prev, ...processedEntry, exitTime: prev.exitTime || sysTime };
              } else {
                  updatedEntry = { ...processedEntry, entryTime: prev.entryTime || sysTime };
              }
              nextAtt[idx] = updatedEntry;
          } else {
              updatedEntry = { ...processedEntry };
              if (currentAction === 'arrival' || currentAction === 'leave') updatedEntry.entryTime = sysTime;
              if (currentAction === 'departure') updatedEntry.exitTime = sysTime;
              nextAtt.push(updatedEntry);
          }
          
          const updatedRecord = { ...dailyAttendance, attendance: nextAtt };
          await saveStaffAttendance(db, updatedRecord);
          
          setDailyAttendance(updatedRecord);
          setSelectedStaffId('');
          setTempEntry(null);
          toast({ title: 'হাজিরা সফলভাবে সংরক্ষিত হয়েছে' });
      } catch (e) {
          console.error(e);
      } finally {
          setIsAttendanceLoading(false);
      }
  };

  const handleDeleteEntry = async (staffId: string) => {
    if (!db || !dailyAttendance) return;
    setIsAttendanceLoading(true);
    try {
        const nextAtt = dailyAttendance.attendance.filter(a => a.staffId !== staffId);
        const updatedRecord = { ...dailyAttendance, attendance: nextAtt };
        await saveStaffAttendance(db, updatedRecord);
        setDailyAttendance(updatedRecord);
        toast({ title: 'হাজিরা মুছে ফেলা হয়েছে' });
    } catch (e) {}
    setIsAttendanceLoading(false);
  };

  const fetchReport = useCallback(async () => {
    if (!db || !reportStartDate || !reportEndDate) {
        toast({ variant: 'destructive', title: 'তারিখ নির্বাচন করুন' });
        return;
    }
    setIsReportLoading(true);
    try {
        const start = format(reportStartDate, 'yyyy-MM-dd');
        const end = format(reportEndDate, 'yyyy-MM-dd');
        const [records, holidayList] = await Promise.all([
            getStaffAttendanceForRange(db, start, end),
            getHolidays(db)
        ]);
        setRangeRecords(records);
        setHolidays(holidayList.map(h => h.date));
        toast({ title: 'রিপোর্ট প্রস্তুত হয়েছে' });
    } catch (e) {}
    setIsReportLoading(false);
  }, [db, reportStartDate, reportEndDate, toast]);

  const sortedTeachers = useMemo(() => {
      return allStaff
        .filter(s => s.staffType === 'teacher')
        .sort((a, b) => {
            const indexA = TEACHER_ORDER.findIndex(name => a.nameBn.trim().includes(name.trim()) || name.trim().includes(a.nameBn.trim()));
            const indexB = TEACHER_ORDER.findIndex(name => b.nameBn.trim().includes(name.trim()) || name.trim().includes(b.nameBn.trim()));
            if (indexA === -1 && indexB === -1) return a.nameBn.localeCompare(b.nameBn, 'bn');
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
  }, [allStaff]);

  const sortedEmployees = useMemo(() => {
    return allStaff
      .filter(s => s.staffType === 'staff')
      .sort((a, b) => {
          const indexA = STAFF_ORDER.findIndex(name => a.nameBn.trim().includes(name.trim()) || name.trim().includes(a.nameBn.trim()));
          const indexB = STAFF_ORDER.findIndex(name => b.nameBn.trim().includes(name.trim()) || name.trim().includes(b.nameBn.trim()));
          if (indexA === -1 && indexB === -1) return a.nameBn.localeCompare(b.nameBn, 'bn');
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
      });
  }, [allStaff]);

  const activeStaffList = useMemo(() => [...sortedTeachers, ...sortedEmployees].filter(s => s.isActive), [sortedTeachers, sortedEmployees]);

  const sidebarItems = useMemo(() => {
      const items = [
          { id: 'list', label: 'স্টাফ তালিকা', icon: List, color: 'text-orange-600 bg-orange-50' },
          { id: 'staff-profile', label: 'শিক্ষক ও কর্মচারী প্রোফাইল', icon: User, color: 'text-primary bg-primary/10' }
      ];
      if (canManageAttendance) {
          items.push({ id: 'attendance', label: 'দৈনিক হাজিরা ও ছুটি', icon: ClipboardCheck, color: 'text-emerald-600 bg-emerald-50' });
      }
      if (canViewAttendanceReport) {
          items.push({ id: 'report', label: 'হাজিরা ও ছুটির রিপোর্ট', icon: FileBarChart, color: 'text-blue-600 bg-blue-50' });
      }
      return items;
  }, [canManageAttendance, canViewAttendanceReport]);

  const StaffTable = ({ data, startIdx = 0, colorClass }: { data: Staff[], startIdx?: number, colorClass: string }) => (
    <div className="table-container mb-8">
        <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-20">
            <TableRow>
                <TableHead className="w-16">{isEn ? 'SL' : 'ক্রমিক'}</TableHead>
                <TableHead className="w-16">{isEn ? 'Photo' : 'ছবি'}</TableHead>
                <TableHead>{isEn ? 'Name' : 'নাম'}</TableHead>
                <TableHead>{isEn ? 'Designation' : 'পদবি'}</TableHead>
                <TableHead>{isEn ? 'Mobile' : 'মোবাইল'}</TableHead>
                <TableHead className="text-right">{isEn ? 'Actions' : 'কার্যক্রম'}</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {data.map((staff, index) => (
                <TableRow key={staff.id} className="hover:bg-muted/10 h-14">
                    <TableCell className="font-bold">{isEn ? (startIdx + index + 1) : toBengaliNumber(startIdx + index + 1)}</TableCell>
                    <TableCell>
                        <Image src={staff.photoUrl || 'https://picsum.photos/seed/staff/40/40'} alt={getStaffDisplayName(staff)} width={40} height={40} className="rounded-full object-cover border shadow-sm" />
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap font-black text-base notranslate", colorClass)} translate="no">{getStaffDisplayName(staff)}</TableCell>
                    <TableCell className="whitespace-nowrap font-bold text-xs">{staff.designation}</TableCell>
                    <TableCell className="text-xs font-bold">{toBengaliNumber(staff.mobile)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStaffToView(staff)} title="দেখুন"><Eye className="h-4 w-4" /></Button>
                            {canManageStaff && (
                                <>
                                    <Link href={`/edit-staff/${staff.id}`}><Button variant="outline" size="icon" className="h-8 w-8 text-blue-600" title="এডিট"><FilePen className="h-4 w-4" /></Button></Link>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild><Button variant="destructive" size="icon" className="h-8 w-8" title="মুছুন"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                        <AlertDialogContent className="font-kalpurush">
                                            <AlertDialogHeader><AlertDialogTitle>আপনি কি নিশ্চিত?</AlertDialogTitle><AlertDialogDescription>এটি স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="font-bold">বাতিল</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => deleteStaff(db!, staff.id)} className="bg-destructive hover:bg-destructive/90 font-black">মুছে ফেলুন</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
    </div>
  );

  const StaffGrid = ({ data, colorClass }: { data: Staff[], colorClass: string }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        {data.map((staff) => (
            <Card key={staff.id} className="overflow-hidden group relative hover:shadow-xl transition-all duration-300 border-2 border-black/5 hover:border-primary/20 bg-white rounded-2xl">
                <div className="p-5 flex flex-col items-center text-center">
                    <div className="relative mb-4">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary/30 to-transparent blur-sm group-hover:blur-md transition-all"></div>
                        <Avatar className="h-24 w-24 border-4 border-white shadow-lg relative">
                            <AvatarImage src={staff.photoUrl} className="object-cover" />
                            <AvatarFallback className="font-black text-2xl bg-muted text-muted-foreground">{getStaffDisplayName(staff).charAt(0)}</AvatarFallback>
                        </Avatar>
                    </div>
                    <h3 className={cn("font-black text-lg line-clamp-1 leading-tight mb-1 notranslate", colorClass)} translate="no">{getStaffDisplayName(staff)}</h3>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{staff.designation}</p>
                    <div className="mt-3 pt-3 border-t border-dashed w-full flex flex-col gap-1">
                        <p className="text-xs font-black text-slate-700 flex items-center justify-center gap-1.5">
                            <Clock className="h-3 w-3 text-primary" />
                            যোগদান: {toBengaliNumber(format(new Date(staff.joinDate), 'yyyy'))}
                        </p>
                        <p className="text-xs font-black text-primary flex items-center justify-center gap-1.5">
                            <ChevronRight className="h-3 w-3" />
                            {toBengaliNumber(staff.mobile)}
                        </p>
                    </div>
                </div>
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 z-10">
                    <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-lg bg-white/90 backdrop-blur-sm hover:bg-white" onClick={() => setStaffToView(staff)}>
                        <Eye className="h-4 w-4" />
                    </Button>
                    {canManageStaff && (
                        <Link href={`/edit-staff/${staff.id}`}>
                            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-lg bg-white/90 backdrop-blur-sm hover:bg-white text-blue-600">
                                <FilePen className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                </div>
            </Card>
        ))}
    </div>
  );

  const reportPages = useMemo(() => {
      if (!reportStartDate || !reportEndDate) return [];
      const activeTeachers = activeStaffList;
      const chunks = [];
      for (let i = 0; i < activeTeachers.length; i += 3) {
          chunks.push(activeTeachers.slice(i, i + 3));
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const allDaysInRange = eachDayOfInterval({ start: reportStartDate, end: reportEndDate });
      const days = allDaysInRange.filter(day => !isAfter(day, today));
      return chunks.map(chunk => ({ teachers: chunk, days }));
  }, [activeStaffList, reportStartDate, reportEndDate]);

  const renderReportPage = (page: any, pageIdx: number) => {
      const displayRange = reportStartDate && reportEndDate ? 
          `${toBengaliNumber(format(reportStartDate, "dd-MM-yyyy", { locale: bn }))} হতে ${toBengaliNumber(format(reportEndDate, "dd-MM-yyyy", { locale: bn }))}` : "";

      return (
          <div key={pageIdx} className="report-page bg-white flex flex-col h-full border border-black/5 p-0">
              <div className="report-header text-center flex flex-col items-center border-b-2 border-black pb-2 mb-2 pt-1">
                  {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="লোগো" width={48} height={48} className="object-contain mb-1" />}
                  <h1 className="text-xl font-black uppercase text-emerald-950 leading-tight">{schoolInfo.name}</h1>
                  <p className="text-[10px] font-bold text-slate-700 leading-none">{schoolInfo.address}</p>
                  <div className="mt-1 inline-block border-[1.5px] border-black px-4 py-0.5 rounded-full bg-slate-50">
                      <h2 className="text-[10px] font-black uppercase tracking-tight">হাজিরা ও ছুটির রিপোর্ট: {displayRange}</h2>
                  </div>
              </div>

              <div className="flex-1 overflow-hidden px-1">
                <table className="report-table w-full border-collapse border border-black">
                    <thead>
                        <tr className="bg-slate-100 h-8">
                            <th className="w-[110px] font-black py-1 border border-black text-[11px]">তারিখ ও বার</th>
                            {page.teachers.map((teacher: any) => (
                                <th key={teacher.id} className="py-1 border border-black">
                                    <p className="font-black text-[11px] text-blue-900 leading-none mb-0.5">{teacher.nameBn}</p>
                                    <p className="text-[8px] italic font-bold text-slate-600 leading-none">{teacher.designation}</p>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {page.days.map((day: any) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const isWeekendDay = day.getDay() === 5 || day.getDay() === 6;
                            const isHolidayDay = holidays.includes(dateStr);
                            const isOffDay = isWeekendDay || isHolidayDay;
                            const displayDate = toBengaliNumber(format(day, "dd-MM-yyyy", { locale: bn })) + " " + format(day, "EEEE", { locale: bn });

                            return (
                                <tr key={dateStr} className={cn("h-[26px] border border-black", isOffDay && "bg-rose-50/50")}>
                                    <td className="text-left pl-2 font-bold text-[11px] border border-black">{displayDate}</td>
                                    {page.teachers.map((teacher: any) => {
                                        const record = rangeRecords.find(r => r.date === dateStr);
                                        const att = record?.attendance.find(a => a.staffId === teacher.id);
                                        let cellText = "";
                                        if (att) {
                                            if (att.status === 'present') {
                                                cellText = att.checkIn ? `${att.checkIn}${att.checkOut ? ` - ${att.checkOut}` : ''}` : 'উপস্থিত';
                                            } else {
                                                cellText = att.leaveType || 'ছুটি';
                                            }
                                        } else if (isHolidayDay) { cellText = "সরকারি ছুটি"; }
                                        else if (isWeekendDay) { cellText = "সাপ্তাহিক ছুটি"; }
                                        else { cellText = "অনুপস্থিত"; }

                                        return (
                                            <td key={teacher.id} className={cn(
                                                "font-bold border border-black text-center text-[11px]",
                                                cellText === "অনুপস্থিত" && "text-rose-600 font-black",
                                                (cellText === "সাপ্তাহিক ছুটি" || cellText === "সরকারি ছুটি") && "text-slate-400 font-normal"
                                            )}>
                                                {toBengaliNumber(cellText)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        
                        <tr className="summary-row font-black bg-slate-50 border-t-2 border-black h-8">
                            <td className="text-right pr-3 border border-black text-[11px]">মোট কর্মদিবস</td>
                            {page.teachers.map((teacher: any) => {
                                const totalWorkDays = page.days.filter((d: any) => {
                                    const ds = format(d, 'yyyy-MM-dd');
                                    return !((d.getDay() === 5 || d.getDay() === 6) || holidays.includes(ds));
                                }).length;
                                return <td key={teacher.id} className="text-blue-900 border border-black text-center text-[11px]">{toBengaliNumber(totalWorkDays)} দিন</td>;
                            })}
                        </tr>
                        <tr className="summary-row font-black h-8">
                            <td className="text-right pr-3 border border-black text-[11px]">উপস্থিত (মোট)</td>
                            {page.teachers.map((teacher: any) => {
                                const count = rangeRecords.filter(r => r.attendance.some(a => a.staffId === teacher.id && a.status === 'present')).length;
                                return <td key={teacher.id} className="text-emerald-700 border border-black text-center text-[11px]">{toBengaliNumber(count)} দিন</td>;
                            })}
                        </tr>
                        <tr className="summary-row font-black h-8">
                            <td className="text-right pr-3 border border-black text-[11px]">অনুপস্থিত (মোট)</td>
                            {page.teachers.map((teacher: any) => {
                                const count = page.days.filter((d: any) => {
                                    const ds = format(d, 'yyyy-MM-dd');
                                    if (holidays.includes(ds) || (d.getDay() === 5 || d.getDay() === 6)) return false;
                                    const r = rangeRecords.find(rec => rec.date === ds);
                                    const a = r?.attendance.find(at => at.staffId === teacher.id);
                                    return !a || (a.status !== 'present' && a.status !== 'leave');
                                }).length;
                                return <td key={teacher.id} className="text-rose-700 border border-black text-center text-[11px]">{toBengaliNumber(count)} দিন</td>;
                            })}
                        </tr>
                    </tbody>
                </table>
              </div>
              
              <div className="report-footer flex justify-between items-end mt-auto pt-4 px-10 pb-2">
                  <div className="sign-box w-48 border-t border-black text-center pt-1 font-black text-[11px]">হিসাবরক্ষকের স্বাক্ষর</div>
                  <div className="sign-box w-48 border-t border-black text-center pt-1 font-black text-[11px]">প্রধান শিক্ষকের স্বাক্ষর ও সিল</div>
              </div>
          </div>
      );
  };

  const currentSelectedStaff = useMemo(() => {
    return activeStaffList.find(s => s.id === selectedStaffId);
  }, [activeStaffList, selectedStaffId]);

  const existingInToday = useMemo(() => {
    if (!dailyAttendance || !selectedStaffId) return null;
    return dailyAttendance.attendance.find(a => a.staffId === selectedStaffId);
  }, [dailyAttendance, selectedStaffId]);

  if (!isClient) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
      <Header />
      <main className="flex-1 flex flex-col md:flex-row h-full max-w-[1600px] mx-auto w-full md:p-6 lg:p-10 gap-8 pb-[500px]">
        
        <aside className="w-full md:w-60 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
            <h2 className="text-2xl font-black mb-6 px-4 hidden md:block text-slate-900 tracking-tight">স্টাফ পোর্টাল</h2>
            <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">
                {sidebarItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit",
                            activeSection === item.id ? "bg-white shadow-md text-primary scale-105" : "text-muted-foreground hover:bg-slate-200/50"
                        )}
                    >
                        <div className={cn("p-1.5 rounded-lg shrink-0", activeSection === item.id ? item.color : "bg-muted")}>
                            <item.icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs">{item.label}</span>
                        {activeSection === item.id && <ChevronRight className="ml-auto h-3.5 w-3.5 hidden md:block" />}
                    </button>
                ))}
            </div>
        </aside>

        <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4">
            <div className="p-4 sm:p-6 lg:p-8 flex-1">
                <div className="mb-6 border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800">{sidebarItems.find(i => i.id === activeSection)?.label}</h2>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">{schoolInfo.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {activeSection === 'list' && (
                            <div className="flex bg-muted/50 p-1 rounded-xl shadow-inner border border-black/5 mr-2">
                                <Button
                                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-8 px-3 rounded-lg shadow-none"
                                    onClick={() => setViewMode('table')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-8 px-3 rounded-lg shadow-none"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        {activeSection === 'list' && canManageStaff && (
                            <Link href="/add-staff">
                                <Button className="font-black h-10 px-6 shadow-md"><Plus className="mr-2 h-4 w-4" /> নতুন স্টাফ</Button>
                            </Link>
                        )}
                    </div>
                </div>

                {activeSection === 'list' && (
                    <div className="space-y-8 animate-in fade-in duration-500 no-print">
                        <section>
                            <div className="flex items-center gap-2 mb-6 px-2">
                                <div className="h-6 w-1.5 bg-orange-500 rounded-full" />
                                <h3 className="text-xl font-black text-orange-950">{isEn ? `Teachers List (${sortedTeachers.length})` : `শিক্ষকবৃন্দের তালিকা (${toBengaliNumber(sortedTeachers.length)} জন)`}</h3>
                            </div>
                            {viewMode === 'table' ? (
                                <StaffTable data={sortedTeachers} colorClass="text-blue-700" />
                            ) : (
                                <StaffGrid data={sortedTeachers} colorClass="text-blue-700" />
                            )}
                        </section>
                        <section>
                            <div className="flex items-center gap-2 mb-6 px-2">
                                <div className="h-6 w-1.5 bg-blue-500 rounded-full" />
                                <h3 className="text-xl font-black text-blue-950">{isEn ? `Staff List (${sortedEmployees.length})` : `কর্মচারীবৃন্দের তালিকা (${toBengaliNumber(sortedEmployees.length)} জন)`}</h3>
                            </div>
                            {viewMode === 'table' ? (
                                <StaffTable data={sortedEmployees} startIdx={sortedTeachers.length} colorClass="text-primary" />
                            ) : (
                                <StaffGrid data={sortedEmployees} colorClass="text-primary" />
                            )}
                        </section>
                    </div>
                )}

                {activeSection === 'staff-profile' && (
                    <StaffProfileTab staffList={activeStaffList} academicYear={selectedYear} />
                )}

                {activeSection === 'attendance' && (
                    <div className="space-y-8 animate-in fade-in duration-500 no-print">
                        <div className={cn(
                            "grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-2 rounded-xl bg-white shadow-sm items-end transition-all duration-300",
                            selectedDate ? "border-primary ring-2 ring-primary/5" : "border-orange-100"
                        )}>
                            <div className="space-y-2">
                                <Label className="font-black text-primary flex items-center gap-2"><Calendar className="h-4 w-4" /> তারিখ নির্বাচন</Label>
                                <DatePicker value={selectedDate} onChange={setSelectedDate} />
                                <p className="text-[10px] font-black text-muted-foreground mt-1 italic">
                                    {selectedDate ? format(selectedDate, 'EEEE, d MMMM yyyy', { locale: bn }) : ''}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="font-black text-primary flex items-center gap-2"><Users className="h-4 w-4" /> শিক্ষক বা কর্মচারী নির্বাচন করুন</Label>
                                <Select 
                                    value={selectedStaffId} 
                                    onValueChange={handleStaffSelect}
                                    disabled={isOffDay}
                                >
                                    <SelectTrigger className="h-10 bg-slate-50 border-2 border-primary/10 font-bold">
                                        <SelectValue placeholder={isOffDay ? "ছুটির দিনে হাজিরা বন্ধ" : "নাম সিলেক্ট করুন"} />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                        {activeStaffList.map(s => (
                                            <SelectItem key={s.id} value={s.id} className="font-bold">{getStaffDisplayName(s)} ({s.designation})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {isOffDay && (
                            <div className="p-10 border-4 border-dashed border-rose-300 bg-rose-50 rounded-[32px] flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                                <AlertTriangle className="h-16 w-16 text-rose-500 mb-4 animate-pulse" />
                                <h3 className="text-2xl font-black text-rose-900 mb-2">আজ ছুটির দিন!</h3>
                                <p className="text-rose-700 font-bold max-w-md">
                                    {activeHoliday ? `${activeHoliday.description} উপলক্ষে আজ বিদ্যালয় বন্ধ।` : 'আজ সাপ্তাহিক ছুটি।'} ছুটির দিনে কোনো ধরনের হাজিরা গ্রহণ করা সম্ভব নয়।
                                </p>
                            </div>
                        )}

                        {!isOffDay && selectedStaffId && tempEntry && currentSelectedStaff && (
                            <Card className="border-4 border-primary rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                                <CardHeader className="bg-primary/5 border-b-2 border-primary/10">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-16 w-16 border-4 border-white shadow-md">
                                            <AvatarImage src={currentSelectedStaff.photoUrl} />
                                            <AvatarFallback className="font-black text-xl bg-muted text-muted-foreground">
                                                {currentSelectedStaff.nameBn?.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <CardTitle className="text-2xl font-black text-slate-900">{getStaffDisplayName(currentSelectedStaff)}</CardTitle>
                                            <CardDescription className="text-primary font-bold text-base">
                                                {currentSelectedStaff.designation}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8 space-y-8">
                                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                                        {existingInToday?.status === 'leave' ? (
                                            <div className="flex flex-col items-center justify-center p-6 bg-blue-50 border-2 border-dashed border-blue-200 rounded-3xl w-full animate-in fade-in duration-500">
                                                <Badge className="bg-blue-600 px-6 py-1.5 text-base font-black mb-2 shadow-lg">আজ ছুটিতে আছেন</Badge>
                                                <p className="text-sm font-bold text-blue-800">এই শিক্ষক/কর্মচারীর আজকের হাজিরা 'ছুটি' হিসেবে সংরক্ষিত হয়েছে।</p>
                                            </div>
                                        ) : (
                                            <>
                                                {!existingInToday?.checkIn && (
                                                    <Button 
                                                        size="lg" 
                                                        className={cn("flex-1 h-14 text-lg font-black transition-all gap-2", currentAction === 'arrival' ? "bg-emerald-600 shadow-lg ring-4 ring-emerald-100" : "bg-white text-emerald-600 border-2 border-emerald-600 hover:bg-emerald-50")}
                                                        onClick={() => handleActionChange('arrival')}
                                                    >
                                                        <LogIn className="h-5 w-5" /> আগমণ
                                                    </Button>
                                                )}
                                                <Button 
                                                    size="lg" 
                                                    disabled={!existingInToday?.checkIn}
                                                    title={!existingInToday?.checkIn ? "আগমণ সেভ করা ছাড়া প্রস্থান দেওয়া যাবে না" : ""}
                                                    className={cn(
                                                        "flex-1 h-14 text-lg font-black transition-all gap-2", 
                                                        currentAction === 'departure' ? "bg-rose-600 shadow-lg ring-4 ring-rose-100" : "bg-white text-rose-600 border-2 border-rose-600 hover:bg-rose-50",
                                                        !existingInToday?.checkIn && "opacity-50 cursor-not-allowed border-slate-200 text-slate-300"
                                                    )}
                                                    onClick={() => handleActionChange('departure')}
                                                >
                                                    <LogOut className="h-5 w-5" /> প্রস্থান
                                                </Button>
                                                {!existingInToday?.checkIn && (
                                                    <Button 
                                                        size="lg" 
                                                        className={cn("flex-1 h-14 text-lg font-black transition-all gap-2", currentAction === 'leave' ? "bg-blue-600 shadow-lg ring-4 ring-blue-100" : "bg-white text-blue-600 border-2 border-blue-600 hover:bg-blue-50")}
                                                        onClick={() => handleActionChange('leave')}
                                                    >
                                                        <UserX className="h-5 w-5" /> ছুটি
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {existingInToday?.status !== 'leave' && (
                                        <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-primary/20 animate-in fade-in slide-in-from-top-2 duration-500">
                                            {currentAction === 'arrival' && (
                                                <div className="space-y-2 max-w-xs mx-auto">
                                                    <Label className="font-black text-emerald-800 flex items-center justify-center gap-1"><Clock className="h-3.5 w-3.5" /> আগমনের সময় লিখুন</Label>
                                                    <Input 
                                                        value={tempEntry.checkIn || ''} 
                                                        onChange={e => setTempEntry({...tempEntry, checkIn: e.target.value})} 
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveIndividualAttendance()}
                                                        className="h-11 font-black text-center bg-white text-xl border-2 border-emerald-300 focus:ring-emerald-500" 
                                                        placeholder="উদা: 10:30 AM" 
                                                    />
                                                </div>
                                            )}
                                            {currentAction === 'departure' && (
                                                <div className="space-y-2 max-w-xs mx-auto">
                                                    <Label className="font-black text-rose-800 flex items-center justify-center gap-1"><Clock className="h-3.5 w-3.5" /> প্রস্থানের সময় লিখুন</Label>
                                                    <Input 
                                                        value={tempEntry.checkOut || ''} 
                                                        onChange={e => setTempEntry({...tempEntry, checkOut: e.target.value})} 
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveIndividualAttendance()}
                                                        className="h-11 font-black text-center bg-white text-xl border-2 border-rose-300 focus:ring-rose-500" 
                                                        placeholder="উদা: 04:00 PM" 
                                                    />
                                                </div>
                                            )}
                                            {currentAction === 'leave' && (
                                                <div className="space-y-4 text-center">
                                                    <Label className="font-black text-blue-800">ছুটির ধরন নির্বাচন করুন</Label>
                                                    <div className="flex flex-wrap justify-center gap-2">
                                                        {LEAVE_TYPES.map(t => (
                                                            <Button 
                                                                key={t.id} 
                                                                variant={tempEntry.leaveType === t.id ? "default" : "outline"}
                                                                size="sm" 
                                                                className={cn("h-9 px-4 font-black shadow-sm", tempEntry.leaveType === t.id ? "bg-blue-600" : "bg-white")}
                                                                onClick={() => setTempEntry({...tempEntry, leaveType: t.id})}
                                                            >
                                                                {t.label}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                                {existingInToday?.status !== 'leave' && (
                                    <CardFooter className="bg-slate-50 p-6 border-t flex justify-between gap-4">
                                        <Button variant="ghost" onClick={() => { setSelectedStaffId(''); setTempEntry(null); }} className="font-bold h-12 px-8">বাতিল</Button>
                                        <Button 
                                            onClick={handleSaveIndividualAttendance} 
                                            disabled={isAttendanceLoading || (currentAction === 'leave' && !tempEntry.leaveType)}
                                            className="h-12 px-12 text-lg font-black shadow-xl"
                                        >
                                            {isAttendanceLoading ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
                                            হাজিরা নিশ্চিত করুন
                                        </Button>
                                    </CardFooter>
                                )}
                            </Card>
                        )}

                        <div className="space-y-4">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 border-b-4 border-emerald-600 pb-2 max-w-fit px-2">
                                <UserCheck className="h-6 w-6 text-emerald-600" /> আজকের গৃহীত হাজিরা তালিকা
                            </h3>
                            <div className="table-container shadow-xl border-2">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="w-16 font-black text-center">ক্রমিক</TableHead>
                                            <TableHead className="font-black">নাম ও পদবি</TableHead>
                                            <TableHead className="text-center font-black">অবস্থা</TableHead>
                                            <TableHead className="text-center font-black">সময় / ছুটির ধরন</TableHead>
                                            <TableHead className="text-center font-black">রেকর্ড সময়</TableHead>
                                            <TableHead className="text-right font-black">কার্যক্রম</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dailyAttendance?.attendance.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-16 italic font-bold text-muted-foreground">
                                                    আজকের কোনো হাজিরা এখনো নেওয়া হয়নি।
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dailyAttendance?.attendance.map((att, index) => {
                                                const staff = activeStaffList.find(s => s.id === att.staffId);
                                                return (
                                                    <TableRow key={att.staffId} className="h-16 hover:bg-slate-50 transition-colors">
                                                        <TableCell className="font-bold text-center">{toBengaliNumber(index + 1)}</TableCell>
                                                        <TableCell>
                                                            <div className="font-black text-sm text-slate-800">{staff?.nameBn}</div>
                                                            <div className="text-[10px] font-bold text-muted-foreground">{staff?.designation}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge className={cn("font-black px-4", att.status === 'present' ? "bg-emerald-600" : "bg-rose-600")}>
                                                                {att.status === 'present' ? 'উপস্থিত' : 'ছুটি'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {att.status === 'present' ? (
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-[11px] font-black text-blue-900">{toBengaliNumber(att.checkIn || '-')}{att.checkOut ? ` - ${toBengaliNumber(att.checkOut)}` : ''}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs font-black text-rose-700">{LEAVE_TYPES.find(t => t.id === att.leaveType)?.label}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
                                                                    {att.status === 'leave' ? 'রেকর্ড:' : 'আগমণ:'} {toBengaliNumber(att.entryTime || '-')}
                                                                </span>
                                                                {att.status !== 'leave' && (
                                                                    <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">প্রস্থান: {toBengaliNumber(att.exitTime || '-')}</span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleStaffSelect(att.staffId)}><Edit2 className="h-4 w-4" /></Button>
                                                                {canDeleteAttendanceEntry && (
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" onClick={() => handleDeleteEntry(att.staffId)}><Trash2 className="h-4 w-4" /></Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'report' && (
                    <div className="space-y-8 animate-in fade-in duration-500 no-print">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-2 border-blue-100 rounded-xl bg-white shadow-sm items-end">
                            <div className="space-y-2">
                                <Label className="font-black text-primary">হতে (শুরুর তারিখ)</Label>
                                <DatePicker value={reportStartDate} onChange={setReportStartDate} />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-black text-primary">পর্যন্ত (শেষের তারিখ)</Label>
                                <DatePicker value={reportEndDate} onChange={setReportEndDate} />
                            </div>
                            <Button className="font-black h-10 shadow-sm" onClick={fetchReport} disabled={isReportLoading || !reportStartDate || !reportEndDate}>
                                {isReportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                রিপোর্ট তৈরি করুন
                            </Button>
                            <Button variant="outline" className="font-black h-10 border-primary text-primary" onClick={() => window.print()} disabled={rangeRecords.length === 0}>
                                <Printer className="mr-2 h-4 w-4" /> রিপোর্ট প্রিন্ট
                            </Button>
                        </div>

                        {rangeRecords.length > 0 && (
                            <div className="space-y-8">
                                <div className="p-4 bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl text-center no-print">
                                    <Badge className="bg-emerald-600 px-6 py-1 text-sm font-black shadow-lg mb-2">রিপোর্ট প্রস্তুত হয়েছে!</Badge>
                                    <p className="font-bold text-blue-700">নিচে প্রফেশনাল প্রিভিউ দেখা যাচ্ছে। আপনি চাইলে সরাসরি প্রিন্ট করতে পারেন।</p>
                                </div>
                                <div className="flex flex-col gap-12 items-center bg-slate-100 p-4 sm:p-10 rounded-3xl border-2 border-slate-200 shadow-inner overflow-x-auto">
                                    {reportPages.map((page, pageIdx) => (
                                        <div key={pageIdx} className="bg-white shadow-2xl shrink-0 overflow-hidden transform scale-95 sm:scale-100 origin-top">
                                            <div style={{ width: '210mm', minHeight: '275mm', padding: '10mm' }} className="box-border">
                                                {renderReportPage(page, pageIdx)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </main>

      <div className="hidden print:block printable-area bg-white text-black font-kalpurush">
          <style jsx global>{`
              @media print {
                  @page { size: A4 portrait; margin: 0.4in !important; }
                  html, body { height: auto !important; overflow: visible !important; background: white !important; margin: 0 !important; padding: 0 !important; }
                  .printable-area { position: absolute !important; top: 0 !important; left: 0 !important; padding: 0 !important; margin: 0 !important; width: 100% !important; box-sizing: border-box !important; }
                  .report-page { 
                      page-break-after: always; 
                      width: 100% !important; 
                      height: 275mm !important;
                      padding: 0 !important; 
                      margin: 0 !important;
                      box-sizing: border-box;
                      display: flex;
                      flex-direction: column;
                      background: white !important;
                  }
                  .report-header { 
                      border-bottom: 2px solid black; 
                      padding-bottom: 2px; 
                      margin-bottom: 4px; 
                      text-align: center;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      width: 100%;
                      margin-top: 0 !important;
                  }
                  .report-table { border: 1.5px solid black !important; width: 100%; border-collapse: collapse; }
                  .report-table th, .report-table td { 
                      border: 1px solid black !important; 
                      padding: 2px 1px !important; 
                      text-align: center; 
                      font-size: 11px; 
                      line-height: 1.1; 
                  }
                  .report-table th { font-weight: 900 !important; background-color: #f1f5f9 !important; font-size: 11px; }
                  .summary-row td { background-color: #f8fafc !important; font-weight: 900 !important; font-size: 11px; border-top: 2px solid black !important; }
                  .report-footer { margin-top: auto; padding-top: 10px; width: 100%; display: flex; justify-content: space-between; padding-left: 20px; padding-right: 20px; padding-bottom: 5px; }
                  .sign-box { border-top: 1.5px solid black; width: 50mm; text-align: center; font-size: 11px; font-weight: 900; padding-top: 2px; }
              }
          `}</style>
          {reportPages.map((page, pageIdx) => (
              <div key={pageIdx} className="report-page">
                  {renderReportPage(page, pageIdx)}
              </div>
          ))}
      </div>

      <Dialog open={!!staffToView} onOpenChange={(isOpen) => !isOpen && setStaffToView(null)}>
        <DialogContent className="max-w-xl font-kalpurush">
             {staffToView && (
                <>
                    <DialogHeader className="flex-row items-center gap-4">
                        <Image src={staffToView.photoUrl || 'https://picsum.photos/seed/staff/96/96'} alt={staffToView.nameBn} width={80} height={80} className="rounded-lg object-cover border shadow-sm" />
                        <div>
                            <DialogTitle className="text-2xl mb-1 font-black notranslate" translate="no">{getStaffDisplayName(staffToView)}</DialogTitle>
                            <DialogDescription className="font-black text-primary">{staffToView.designation}</DialogDescription>
                        </div>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto pr-4 scrollbar-thin">
                        <div className="space-y-4 py-4 text-sm font-bold text-slate-700">
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">{isEn ? 'Name (Bangla):' : 'নাম (বাংলা):'}</span> <span className="notranslate" translate="no">{staffToView.nameBn}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">{isEn ? 'Name (English):' : 'নাম (ইংরেজি):'}</span> <span className="notranslate" translate="no">{staffToView.nameEn || '-'}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">জন্ম তারিখ:</span> <span>{staffToView.dob ? toBengaliNumber(format(new Date(staffToView.dob), "dd-MM-yyyy", { locale: bn })) : 'N/A'}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">ধরন:</span> <span>{staffToView.staffType === 'teacher' ? 'শিক্ষক' : 'কর্মচারী'}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">বিষয়:</span> <span>{staffToView.subject || 'N/A'}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">মোবাইল:</span> <span>{toBengaliNumber(staffToView.mobile)}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">যোগদানের তারিখ:</span> <span>{staffToView.joinDate ? toBengaliNumber(format(new Date(staffToView.joinDate), "dd-MM-yyyy", { locale: bn })) : 'N/A'}</span></p>
                            <p className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground font-medium">শিক্ষাগত যোগ্যতা:</span> <span>{staffToView.education || 'N/A'}</span></p>
                            <p className="flex flex-col border-b pb-1.5"><span className="text-muted-foreground mb-1 font-medium">ঠিকানা:</span> <span>{staffToView.address || 'N/A'}</span></p>
                        </div>
                    </div>
                </>
             )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
