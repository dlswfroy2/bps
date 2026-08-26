'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Menu,
  LayoutDashboard,
  UserPlus,
  Users,
  CalendarCheck,
  BookMarked,
  Banknote,
  Users2,
  Settings,
  FileText,
  CalendarClock,
  LogOut,
  UserSearch,
  MessageSquare,
  Search,
  BookOpen,
  FileBadge,
  IdCard,
  UserCheck,
  ChevronRight,
  Loader2,
  ListTodo,
  Bell,
  Wifi,
  WifiOff,
  ArrowLeft,
  Award
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEffect, useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Label } from "@/components/ui/label";
import { Skeleton } from './ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { signOut } from '@/lib/auth';
import { useFirestore } from '@/firebase';
import { collection, query, where, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Student, studentFromDoc, getStudentPlaceholderImage, sanitizePhotoUrl } from '@/lib/student-data';
import { StudentFeeDialog } from './StudentFeeDialog';
import { cn } from '@/lib/utils';
import { getExams, Exam } from '@/lib/exam-data';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const classNamesMap: { [key: string]: string } = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম'
};

const mainMenuItems = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard, href: '/', permission: 'view:dashboard', color: 'bg-sky-50 text-sky-700 border-sky-100' },
  { id: 'admissions', label: 'ভর্তি আবেদনসমূহ', icon: UserCheck, href: '/admissions-management', permission: 'manage:admissions', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { id: 'notices', label: 'নোটিশ বোর্ড', icon: Bell, href: '/notices-management', permission: 'view:notices', color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  { id: 'profile-search', label: 'শিক্ষার্থী প্রোফাইল', icon: UserSearch, href: '/student-profile', permission: 'view:student-profile', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  { id: 'add-student', label: 'নতুন শিক্ষার্থী যোগ', icon: UserPlus, href: '/add-student', permission: 'manage:students', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { id: 'student-list', label: 'শিক্ষার্থী তালিকা', icon: Users, href: '/student-list', permission: 'view:students', color: 'bg-rose-50 text-rose-700 border-rose-100' },
  { id: 'attendance', label: 'হাজিরা', icon: CalendarCheck, href: '/attendance', permission: 'manage:attendance', color: 'bg-amber-50 text-amber-700 border-amber-100' },
  { id: 'lesson-planner', label: 'লেসন প্ল্যান ও সিলেবাস', icon: ListTodo, href: '/lesson-planner', permission: 'manage:lesson-plans', color: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
  { id: 'results', label: 'ফলাফল', icon: BookMarked, href: '/results', permission: ['manage:results', 'input:results'], color: 'bg-violet-50 text-violet-700 border-violet-100' },
  { id: 'public-exam-records', label: 'পাবলিক পরীক্ষার রেকর্ড', icon: Award, href: '/public-exam-records', permission: ['manage:results', 'input:results'], color: 'bg-amber-50 text-amber-700 border-amber-100' },
  { id: 'messaging', label: 'মেসেজ', icon: MessageSquare, href: '/messaging', permission: ['send:messaging', 'manage:messaging'], color: 'bg-lime-50 text-lime-700 border-lime-100' },
  { id: 'accounts', label: 'হিসাব শাখা', icon: Banknote, href: '/accounts', permission: 'view:accounts', color: 'bg-teal-50 text-teal-700 border-teal-100' },
  { id: 'staff', label: 'শিক্ষক ও কর্মচারী', icon: Users2, href: '/staff', permission: 'view:staff', color: 'bg-orange-50 text-orange-700 border-orange-100' },
  { id: 'documents', label: 'ডকুমেন্ট', icon: FileText, href: '/documents', permission: 'manage:documents', color: 'bg-slate-50 text-slate-700 border-slate-100' },
  { id: 'routines', label: 'রুটিন', icon: CalendarClock, href: '/routines', permission: 'view:routines', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' },
  { id: 'settings', label: 'সেটিং', icon: Settings, href: '/settings', permission: 'manage:settings', color: 'bg-gray-50 text-gray-700 border-gray-100' },
];

export function Header() {
  const [isClient, setIsClient] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { selectedYear, setSelectedYear, availableYears } = useAcademicYear();
  const { schoolInfo, isLoading: isSchoolInfoLoading } = useSchoolInfo();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const db = useFirestore();
  
  const [displayPhoto, setDisplayPhoto] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [displayDesignation, setDisplayDesignation] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lastFetchedYear, setLastFetchedYear] = useState('');

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [actionsDialogOpen, setActionsDialogOpen] = useState(false);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamForMarksheet, setSelectedExamForMarksheet] = useState<string>('বার্ষিক পরীক্ষা');

  useEffect(() => {
    setIsClient(true);
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    let unsubscribe: (() => void) | undefined;
    
    if (user.role === 'teacher' && user.email) {
      const staffQuery = query(collection(db, 'staff'), where('email', '==', user.email.toLowerCase().trim()), limit(1));
      unsubscribe = onSnapshot(staffQuery, (snapshot) => {
        if (!snapshot.empty) {
          const staffData = snapshot.docs[0].data();
          setDisplayPhoto(staffData.photoUrl);
          setDisplayName(staffData.nameBn);
          setDisplayDesignation(staffData.designation);
        } else {
          setDisplayPhoto(user.photoUrl || null);
          setDisplayName(user.displayName || null);
          setDisplayDesignation('শিক্ষক');
        }
      }, (error) => {
          if (error.code === 'permission-denied') {
              errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: 'staff',
                  operation: 'get',
              } satisfies SecurityRuleContext));
          }
      });
    } else {
      setDisplayPhoto(user.photoUrl || null);
      setDisplayName(user.displayName || 'Admin');
      setDisplayDesignation('সিস্টেম এডমিনিস্ট্রেটর');
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, db]);

  useEffect(() => {
    if (db && selectedYear && user) {
        getExams(db, selectedYear).then(data => {
            setExams(data);
            if (data.length > 0) {
                const annual = data.find(e => e.name.includes('বার্ষিক'));
                setSelectedExamForMarksheet(annual ? annual.name : data[0].name);
            }
        });
    }
  }, [db, selectedYear, user]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const handleSearchOpen = async (open: boolean) => {
    setSearchOpen(open);
    if (open && db && user && (allStudents.length === 0 || lastFetchedYear !== selectedYear)) {
        setIsSearching(true);
        try {
            const q = query(collection(db, 'students'), where('academicYear', '==', selectedYear));
            const snap = await getDocs(q);
            setAllStudents(snap.docs.map(studentFromDoc));
            setLastFetchedYear(selectedYear);
        } catch (e: any) {
            if (e.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'students',
                    operation: 'list',
                } satisfies SecurityRuleContext));
            }
            console.error(e);
        }
        setIsSearching(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
    const q = searchQuery.toLowerCase();
    const qEn = bnToEn(q);
    return allStudents.filter(s => {
        const nameBn = (s.studentNameBn || '').toLowerCase();
        const nameEn = (s.studentNameEn || '').toLowerCase();
        const rollEn = parseInt(qEn, 10);
        return nameBn.includes(q) || nameEn.includes(q) || (!isNaN(rollEn) && rollEn === s.roll) || (s.generatedId?.toLowerCase() === qEn);
    }).slice(0, 10);
  }, [searchQuery, allStudents]);

  const handleStudentClick = (student: Student) => {
    setSelectedStudent(student);
    setSearchOpen(false);
    setSearchQuery('');
    setActionsDialogOpen(true);
  };

  const permittedMenuItems = useMemo(() => {
    if (!user) return [];
    return mainMenuItems.filter(item => {
      if (user.role === 'admin') return true;
      if (Array.isArray(item.permission)) return item.permission.some(p => hasPermission(p));
      return hasPermission(item.permission);
    });
  }, [user, hasPermission]);

  if (!isClient) return <header className="h-16 bg-primary" />;

  return (
    <>
      <header className="sticky top-0 z-[60] flex h-16 md:h-24 items-center justify-between border-b bg-primary px-4 text-primary-foreground shadow-sm sm:px-6 md:px-8">
        <div className="flex items-center gap-2">
          {user && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                className="shrink-0 rounded-lg bg-white text-primary hover:bg-gray-100"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 rounded-lg bg-white text-primary hover:bg-gray-100">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col p-0 font-kalpurush h-full w-[260px]">
                  <SheetHeader className="p-2 border-b bg-primary/5 shrink-0">
                      <SheetTitle className="sr-only">Main Menu</SheetTitle>
                      <SheetDescription className="sr-only">Navigation and settings</SheetDescription>
                    <Link href="/" className="flex items-center gap-2 text-base font-semibold text-foreground">
                      {isSchoolInfoLoading ? <Skeleton className="h-6 w-6 rounded-md" /> : (schoolInfo.logoUrl && (
                        <div className="relative h-6 w-6">
                          <Image src={schoolInfo.logoUrl} alt="Logo" fill className="object-contain" />
                        </div>
                      ))}
                      <span className="font-black text-slate-900 truncate text-[10px]">{isSchoolInfoLoading ? <Skeleton className="h-4 w-20" /> : schoolInfo.name}</span>
                    </Link>
                  </SheetHeader>
                  
                  <div className="px-3 py-1 border-b bg-slate-50 shrink-0">
                      <Label htmlFor="year-select" className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">শিক্ষাবর্ষ</Label>
                      <Select value={selectedYear} onValueChange={setSelectedYear}>
                          <SelectTrigger id="year-select" className="mt-0.5 h-6 bg-white border-2 border-primary/10 font-black text-primary text-[10px] px-2">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              {availableYears.map(year => (
                                  <SelectItem key={year} value={year} className="font-bold">{toBengaliNumber(year)}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <nav className="grid gap-0.5 p-2">
                            {permittedMenuItems.map((item) => (
                                <SheetClose asChild key={item.id}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2 px-2.5 py-2.5 rounded-lg border-2 transition-all shadow-sm",
                                            pathname === item.href ? "border-primary bg-primary text-white shadow-md" : cn(item.color, "hover:shadow-md")
                                        )}
                                    >
                                        <item.icon className={cn("h-4 w-4 shrink-0", pathname === item.href ? "text-white" : "")} />
                                        <span className="font-black text-sm">{item.label}</span>
                                        <ChevronRight className={cn("ml-auto h-3 w-3 opacity-30", pathname === item.href ? "text-white opacity-100" : "")} />
                                    </Link>
                                </SheetClose>
                            ))}
                        </nav>
                    </ScrollArea>
                  </div>
                  
                  <div className="p-3 border-t bg-white shrink-0 mt-auto no-print">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <Avatar className="h-9 w-9 border-2 border-primary/10 shadow-sm shrink-0">
                                <AvatarImage src={displayPhoto || undefined} />
                                <AvatarFallback className="font-black text-[10px]">{displayName?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-[11px] font-black text-slate-900 truncate leading-tight">{displayName || 'ব্যবহারকারী'}</span>
                                <span className="text-[9px] font-bold text-primary truncate leading-tight">{displayDesignation || 'শিক্ষক'}</span>
                            </div>
                        </div>
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            className="h-8 px-3 font-black text-[10px] shrink-0 shadow-sm" 
                            onClick={handleLogout}
                        >
                            <LogOut className="h-3 w-3 mr-1" />
                            লগ আউট
                        </Button>
                    </div>
                    <div className="text-center pt-1 border-t border-dashed">
                        <p className="text-[9px] font-bold text-muted-foreground leading-relaxed">
                            © {toBengaliNumber(selectedYear)} {schoolInfo.name}।<br/>সর্বস্বত্ব সংরক্ষিত।
                        </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>

        <Link href="/" className="flex items-center gap-2 sm:gap-4 md:gap-6">
            {!isSchoolInfoLoading && schoolInfo.logoUrl && (
              <div className="relative h-10 w-10 md:h-[70px] md:w-[70px] shrink-0 bg-white p-1 shadow-md border-2 border-white/20 rounded-full">
                <Image src={schoolInfo.logoUrl} alt="Logo" fill className="object-contain rounded-full" />
              </div>
            )}
            <div className="flex flex-col items-center md:items-start">
              <div className="text-xl sm:text-2xl md:text-[40px] font-black whitespace-nowrap tracking-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] leading-tight">
                {isSchoolInfoLoading ? <Skeleton className="h-8 w-40 md:h-12 md:w-80" /> : schoolInfo.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {isClient && (
                  <Badge variant="outline" className="bg-white/20 text-white border-white/40 font-black text-[10px] md:text-xs h-5 px-3 backdrop-blur-sm shadow-sm">
                    শিক্ষাবর্ষ: {toBengaliNumber(selectedYear)}
                  </Badge>
                )}
                {!isOnline && (
                  <Badge className="bg-rose-500 text-white font-black text-[8px] md:text-[10px] h-4 animate-pulse gap-1">
                    <WifiOff className="h-2 w-2" /> অফলাইন মোড (লোকাল সেভ)
                  </Badge>
                )}
              </div>
            </div>
        </Link>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitcher />
          {user && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full bg-white/20 text-white hover:bg-white/30 shadow-sm"
              onClick={() => handleSearchOpen(true)}
              title="শিক্ষার্থী খুঁজুন"
            >
              <Search className="h-5 w-5" />
            </Button>
          )}
          {authLoading ? <Skeleton className="h-10 w-10 rounded-full" /> : user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end text-right">
                <span className="text-sm font-black text-white leading-tight">{displayName || 'ব্যবহারকারী'}</span>
                <span className="text-[10px] font-bold text-white/80 leading-tight">{displayDesignation || (user.role === 'admin' ? 'সিস্টেম এডমিনিস্ট্রেটর' : 'শিক্ষক')}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-white cursor-pointer shadow-md">
                    <AvatarImage src={displayPhoto || undefined} />
                    <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 font-kalpurush">
                    <DropdownMenuLabel>
                      <p className="font-black">{displayName || 'ব্যবহারকারী'}</p>
                      <p className="text-xs font-normal text-muted-foreground truncate">{user.email}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer font-bold">
                        <Settings className="mr-2 h-4 w-4" /> সেটিংস
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 font-bold">
                        <LogOut className="mr-2 h-4 w-4" /> লগ আউট
                    </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Link href="/login"><Button variant="secondary">লগইন</Button></Link>
          )}
        </div>
      </header>

      {/* Student Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={handleSearchOpen}>
          <DialogContent className="sm:max-w-md font-kalpurush p-0 border-none shadow-2xl overflow-hidden rounded-2xl">
              <DialogHeader className="p-6 bg-primary text-white">
                  <DialogTitle className="text-2xl font-black flex items-center gap-2"><Search className="h-6 w-6" /> শিক্ষার্থী খুঁজুন</DialogTitle>
                  <DialogDescription className="text-white/80 font-bold">নাম, রোল বা আইডি দিয়ে শিক্ষার্থীর তথ্য বের করুন</DialogDescription>
              </DialogHeader>
              <div className="p-6 space-y-4">
                  <Input 
                      placeholder="এখানে লিখুন..." 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      autoFocus 
                      className="h-12 text-lg font-bold border-2 focus:ring-primary shadow-sm" 
                  />
                  <ScrollArea className="h-[350px] pr-2">
                      <div className="space-y-2">
                          {isSearching ? (
                              <div className="flex flex-col items-center justify-center py-20 gap-3">
                                  <Loader2 className="animate-spin h-8 w-8 text-primary" />
                                  <p className="text-sm font-bold text-muted-foreground">ডাটাবেস অনুসন্ধান করা হচ্ছে...</p>
                              </div>
                          ) : filteredResults.length > 0 ? (
                              filteredResults.map(s => (
                                  <div 
                                      key={s.id} 
                                      className="group flex items-center justify-between p-3 border-2 border-slate-100 rounded-2xl hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all active:scale-[0.98]" 
                                      onClick={() => handleStudentClick(s)}
                                  >
                                      <div className="flex items-center gap-3">
                                          <Avatar className="h-11 w-11 border-2 border-white shadow-sm">
                                              <AvatarImage src={sanitizePhotoUrl(s.photoUrl, s.gender) || getStudentPlaceholderImage(s.gender)} />
                                          </Avatar>
                                          <div>
                                              <p className="text-sm font-black text-slate-800">{s.studentNameBn}</p>
                                              <p className="text-[10px] font-bold text-muted-foreground">
                                                  রোল: {s.roll.toLocaleString('bn-BD')} | {classNamesMap[s.className] || s.className} শ্রেণি
                                              </p>
                                          </div>
                                      </div>
                                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-colors" />
                                  </div>
                              ))
                          ) : searchQuery ? (
                              <div className="text-center py-20 text-muted-foreground">
                                  <p className="font-bold">দুঃখিত, কোনো মিল পাওয়া যায়নি।</p>
                              </div>
                          ) : (
                              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                                  <Users className="h-16 w-16" />
                                  <p className="text-sm font-black uppercase mt-2">অনুসন্ধান করুন</p>
                              </div>
                          )}
                      </div>
                  </ScrollArea>
              </div>
          </DialogContent>
      </Dialog>

      {/* Student Quick Actions Dialog */}
      <Dialog open={actionsDialogOpen} onOpenChange={setActionsDialogOpen}>
          <DialogContent className="font-kalpurush max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="p-6 bg-slate-50 border-b">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-4 border-white shadow-md">
                        <AvatarImage src={sanitizePhotoUrl(selectedStudent?.photoUrl, selectedStudent?.gender) || (selectedStudent ? getStudentPlaceholderImage(selectedStudent.gender) : undefined)} />
                    </Avatar>
                    <div>
                        <DialogTitle className="text-xl font-black text-slate-800">{selectedStudent?.studentNameBn}</DialogTitle>
                        <DialogDescription className="font-bold text-primary">
                            রোল: {selectedStudent?.roll.toLocaleString('bn-BD')} | {classNamesMap[selectedStudent?.className || '']} শ্রেণি
                        </DialogDescription>
                    </div>
                  </div>
              </DialogHeader>
              <div className="p-6 bg-white space-y-4">
                  {/* Exam Selector for Marksheet */}
                  <div className="space-y-1.5 p-3.5 bg-violet-50/70 rounded-2xl border-2 border-violet-100 shadow-sm">
                      <Label className="text-xs font-black text-violet-900 flex items-center gap-1.5">
                          <FileBadge className="h-4 w-4 text-violet-600" /> মার্কশিটের জন্য পরীক্ষা নির্বাচন করুন:
                      </Label>
                      <Select value={selectedExamForMarksheet} onValueChange={setSelectedExamForMarksheet}>
                          <SelectTrigger className="h-10 bg-white border border-violet-200 text-xs font-black text-violet-950 focus:ring-violet-400">
                              <SelectValue placeholder="পরীক্ষা নির্বাচন করুন" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[250px] font-kalpurush">
                              {exams.length > 0 ? (
                                  exams.map((exam) => (
                                      <SelectItem key={exam.id || exam.name} value={exam.name} className="font-bold text-xs">
                                          {exam.name}
                                      </SelectItem>
                                  ))
                              ) : (
                                  <>
                                      <SelectItem value="১ম সাময়িক পরীক্ষা" className="font-bold text-xs">১ম সাময়িক পরীক্ষা</SelectItem>
                                      <SelectItem value="২য় সাময়িক পরীক্ষা" className="font-bold text-xs">২য় সাময়িক পরীক্ষা</SelectItem>
                                      <SelectItem value="বার্ষিক পরীক্ষা" className="font-bold text-xs">বার্ষিক পরীক্ষা</SelectItem>
                                      <SelectItem value="প্রাক-নির্বাচনী পরীক্ষা" className="font-bold text-xs">প্রাক-নির্বাচনী পরীক্ষা</SelectItem>
                                      <SelectItem value="নির্বাচনী পরীক্ষা" className="font-bold text-xs">নির্বাচনী পরীক্ষা</SelectItem>
                                  </>
                              )}
                          </SelectContent>
                      </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" className="h-14 flex flex-col items-center justify-center gap-1 border-2 border-rose-100 hover:bg-rose-50 text-rose-700 font-black rounded-2xl shadow-sm" onClick={() => { setActionsDialogOpen(false); router.push(`/student-list?class=${selectedStudent?.className}&studentId=${selectedStudent?.id}`); }}>
                        <Users className="h-5 w-5" />
                        <span className="text-[10px]">প্রোফাইল</span>
                      </Button>
                      <Button variant="outline" className="h-14 flex flex-col items-center justify-center gap-1 border-2 border-teal-100 hover:bg-teal-50 text-teal-700 font-black rounded-2xl shadow-sm" onClick={() => { setActionsDialogOpen(false); setFeeDialogOpen(true); }}>
                        <Banknote className="h-5 w-5" />
                        <span className="text-[10px]">বেতন আদায়</span>
                      </Button>
                      <Button variant="outline" className="h-14 flex flex-col items-center justify-center gap-1 border-2 border-blue-100 hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-sm" onClick={() => { setActionsDialogOpen(false); router.push(`/student-profile?roll=${selectedStudent?.roll}&class=${selectedStudent?.className}`); }}>
                        <CalendarCheck className="h-5 w-5" />
                        <span className="text-[10px]">হাজিরা রিপোর্ট</span>
                      </Button>
                      <Button variant="outline" className="h-14 flex flex-col items-center justify-center gap-1 border-2 border-violet-200 bg-violet-600 text-white hover:bg-violet-700 font-black rounded-2xl shadow-md transition-all active:scale-95" onClick={() => { setActionsDialogOpen(false); window.open(`/marksheet/${selectedStudent?.id}?academicYear=${selectedYear}&examName=${encodeURIComponent(selectedExamForMarksheet || 'বার্ষিক পরীক্ষা')}`, '_blank'); }}>
                        <FileBadge className="h-5 w-5" />
                        <span className="text-[10px]">মার্কশিট প্রিন্ট</span>
                      </Button>
                  </div>
              </div>
              <DialogFooter className="p-4 bg-slate-50 border-t">
                  <Button variant="ghost" className="w-full font-bold h-10" onClick={() => setActionsDialogOpen(false)}>বন্ধ করুন</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {selectedStudent && <StudentFeeDialog student={selectedStudent} open={feeDialogOpen} onOpenChange={setFeeDialogOpen} onFeeCollected={() => {}} />}
    </>
  );
}
