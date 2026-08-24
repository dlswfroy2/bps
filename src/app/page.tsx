'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, GraduationCap, Clock, Bell, Info, Plus, Trash2, CheckCircle2, XCircle, Banknote, PieChart as PieChartIcon, UserMinus, Sparkles, Loader2, FilePen, Megaphone, RefreshCcw, Image as ImageIcon, Search, UserCheck, AlertCircle, MousePointer2, UserPlus } from 'lucide-react';
import { Student, studentFromDoc } from '@/lib/student-data';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { getAttendanceForDate, saveDailyAttendance, StudentAttendance, DailyAttendance, getAttendanceForClassAndDate } from '@/lib/attendance-data';
import { getFullRoutine, ClassRoutine } from '@/lib/routine-data';
import { getProxyClasses, ProxyClass } from '@/lib/proxy-data';
import { getNotices, Notice } from '@/lib/notice-data';
import { getStaffAttendanceByDate } from '@/lib/staff-attendance-data';
import { getStaff } from '@/lib/staff-data';
import { getGalleryConfig, GalleryConfig, defaultGalleryConfig } from '@/lib/gallery-data';
import { getTransactions, Transaction } from '@/lib/transactions-data';
import { isHoliday, Holiday } from '@/lib/holiday-data';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, FirestoreError, orderBy, limit, doc, Timestamp, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StudentFeeDialog } from '@/components/StudentFeeDialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';

const parseTeacherName = (cell: string): string => {
    if (!cell || !cell.includes(' - ')) return 'N/A';
    const parts = cell.split(' - ');
    return parts.pop()?.trim() || 'N/A';
};

const periodTimes = [
  { name: "১ম", start: { h: 10, m: 30 }, end: { h: 11, m: 20 } },
  { name: "২য়", start: { h: 11, m: 20 }, end: { h: 12, m: 10 } },
  { name: "৩য়", start: { h: 12, m: 10 }, end: { h: 13, m: 0 } },
  { name: "বিরতি", start: { h: 13, m: 0 }, end: { h: 14, m: 0 } },
  { name: "৪র্থ", start: { h: 14, m: 0 }, end: { h: 14, m: 40 } },
  { name: "৫ম", start: { h: 14, m: 40 }, end: { h: 15, m: 20 } },
  { name: "৬ষ্ঠ", start: { h: 15, m: 20 }, end: { h: 16, m: 0 } },
];

const dayMap = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const classNamesMap: { [key: string]: string } = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম'
};

// Scrolling Notice Ticker Component
const NoticeTicker = () => {
    const db = useFirestore();
    const { user } = useAuth();
    const [scrollingNotices, setScrollingNotices] = useState<Notice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!db || !user || !isClient) return;
        
        const q = query(collection(db, 'notices'), orderBy('date', 'desc'), limit(15));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => {
                const docData = doc.data();
                return {
                    id: doc.id,
                    ...docData,
                    date: docData.date instanceof Timestamp ? docData.date.toDate() : (docData.date ? new Date(docData.date) : new Date()),
                } as Notice;
            });
            const scrolling = data.filter(n => !!n.isScrolling);
            setScrollingNotices(scrolling);
            setIsLoading(false);
        }, async (error: FirestoreError) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'notices',
                    operation: 'list',
                }));
            }
        });

        return () => unsubscribe();
    }, [db, user, isClient]);

    if (!isClient) return null;

    if (scrollingNotices.length > 0) {
        return (
            <div className="w-full bg-yellow-100 text-red-700 h-8 flex items-center overflow-hidden border-y-2 border-red-500 shadow-md sticky top-16 md:top-24 z-40 font-kalpurush group cursor-default">
                <div className="bg-red-600 text-white px-3 h-full flex items-center gap-1.5 shrink-0 z-10 shadow-lg">
                    <Megaphone className="h-3.5 w-3.5 animate-bounce" />
                    <span className="font-black text-xs whitespace-nowrap leading-none">জরুরি নোটিশ:</span>
                </div>
                <div className="flex-1 relative overflow-hidden h-full flex items-center">
                    <div className="absolute whitespace-nowrap animate-marquee flex items-center gap-10 group-hover:pause-animation">
                        {scrollingNotices.map((notice, idx) => (
                            <span key={`notice-${idx}`} className="font-black text-xs tracking-tight">
                                <span className="text-blue-800">[{notice.title}]</span> - {notice.content.replace(/\n/g, ' ')}
                            </span>
                        ))}
                        {scrollingNotices.map((notice, idx) => (
                            <span key={`notice-loop-${idx}`} className="font-black text-xs tracking-tight">
                                <span className="text-blue-800">[{notice.title}]</span> - {notice.content.replace(/\n/g, ' ')}
                            </span>
                        ))}
                    </div>
                </div>
                <style jsx>{`
                    @keyframes marquee {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .animate-marquee {
                        animation: marquee 45s linear infinite;
                        display: inline-flex;
                        width: max-content;
                    }
                    .pause-animation {
                        animation-play-state: paused;
                    }
                `}</style>
            </div>
        );
    }

    if (isLoading) return <div className="h-8 w-full mb-4 bg-muted animate-pulse" />;
    return null;
};

