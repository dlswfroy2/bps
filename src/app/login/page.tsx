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
import Link from 'next/link';
import { 
    Loader2, Search, BookOpen, User, Info, 
    CheckCircle2, XCircle, ArrowLeft, GraduationCap, Users, 
    UserPlus, Bell, ChevronRight,
    TrendingUp, ShieldCheck, MapPin, Phone,
    CalendarCheck, Trophy, ImageIcon, Megaphone, Sparkles
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
        <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
            {activeImages.length > 0 ? (
                activeImages.map((img, idx) => (
                    <div 
                        key={img.id}
                        className={cn(
                            "absolute inset-0 transition-opacity duration-2000 ease-in-out",
                            idx === currentIdx ? "opacity-100 scale-105" : "opacity-0 scale-100"
                        )}
                        style={{ transitionProperty: 'opacity, transform', transitionDuration: '2s' }}
                    >
                        <Image 
                            src={img.url} 
                            alt={img.title} 
                            fill 
                            priority={idx === 0}
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
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

export default function LoginPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, loading } = useAuth();
    const { schoolInfo, isLoading: isSchoolInfoLoading } = useSchoolInfo();
    const { availableYears, selectedYear: globalYear } = useAcademicYear();
    const db = useFirestore();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
        passRate: 0
    });

    useEffect(() => {
        if (!loading && user) {
            router.push('/');
        }
    }, [user, loading, router]);

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
                
                const sPromise = getDocs(query(collection(db, 'students'), where('academicYear', '==', globalYear)));
                const tPromise = getDocs(query(collection(db, 'staff'), where('isActive', '==', true), where('staffType', '==', 'teacher')));
                const attPromise = getDocs(query(collection(db, 'attendance'), where('academicYear', '==', globalYear), where('date', '==', todayStr)));
                
                const sscRecordsPromise = getDocs(query(
                    collection(db, 'publicExamRecords'), 
                    where('academicYear', '==', globalYear), 
                    where('examType', '==', 'SSC')
                ));

                const [sSnap, tSnap, attSnap, sscSnap] = await Promise.all([
                    sPromise.catch(() => ({ size: 0, docs: [] })),
                    tPromise.catch(() => ({ size: 0, docs: [] })),
                    attPromise.catch(() => ({ size: 0, docs: [] })),
                    sscRecordsPromise.catch(() => ({ size: 0, docs: [] }))
                ]);

                const totalStudentsCount = sSnap.size;
                const activeTeachersCount = tSnap.size;

                let presentCount = 0;
                (attSnap as any).docs.forEach((doc: any) => {
                    const data = doc.data();
                    if (data.attendance) {
                        presentCount += data.attendance.filter((a: any) => a.status === 'present').length;
                    }
                });

                const totalSscParticipants = sscSnap.size;
                const passedCount = sscSnap.docs.filter(doc => {
                    const data = doc.data();
                    const grade = (data.grade || '').toString().trim().toUpperCase();
                    const gpa = Number(data.gpa) || 0;
                    return grade !== '' && grade !== 'F' && gpa > 0;
                }).length;

                const passRatePercent = totalSscParticipants > 0 ? (passedCount / totalSscParticipants) * 100 : 0;

                setStats({ 
                    students: totalStudentsCount, 
                    teachers: activeTeachersCount,
                    attendanceRate: totalStudentsCount > 0 ? (presentCount / totalStudentsCount) * 100 : 0,
                    passRate: passRatePercent
                });
            } catch (e) {
                console.error("Live Stats Error:", e);
            }
        };
        fetchStats();
    }, [db, globalYear]);

    const handleAuthAction = async (action: 'signIn' | 'signUp', role: UserRole) => {
        setIsLoading(true);
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
            setIsLoading(false);
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
            const cleanStudentId = bnToEn(searchStudentId).trim().toUpperCase();
            const studentQuery = query(collection(db, 'students'), where('academicYear', '==', searchYear), where('className', '==', searchClass), where('roll', '==', cleanRoll), limit(1));
            const studentSnap = await getDocs(studentQuery);
            if (studentSnap.empty) {
                toast({ variant: 'destructive', title: 'শিক্ষার্থী পাওয়া যায়নি' });
                setIsSearching(false); return;
            }
            const foundStudent = studentFromDoc(studentSnap.docs[0]);
            if (foundStudent.generatedId?.toUpperCase() !== cleanStudentId) {
                 toast({ variant: 'destructive', title: 'আইডি মেলেনি' });
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
            toast({ variant: 'destructive', title: 'সার্ভার ত্রুটি' });
        } finally { setIsSearching(false); }
    };

    if(loading || user) return null;

    return (
        <div className="min-h-screen flex flex-col font-kalpurush bg-slate-900 text-slate-900 overflow-x-hidden">
            
            {/* Header / Nav */}
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
                <div className="flex items-center gap-4">
                    <Badge variant="outline" className="hidden sm:flex border-white/20 text-white font-black px-4 py-1.5 h-auto text-sm shadow-sm bg-white/5">
                        সেশন: {toBengaliNumber(globalYear)}
                    </Badge>
                </div>
            </header>

            <NoticeTicker />

            <main className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
                {/* Full Background Gallery */}
                <BackgroundGallery />

                {/* Content Overlay */}
                <div className="relative z-10 flex-1 flex flex-col lg:flex-row">
                    {/* Left Side: Welcome & Stats */}
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
                                ফলাফল অনুসন্ধান
                            </Button>
                            <Link href="/admission">
                                <Button 
                                    variant="outline" 
                                    size="lg" 
                                    className="h-9 px-5 rounded-xl border-2 border-emerald-400/50 text-white font-black text-[10px] bg-emerald-600/20 backdrop-blur-md shadow-xl hover:bg-emerald-600 hover:text-white transition-all duration-500 group"
                                >
                                    <UserPlus className="h-3.5 w-3.5 mr-2 group-hover:scale-110 transition-transform" />
                                    অনলাইন ভর্তি
                                </Button>
                            </Link>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><CheckCircle2 className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">ডিজিটাল হাজিরা</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><ShieldCheck className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">নিরাপদ তথ্যভাণ্ডার</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-white/20 backdrop-blur-md shadow-md flex items-center justify-center text-white"><TrendingUp className="h-3 w-3" /></div>
                                <span className="font-bold text-white text-[10px] drop-shadow-md">স্বচ্ছ হিসাব শাখা</span>
                            </div>
                        </div>

                        {/* Fixed Live Stats Board */}
                        <div className="w-full pt-1">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl">
                                <div className="bg-white/90 backdrop-blur-md border-2 border-indigo-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                                    <div className="p-2 bg-indigo-50 rounded-xl w-fit mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <Users className="h-5 w-5" />
                                    </div>
                                    <p className="text-2xl font-black text-slate-900">{toBengaliNumber(stats.students || 0)}</p>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase mt-1">শিক্ষার্থী</p>
                                </div>
                                <div className="bg-white/90 backdrop-blur-md border-2 border-emerald-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                                    <div className="p-2 bg-emerald-50 rounded-xl w-fit mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <GraduationCap className="h-5 w-5" />
                                    </div>
                                    <p className="text-2xl font-black text-slate-900">{toBengaliNumber(stats.teachers || 0)}</p>
                                    <p className="text-[10px] font-black text-emerald-600 uppercase mt-1">শিক্ষক</p>
                                </div>
                                <div className="bg-white/90 backdrop-blur-md border-2 border-blue-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                                    <div className="p-2 bg-blue-50 rounded-xl w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        <CalendarCheck className="h-5 w-5" />
                                    </div>
                                    <p className="text-2xl font-black text-slate-900">{toBengaliNumber(stats.attendanceRate.toFixed(1))}%</p>
                                    <p className="text-[10px] font-black text-blue-600 uppercase mt-1">উপস্থিতি</p>
                                </div>
                                <div className="bg-white/90 backdrop-blur-md border-2 border-rose-200 p-4 rounded-3xl shadow-xl hover:shadow-2xl transition-all group h-full">
                                    <div className="p-2 bg-rose-50 rounded-xl w-fit mb-3 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                        <Trophy className="h-5 w-5" />
                                    </div>
                                    <p className="text-2xl font-black text-slate-900">{toBengaliNumber(stats.passRate.toFixed(1))}%</p>
                                    <p className="text-[10px] font-black text-rose-600 uppercase mt-1">এস এস সি পরীক্ষা-{toBengaliNumber(globalYear)}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Right Side: Auth Form */}
                    <section className="w-full lg:w-[480px] p-6 sm:p-12 flex flex-col items-center justify-center">
                        <Card className="w-full shadow-2xl border-4 border-white/20 rounded-[32px] overflow-hidden bg-white">
                            <CardHeader className="bg-primary p-8 text-white text-center">
                                <CardTitle className="text-2xl font-black">প্রশাসনিক লগইন</CardTitle>
                                <CardDescription className="text-white/80 font-bold">আপনার ইমেইল ও পাসওয়ার্ড দিন</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                <Tabs defaultValue="teacher-login" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 mb-6 h-11 rounded-xl">
                                        <TabsTrigger value="teacher-login" className="font-black text-xs rounded-lg">শিক্ষক</TabsTrigger>
                                        <TabsTrigger value="admin-login" className="font-black text-xs rounded-lg">এডমিন</TabsTrigger>
                                        <TabsTrigger value="signup" className="font-black text-xs rounded-lg">নিবন্ধন</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="teacher-login" className="mt-0 space-y-4">
                                        <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signIn', 'teacher'); }} className="space-y-6">
                                            <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                            <Button type="submit" disabled={isLoading} className="w-full h-12 text-lg font-black shadow-xl">
                                                {isLoading ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
                                                লগইন করুন
                                            </Button>
                                        </form>
                                    </TabsContent>
                                    
                                    <TabsContent value="admin-login" className="mt-0">
                                        <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signIn', 'admin'); }} className="space-y-6">
                                            <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                            <Button type="submit" disabled={isLoading} className="w-full h-12 text-lg font-black shadow-xl">
                                                {isLoading ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
                                                লগইন করুন
                                            </Button>
                                        </form>
                                    </TabsContent>
                                    
                                    <TabsContent value="signup" className="mt-0">
                                        <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('signUp', 'teacher'); }} className="space-y-6">
                                            <AuthFormFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
                                            <Button type="submit" disabled={isLoading} className="w-full h-12 text-lg font-black shadow-xl">
                                                নিবন্ধন করুন
                                            </Button>
                                        </form>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
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

            {/* Result Search Dialog */}
            <Dialog open={isSearchOpen} onOpenChange={(o) => { setIsSearchOpen(o); if(!o) { setSearchResult(null); setSearchRoll(''); setSearchStudentId(''); }}}>
                <DialogContent className="sm:max-w-xl p-0 font-kalpurush overflow-hidden border-none shadow-2xl rounded-2xl z-[150]">
                    {!searchResult ? (
                        <>
                            <DialogHeader className="p-8 bg-primary text-white">
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
                            <DialogHeader className="p-8 bg-primary text-white flex flex-row items-center gap-6">
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

                            <div className="p-8 space-y-8 bg-slate-50 overflow-y-auto max-h-[60vh]">
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
                                        <TableHeader className="bg-muted/50 h-14">
                                            <TableRow>
                                                <TableHead className="font-black text-xs text-black pl-8">বিষয়ের নাম</TableHead>
                                                <TableHead className="text-center font-black text-xs text-black">প্রাপ্ত নম্বর</TableHead>
                                                <TableHead className="text-center font-black text-xs text-black">গ্রেড</TableHead>
                                                <TableHead className="text-right pr-8 font-black text-xs text-black">পয়েন্ট</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.from(searchResult.subjectResults.entries()).map(([name, res]) => (
                                                <TableRow key={name} className="h-12">
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

                            <DialogFooter className="p-6 bg-white border-t flex flex-col sm:flex-row gap-4">
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

            {/* Hidden Printable Result Summary */}
            {searchResult && (
                <div className="hidden print:block printable-area bg-white text-black p-10 font-kalpurush border-[12px] border-double border-primary/20 rounded-sm w-[210mm] h-[297mm] mx-auto overflow-hidden">
                    <header className="text-center border-b-4 border-primary pb-4 mb-8 flex flex-col items-center">
                        {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="Logo" className="w-24 h-24 object-contain mb-3" />}
                        <h1 className="text-4xl font-black text-primary leading-tight uppercase">{schoolInfo.name}</h1>
                        <p className="text-lg font-bold text-slate-700">{schoolInfo.address}</p>
                        <div className="mt-4 inline-block bg-primary text-white px-10 py-1.5 rounded-full font-black text-xl shadow-lg">ফলাফল বিবরণী (সামারি)</div>
                    </header>

                    <div className="grid grid-cols-2 gap-x-10 gap-y-3 mb-10 text-lg font-bold bg-slate-50 p-6 border-2 rounded-[32px]">
                        <div className="flex gap-2 border-b-2 border-dashed pb-2"><span className="text-slate-500 w-32">শিক্ষার্থীর নাম:</span> <span className="font-black text-primary">{searchResult.student.studentNameBn}</span></div>
                        <div className="flex gap-2 border-b-2 border-dashed pb-2"><span className="text-slate-500 w-32">আইডি নং:</span> <span className="font-black">{toBengaliNumber(searchResult.student.generatedId || '-')}</span></div>
                        <div className="flex gap-2 border-b-2 border-dashed pb-2"><span className="text-slate-500 w-32">শ্রেণি ও রোল:</span> <span className="font-black">{classNamesMap[searchResult.student.className]} শ্রেণি, রোল- {toBengaliNumber(searchResult.student.roll)}</span></div>
                        <div className="flex gap-2 border-b-2 border-dashed pb-2"><span className="text-slate-500 w-32">পরীক্ষার নাম:</span> <span className="font-black">{searchExam}</span></div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mb-10">
                        <div className="p-4 border-[3px] border-black rounded-2xl text-center shadow-md"><p className="text-xs font-black uppercase text-muted-foreground mb-1">মোট নম্বর</p><p className="text-3xl font-black text-primary">{toBengaliNumber(searchResult.totalMarks)}</p></div>
                        <div className="p-4 border-[3px] border-black rounded-2xl text-center shadow-md"><p className="text-xs font-black uppercase text-muted-foreground mb-1">GPA</p><p className="text-3xl font-black text-primary">{toBengaliNumber(searchResult.gpa.toFixed(2))}</p></div>
                        <div className="p-4 border-[3px] border-black rounded-2xl text-center shadow-md"><p className="text-xs font-black uppercase text-muted-foreground mb-1">গ্রেড</p><p className="text-3xl font-black">{searchResult.isPass ? searchResult.finalGrade : 'F'}</p></div>
                        <div className="p-4 border-[3px] border-black rounded-2xl text-center shadow-md"><p className="text-xs font-black uppercase text-muted-foreground mb-1">মেধাস্থান</p><p className="text-3xl font-black text-amber-600">{searchResult.isPass ? toBengaliNumber(searchResult.meritPosition || '-') : '-'}</p></div>
                    </div>

                    <div className="border-[3px] border-black rounded-[32px] overflow-hidden mb-10 shadow-lg">
                        <table className="w-full text-base text-center border-collapse">
                            <thead className="bg-slate-100 border-b-[3px] border-black h-12">
                                <tr>
                                    <th className="border-r-[2px] border-black font-black p-2">বিষয়ের নাম</th>
                                    <th className="border-r-[2px] border-black font-black p-2">প্রাপ্ত নম্বর</th>
                                    <th className="border-r-[2px] border-black font-black p-2">গ্রেড</th>
                                    <th className="font-black p-2">পয়েন্ট</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(searchResult.subjectResults.entries()).map(([name, res]) => (
                                    <tr key={name} className="h-10 border-b-2 border-slate-200 last:border-0">
                                        <td className="border-r-[2px] border-slate-200 text-left pl-10 font-bold">{name}</td>
                                        <td className="border-r-[2px] border-slate-200 font-black text-blue-900 text-xl">{toBengaliNumber(res.marks)}</td>
                                        <td className="border-r-[2px] border-slate-200 font-black">{res.grade}</td>
                                        <td className="font-bold">{toBengaliNumber(res.point.toFixed(2))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-auto flex justify-between px-16 pt-20">
                        <div className="text-center w-56 border-t-2 border-black pt-2 font-black text-sm">অফিস সহকারীর স্বাক্ষর</div>
                        <div className="text-center w-56 border-t-2 border-black pt-2 font-black text-sm">প্রধান শিক্ষকের স্বাক্ষর ও সিল</div>
                    </div>
                    <div className="mt-12 text-center text-[10px] text-slate-300 italic border-t border-dashed pt-4 flex justify-between">
                        <span>Digital Management Portal | {schoolInfo.name}</span>
                        <span>জেনারেশন সময়: {format(new Date(), 'PPpp', { locale: bn })}</span>
                    </div>
                </div>
            )}
        </div>
    );
}