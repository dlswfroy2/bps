'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { signIn, signUp } from '@/lib/auth';
import type { UserRole } from '@/lib/user';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Link from 'next/link';
import { 
    Loader2, Search, BookOpen, User, Info, 
    CheckCircle2, XCircle, ArrowLeft, GraduationCap, Users, 
    UserPlus, Bell, ChevronRight,
    TrendingUp, ShieldCheck, MapPin, Phone,
    CalendarCheck, Trophy, ImageIcon, Megaphone, Sparkles, LogIn, Printer, Clock
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit, orderBy, doc, onSnapshot, Timestamp, FirestoreError } from 'firebase/firestore';
import { studentFromDoc, getStudentPlaceholderImage, sanitizePhotoUrl } from '@/lib/student-data';
import { getExams, Exam } from '@/lib/exam-data';
import { getAllResults } from '@/lib/results-data';
import { getSubjects } from '@/lib/subjects';
import { processStudentResults, StudentProcessedResult } from '@/lib/results-calculation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { GalleryConfig, defaultGalleryConfig } from '@/lib/gallery-data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const classNamesMap: Record<string, string> = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম'
};

function AuthFormFields({ email, password, setEmail, setPassword }: {
    email: string;
    password: string;
    setEmail: (value: string) => void;
    setPassword: (value: string) => void;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="email" className="font-black text-[11px] uppercase tracking-wider text-primary">ইমেইল ঠিকানা</Label>
                <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    placeholder="example@mail.com"
                    className="h-11 border-2 focus:ring-primary" 
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="password" className="font-black text-[11px] uppercase tracking-wider text-primary">পাসওয়ার্ড</Label>
                <Input 
                    id="password" 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                    placeholder="••••••••"
                    className="h-11 border-2 focus:ring-primary" 
                />
            </div>
        </div>
    );
}

const BackgroundGallery = () => {
    const db = useFirestore();
    const [config, setConfig] = useState<GalleryConfig>(defaultGalleryConfig);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
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
    }, [db]);

    const activeImages = useMemo(() => config.images.filter(img => img.isActive), [config.images]);

    useEffect(() => {
        if (activeImages.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentIdx(prev => (prev + 1) % activeImages.length);
        }, config.duration * 1000);
        return () => clearInterval(interval);
    }, [activeImages, config.duration]);

    if (isLoading) return <div className="absolute inset-0 bg-slate-900" />;

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden z-0 bg-slate-950">
            {activeImages.length > 0 ? (
                activeImages.map((img, idx) => (
                    <div 
                        key={img.id}
                        className={cn(
                            "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                            idx === currentIdx ? "opacity-100" : "opacity-0"
                        )}
                        style={{ transitionProperty: 'opacity', transitionDuration: '2s' }}
                    >
                        <Image 
                            src={img.url} 
                            alt={img.title} 
                            fill 
                            priority={idx === 0}
                            className="object-cover object-center brightness-[1.20] contrast-[1.10]"
                        />
                        <div className="absolute inset-0 bg-black/5" />
                    </div>
                ))
            ) : (
                <div className="absolute inset-0 bg-slate-900" />
            )}
        </div>
    );
};