const GalleryCard = () => {
    const db = useFirestore();
    const { user } = useAuth();
    const [config, setConfig] = useState<GalleryConfig>(defaultGalleryConfig);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user) return;
        const unsub = onSnapshot(doc(db, 'school', 'gallery'), (snap) => {
            if (snap.exists()) {
                setConfig(snap.data() as GalleryConfig);
            }
            setIsLoading(false);
        }, async (error: FirestoreError) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'school/gallery',
                    operation: 'get',
                }));
            }
        });
        return () => unsub();
    }, [db, user]);

    const activeImages = useMemo(() => config.images.filter(img => img.isActive), [config.images]);

    useEffect(() => {
        if (activeImages.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentIdx(prev => (prev + 1) % activeImages.length);
        }, config.duration * 1000);
        return () => clearInterval(interval);
    }, [activeImages, config.duration]);

    if (isLoading) return <Skeleton className="h-full w-full rounded-lg" />;

    return (
        <Card className="relative overflow-hidden bg-white border-2 border-black shadow-sm group hover:shadow-lg transition-all duration-500">
            <CardHeader className="p-3 bg-primary/5 border-b border-black/10 relative z-20">
                <CardTitle className="text-xs font-black text-primary flex items-center gap-1.5 uppercase">
                    <ImageIcon className="h-3.5 w-3.5" /> বিদ্যালয় গ্যালারি
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 relative h-28 sm:h-32 overflow-hidden">
                {activeImages.length > 0 ? (
                    <div className="relative w-full h-full">
                        {activeImages.map((img, idx) => (
                            <div 
                                key={img.id}
                                className={cn(
                                    "absolute inset-0 transition-opacity duration-1000",
                                    idx === currentIdx ? "opacity-100 z-10" : "opacity-0 z-0"
                                )}
                            >
                                <Image 
                                    src={img.url} 
                                    alt={img.title} 
                                    fill 
                                    className="object-cover"
                                    data-ai-hint="school landscape"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-[2px] p-1 text-center">
                                    <p className="text-[10px] text-white font-black truncate">{img.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-muted-foreground italic">
                        <ImageIcon className="h-8 w-8 mb-1 opacity-20" />
                        <p className="text-[10px]">ছবি নেই</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const TeachersOnLeaveCard = () => {
    const db = useFirestore();
    const { user } = useAuth();
    const [onLeave, setOnLeave] = useState<{name: string, designation: string, type?: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user) return;
        
        const fetchLeaveInfo = async () => {
            setIsLoading(true);
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const [attRecord, allStaff] = await Promise.all([
                    getStaffAttendanceByDate(db, todayStr),
                    getStaff(db)
                ]);

                if (attRecord) {
                    const leaveEntries = attRecord.attendance.filter(a => a.status === 'leave');
                    const leaveDetails = leaveEntries.map(l => {
                        const staff = allStaff.find(s => s.id === l.staffId);
                        return { 
                            name: staff?.nameBn || 'অজানা', 
                            designation: staff?.designation || '',
                            type: l.leaveType 
                        };
                    });
                    setOnLeave(leaveDetails);
                } else {
                    setOnLeave([]);
                }
            } catch (e) {
                console.error("Error fetching leave info:", e);
            }
            setIsLoading(false);
        };
        
        fetchLeaveInfo();
    }, [db, user]);

    return (
        <Card className="lg:col-span-1 shadow-md border-2 border-black bg-rose-50/30">
            <CardHeader className="bg-rose-100/50 rounded-t-lg pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-rose-800">
                    <UserMinus className="h-5 w-5" /> ছুটিতে থাকা শিক্ষক ও কর্মচারী
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                {isLoading ? (
                    <Skeleton className="h-24 w-full rounded-md" />
                ) : onLeave.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground italic text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2 opacity-20" />
                        <p className="text-xs">আজ সব শিক্ষক ও কর্মচারী উপস্থিত আছেন।</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {onLeave.map((person, idx) => (
                            <div key={idx} className="flex flex-col gap-0.5 p-2.5 bg-white rounded-lg border border-rose-100 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                        <span className="font-bold text-rose-900 text-sm">{person.name}</span>
                                    </div>
                                    {person.type && (
                                        <Badge variant="outline" className="text-[9px] h-4 font-black bg-rose-50 text-rose-700 border-rose-200">
                                            {person.type}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground pl-3.5 italic">
                                    {person.designation}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const LiveRoutineCard = () => {
    const db = useFirestore();
    const { user } = useAuth();
    const { selectedYear } = useAcademicYear();
    const [fullRoutine, setFullRoutine] = useState<ClassRoutine[]>([]);
    const [proxies, setProxies] = useState<ProxyClass[]>([]);
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeHoliday, setActiveHoliday] = useState<Holiday | undefined>(undefined);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!db || !user || !isClient) return;
        setIsLoading(true);
        const fetchData = async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const [routineData, holidayInfo, proxyData] = await Promise.all([
                    getFullRoutine(db, selectedYear),
                    isHoliday(db, todayStr),
                    getProxyClasses(db, todayStr, selectedYear)
                ]);
                setFullRoutine(routineData || []);
                setActiveHoliday(holidayInfo);
                setProxies(proxyData || []);
            } catch (e) {
                console.error(e);
            }
            setIsLoading(false);
        };
        fetchData();
        setCurrentTime(new Date());
    }, [db, selectedYear, user, isClient]);

    useEffect(() => {
        if (!isClient) return;
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, [isClient]);

    const getCurrentPeriodInfo = () => {
        if (!isClient || !currentTime) return { status: 'লোড হচ্ছে...', runningClasses: [], isSpecialStatus: false, nextClasses: [], nextStatus: '' };
        
        const now = currentTime;
        const currentDayName = dayMap[now.getDay()];
        let status = 'ক্লাস চলছে';
        let runningClasses: any[] = [];
        let isSpecialStatus = false;
        let nextClasses: any[] = [];
        let nextStatus = '';

        if (activeHoliday) {
            isSpecialStatus = true;
            return { status: `আজ ${activeHoliday.description}।`, runningClasses: [], isSpecialStatus, nextClasses: [], nextStatus: '' };
        }
        
        if (currentDayName === 'শুক্রবার' || currentDayName === 'শনিবার') {
            isSpecialStatus = true;
            return { status: 'আজ সাপ্তাহিক ছুটি।', runningClasses: [], isSpecialStatus, nextClasses: [], nextStatus: '' };
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let periodIndex = -1;
        for(let i=0; i<periodTimes.length; i++) {
            const period = periodTimes[i];
            const startMinutes = period.start.h * 60 + period.start.m;
            const endMinutes = period.end.h * 60 + period.end.m;

            if(currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                if (period.name === 'বিরতি') {
                    status = 'এখন টিফিনের বিরতি চলছে।';
                } else {
                    if (i < 3) periodIndex = i; 
                    if (i > 3) periodIndex = i - 1;
                }
                break;
            }
        }
        
        if (periodIndex !== -1) {
            runningClasses = fullRoutine
                .filter(r => r.day === currentDayName)
                .map(r => {
                    const periodContent = r.periods[periodIndex];
                    if (periodContent) {
                        const adjustedPeriodIndex = periodIndex + (periodIndex >= 3 ? 1 : 0);
                        const periodInfo = periodTimes[adjustedPeriodIndex];
                        const proxy = proxies.find(p => p.className === r.className && p.periodIndex === periodIndex);
                        return {
                            className: r.className,
                            displayClassName: classNamesMap[r.className] || r.className,
                            teacher: proxy ? proxy.proxyTeacher : parseTeacherName(periodContent),
                            isProxy: !!proxy,
                            period: periodInfo.name,
                            time: `${periodInfo.start.h.toString().padStart(2, '0')}:${periodInfo.start.m.toString().padStart(2, '0')} - ${periodInfo.end.h.toString().padStart(2, '0')}:${periodInfo.end.m.toString().padStart(2, '0')}`
                        };
                    }
                    return null;
                })
                .filter((c): c is NonNullable<typeof c> => c !== null)
                .sort((a, b) => parseInt(a.className) - parseInt(b.className));
            
            if (runningClasses.length === 0) status = 'এখন কোনো ক্লাস চলছে না।';
        } else if (status === 'ক্লাস চলছে') {
             status = 'এখন কোনো ক্লাস চলছে না।';
        }

        let nextRawPeriodIndex = -1;
        for(let i=0; i<periodTimes.length; i++) {
            const period = periodTimes[i];
            const startMinutes = period.start.h * 60 + period.start.m;
            if (startMinutes > currentMinutes) {
                nextRawPeriodIndex = i;
                break;
            }
        }

        if (nextRawPeriodIndex !== -1) {
            const nextPeriodInfo = periodTimes[nextRawPeriodIndex];
            if (nextPeriodInfo.name === 'বিরতি') {
                nextStatus = `পরবর্তী: টিফিনের বিরতি (${nextPeriodInfo.start.h > 12 ? nextPeriodInfo.start.h - 12 : nextPeriodInfo.start.h}:${nextPeriodInfo.start.m.toString().padStart(2, '0')})`;
            } else {
                let nextPeriodIndexCalc = -1;
                if (nextRawPeriodIndex < 3) nextPeriodIndexCalc = nextRawPeriodIndex;
                if (nextRawPeriodIndex > 3) nextPeriodIndexCalc = nextRawPeriodIndex - 1;

                if (nextPeriodIndexCalc !== -1) {
                    nextClasses = fullRoutine
                        .filter(r => r.day === currentDayName)
                        .map(r => {
                            const periodContent = r.periods[nextPeriodIndexCalc];
                            if (periodContent) {
                                const proxy = proxies.find(p => p.className === r.className && p.periodIndex === nextPeriodIndexCalc);
                                return {
                                    className: r.className,
                                    displayClassName: classNamesMap[r.className] || r.className,
                                    teacher: proxy ? proxy.proxyTeacher : parseTeacherName(periodContent),
                                    isProxy: !!proxy,
                                    period: nextPeriodInfo.name,
                                    time: `${nextPeriodInfo.start.h > 12 ? nextPeriodInfo.start.h - 12 : nextPeriodInfo.start.h}:${nextPeriodInfo.start.m.toString().padStart(2, '0')} - ${nextPeriodInfo.end.h > 12 ? nextPeriodInfo.end.h - 12 : nextPeriodInfo.end.h}:${nextPeriodInfo.end.m.toString().padStart(2, '0')}`
                                };
                            }
                            return null;
                        })
                        .filter((c): c is NonNullable<typeof c> => c !== null)
                        .sort((a, b) => parseInt(a.className) - parseInt(b.className));
                }
                
                nextStatus = `পরবর্তী ক্লাস শুরু হবে ${nextPeriodInfo.start.h > 12 ? nextPeriodInfo.start.h - 12 : nextPeriodInfo.start.h}:${nextPeriodInfo.start.m.toString().padStart(2, '0')} এ`;
            }
        } else {
             nextStatus = 'আজ আর কোনো ক্লাস বাকি নেই।';
        }

        return { status, runningClasses, isSpecialStatus, nextClasses, nextStatus };
    };

    const periodInfo = getCurrentPeriodInfo();

    return (
        <Card className="lg:col-span-2 shadow-md border-2 border-black">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" /> লাইভ ক্লাস রুটিন
                    </CardTitle>
                    <div className="text-[10px] font-bold text-muted-foreground pl-6">
                        {isClient && currentTime ? format(currentTime, 'EEEE, d MMMM yyyy', { locale: bn }) : <Skeleton className="h-3 w-32" />}
                    </div>
                </div>
                 <Badge variant="outline" className="flex items-center gap-2 bg-white shadow-sm">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    {isClient && currentTime ? currentTime.toLocaleTimeString('bn-BD', { hour: 'numeric', minute: 'numeric' }) : <Skeleton className="h-4 w-12" />}
                </Badge>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2 pt-4">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            {periodInfo.runningClasses && periodInfo.runningClasses.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2 text-emerald-600 font-semibold text-sm">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                        এখন ক্লাস চলছে
                                    </div>
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead>সময়</TableHead>
                                                <TableHead>শিক্ষক</TableHead>
                                                <TableHead>শ্রেণি</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {periodInfo.runningClasses.map((rc, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="text-xs font-medium">{rc.time}</TableCell>
                                                    <TableCell className="font-semibold text-primary">
                                                        {rc.teacher} 
                                                        {rc.isProxy && <span className="ml-1 text-[10px] text-red-600 font-black animate-pulse">(বদলি)</span>}
                                                    </TableCell>
                                                    <TableCell>{rc.displayClassName}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-20 text-center bg-muted/20 rounded-md border border-dashed">
                                    <p className={cn(
                                        "text-muted-foreground transition-all duration-500",
                                        periodInfo.isSpecialStatus ? "text-red-600 font-bold" : "text-sm"
                                    )}>
                                        {periodInfo.status}
                                    </p>
                                </div>
                            )}
                        </div>

                        {!periodInfo.isSpecialStatus && (
                            <div>
                                {periodInfo.nextClasses && periodInfo.nextClasses.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="text-indigo-600 font-semibold text-sm mb-2 border-t pt-4">
                                            {periodInfo.nextStatus}
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-indigo-50/50">
                                                <TableRow>
                                                    <TableHead>সময়</TableHead>
                                                    <TableHead>শিক্ষক</TableHead>
                                                    <TableHead>শ্রেণি</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {periodInfo.nextClasses.map((nc, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="text-xs text-muted-foreground">{nc.time}</TableCell>
                                                        <TableCell className="font-medium text-indigo-900">
                                                            {nc.teacher}
                                                            {nc.isProxy && <span className="ml-1 text-[10px] text-red-600 font-black">(বদলি)</span>}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground">{nc.displayClassName}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center text-xs text-muted-foreground border-t pt-4">
                                        {periodInfo.nextStatus}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const IncomeExpenseChart = () => {
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        setLoading(true);
        getTransactions(db, selectedYear).then(data => {
            setTransactions(data);
            setLoading(false);
        });
    }, [db, selectedYear]);

    const chartData = useMemo(() => {
        let income = 0;
        let expense = 0;
        transactions.forEach(t => {
            if (t.type === 'income') income += t.amount;
            else expense += t.amount;
        });
        return [
            { name: 'আয়', value: income, color: '#10b981' },
            { name: 'ব্যয়', value: expense, color: '#ef4444' }
        ];
    }, [transactions]);

    if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;

    return (
        <Card className="shadow-md border-2 border-black">
            <CardHeader className="bg-primary/5 rounded-t-lg">
                <CardTitle className="text-lg flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-primary" /> আয়-ব্যয় চিত্র
                </CardTitle>
            </CardHeader>
            <CardContent className="h-64 pt-6">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <RechartsTooltip 
                            formatter={(value: number) => [`${value.toLocaleString('bn-BD')} ৳`, 'পরিমাণ']}
                        />
                        <Legend verticalAlign="bottom" align="center" />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
  const router = useRouter();
  const { toast } = useToast();
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [totalPresent, setTotalPresent] = useState(0);
  const [totalAbsent, setTotalAbsent] = useState(0);
  const [classAttendance, setClassAttendance] = useState<Record<string, { present: number; absent: number; total: number }>>({});
  const [attendanceTaken, setAttendanceTaken] = useState(false);
  const { selectedYear } = useAcademicYear();
  const db = useFirestore();

  // Quick Payment States
  const [isQuickPaymentOpen, setIsQuickPaymentOpen] = useState(false);
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [quickSearchClass, setQuickSearchClass] = useState<string>('');
  const [studentsForYear, setStudentsForYear] = useState<Student[]>([]);
  const [quickFeeStudent, setQuickFeeStudent] = useState<Student | null>(null);

  // Quick Attendance States
  const [isQuickAttendanceOpen, setIsQuickAttendanceOpen] = useState(false);
  const [quickAttendanceClass, setQuickAttendanceClass] = useState<string>('6');
  const [quickAttendanceInput, setQuickAttendanceInput] = useState('');
  const [isSavingQuickAttendance, setIsSavingQuickAttendance] = useState(false);
  const [isConfirmingQuickAttendance, setIsConfirmingQuickAttendance] = useState(false);
  
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
      if (!db || !user) return;

      const studentsQuery = query(collection(db, 'students'), where('academicYear', '==', selectedYear));
      
      const unsubscribeStudents = onSnapshot(studentsQuery, async (studentsSnapshot) => {
        const list = studentsSnapshot.docs.map(studentFromDoc);
        setStudentsForYear(list);
        setTotalStudents(list.length);
        
        const classMap: Record<string, { present: number; absent: number; total: number }> = {
            '6': { present: 0, absent: 0, total: 0 },
            '7': { present: 0, absent: 0, total: 0 },
            '8': { present: 0, absent: 0, total: 0 },
            '9': { present: 0, absent: 0, total: 0 },
            '10': { present: 0, absent: 0, total: 0 },
        };

        list.forEach(student => {
            if (classMap[student.className]) {
                classMap[student.className].total++;
            }
        });

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        try {
            const todaysAttendance = await getAttendanceForDate(db, todayStr, selectedYear);
            setAttendanceTaken(todaysAttendance.length > 0);

            if (todaysAttendance.length > 0) {
                let totalPresentCount = 0;
                let totalAbsentCount = 0;
                todaysAttendance.forEach(classAttendanceRecord => {
                    const className = classAttendanceRecord.className;
                    if (classMap[className]) {
                        let presentCount = 0;
                        let absentCount = 0;
                        
                        classAttendanceRecord.attendance.forEach(studentAttendance => {
                            const studentExistsInYear = list.some(s => s.id === studentAttendance.studentId && s.className === className);
                            if (studentExistsInYear) {
                                if (studentAttendance.status === 'present') {
                                    presentCount++;
                                } else {
                                    absentCount++;
                                }
                            }
                        });
                        classMap[className].present = presentCount;
                        classMap[className].absent = absentCount;
                        totalPresentCount += presentCount;
                        totalAbsentCount += absentCount;
                    }
                });
                setTotalPresent(totalPresentCount);
                setTotalAbsent(totalAbsentCount);
            } else {
                setTotalPresent(0);
                setTotalAbsent(0);
            }
        } catch (e) {}
        
        setClassAttendance(classMap);
      },
      (error: FirestoreError) => {
        // Only emit if it's a real permission denial, ignore network errors when offline
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'students',
                operation: 'list',
            }));
        }
      });

      const staffQuery = query(collection(db, 'staff'), where('isActive', '==', true), where('staffType', '==', 'teacher'));
      const unsubscribeStaff = onSnapshot(staffQuery, (querySnapshot) => {
        setTotalTeachers(querySnapshot.size);
      },
      (error: FirestoreError) => {
        // Only emit if it's a real permission denial, ignore network errors when offline
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'staff',
                operation: 'list',
            }));
        }
      });

      return () => {
        unsubscribeStudents();
        unsubscribeStaff();
      };

  }, [selectedYear, db, user]);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const queryStr = quickSearchInput.trim().toLowerCase();
    if (!queryStr) {
        toast({ variant: "destructive", title: "তথ্য দিন", description: "রোল বা আইডি লিখুন।" });
        return;
    }

    const bnToEn = (str: string) => str.toString().replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
    const queryEn = bnToEn(queryStr);
    const rollEn = parseInt(queryEn, 10);

    const found = studentsForYear.find(s => {
        if (s.generatedId && s.generatedId.toLowerCase() === queryEn) {
            return true;
        }
        if (quickSearchClass && !isNaN(rollEn)) {
            return s.className === quickSearchClass && s.roll === rollEn;
        }
        return false;
    });

    if (found) {
        setQuickFeeStudent(found);
        setQuickSearchInput('');
        setIsQuickPaymentOpen(false);
    } else {
        toast({
            variant: "destructive",
            title: "শিক্ষার্থী পাওয়া যায়নি",
            description: "সঠিক আইডি লিখুন অথবা রোল এবং শ্রেণি উভয়ই চেক করুন।"
        });
    }
  };

  const refreshDashboardAttendance = useCallback(async (currentStudents?: Student[]) => {
      if (!db) return;
      const list = currentStudents && currentStudents.length > 0 ? currentStudents : studentsForYear;
      const classMap: Record<string, { present: number; absent: number; total: number }> = {
          '6': { present: 0, absent: 0, total: 0 },
          '7': { present: 0, absent: 0, total: 0 },
          '8': { present: 0, absent: 0, total: 0 },
          '9': { present: 0, absent: 0, total: 0 },
          '10': { present: 0, absent: 0, total: 0 },
      };

      list.forEach(student => {
          if (classMap[student.className]) {
              classMap[student.className].total++;
          }
      });

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      try {
          const todaysAttendance = await getAttendanceForDate(db, todayStr, selectedYear);
          setAttendanceTaken(todaysAttendance.length > 0);

          if (todaysAttendance.length > 0) {
              let totalPresentCount = 0;
              let totalAbsentCount = 0;
              todaysAttendance.forEach(classAttendanceRecord => {
                  const className = classAttendanceRecord.className;
                  if (classMap[className]) {
                      let presentCount = 0;
                      let absentCount = 0;
                      
                      classAttendanceRecord.attendance.forEach(studentAttendance => {
                          const studentExistsInYear = list.some(s => s.id === studentAttendance.studentId && s.className === className);
                          if (studentExistsInYear) {
                              if (studentAttendance.status === 'present') {
                                  presentCount++;
                              } else {
                                  absentCount++;
                              }
                          }
                      });
                      classMap[className].present = presentCount;
                      classMap[className].absent = absentCount;
                      totalPresentCount += presentCount;
                      totalAbsentCount += absentCount;
                  }
              });
              setTotalPresent(totalPresentCount);
              setTotalAbsent(totalAbsentCount);
          } else {
              setTotalPresent(0);
              setTotalAbsent(0);
          }
      } catch (e) {}
      
      setClassAttendance(classMap);
  }, [db, selectedYear, studentsForYear]);

  const handleQuickAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    if (!quickAttendanceClass) {
        toast({ variant: 'destructive', title: 'শ্রেণি নির্বাচন করুন' });
        return;
    }

    setIsSavingQuickAttendance(true);
    try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const activeHoliday = await isHoliday(db, todayStr);
        const dayOfWeek = new Date().getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

        if (activeHoliday || isWeekend) {
            toast({ 
                variant: 'destructive', 
                title: 'আজ ছুটির দিন!', 
                description: activeHoliday ? `আজ ${activeHoliday.description} উপলক্ষে স্কুল বন্ধ।` : 'আজ সাপ্তাহিক ছুটি।' 
            });
            setIsSavingQuickAttendance(false);
            return;
        }

        if (!isConfirmingQuickAttendance) {
            const existing = await getAttendanceForClassAndDate(db, todayStr, quickAttendanceClass, selectedYear);
            if (existing) {
                setIsConfirmingQuickAttendance(true);
                toast({ 
                    variant: 'destructive', 
                    title: 'হাজিরা ইতিমধ্যে নেওয়া হয়েছে!', 
                    description: 'আপনি কি পূর্বের হাজিরা মুছে নতুনভাবে সেভ করতে চান? চাইলে আবার এন্টার দিন।' 
                });
                setIsSavingQuickAttendance(false);
                return;
            }
        }

        const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
        const inputRolls = quickAttendanceInput
            .split(/[\s,]+/)
            .map(r => parseInt(bnToEn(r.trim()), 10))
            .filter(r => !isNaN(r));

        let classStudents = (studentsForYear || []).filter(
            (s: Student) => String(s.className) === String(quickAttendanceClass)
        );

        if (classStudents.length === 0) {
            const qSnap = await getDocs(query(
                collection(db, 'students'),
                where('className', '==', quickAttendanceClass),
                where('academicYear', '==', selectedYear)
            ));
            classStudents = qSnap.docs.map((docSnap: QueryDocumentSnapshot) => ({ id: docSnap.id, ...docSnap.data() } as Student));
        }

        if (classStudents.length === 0) {
            toast({ variant: 'destructive', title: 'এই শ্রেণিতে কোনো শিক্ষার্থী পাওয়া যায়নি' });
            setIsSavingQuickAttendance(false);
            return;
        }

        const attendanceData: StudentAttendance[] = classStudents.map((student: Student) => ({
            studentId: student.id,
            status: (student.roll !== undefined && inputRolls.includes(student.roll)) ? 'present' : 'absent'
        }));

        const dailyAttendance: DailyAttendance = {
            date: todayStr,
            academicYear: selectedYear,
            className: quickAttendanceClass,
            attendance: attendanceData,
        };

        // Initiate save immediately (deterministic ID handles sync automatically)
        saveDailyAttendance(db, dailyAttendance);

        toast({
            title: `আজকের কুইক হাজিরা সংরক্ষিত হয়েছে (${classNamesMap[quickAttendanceClass] || quickAttendanceClass} শ্রেণি)`,
            description: `${inputRolls.length} জন উপস্থিত হিসেবে সেভ হয়েছে।`
        });
        setQuickAttendanceInput('');
        setIsConfirmingQuickAttendance(false);
        setIsQuickAttendanceOpen(false);

        refreshDashboardAttendance(studentsForYear);
    } catch (err: any) {
        console.error("Error saving quick attendance:", err);
        toast({ variant: 'destructive', title: 'হাজিরা সেভ করতে সমস্যা হয়েছে' });
    } finally {
        setIsSavingQuickAttendance(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-sky-100 font-kalpurush">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="font-bold">লোড হচ্ছে...</p>
      </div>
    );
  }

  const presentPercentage = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : "০";
  const absentPercentage = totalStudents > 0 ? ((totalAbsent / totalStudents) * 100).toFixed(1) : "০";

  return (
    <div className="flex min-h-screen w-full flex-col bg-sky-100 font-kalpurush">
      <Header />
      <NoticeTicker />
      <main className="p-4 md:p-8 pb-[600px] max-w-[1600px] mx-auto w-full">
        
        {/* Quick Actions Bar */}
        <div className="mb-8 flex flex-wrap gap-4 items-center justify-center sm:justify-start">
            <Link href="/add-student">
                <Button className="h-12 px-6 rounded-2xl bg-primary hover:bg-primary/90 shadow-lg font-black gap-2 transition-all active:scale-95">
                    <UserPlus className="h-5 w-5" /> কুইক ভর্তি
                </Button>
            </Link>

            <Dialog open={isQuickPaymentOpen} onOpenChange={setIsQuickPaymentOpen}>
                <DialogTrigger asChild>
                    <Button className="h-12 px-6 rounded-2xl bg-teal-600 hover:bg-teal-700 shadow-lg font-black gap-2 transition-all active:scale-95">
                        <Banknote className="h-5 w-5" /> কুইক পেমেন্ট
                    </Button>
                </DialogTrigger>
                <DialogContent className="font-kalpurush sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-teal-700 flex items-center gap-2">
                            <Banknote /> কুইক পেমেন্ট সার্চ
                        </DialogTitle>
                        <DialogDescription className="font-bold">রোল এবং শ্রেণি নির্বাচন করে শিক্ষার্থী খুঁজুন</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleQuickSearch} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="font-bold">শ্রেণি নির্বাচন</Label>
                            <Select value={quickSearchClass} onValueChange={setQuickSearchClass}>
                                <SelectTrigger className="h-11 border-2"><SelectValue placeholder="সিলেক্ট শ্রেণি" /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(classNamesMap).map(([id, label]) => (
                                        <SelectItem key={id} value={id}>{label} শ্রেণি</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold">রোল অথবা আইডি (ID)</Label>
                            <Input 
                                value={quickSearchInput} 
                                onChange={e => setQuickSearchInput(e.target.value)}
                                placeholder="এখানে লিখুন..."
                                className="h-11 border-2 font-black text-lg"
                            />
                        </div>
                        <Button type="submit" className="w-full h-11 bg-teal-600 font-black">সার্চ করুন</Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isQuickAttendanceOpen} onOpenChange={(o) => { setIsQuickAttendanceOpen(o); if(!o) setIsConfirmingQuickAttendance(false); }}>
                <DialogTrigger asChild>
                    <Button className="h-12 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-lg font-black gap-2 transition-all active:scale-95">
                        <UserCheck className="h-5 w-5" /> কুইক হাজিরা
                    </Button>
                </DialogTrigger>
                <DialogContent className={cn("font-kalpurush sm:max-w-md transition-all duration-300", isConfirmingQuickAttendance && "border-rose-500 ring-4 ring-rose-100")}>
                    <DialogHeader>
                        <DialogTitle className={cn("text-xl font-black flex items-center gap-2", isConfirmingQuickAttendance ? "text-rose-700" : "text-emerald-700")}>
                            {isConfirmingQuickAttendance ? <AlertCircle /> : <UserCheck />}
                            {isConfirmingQuickAttendance ? "পুনরায় সেভ নিশ্চিত করুন" : "আজকের কুইক হাজিরা"}
                        </DialogTitle>
                        <DialogDescription className={cn("font-bold", isConfirmingQuickAttendance && "text-rose-600")}>
                            {isConfirmingQuickAttendance ? "এই শ্রেণির হাজিরা আজ একবার নেওয়া হয়েছে। আপডেট করতে চান?" : "রোল নম্বরগুলো কমা বা স্পেস দিয়ে লিখুন।"}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleQuickAttendanceSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="font-bold">শ্রেণি</Label>
                            <Select value={quickAttendanceClass} onValueChange={(v) => { setQuickAttendanceClass(v); setIsConfirmingQuickAttendance(false); }}>
                                <SelectTrigger className="h-11 border-2"><SelectValue placeholder="সিলেক্ট শ্রেণি" /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(classNamesMap).map(([id, label]) => (
                                        <SelectItem key={id} value={id}>{label} শ্রেণি</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold">উপস্থিত রোল নম্বরসমূহ</Label>
                            <Input 
                                value={quickAttendanceInput} 
                                onChange={e => { setQuickAttendanceInput(e.target.value); setIsConfirmingQuickAttendance(false); }}
                                placeholder="উদা: ১, ২, ৫, ১০"
                                className={cn("h-11 border-2 font-black text-lg", isConfirmingQuickAttendance && "bg-rose-50")}
                            />
                        </div>
                        <div className="flex gap-2">
                            {isConfirmingQuickAttendance && (
                                <Button type="button" variant="outline" onClick={() => setIsConfirmingQuickAttendance(false)} className="flex-1 font-bold">বাতিল</Button>
                            )}
                            <Button type="submit" disabled={isSavingQuickAttendance} className={cn("flex-1 h-11 font-black", isConfirmingQuickAttendance ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")}>
                                {isSavingQuickAttendance ? <Loader2 className="animate-spin" /> : (isConfirmingQuickAttendance ? 'হ্যাঁ, আপডেট করুন' : 'হাজিরা সম্পন্ন করুন')}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-5 mb-8">
          <GalleryCard />
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100 border-2 border-black shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
               <Users className="h-28 w-28 text-indigo-900" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-bold text-indigo-900">মোট শিক্ষার্থী</CardTitle>
              <div className="p-2 bg-white/60 rounded-full backdrop-blur-sm shadow-sm">
                <Users className="h-4 w-4 text-indigo-700" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-black text-indigo-950 mb-1">{totalStudents.toLocaleString('bn-BD')}</div>
              <p className="text-xs text-indigo-700 font-medium">শিক্ষাবর্ষ {Number(selectedYear).toLocaleString('bn-BD')}</p>
            </CardContent>
          </Card>
          
           <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-100 border-2 border-black shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
               <CheckCircle2 className="h-28 w-28 text-teal-900" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-bold text-teal-900">মোট উপস্থিত</CardTitle>
              <div className="p-2 bg-white/60 rounded-full backdrop-blur-sm shadow-sm">
                <Users className="h-4 w-4 text-teal-700" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-black text-teal-950 mb-1">{totalPresent.toLocaleString('bn-BD')}</div>
                <div className="text-sm font-bold text-emerald-700 bg-white/80 px-2 py-0.5 rounded-full border border-emerald-100">{toBengaliNumber(presentPercentage)}%</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-rose-50 to-red-100 border-2 border-black shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
               <XCircle className="h-28 w-28 text-red-900" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-bold text-red-900">মোট অনুপস্থিত</CardTitle>
              <div className="p-2 bg-white/60 rounded-full backdrop-blur-sm shadow-sm">
                <Users className="h-4 w-4 text-red-700" />
              </div>
            </CardHeader>            
            <CardContent className="relative z-10">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-black text-red-950 mb-1">{totalAbsent.toLocaleString('bn-BD')}</div>
                <div className="text-sm font-bold text-rose-700 bg-white/80 px-2 py-0.5 rounded-full border border-rose-100">{toBengaliNumber(absentPercentage)}%</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100 border-2 border-black shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group">
             <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
               <GraduationCap className="h-28 w-28 text-orange-900" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-bold text-orange-900">মোট শিক্ষক</CardTitle>
              <div className="p-2 bg-white/60 rounded-full backdrop-blur-sm shadow-sm">
                <GraduationCap className="h-4 w-4 text-orange-700" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-black text-orange-950 mb-1">{totalTeachers.toLocaleString('bn-BD')}</div>
              <p className="text-xs text-orange-700 font-medium">নিবন্ধিত সক্রিয় শিক্ষক</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
          <Card className="lg:col-span-1 shadow-md border-2 border-black">
            <CardHeader className="bg-primary/5 rounded-t-lg">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" /> আজকের হাজিরা
                </CardTitle>
                <CardDescription>
                    {attendanceTaken ? 'শ্রেণিভিত্তিক আজকের উপস্থিতির সারসংক্ষেপ' : 'আজ এখনো কোনো শ্রেণির হাজিরা নেওয়া হয়নি।'}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">শ্রেণি</TableHead>
                            <TableHead className="text-center">মোট</TableHead>
                            <TableHead className="text-center">উপস্থিত</TableHead>
                            <TableHead className="text-center">অনুপস্থিত</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(classAttendance).map(([className, data]) => (
                            <TableRow key={className}>
                                <TableCell className="font-medium pl-4 notranslate" translate="no">{isEn ? `Class ${className}` : `${classNamesMap[className]} শ্রেণি`}</TableCell>
                                <TableCell className="text-center notranslate" translate="no">{isEn ? data.total : data.total.toLocaleString('bn-BD')}</TableCell>
                                <TableCell className="text-center text-emerald-600 font-semibold notranslate" translate="no">{isEn ? data.present : data.present.toLocaleString('bn-BD')}</TableCell>
                                <TableCell className="text-center text-rose-600 font-semibold notranslate" translate="no">{isEn ? data.absent : data.absent.toLocaleString('bn-BD')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
          <LiveRoutineCard />
          <IncomeExpenseChart />
          <TeachersOnLeaveCard />
        </div>
      </main>

      {/* Direct Fee Dialog for Quick Search */}
      {quickFeeStudent && (
          <StudentFeeDialog 
            student={quickFeeStudent} 
            open={!!quickFeeStudent} 
            onOpenChange={(o) => !o && setQuickFeeStudent(null)} 
            onFeeCollected={() => {}} 
          />
      )}
    </div>
  );
}

function toBengaliNumber(str: string | number) {
  if (!str && str !== 0) return '';
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
}