const NoticeTicker = () => {
    const db = useFirestore();
    const [scrollingNotices, setScrollingNotices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'notices'), orderBy('date', 'desc'), limit(15));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const scrolling = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as any))
                .filter(n => !!n.isScrolling);
            setScrollingNotices(scrolling);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [db]);

    if (scrollingNotices.length > 0) {
        return (
            <div className="w-full bg-yellow-100/90 backdrop-blur-md text-red-700 h-8 flex items-center overflow-hidden border-y-2 border-red-500 shadow-md sticky top-16 md:top-24 z-40 font-kalpurush group cursor-default">
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
                const qAtt = query(collection(db, 'staffAttendance'), where('date', '==', todayStr));
                const attSnap = await getDocs(qAtt);
                const qStaff = collection(db, 'staff');
                const staffSnap = await getDocs(qStaff);
                const allStaff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                if (!attSnap.empty) {
                    const attRecord = attSnap.docs[0].data();
                    const leaveEntries = attRecord.attendance.filter((a: any) => a.status === 'leave');
                    const leaveDetails = leaveEntries.map((l: any) => {
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
                    <UserRound className="h-5 w-5" /> ছুটিতে থাকা শিক্ষক ও কর্মচারী
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
    const [fullRoutine, setFullRoutine] = useState<any[]>([]);
    const [proxies, setProxies] = useState<any[]>([]);
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeHoliday, setActiveHoliday] = useState<any | undefined>(undefined);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

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
    const parseTeacherName = (cell: string): string => {
        if (!cell || !cell.includes(' - ')) return 'N/A';
        const parts = cell.split(' - ');
        return parts.pop()?.trim() || 'N/A';
    };

    useEffect(() => {
        if (!db || !user || !isClient) return;
        setIsLoading(true);
        const fetchData = async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const [routineData, holidayInfo, proxyData] = await Promise.all([
                    getDocs(query(collection(db, 'classRoutines'), where('academicYear', '==', selectedYear))),
                    getDocs(query(collection(db, 'holidays'), where('date', '==', todayStr), limit(1))),
                    getDocs(query(collection(db, 'proxyClasses'), where('date', '==', todayStr), where('academicYear', '==', selectedYear)))
                ]);
                
                setFullRoutine(routineData.docs.map(d => d.data()));
                setActiveHoliday(holidayInfo.empty ? undefined : holidayInfo.docs[0].data());
                setProxies(proxyData.docs.map(d => d.data()));
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
        <Card className="lg:col-span-2 shadow-md border-2 border-black bg-white/90 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary">
                        <Clock className="h-4 w-4" /> লাইভ ক্লাস রুটিন
                    </CardTitle>
                    <div className="text-[10px] font-black text-muted-foreground pl-6 uppercase">
                        {isClient && currentTime ? format(currentTime, 'EEEE, d MMMM yyyy', { locale: bn }) : ''}
                    </div>
                </div>
                 <Badge variant="outline" className="flex items-center gap-2 bg-white shadow-sm border-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    {isClient && currentTime ? <span className="font-black">{currentTime.toLocaleTimeString('bn-BD', { hour: 'numeric', minute: 'numeric' })}</span> : <Skeleton className="h-4 w-12" />}
                </Badge>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2 pt-4">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            {periodInfo.runningClasses && periodInfo.runningClasses.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2 text-emerald-700 font-black text-xs uppercase tracking-wider">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        এখন ক্লাস চলছে
                                    </div>
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="font-black text-[10px]">সময়</TableHead>
                                                <TableHead className="font-black text-[10px]">শিক্ষকর</TableHead>
                                                <TableHead className="font-black text-[10px]">শ্রেণি</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {periodInfo.runningClasses.map((rc, index) => (
                                                <TableRow key={index} className="h-10">
                                                    <TableCell className="text-[10px] font-bold text-slate-600">{toBengaliNumber(rc.time)}</TableCell>
                                                    <TableCell className="font-black text-primary text-xs">
                                                        {rc.teacher} 
                                                        {rc.isProxy && <span className="ml-1 text-[8px] text-red-600 font-black animate-pulse">(বদলি)</span>}
                                                    </TableCell>
                                                    <TableCell className="font-black text-xs">{rc.displayClassName}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-20 text-center bg-muted/20 rounded-xl border-2 border-dashed">
                                    <p className={cn(
                                        "font-black transition-all duration-500",
                                        periodInfo.isSpecialStatus ? "text-red-600 text-lg" : "text-sm text-muted-foreground"
                                    )}>
                                        {periodInfo.status}
                                    </p>
                                </div>
                            )}
                        </div>

                        {!periodInfo.isSpecialStatus && (
                            <div className="pt-4 border-t-2 border-dashed">
                                {periodInfo.nextClasses && periodInfo.nextClasses.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="text-indigo-700 font-black text-xs uppercase mb-2">
                                            {periodInfo.nextStatus}
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-indigo-50/50">
                                                <TableRow>
                                                    <TableHead className="font-black text-[10px]">সময়</TableHead>
                                                    <TableHead className="font-black text-[10px]">শিক্ষক</TableHead>
                                                    <TableHead className="font-black text-[10px]">শ্রেণি</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {periodInfo.nextClasses.map((nc, index) => (
                                                    <TableRow key={index} className="h-10">
                                                        <TableCell className="text-[10px] font-bold text-slate-50">{toBengaliNumber(nc.time)}</TableCell>
                                                        <TableCell className="font-black text-indigo-900 text-xs">
                                                            {nc.teacher}
                                                            {nc.isProxy && <span className="ml-1 text-[8px] text-red-600 font-black">(বদলি)</span>}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground font-bold text-xs">{nc.displayClassName}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center text-[10px] font-black text-muted-foreground py-2">
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

const PublicStats = ({ stats, globalYear, isEn }: any) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
            <div className="bg-white/90 backdrop-blur-md border-2 border-indigo-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                <div className="p-2 bg-indigo-50 rounded-xl w-fit mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Users className="h-5 w-5" />
                </div>
                <p className="text-2xl font-black text-slate-900 notranslate" translate="no">{isEn ? (stats.students || 0) : toBengaliNumber(stats.students || 0)}</p>
                <p className="text-[10px] font-black text-indigo-600 uppercase mt-1 notranslate" translate="no">{isEn ? 'STUDENT' : 'শিক্ষার্থী'}</p>
            </div>
            <div className="bg-white/90 backdrop-blur-md border-2 border-emerald-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                <div className="p-2 bg-emerald-50 rounded-xl w-fit mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <GraduationCap className="h-5 w-5" />
                </div>
                <p className="text-2xl font-black text-slate-900 notranslate" translate="no">{isEn ? (stats.teachers || 0) : toBengaliNumber(stats.teachers || 0)}</p>
                <p className="text-[10px] font-black text-emerald-600 uppercase mt-1 notranslate" translate="no">{isEn ? 'TEACHER' : 'শিক্ষক'}</p>
            </div>
            <div className="bg-white/90 backdrop-blur-md border-2 border-blue-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                <div className="p-2 bg-blue-50 rounded-xl w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <CalendarCheck className="h-5 w-5" />
                </div>
                <p className="text-2xl font-black text-slate-900 notranslate" translate="no">{isEn ? stats.attendanceRate.toFixed(1) : toBengaliNumber(stats.attendanceRate.toFixed(1))}%</p>
                <p className="text-[10px] font-black text-blue-600 uppercase mt-1 notranslate" translate="no">{isEn ? 'ATTENDANCE' : 'উপস্থিতি'}</p>
            </div>
            <div className="bg-white/90 backdrop-blur-md border-2 border-rose-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                <div className="p-2 bg-rose-50 rounded-xl w-fit mb-3 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <Trophy className="h-5 w-5" />
                </div>
                <p className="text-2xl font-black text-rose-950 mb-1 notranslate" translate="no">{isEn ? stats.passRate.toFixed(1) : toBengaliNumber(stats.passRate.toFixed(1))}%</p>
                <p className="text-[10px] font-black text-rose-600 uppercase mt-1 notranslate" translate="no">{isEn ? `SSC EXAM- ${stats.sscYear || globalYear}` : `এস এস সি পরীক্ষা-${toBengaliNumber(stats.sscYear || globalYear)}`}</p>
            </div>
        </div>
    );
};

export default function LoginPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, loading } = useAuth();
    const { schoolInfo, isLoading: isSchoolInfoLoading } = useSchoolInfo();
    const { availableYears, selectedYear: globalYear } = useAcademicYear();
    const db = useFirestore();
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoadingAuth, setIsLoadingAuth] = useState(false);

    // Search Logic States
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchYear, setSearchYear] = useState<string>(globalYear);
    const [searchClass, setSearchClass] = useState<string>('');
    const [searchExam, setSearchExam] = useState<string>('');
    const [searchRoll, setSearchRoll] = useState<string>('');
    const [searchStudentId, setSearchStudentId] = useState<string>('');
    const [searchExams, setSearchExams] = useState<Exam[]>([]);
    const [searchResult, setSearchResult] = useState<StudentProcessedResult | null>(null);

    // Dynamic Stats States
    const [stats, setStats] = useState({ 
        students: 0, 
        teachers: 0,
        attendanceRate: 0,
        passRate: 0,
        sscYear: globalYear
    });

    useEffect(() => {
        if (!loading && !isLoadingAuth && user) {
            router.push('/');
        }
    }, [user, loading, isLoadingAuth, router]);

    useEffect(() => {
        if (db && searchYear) {
            getExams(db, searchYear).then(setSearchExams);
        }
    }, [db, searchYear]);

    // Fetch live stats
    useEffect(() => {
        if (!db) return;
        const fetchStats = async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const bnToEn = (str: string) => str.toString().replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
                
                const sPromise = getDocs(query(collection(db, 'students'), where('academicYear', '==', globalYear)));
                const tPromise = getDocs(query(collection(db, 'staff'), where('isActive', '==', true), where('staffType', '==', 'teacher')));
                const attPromise = getDocs(query(collection(db, 'attendance'), where('academicYear', '==', globalYear), where('date', '==', todayStr)));
                
                const sscRecordsPromise = getDocs(query(
                    collection(db, 'publicExamRecords'), 
                    where('examType', '==', 'SSC')
                ));

                const [sSnap, tSnap, attSnap, allSscSnap] = await Promise.all([
                    sPromise.catch(() => ({ size: 0, docs: [] })),
                    tPromise.catch(() => ({ size: 0, docs: [] })),
                    attPromise.catch(() => ({ size: 0, docs: [] })),
                    sscRecordsPromise.catch(() => ({ size: 0, docs: [] }))
                ]);

                const totalStudentsCount = (sSnap as any).size;
                const activeTeachersCount = (tSnap as any).size;

                let presentCount = 0;
                (attSnap as any).docs.forEach((doc: any) => {
                    const data = doc.data();
                    if (data.attendance) {
                        presentCount += data.attendance.filter((a: any) => a.status === 'present').length;
                    }
                });

                let sscYear = globalYear;
                let sscDocs = (allSscSnap as any).docs.filter((d: any) => d.data().academicYear === globalYear);
                
                if (sscDocs.length === 0 && (allSscSnap as any).docs.length > 0) {
                    const yearsWithRecords = Array.from(new Set((allSscSnap as any).docs.map((d: any) => d.data().academicYear).filter(Boolean))).sort().reverse();
                    if (yearsWithRecords.length > 0) {
                        sscYear = yearsWithRecords[0] as string;
                        sscDocs = (allSscSnap as any).docs.filter((d: any) => d.data().academicYear === sscYear);
                    }
                }

                let passRatePercent = 0;
                if (sscDocs.length > 0) {
                    const passedCount = sscDocs.filter((doc: any) => {
                        const data = doc.data();
                        const grade = (data.grade || '').toString().trim().toUpperCase();
                        const gpa = Number(data.gpa) || 0;
                        return grade !== '' && grade !== 'F' && gpa > 0;
                    }).length;
                    passRatePercent = (passedCount / sscDocs.length) * 100;
                } else if ((schoolInfo as any)?.passingRate) {
                    passRatePercent = parseFloat((schoolInfo as any).passingRate) || 0;
                }

                setStats({ 
                    students: totalStudentsCount, 
                    teachers: activeTeachersCount,
                    attendanceRate: totalStudentsCount > 0 ? (presentCount / totalStudentsCount) * 100 : 0,
                    passRate: passRatePercent,
                    sscYear: sscYear
                });
            } catch (e) {
                console.error("Live Stats Error:", e);
            }
        };
        fetchStats();
    }, [db, globalYear, schoolInfo]);

    const handleAuthAction = async (action: 'signIn' | 'signUp', role: UserRole) => {
        setIsLoadingAuth(true);
        try {
            if (action === 'signIn') {
                const result = await signIn(email, password, role);
                if (result.success) {
                    toast({ title: 'লগইন সফল হয়েছে' });
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'লগইন ব্যর্থ হয়েছে',
                        description: result.error || 'ইমেইল বা পাসওয়ার্ড ভুল।',
                    });
                }
            } else {
                const result = await signUp(email, password);
                 if (result.success) {
                    toast({ title: 'সাইন আপ সফল হয়েছে', description: `আপনাকে একজন ${result.role} হিসেবে নিবন্ধন করা হয়েছে।` });
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'সাইন আপ ব্যর্থ হয়েছে',
                        description: result.error || 'অনুগ্রহ করে পুনরায় চেষ্টা করুন।',
                    });
                }
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'একটি অপ্রত্যাশিত ত্রুটি ঘটেছে',
                description: error.message || 'সার্ভারে সংযোগ করা যাচ্ছে না।',
            });
        } finally {
            setIsLoadingAuth(false);
        }
    };

    const handleResultSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const bnToEn = (str: string) => str.toString().replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
        if (!db || !searchYear || !searchClass || !searchExam || !searchRoll || !searchStudentId) {
            toast({ variant: 'destructive', title: 'তথ্য অসম্পূর্ণ', description: 'সবগুলো ঘর পূরণ করুন। ' });
            return;
        }
        setIsSearching(true);
        try {
            const cleanRoll = parseInt(bnToEn(searchRoll).trim(), 10);
            const cleanStudentId = bnToEn(searchStudentId).trim().toUpperCase().replace(/\s/g, '');
            
            const studentQuery = query(
                collection(db, 'students'), 
                where('academicYear', '==', searchYear), 
                where('className', '==', searchClass), 
                where('roll', '==', cleanRoll), 
                limit(1)
            );
            const studentSnap = await getDocs(studentQuery);
            
            if (studentSnap.empty) {
                toast({ variant: 'destructive', title: 'শিক্ষার্থী পাওয়া যায়নি' });
                setIsSearching(false); return;
            }
            
            const foundStudent = studentFromDoc(studentSnap.docs[0]);
            const dbStudentId = bnToEn(foundStudent.generatedId || '').trim().toUpperCase().replace(/\s/g, '');
            
            if (dbStudentId !== cleanStudentId && foundStudent.generatedId !== cleanStudentId) {
                 toast({ variant: 'destructive', title: 'আইডি মেলেনি', description: 'অনুগ্রহ করে সঠিক আইডি নম্বরটি পুনরায় লিখুন।' });
                 setIsSearching(false); return;
            }
            
            const allResults = await getAllResults(db, searchYear, searchExam);
            const classRes = allResults.filter(r => r.className === searchClass);
            if (classRes.length === 0) {
                toast({ variant: 'destructive', title: 'ফলাফল প্রকাশিত হয়নি' });
                setIsSearching(false); return;
            }
            const classStudentsSnap = await getDocs(query(collection(db, 'students'), where('academicYear', '==', searchYear), where('className', '==', searchClass)));
            const classStudents = classStudentsSnap.docs.map(studentFromDoc);
            const subs = getSubjects(searchClass, foundStudent.group).filter(s => s.isExamSubject !== false);
            const processedResultsList = processStudentResults(classStudents, classRes, subs);
            const studentProcessed = processedResultsList.find(r => r.student.id === foundStudent.id);
            if (studentProcessed) setSearchResult(studentProcessed);
            else toast({ variant: 'destructive', title: 'ফলাফল পাওয়া যায়নি' });
        } catch (error: any) {
            console.error("Result Search Error:", error);
            toast({ variant: 'destructive', title: 'সার্ভার ত্রুটি' });
        } finally { setIsSearching(false); }
    };

    if(loading || (user && !isLoadingAuth)) return null;

    return (
        <div className="min-h-screen flex flex-col font-kalpurush bg-slate-900 text-slate-900 overflow-x-hidden">
            
            <header className="sticky top-0 z-[100] w-full h-16 md:h-24 bg-primary flex items-center justify-between px-4 sm:px-12 shadow-md">
                <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
                    <div className="relative h-12 w-12 md:h-16 md:w-16 shrink-0 rounded-full border-2 border-white/20 p-0.5 bg-white shadow-md">
                        {isSchoolInfoLoading ? <Skeleton className="h-full w-full rounded-full" /> : <Image src={schoolInfo.logoUrl} alt="Logo" fill className="rounded-full object-contain p-1" />}
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl md:text-4xl font-black text-white leading-tight tracking-tight md:[text-shadow:1px_1px_0px_#000,2px_2px_4px_rgba(0,0,0,0.5)]">
                            {schoolInfo.name}
                        </h1>
                        <p className="text-[10px] md:text-xs font-bold text-white/80 uppercase tracking-widest mt-0.5">Digital Management Portal</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <LanguageSwitcher />
                    <Badge variant="outline" className="hidden sm:flex border-white/20 text-white font-black px-4 py-1.5 h-auto text-sm shadow-sm bg-white/5">
                        সেশন: {toBengaliNumber(globalYear)}
                    </Badge>
                </div>
            </header>

            <NoticeTicker />

            <main className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
                <BackgroundGallery />

                <div className="relative z-10 flex-1 flex flex-col lg:flex-row">
                    <section className="flex-1 p-4 sm:p-8 lg:p-12 flex flex-col justify-start pt-1 space-y-4">
                        <div className="space-y-1">
                            <h2 className="text-sm sm:text-base font-black leading-tight text-white drop-shadow-md tracking-tight">
                                সৃজনশীল শিক্ষায় <span className="text-yellow-400 italic">এক ধাপ এগিয়ে...</span>
                            </h2>
                            <p className="text-[10px] sm:text-[11px] font-bold text-white/90 max-w-2xl leading-relaxed drop-shadow-md">
                                {schoolInfo.name} এর কেন্দ্রীয় ডিজিটাল ম্যানেজমেন্ট পোর্টালে আপনাকে স্বাগতম। আধুনিক শিক্ষা ও প্রশাসনিক কাজে স্বচ্ছতা নিশ্চিত করতে আমাদের এই ডিজিটাল উদ্যোগ।
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button 
                                variant="outline" 
                                size="lg" 
                                className="h-9 px-5 rounded-xl border-2 border-white/30 text-white font-black text-[10px] bg-white/10 backdrop-blur-md shadow-xl hover:bg-white hover:text-primary transition-all duration-500 group"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <BookOpen className="h-3.5 w-3.5 mr-2 group-hover:scale-110 transition-transform" />
                                {isEn ? 'Result Search' : 'ফলাফল অনুসন্ধান'}
                            </Button>
                            <Link href="/admission">
                                <Button 
                                    variant="outline" 
                                    size="lg" 
                                    className="h-9 px-5 rounded-xl border-2 border-emerald-400/50 text-white font-black text-[10px] bg-emerald-600/20 backdrop-blur-md shadow-xl hover:bg-emerald-600 hover:text-white transition-all duration-500 group"
                                >
                                    <UserPlus className="h-3.5 w-3.5 mr-2 group-hover:scale-110 transition-transform" />
                                    {isEn ? 'Online Admission' : 'অনলাইন ভর্তি'}
                                </Button>
                            </Link>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button 
                                        variant="outline" 
                                        size="lg" 
                                        className="h-9 px-5 rounded-xl border-2 border-blue-400/50 text-white font-black text-[10px] bg-blue-600/20 backdrop-blur-md shadow-xl hover:bg-blue-600 hover:text-white transition-all duration-500 group"
                                    >
                                        <LogIn className="h-3.5 w-3.5 mr-2 group-hover:scale-110 transition-transform" />
                                        {isEn ? 'Login' : 'লগইন করুন'}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md p-0 font-kalpurush overflow-hidden border-none shadow-2xl rounded-[32px] z-[150]">
                                    <DialogHeader className="p-6 bg-primary text-white text-center shrink-0 border-b-0">
                                        <DialogTitle className="text-2xl font-black">প্রশাসনিক লগইন</DialogTitle>
                                        <DialogDescription className="text-white/80 font-bold">আপনার ইমেইল ও পাসওয়ার্ড দিন</DialogDescription>
                                    </DialogHeader>
                                    <Card className="w-full border-none shadow-none bg-white">
                                        <CardContent className="p-8">
                                            <Tabs defaultValue="teacher-login" className="w-full">
                                                <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 mb-6 h-11 rounded-xl">
                                                    <TabsTrigger value="teacher-login" className="font-black text-xs rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white">শিক্ষক</TabsTrigger>
                                                    <TabsTrigger value="admin-login" className="font-black text-xs rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white">এডমিন</TabsTrigger>
                                                    <TabsTrigger value="signup" className="font-black text-xs rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white">নিবন্ধন</TabsTrigger>
                                                </TabsList>

                                                <TabsContent value="teacher-login" className="mt-0 space-y-4">
                                                    <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signIn', 'teacher'); }} className="space-y-6">
                                                        <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                                        <Button type="submit" disabled={isLoadingAuth} className="w-full h-12 text-lg font-black shadow-xl">
                                                            {isLoadingAuth ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
                                                            লগইন করুন
                                                        </Button>
                                                    </form>
                                                </TabsContent>
                                                
                                                <TabsContent value="admin-login" className="mt-0">
                                                    <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signIn', 'admin'); }} className="space-y-6">
                                                        <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                                        <Button type="submit" disabled={isLoadingAuth} className="w-full h-12 text-lg font-black shadow-xl">
                                                            লগইন করুন
                                                        </Button>
                                                    </form>
                                                </TabsContent>
                                                
                                                <TabsContent value="signup" className="mt-0">
                                                    <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signUp', 'teacher'); }} className="space-y-6">
                                                        <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                                        <Button type="submit" disabled={isLoadingAuth} className="w-full h-12 text-lg font-black shadow-xl">
                                                            নিবন্ধন করুন
                                                        </Button>
                                                    </form>
                                                </TabsContent>
                                            </Tabs>
                                        </CardContent>
                                    </Card>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><CheckCircle2 className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">{isEn ? 'Digital Attendance' : 'ডিজিটাল হাজিরা'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><ShieldCheck className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">{isEn ? 'Secure Database' : 'নিরাপদ তথ্যভাণ্ডার'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><TrendingUp className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">{isEn ? 'Transparent Accounts' : 'স্বচ্ছ হিসাব শাখা'}</span>
                            </div>
                        </div>

                        <div className="w-full pt-1">
                           <PublicStats stats={stats} globalYear={globalYear} isEn={isEn} />
                        </div>
                    </section>

                    <section className="hidden lg:flex flex-1 p-6 sm:p-12 items-center justify-center">
                        <div className="grid grid-cols-1 gap-6 w-full max-w-md">
                            <LiveRoutineCard />
                            <TeachersOnLeaveCard />
                            <GalleryCard />
                        </div>
                    </section>
                </div>
            </main>

            <footer className="w-full bg-slate-900 text-white/60 p-8 sm:px-12 flex flex-col sm:flex-row justify-between items-center gap-6 font-bold text-sm z-50">
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                    <p>© ২০২৬ {schoolInfo.name}</p>
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {schoolInfo.address}</div>
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {toBengaliNumber('01717576030')}</div>
                </div>
                <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px]">
                    <Sparkles className="h-4 w-4" /> Digital Management Portal | Version 2.0
                </div>
            </footer>

            <Dialog open={isSearchOpen} onOpenChange={(o) => { setIsSearchOpen(o); if(!o) { setSearchResult(null); setSearchRoll(''); setSearchStudentId(''); }}}>
                <DialogContent className="sm:max-w-xl p-0 font-kalpurush overflow-hidden border-none shadow-2xl rounded-2xl z-[150]">
                    {!searchResult ? (
                        <>
                            <DialogHeader className="p-8 bg-primary text-white border-b-0 shrink-0">
                                <DialogTitle className="text-3xl font-black flex items-center gap-2"><BookOpen className="h-8 w-8" /> ফলাফল অনুসন্ধান</DialogTitle>
                                <DialogDescription className="text-white/80 font-bold text-lg mt-1">সঠিক তথ্য দিয়ে ড্রাফট রেজাল্ট সামারি দেখুন</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleResultSearch} className="p-8 space-y-6 bg-white">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="font-black text-xs uppercase">শিক্ষাবর্ষ</Label>
                                        <Select value={searchYear} onValueChange={setSearchYear}>
                                            <SelectTrigger className="h-12 bg-slate-50 border-2 font-black text-lg"><SelectValue /></SelectTrigger>
                                            <SelectContent>{availableYears.map(y => <SelectItem key={y} value={y} className="font-bold">{toBengaliNumber(y)}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-black text-xs uppercase">শ্রেণি</Label>
                                        <Select value={searchClass} onValueChange={setSearchClass}>
                                            <SelectTrigger className="h-12 bg-slate-50 border-2 font-black text-lg"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                                            <SelectContent>{Object.entries(classNamesMap).map(([id, label]) => <SelectItem key={id} value={id} className="font-bold">{label} শ্রেণি</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-black text-xs uppercase">পরীক্ষার নাম</Label>
                                    <Select value={searchExam} onValueChange={setSearchExam}>
                                        <SelectTrigger className="h-12 bg-slate-50 border-2 font-black text-lg"><SelectValue placeholder="পরীক্ষা নির্বাচন করুন" /></SelectTrigger>
                                        <SelectContent>
                                            {searchExams.length > 0 ? searchExams.map(e => <SelectItem key={e.id} value={e.name} className="font-bold">{e.name}</SelectItem>) : <SelectItem value="none" disabled>কোনো পরীক্ষা নেই</SelectItem>}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="font-black text-xs uppercase">রোল নম্বর</Label>
                                        <Input value={searchRoll} onChange={e => setSearchRoll(e.target.value)} placeholder="উদা: ১" className="font-black text-xl h-12 border-2" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-black text-xs uppercase">শিক্ষার্থী আইডি (ID)</Label>
                                        <Input value={searchStudentId} onChange={e => setSearchStudentId(e.target.value)} placeholder="ID লিখুন" className="font-black text-xl h-12 uppercase border-2" required />
                                    </div>
                                </div>
                                <div className="p-4 bg-amber-50 rounded-2xl border-2 border-dashed border-amber-200 flex items-start gap-3">
                                    <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-bold text-amber-800 leading-tight">সতর্কতা: রোল এবং আইডি সঠিক হতে হবে। মার্কশিট প্রিন্ট করতে অফিস বা শ্রেণি শিক্ষকের সাথে যোগাযোগ করুন।</p>
                                </div>
                                <Button type="submit" className="w-full h-14 text-xl font-black shadow-xl" disabled={isSearching}>
                                    {isSearching ? <Loader2 className="animate-spin mr-2 h-6 w-6" /> : <Search className="mr-2 h-6 w-6" />}
                                    ফলাফল দেখুন
                                </Button>
                            </form>
                        </>
                    ) : (
                        <div className="flex flex-col bg-white animate-in zoom-in duration-300">
                            <DialogHeader className="p-8 bg-primary text-white flex flex-row items-center gap-6 shrink-0 border-b-0">
                                <div className="h-24 w-24 border-4 border-white/30 shadow-xl overflow-hidden shrink-0 rounded-full">
                                    <img src={sanitizePhotoUrl(searchResult.student.photoUrl, searchResult.student.gender) || getStudentPlaceholderImage(searchResult.student.gender)} className="object-cover h-full w-full" alt="avatar" />
                                </div>
                                <div className="overflow-hidden">
                                    <DialogTitle className="text-3xl font-black truncate">{searchResult.student.studentNameBn}</DialogTitle>
                                    <DialogDescription className="text-white/80 font-bold text-lg mt-1">
                                        রোল: {toBengaliNumber(searchResult.student.roll)} | {classNamesMap[searchResult.student.className]} শ্রেণি | {searchExam}
                                    </DialogDescription>
                                </div>
                            </DialogHeader>

                            <div className="p-6 space-y-6 bg-slate-50 overflow-y-auto max-h-[60vh]">
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="p-4 text-center border-2 border-black/5 bg-white shadow-sm rounded-2xl">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">মোট নম্বর</p>
                                        <p className="text-2xl font-black text-primary">{toBengaliNumber(searchResult.totalMarks)}</p>
                                    </Card>
                                    <Card className="p-4 text-center border-2 border-black/5 bg-white shadow-sm rounded-2xl">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">জি.পি.এ</p>
                                        <p className="text-2xl font-black text-primary">{toBengaliNumber(searchResult.gpa.toFixed(2))}</p>
                                    </Card>
                                    <Card className="p-4 text-center border-2 border-black/5 bg-white shadow-sm rounded-2xl">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">গ্রেড</p>
                                        <p className={cn("text-2xl font-black", searchResult.isPass ? "text-emerald-600" : "text-rose-600")}>
                                            {searchResult.isPass ? searchResult.finalGrade : `F${toBengaliNumber(searchResult.failedSubjectsCount)}`}
                                        </p>
                                    </Card>
                                    <Card className="p-4 text-center border-2 border-black/5 bg-white shadow-sm rounded-2xl">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">মেধাক্রম</p>
                                        <p className="text-2xl font-black text-amber-600">{searchResult.isPass ? toBengaliNumber(searchResult.meritPosition || '-') : 'ফেল'}</p>
                                    </Card>
                                </div>

                                <div className="border-2 border-black/10 rounded-[32px] overflow-hidden bg-white shadow-xl">
                                    <Table>
                                        <TableHeader className="bg-muted/50 h-12">
                                            <TableRow>
                                                <TableHead className="font-black text-xs text-black pl-8">বিষয়ের নাম</TableHead>
                                                <TableHead className="text-center font-black text-xs text-black">প্রাপ্ত নম্বর</TableHead>
                                                <TableHead className="text-center font-black text-xs text-black">গ্রেড</TableHead>
                                                <TableHead className="text-right pr-8 font-black text-xs text-black">পয়েন্ট</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.from(searchResult.subjectResults.entries()).map(([name, res]) => (
                                                <TableRow key={name} className="h-10">
                                                    <TableCell className="font-bold text-sm text-slate-700 pl-8">{name}</TableCell>
                                                    <TableCell className="text-center font-black text-blue-900 text-lg">{toBengaliNumber(res.marks)}</TableCell>
                                                    <TableCell className={cn("text-center font-black text-sm", res.isPass ? "text-slate-700" : "text-rose-600")}>{res.grade}</TableCell>
                                                    <TableCell className="text-right pr-8 font-bold text-sm">{toBengaliNumber(res.point.toFixed(2))}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <DialogFooter className="p-6 bg-white border-t flex flex-col sm:flex-row gap-4 shrink-0">
                                <Button variant="outline" className="font-black flex-1 h-12 rounded-xl text-lg" onClick={() => setSearchResult(null)}>অন্য ফলাফল খুঁজুন</Button>
                                <Button 
                                    className="font-black flex-1 h-12 shadow-xl bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-lg"
                                    onClick={() => window.print()}
                                >
                                    <Printer className="mr-2 h-5 w-5" /> ফলাফল প্রিন্ট করুন
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {searchResult && (
                <div className="hidden print:block printable-area bg-white text-black p-6 font-kalpurush border-[10px] border-double border-primary/20 rounded-sm w-[210mm] h-[297mm] mx-auto overflow-hidden">
                    <header className="text-center border-b-4 border-primary pb-2 mb-6 flex flex-col items-center">
                        {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="Logo" className="w-16 h-16 object-contain mb-1" />}
                        <h1 className="text-2xl font-black text-primary leading-tight uppercase">{schoolInfo.name}</h1>
                        <p className="text-sm font-bold text-slate-700">{schoolInfo.address}</p>
                        <div className="mt-1 inline-block bg-primary text-white border-2 border-primary px-8 py-0.5 rounded-full font-black text-base shadow-lg">ফলাফল বিবরণী (সামারি)</div>
                    </header>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6 text-sm font-bold bg-slate-50 p-4 border-2 rounded-[20px]">
                        <div className="flex gap-2 border-b border-dashed pb-1"><span className="text-slate-500 w-24">শিক্ষার্থীর নাম:</span> <span className="font-black text-primary">{searchResult.student.studentNameBn}</span></div>
                        <div className="flex gap-2 border-b border-dashed pb-1"><span className="text-slate-500 w-16">আইডি নং:</span> <span className="font-black">{toBengaliNumber(searchResult.student.generatedId || '-')}</span></div>
                        <div className="flex gap-2 border-b border-dashed pb-1"><span className="text-slate-500 w-24">শ্রেণি ও রোল:</span> <span className="font-black">{classNamesMap[searchResult.student.className]} শ্রেণি, রোল- {toBengaliNumber(searchResult.student.roll)}</span></div>
                        <div className="flex gap-2 border-b border-dashed pb-1"><span className="text-slate-500 w-16">পরীক্ষা:</span> <span className="font-black">{searchExam}</span></div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 mb-6">
                        <div className="p-2 border-[1.5px] border-black rounded-lg text-center shadow-sm"><p className="text-[8px] font-black uppercase text-muted-foreground mb-0.5">মোট নম্বর</p><p className="text-xl font-black text-primary">{toBengaliNumber(searchResult.totalMarks)}</p></div>
                        <div className="p-2 border-[1.5px] border-black rounded-lg text-center shadow-sm"><p className="text-[8px] font-black uppercase text-muted-foreground mb-0.5">GPA</p><p className="text-xl font-black text-primary">{toBengaliNumber(searchResult.gpa.toFixed(2))}</p></div>
                        <div className="p-2 border-[1.5px] border-black rounded-lg text-center shadow-sm"><p className="text-[8px] font-black uppercase text-muted-foreground mb-0.5">গ্রেড</p><p className="text-xl font-black">{searchResult.isPass ? searchResult.finalGrade : 'F'}</p></div>
                        <div className="p-2 border-[1.5px] border-black rounded-lg text-center shadow-sm"><p className="text-[8px] font-black uppercase text-muted-foreground mb-0.5">মেধাস্থান</p><p className="text-xl font-black text-amber-600">{searchResult.isPass ? toBengaliNumber(searchResult.meritPosition || '-') : '-'}</p></div>
                    </div>

                    <div className="border-[1.5px] border-black rounded-[20px] overflow-hidden mb-6 shadow-sm">
                        <table className="w-full text-xs text-center border-collapse">
                            <thead className="bg-slate-100 border-b-[1.5px] border-black h-8">
                                <tr>
                                    <th className="border-r border-black font-black p-1">বিষয়ের নাম</th>
                                    <th className="border-r border-black font-black p-1">প্রাপ্ত নম্বর</th>
                                    <th className="border-r border-black font-black p-1">গ্রেড</th>
                                    <th className="font-black p-1">পয়েন্ট</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(searchResult.subjectResults.entries()).map(([name, res]) => (
                                    <tr key={name} className="h-7 border-b border-slate-200 last:border-0">
                                        <td className="border-r border-slate-200 text-left pl-6 font-bold">{name}</td>
                                        <td className="border-r border-slate-200 font-black text-blue-900">{toBengaliNumber(res.marks)}</td>
                                        <td className="border-r border-slate-200 font-black">{res.grade}</td>
                                        <td className="font-bold">{toBengaliNumber(res.point.toFixed(2))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-10 flex justify-between px-10 pt-8">
                        <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">অফিস সহকারীর স্বাক্ষর</div>
                        <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">প্রধান শিক্ষকের স্বাক্ষর ও সিল</div>
                    </div>
                    <div className="mt-auto text-center text-[8px] text-slate-300 italic border-t border-dashed pt-2 flex justify-between">
                        <span>Digital Management Portal | {schoolInfo.name}</span>
                        <span>জেনারেশন সময়: {format(new Date(), 'PPpp', { locale: bn })}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

