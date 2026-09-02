
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Trash2, Upload, Info, Database, Calculator, Clock, Loader2, ChevronRight, User, School, 
    Calendar, Users, HardDriveDownload, Monitor, ShieldAlert,
    FileSpreadsheet, FileJson, Download, ImageIcon, Plus, CheckCircle2, Save, Eye, EyeOff, Bell, FilePen, Sparkles, Printer, FileText, ExternalLink
} from 'lucide-react';
import { format } from "date-fns";
import { bn } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { addHoliday, getHolidays, deleteHoliday, Holiday, NewHolidayData, createInitialHolidays } from '@/lib/holiday-data';
import { getGalleryConfig, saveGalleryConfig, GalleryConfig, GalleryImage, defaultGalleryConfig } from '@/lib/gallery-data';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import type { SchoolInfo } from '@/lib/school-info';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDocs, where, limit, FirestoreError } from 'firebase/firestore';
import { DatePicker } from '@/components/ui/date-picker';
import { useAuth } from '@/hooks/useAuth';
import { User as SystemUser, userFromDoc, UserRole } from '@/lib/user';
import { updateUserPermissions, updateUserRole, deleteUserRecord } from '@/lib/user-management';
import { changePassword } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { availablePermissions, defaultPermissions } from '@/lib/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Staff, staffFromDoc } from '@/lib/staff-data';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSubjects } from '@/lib/subjects';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import * as XLSX from 'xlsx';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// --- Utility Functions ---
const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const classNamesMap: Record<string, string> = {
    '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম'
};

// --- Sub Components ---

function GalleryManagementSettings() {
    const db = useFirestore();
    const { toast } = useToast();
    const [config, setConfig] = useState<GalleryConfig>(defaultGalleryConfig);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [newImgUrl, setNewImgUrl] = useState('');
    const [newImgTitle, setNewImgTitle] = useState('');

    useEffect(() => {
        if (!db) return;
        getGalleryConfig(db).then(data => {
            setConfig(data);
            setIsLoading(false);
        });
    }, [db]);

    const handleSave = async () => {
        if (!db) return;
        setIsSaving(true);
        try {
            await saveGalleryConfig(db, config);
            toast({ title: 'গ্যালারি সেটিংস সংরক্ষিত হয়েছে' });
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddImage = () => {
        if (!newImgUrl.trim()) {
            toast({ variant: 'destructive', title: 'ছবির লিংক দিন' });
            return;
        }
        const newImg: GalleryImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: newImgUrl,
            title: newImgTitle || 'নতুন ছবি',
            isActive: true
        };
        setConfig(prev => ({ ...prev, images: [...prev.images, newImg] }));
        setNewImgUrl('');
        setNewImgTitle('');
    };

    const handleRemoveImage = (id: string) => {
        setConfig(prev => ({ ...prev, images: prev.images.filter(img => img.id !== id) }));
    };

    const handleToggleActive = (id: string, val: boolean) => {
        setConfig(prev => ({
            ...prev,
            images: prev.images.map(img => img.id === id ? { ...img, isActive: val } : img)
        }));
    };

    if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

    return (
        <Card className="border-none shadow-none">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="text-2xl font-black flex items-center gap-2">
                    <ImageIcon className="h-6 w-6 text-primary" /> ড্যাশবোর্ড গ্যালারি ব্যবস্থাপনা
                </CardTitle>
                <CardDescription>ড্যাশবোর্ডে প্রদর্শিত ছবি এবং স্লাইডার সেটিংস নিয়ন্ত্রণ করুন</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-6 space-y-8">
                {/* Global Slider Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-2 border-dashed rounded-2xl bg-primary/5">
                    <div className="space-y-2">
                        <Label className="font-bold flex items-center gap-2">
                            <Clock className="h-4 w-4" /> স্লাইড ডিউরেশন (সেকেন্ড)
                        </Label>
                        <div className="flex items-center gap-3">
                            <Input 
                                type="number" 
                                value={config.duration} 
                                onChange={e => setConfig(prev => ({ ...prev, duration: parseInt(e.target.value) || 5 }))}
                                className="w-32 h-11 text-lg font-black text-center"
                            />
                            <span className="text-sm font-bold text-muted-foreground">সেকেন্ড পর ছবি পরিবর্তন হবে</span>
                        </div>
                    </div>
                </div>

                {/* Add New Image Form */}
                <div className="space-y-4">
                    <h3 className="font-black text-lg text-slate-800">নতুন ছবি যোগ করুন</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">ছবির লিংক (URL)</Label>
                            <Input value={newImgUrl} onChange={e => setNewImgUrl(e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase">ছবির শিরোনাম</Label>
                            <Input value={newImgTitle} onChange={e => setNewImgTitle(e.target.value)} placeholder="উদা: আমাদের মাঠ" />
                        </div>
                        <Button onClick={handleAddImage} variant="outline" className="h-10 border-primary text-primary font-black hover:bg-primary/5">
                            <Plus className="h-4 w-4 mr-2" /> ছবি যুক্ত করুন
                        </Button>
                    </div>
                </div>

                {/* Image List */}
                <div className="space-y-4 pt-4">
                    <h3 className="font-black text-lg text-slate-800 flex items-center justify-between">
                        ছবির তালিকা 
                        <Badge variant="outline" className="font-black">{toBengaliNumber(config.images.length)} টি ছবি</Badge>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {config.images.map((img) => (
                            <div key={img.id} className={cn(
                                "group relative border-2 rounded-xl overflow-hidden bg-white shadow-sm transition-all hover:shadow-md",
                                !img.isActive && "opacity-60 grayscale-[0.5]"
                            )}>
                                <div className="aspect-video relative">
                                    <Image src={img.url} alt={img.title} fill className="object-cover" />
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button 
                                            variant="destructive" 
                                            size="icon" 
                                            className="h-7 w-7 shadow-lg"
                                            onClick={() => handleRemoveImage(img.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="absolute bottom-2 left-2">
                                        <Badge className={cn("font-black text-[9px] shadow-lg", img.isActive ? "bg-emerald-600" : "bg-slate-500")}>
                                            {img.isActive ? 'প্রদর্শিত হচ্ছে' : 'লুকানো'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <Input 
                                            value={img.title} 
                                            onChange={e => {
                                                const next = config.images.map(i => i.id === img.id ? { ...i, title: e.target.value } : i);
                                                setConfig(prev => ({ ...prev, images: next }));
                                            }}
                                            className="h-8 text-[11px] font-bold bg-muted/20 border-transparent focus:border-primary"
                                        />
                                        <Switch 
                                            checked={img.isActive} 
                                            onCheckedChange={v => handleToggleActive(img.id, v)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="px-0 border-t justify-end pt-8">
                <Button onClick={handleSave} disabled={isSaving} className="px-12 h-12 text-lg font-black shadow-xl">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                    পরিবর্তন সেভ করুন
                </Button>
            </CardFooter>
        </Card>
    );
}

function SystemUsageInfo() {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-blue-200 bg-blue-50 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-blue-700">
                        <Database className="h-5 w-5" />
                        <CardTitle className="text-lg">ডাটাবেস লিমিট (ফ্রি)</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-blue-900">
                    <p>• <strong>রিড (Read):</strong> প্রতিদিন ৫০,০০০ বার</p>
                    <p>• <strong>রাইট (Write):</strong> প্রতিদিন ২০,০০০ বার</p>
                    <p>• <strong>স্টোরেজ:</strong> ১ জিবি ডাটা (টেক্সট)</p>
                    <p>• <strong>মেয়াদ:</strong> আজীবন ফ্রি (Spark Plan)</p>
                </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-emerald-700">
                        <Calculator className="h-5 w-5" />
                        <CardTitle className="text-lg">স্থায়িত্ব প্রাক্কলন</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-emerald-900">
                    <p>• <strong>১০০০ শিক্ষার্থীর জন্য:</strong> বছরে প্রায় ৫০-১০০ মেগাবাইট।</p>
                    <p>• <strong>ব্যবহারযোগ্য সময়:</strong> প্রায় ১০-১৫ বছর (সম্পূর্ণ ফ্রি)।</p>
                    <p>• <strong>ডেইলি অ্যাক্টিভিটি:</strong> ১০০০ হাজিরার কাজ অনায়াসেই ফ্রি লিমিটের মধ্যে থাকবে।</p>
                </CardContent>
            </Card>

            <Card className="md:col-span-2 border-slate-200">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">সতর্কতা ও পরামর্শ</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2 leading-relaxed">
                    <p>১. বিদ্যালয়ের ছাত্র সংখ্যা ১০০০ হলেও আপনি এই ফ্রি লিমিট অতিক্রম করবেন না, যদি না প্রতিদিন অস্বাভাবিক বেশি রিড/রাইট করা হয়।</p>
                    <p>২. ১০ বছর পর যদি ডাটাবেস পূর্ণ হয়ে যায়, তবে পুরনো বছরের ডাটা এক্সপোর্ট করে রিমুভ করলে জায়গা খালি করা যাবে।</p>
                    <p>৩. বড় সাইজের ছবি আপলোড থেকে বিরত থাকলে স্টোরেজ আরও অনেক বেশি বছর স্থায়ী হবে।</p>
                </CardContent>
            </Card>
        </div>
    );
}

function SchoolInfoSettings() {
    const { schoolInfo, updateSchoolInfo } = useSchoolInfo();
    const { toast } = useToast();
    const [info, setInfo] = useState(schoolInfo);
    const [logoPreview, setLogoPreview] = useState<string | null>(schoolInfo.logoUrl);

    useEffect(() => {
        setInfo(schoolInfo);
        setLogoPreview(schoolInfo.logoUrl);
    }, [schoolInfo]);

    const handleInputChange = (field: keyof SchoolInfo, value: string) => {
        setInfo(prev => ({...prev, [field]: value}));
    };

    const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setLogoPreview(result);
                handleInputChange('logoUrl', result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveChanges = () => {
        updateSchoolInfo(info).then(() => {
            toast({ title: 'প্রতিষ্ঠানের তথ্য সংরক্ষিত হয়েছে' });
        }).catch(() => {});
    };
    
    return (
        <Card className="border-none shadow-none">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="text-2xl font-black">প্রতিষ্ঠানের সাধারণ তথ্য</CardTitle>
                <CardDescription>আপনার বিদ্যালয়ের দাপ্তরিক তথ্য এখান থেকে পরিবর্তন করুন</CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-8 pt-4">
                 <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="schoolName" className="font-bold">প্রতিষ্ঠানের নাম (বাংলা)</Label>
                        <Input id="schoolName" value={info.name} onChange={(e) => handleInputChange('name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="schoolNameEn" className="font-bold">School Name (English)</Label>
                        <Input id="schoolNameEn" value={info.nameEn || ''} onChange={(e) => handleInputChange('nameEn', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="eiin" className="font-bold">EIIN</Label>
                        <Input id="eiin" value={info.eiin} onChange={(e) => handleInputChange('eiin', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="schoolCode" className="font-bold">স্কুল কোড</Label>
                        <Input id=" schoolCode" value={info.code} onChange={(e) => handleInputChange('code', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address" className="font-bold">ঠিকানা</Label>
                        <Textarea id="address" value={info.address} onChange={(e) => handleInputChange('address', e.target.value)} />
                    </div>
                 </div>

                 <div className="space-y-4 border-t pt-6">
                    <Label className="font-bold text-lg">প্রতিষ্ঠানের লোগো</Label>
                    <div className="flex items-center gap-6">
                        <div className="w-32 h-32 rounded-xl border-4 border-white shadow-xl bg-muted overflow-hidden shrink-0">
                            {logoPreview ? (
                                <Image src={logoPreview} alt="School Logo" width={128} height={128} className="object-contain w-full h-full" />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-1 text-center text-muted-foreground">
                                    <Upload className="h-8 w-8" />
                                </div>
                            )}
                        </div>
                        <div className="space-y-3">
                            <Input id="logo" name="logo" type="file" className="hidden" onChange={handleLogoChange} accept="image/*" />
                            <Button type="button" variant="outline" onClick={() => document.getElementById('logo')?.click()}>
                                নতুন লোগো আপলোড করুন
                            </Button>
                            <p className="text-xs text-muted-foreground">বর্গাকার (Square) এবং পিএনজি (PNG) লোগো ব্যবহারের পরামর্শ দেওয়া হলো।</p>
                        </div>
                    </div>
                 </div>
            </CardContent>
            <CardFooter className="px-0 border-t justify-end pt-6">
                <Button onClick={handleSaveChanges} className="px-8 font-black">পরিবর্তন সেভ করুন</Button>
            </CardFooter>
        </Card>
    );
}

function HolidaySettings() {
    const db = useFirestore();
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    const canManageSettings = hasPermission('manage:settings');
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [newHolidayDescription, setNewHolidayDescription] = useState('');

    const fetchHolidays = useCallback(async () => {
        if (!db) return;
        setIsLoading(true);
        try {
            const data = await getHolidays(db);
            setHolidays(data);
        } catch (e) {} finally {
            setIsLoading(false);
        }
    }, [db]);

    useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

    const handleAddHolidays = async () => {
        if (!db || !startDate || !newHolidayDescription) {
            toast({ variant: 'destructive', title: 'তথ্য অসম্পূর্ণ' });
            return;
        }
        const loopEndDate = endDate || startDate;
        let currentDate = new Date(startDate);
        const promises: Promise<any>[] = [];
        while (currentDate <= loopEndDate) {
            promises.push(addHoliday(db, { date: format(currentDate, 'yyyy-MM-dd'), description: newHolidayDescription }));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        await Promise.all(promises);
        toast({ title: 'ছুটি যোগ হয়েছে' });
        setStartDate(undefined); setEndDate(undefined); setNewHolidayDescription('');
        fetchHolidays();
    };

    const handleDeleteHoliday = (id: string) => {
        if (!db) return;
        deleteHoliday(db, id).then(() => { toast({ title: 'ছুটি মুছে ফেলা হয়েছে' }); fetchHolidays(); });
    };

    const handleResetHolidays = async () => {
        if (!db) return;
        setIsLoading(true);
        try {
            const defaultHolidays = await createInitialHolidays(db);
            setHolidays(defaultHolidays);
            toast({ title: "ছুটির তালিকা রিসেট হয়েছে" });
        } catch (e) {} finally { setIsLoading(false); }
    };
    
    return (
        <div className="space-y-10">
            <Card className="border-none shadow-none">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="text-2xl font-black">অতিরিক্ত ছুটি ব্যবস্থাপনা</CardTitle>
                    <CardDescription>নতুন ছুটি যোগ করুন অথবা বিদ্যমান তালিকা পরিবর্তন করুন</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pt-4 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gl:grid-cols-2 items-end gap-6 p-6 border-2 border-dashed rounded-xl bg-muted/20">
                        <div className="w-full space-y-2">
                            <Label className="font-bold">শুরুর তারিখ</Label>
                            <DatePicker value={startDate} onChange={setStartDate} />
                        </div>
                        <div className="w-full space-y-2">
                            <Label className="font-bold">শেষের তারিখ (ঐচ্ছিক)</Label>
                            <DatePicker value={endDate} onChange={setEndDate} placeholder="একদিনের বেশি হলে" />
                        </div>
                        <div className="w-full sm:col-span-2 space-y-2">
                            <Label className="font-bold">ছুটির কারণ</Label>
                            <Input value={newHolidayDescription} onChange={(e) => setNewHolidayDescription(e.target.value)} placeholder="উদা: পবিত্র ঈদ-উল-ফিতর" />
                        </div>
                        <div className="sm:col-span-2 flex justify-end">
                            <Button onClick={handleAddHolidays} disabled={!canManageSettings} className="px-10 font-bold">ছুটি যোগ করুন</Button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-lg">চলতি বছরের ছুটির তালিকা</h3>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!canManageSettings}>রিসেট করুন</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>রিসেট করতে চান?</AlertDialogTitle><AlertDialogDescription>এটি বর্তমান তালিকা মুছে ডিফল্ট ছুটিতে রিসেট করবে।</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>বাতিল</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleResetHolidays}>নিশ্চিত করুন</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-16">ক্রমিক</TableHead>
                                        <TableHead>তারিখ ও বার</TableHead>
                                        <TableHead>কারণ</TableHead>
                                        <TableHead className="text-right">কার্যক্রম</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-10 italic">লোড হচ্ছে...</TableCell></TableRow>
                                    ) : (
                                        holidays.map((h, i) => (
                                            <TableRow key={h.id}>
                                                <TableCell>{toBengaliNumber(i + 1)}</TableCell>
                                                <TableCell>
                                                    <p className="font-bold">{format(new Date(h.date.replace(/-/g, '/')), "d MMMM yyyy", { locale: bn })}</p>
                                                    <p className="text-[10px] text-muted-foreground">{format(new Date(h.date.replace(/-/g, '/')), "EEEE", { locale: bn })}</p>
                                                </TableCell>
                                                <TableCell className="font-medium">{h.description}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteHoliday(h.id)}><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

const permissionGroups = [
    { title: 'ড্যাশবোর্ড', ids: ['view:dashboard'] },
    { title: 'ভর্তি আবেদন', ids: ['manage:admissions'] },
    { title: 'শিক্ষার্থী ও প্রোফাইল', ids: ['view:students', 'manage:students', 'special:edit-student', 'special:delete-student', 'upload:students', 'view:student-profile'] },
    { title: 'শিক্ষক ও কর্মচারী', ids: ['view:staff', 'manage:staff', 'manage:staff-attendance', 'manage:staff-attendance-delete', 'view:staff-attendance-report'] },
    { title: 'হাজিরা ও উপস্থিতি', ids: ['manage:attendance', 'input:quick-roll-attendance', 'view:missed-attendance', 'input:missed-attendance', 'view:absent-student-list'] },
    { title: 'লেসন প্ল্যান ও সিলেবাস', ids: ['manage:lesson-plans', 'view:syllabus-mgmt', 'manage:syllabus', 'view:syllabus-tracker'] },
    { title: 'নোটিশ বোর্ড', ids: ['view:notices', 'manage:notices'] },
    { title: 'ফলাফল ও প্রমোশন', ids: ['input:results', 'manage:results', 'manage:full-marks', 'upload:marks', 'view:merit-list', 'promote:students', 'manage:special-results', 'view:public-records', 'manage:public-records'] },
    { title: 'হিসাব ও ফি', ids: ['view:accounts', 'collect:fees', 'manage:fee-setup', 'special:edit-transaction', 'special:delete-transaction', 'view:collection-report', 'view:expense-report', 'view:accounts-monthly-report', 'view:cashbook-ledger', 'manage:transactions'] },
    { title: 'রুটিন ও বদলি ক্লাস', ids: ['view:routines', 'manage:routines', 'view:proxy-classes', 'manage:proxy-classes'] },
    { title: 'ডকুমেন্ট', ids: ['manage:documents'] },
    { title: 'নথিপত্র ও আর্কাইভ', ids: ['view:archive', 'manage:archive'] },
    { title: 'মেসেজিং', ids: ['send:messaging', 'manage:messaging'] },
    { title: 'সিস্টেম সেটিংস', ids: ['manage:settings'] },
];

function PermissionDialog({ user, open, onOpenChange, onPermissionsUpdate }: { user: SystemUser, open: boolean, onOpenChange: (open: boolean) => void, onPermissionsUpdate: () => void }) {
    const db = useFirestore();
    const { toast } = useToast();
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [marksPermissions, setMarksPermissions] = useState<Record<string, string[]>>({});
    const [selectedClass, setSelectedClass] = useState<string>('6');

    useEffect(() => {
        if (user) {
            setPermissions(new Set(user.permissions?.length ? user.permissions : (defaultPermissions[user.role] || [])));
            setMarksPermissions(user.marksPermissions || {});
        }
    }, [user]);

    const handleSave = async () => {
        await updateUserPermissions(db!, user.uid, Array.from(permissions), marksPermissions);
        toast({ title: 'পারমিশন আপডেট হয়েছে' });
        onPermissionsUpdate(); onOpenChange(false);
    };

    const toggleSubject = (cls: string, sub: string) => {
        setMarksPermissions(prev => {
            const next = { ...prev };
            const currentSubs = next[cls] || [];
            if (currentSubs.includes(sub)) {
                next[cls] = currentSubs.filter(s => s !== sub);
            } else {
                next[cls] = [...currentSubs, sub];
            }
            if (next[cls].length === 0) delete next[cls];
            return next;
        });
    };

    const totalApprovedSubjects = useMemo(() => {
        return Object.values(marksPermissions).reduce((acc, subs) => acc + subs.length, 0);
    }, [marksPermissions]);

    const availableSubjects = getSubjects(selectedClass);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto font-kalpurush p-0 border-none shadow-2xl rounded-2xl">
                <DialogHeader className="p-6 bg-primary text-white border-b-0 shrink-0">
                    <DialogTitle className="text-2xl font-black">পারমিশন সেটিংস - {user.email}</DialogTitle>
                </DialogHeader>
                
                <div className="p-8 space-y-10 bg-white">
                    <div className="space-y-8">
                        <h3 className="font-black text-xl text-primary border-b-2 border-primary/10 pb-2 flex items-center gap-2">
                            <ShieldAlert className="h-6 w-6" /> সাধারণ পারমিশন (মডিউল ভিত্তিক)
                        </h3>
                        
                        <div className="space-y-10">
                            {permissionGroups.map(group => {
                                const groupPerms = availablePermissions.filter(p => group.ids.includes(p.id));
                                if (groupPerms.length === 0) return null;
                                
                                return (
                                    <div key={group.title} className="space-y-4">
                                        <p className="text-xs font-black uppercase text-muted-foreground tracking-widest border-l-4 border-primary pl-2">
                                            {group.title}
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {groupPerms.map(p => (
                                                <div key={p.id} className={cn(
                                                    "flex items-center gap-3 p-3 border-2 rounded-xl transition-all",
                                                    permissions.has(p.id) ? "bg-primary/5 border-primary/30 shadow-sm" : "bg-muted/10 border-transparent"
                                                )}>
                                                    <Checkbox 
                                                        id={`perm-${p.id}`}
                                                        checked={permissions.has(p.id)} 
                                                        onCheckedChange={c => { 
                                                            const n = new Set(permissions); 
                                                            if (c) n.add(p.id); else n.delete(p.id); 
                                                            setPermissions(n); 
                                                        }} 
                                                    />
                                                    <Label htmlFor={`perm-${p.id}`} className="text-xs font-bold leading-tight cursor-pointer">
                                                        {p.label}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <Separator className="my-8" />

                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h3 className="font-black text-xl text-emerald-700 border-b-2 border-emerald-100 pb-2 flex items-center gap-2">
                                <FilePen className="h-6 w-6" /> শ্রেণি ও বিষয় ভিত্তিক নম্বর এন্ট্রি পারমিশন
                            </h3>
                            <div className="flex items-center gap-3 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200 shadow-sm">
                                <Label className="text-[10px] font-black uppercase text-emerald-900 whitespace-nowrap">শ্রেণি নির্বাচন:</Label>
                                <Select value={selectedClass} onValueChange={setSelectedClass}>
                                    <SelectTrigger className="h-8 w-28 text-[11px] font-black bg-white border-2 border-emerald-200"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(classNamesMap).map(([id, label]) => (
                                            <SelectItem key={id} value={id}>{label} শ্রেণি</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {availableSubjects.map(s => {
                                const isChecked = marksPermissions[selectedClass]?.includes(s.name);
                                return (
                                    <div key={s.name} className={cn(
                                        "flex items-center gap-3 p-3 border-2 rounded-xl transition-all",
                                        isChecked ? "bg-emerald-50 border-emerald-300 shadow-sm" : "bg-muted/10 border-transparent"
                                    )}>
                                        <Checkbox 
                                            id={`sub-${selectedClass}-${s.name}`}
                                            checked={isChecked} 
                                            onCheckedChange={() => toggleSubject(selectedClass, s.name)} 
                                        />
                                        <Label htmlFor={`sub-${selectedClass}-${s.name}`} className="text-[11px] font-black leading-tight cursor-pointer">{s.name}</Label>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="mt-6 p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">অনুমোদিত বিষয়ের সারসংক্ষেপ</p>
                                <Badge className="bg-emerald-600 font-black h-6 px-3">{toBengaliNumber(totalApprovedSubjects)} টি অনুমোদিত</Badge>
                            </div>
                            {Object.keys(marksPermissions).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(marksPermissions).map(([cls, subs]) => (
                                        subs.map(sub => (
                                            <Badge key={`${cls}-${sub}`} variant="secondary" className="text-[10px] font-bold bg-white text-emerald-800 border-2 border-emerald-100 shadow-sm h-7 px-3">
                                                {classNamesMap[cls] || cls} - {sub}
                                            </Badge>
                                        ))
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs italic text-muted-foreground font-medium">এখনো কোনো বিষয় নির্বাচন করা হয়নি।</p>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-slate-50 border-t sticky bottom-0 z-20">
                    <div className="flex gap-3 w-full">
                        <DialogClose asChild>
                            <Button variant="outline" className="flex-1 font-bold h-12">বাতিল</Button>
                        </DialogClose>
                        <Button onClick={handleSave} className="flex-1 min-w-[200px] font-black h-12 text-lg shadow-xl shadow-primary/20">
                            সবগুলো পারমিশন সেভ করুন
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function UserManagementSettings() {
    const db = useFirestore();
    const { toast } = useToast();
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [allStaff, setAllStaff] = useState<Staff[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
    const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);

    useEffect(() => {
        if (!db || !currentUser || currentUser.role !== 'admin') return;
        setIsLoading(true);
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            setUsers(snapshot.docs.map(userFromDoc).sort((a, b) => (a.email || '').localeCompare(b.email || '')));
            setIsLoading(false);
        }, async (error: FirestoreError) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'users',
                    operation: 'list',
                }));
            }
        });
        getDocs(collection(db, 'staff')).then(snap => setAllStaff(snap.docs.map(staffFromDoc)));
        return () => unsubscribe();
    }, [db, currentUser]);

    const staffInfoMap = useMemo(() => {
        const map = new Map<string, { name: string, photo: string }>();
        allStaff.forEach(s => { 
            if (s.email) map.set(s.email.toLowerCase().trim(), { name: s.nameBn, photo: s.photoUrl }); 
        });
        return map;
    }, [allStaff]);

    const handleUpdateRole = async (uid: string, newRole: UserRole) => {
        await updateUserRole(db!, uid, newRole);
        toast({ title: 'রোল আপডেট হয়েছে' });
    };

    const handleDeleteUser = async (uid: string) => {
        if (!db) return;
        try {
            await deleteUserRecord(db, uid);
            toast({ title: 'ব্যবহারকারী মুছে ফেলা হয়েছে' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'ত্রুটি', description: 'ইউজার মোছা সম্ভব হয়নি।' });
        }
    };

    return (
        <Card className="border-none shadow-none">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="text-2xl font-black">ব্যবহারকারী ও নিরাপত্তা</CardTitle>
                <CardDescription>সিস্টেমে প্রবেশাধিকার এবং ইউজার রোল নিয়ন্ত্রণ করুন</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-4">
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>নাম ও ইমেইল</TableHead>
                                <TableHead>রোল (Role)</TableHead>
                                <TableHead>অবস্থা</TableHead>
                                <TableHead>সবশেষ ব্যবহার</TableHead>
                                <TableHead className="text-right">একশন</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map(u => {
                                const staffInfo = staffInfoMap.get(u.email?.toLowerCase().trim() || '');
                                const isMe = u.uid === currentUser?.uid;
                                const finalPhoto = staffInfo?.photo || u.photoUrl;
                                const finalName = staffInfo?.name || u.displayName || 'Admin';

                                return (
                                    <TableRow key={u.uid} className={isMe ? "bg-primary/5" : ""}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border shadow-sm">
                                                    <AvatarImage src={finalPhoto} />
                                                    <AvatarFallback>{u.email?.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-bold text-sm">{finalName}</p>
                                                    <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Select value={u.role} onValueChange={(v) => handleUpdateRole(u.uid, v as UserRole)} disabled={isMe}>
                                                <SelectTrigger className="h-8 w-28 text-xs font-bold"><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="admin">এডমিন</SelectItem><SelectItem value="teacher">শিক্ষক</SelectItem></SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            {u.isOnline ? <Badge className="bg-green-500 h-5 text-[10px]">অনলাইন</Badge> : <span className="text-[10px] text-muted-foreground">অফলাইন</span>}
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-[10px] font-medium">
                                                {u.lastLoginAt ? format(u.lastLoginAt, 'PP p', { locale: bn }) : 'কখনো নয়'}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" className="h-8 px-4 font-bold" onClick={() => { setSelectedUser(u); setIsPermissionDialogOpen(true); }} disabled={u.role === 'admin'}>পারমিশন</Button>
                                                {!isMe && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>ব্যবহারকারী মুছুন</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    আপনি কি নিশ্চিতভাবে {u.email} ইউজারটিকে সিস্টেম থেকে মুছে ফেলতে চান? এই কাজটি আর ফিরিয়ে আনা যাবে না।
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>বাতিল</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteUser(u.uid)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                    মুছে ফেলুন
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
            {selectedUser && <PermissionDialog user={selectedUser} open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen} onPermissionsUpdate={() => {}} />}
        </Card>
    );
}

function ProfileSettings() {
    const db = useFirestore();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [displayPhoto, setDisplayPhoto] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [displayDesignation, setDisplayDesignation] = useState<string | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
                    }));
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { toast({ variant: 'destructive', title: 'পাসওয়ার্ড মিলেনি' }); return; }
        setIsSaving(true);
        const result = await changePassword(currentPassword, newPassword);
        setIsSaving(false);
        if (result.success) {
            toast({ title: 'পাসওয়ার্ড পরিবর্তিত হয়েছে' });
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } else toast({ variant: 'destructive', title: result.error });
    }

    return (
        <div className="space-y-10">
            <Card className="border-none shadow-none">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="text-2xl font-black">আমার প্রোফাইল</CardTitle>
                    <CardDescription>আপনার ব্যক্তিগত তথ্য এবং নিরাপত্তা সেটিংস</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pt-4">
                    <div className="flex flex-col sm:flex-row items-center gap-8 p-8 border-2 rounded-2xl bg-white shadow-sm mb-8">
                        <Avatar className="h-32 w-32 border-4 border-primary/10 shadow-lg">
                            <AvatarImage src={displayPhoto || undefined} />
                            <AvatarFallback className="text-3xl">{user?.email?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1 text-center sm:text-left">
                            <h2 className="text-2xl font-black text-slate-800">{displayName || 'ব্যবহারকারী'}</h2>
                            <p className="font-bold text-primary">{displayDesignation || (user?.role === 'admin' ? 'সিস্টেম এডমিনিস্ট্রেটর' : 'শিক্ষক')}</p>
                            <p className="text-sm text-muted-foreground">{user?.email}</p>
                            <div className="pt-3"><Badge variant="outline" className="font-black bg-muted/50 border-none px-4">আইডি: {user?.uid.slice(0, 8)}</Badge></div>
                        </div>
                    </div>

                    <div className="max-w-md">
                        <h3 className="font-black text-lg mb-4">পাসওয়ার্ড পরিবর্তন করুন</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2"><Label className="font-bold">বর্তমান পাসওয়ার্ড</Label><Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></div>
                            <div className="space-y-2"><Label className="font-bold">নতুন পাসওয়ার্ড</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div>
                            <div className="space-y-2"><Label className="font-bold">পুনরায় লিখুন</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></div>
                            <Button type="submit" disabled={isSaving} className="w-full h-11 font-black shadow-md">{isSaving ? 'সেভ হচ্ছে...' : 'পাসওয়ার্ড আপডেট করুন'}</Button>
                        </form>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function BackupAndExportSettings() {
    const db = useFirestore();
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);

    const collectionsToExport = [
        'students', 'staff', 'attendance', 'feeCollections', 
        'transactions', 'results', 'notices', 'holidays', 
        'classRoutines', 'proxyClasses'
    ];

    const handleFullBackup = async (format: 'json' | 'excel') => {
        if (!db) return;
        setIsExporting(true);
        try {
            const fullData: any = {};
            
            for (const collName of collectionsToExport) {
                const snap = await getDocs(collection(db, collName));
                fullData[collName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            const timestamp = new Date().toISOString().split('T')[0];
            const fileName = `BPHS_Backup_${timestamp}`;

            if (format === 'json') {
                const jsonStr = JSON.stringify(fullData, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                const wb = XLSX.utils.book_new();
                for (const sheetName in fullData) {
                    const sanitizedData = fullData[sheetName].map((row: any) => {
                        const newRow = { ...row };
                        for (const key in newRow) {
                            if (typeof newRow[key] === 'string' && newRow[key].length > 32000) {
                                newRow[key] = "[Large Data - Excluded from Excel]";
                            }
                        }
                        return newRow;
                    });
                    const ws = XLSX.utils.json_to_sheet(sanitizedData);
                    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); 
                }
                XLSX.writeFile(wb, `${fileName}.xlsx`);
            }

            toast({ title: 'ব্যাকআপ সফল হয়েছে', description: `সিস্টেমের পূর্ণাঙ্গ ডেটা এক্সপোর্ট করা হয়েছে।` });
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'backup-export',
                    operation: 'list',
                }));
            }
            console.error(error);
            toast({ variant: 'destructive', title: 'এক্সপোর্ট ব্যর্থ হয়েছে', description: 'সার্ভার থেকে তথ্য পাওয়া যায়নি।' });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Card className="border-none shadow-none">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="text-2xl font-black">ডেটা ব্যাকআপ ও এক্সপোর্ট</CardTitle>
                <CardDescription>পুরো সিস্টেমের ডেটা নিরাপদ রাখতে ব্যাকআপ ফাইল ডাউনলোড করুন</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-6 space-y-10">
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="border-2 border-emerald-100 bg-emerald-50/20 p-6 flex flex-col gap-4 relative overflow-hidden group">
                        <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <FileSpreadsheet className="h-32 w-32 text-emerald-900" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-black text-xl text-emerald-950 flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Excel ব্যাকআপ</h4>
                            <p className="text-xs text-muted-foreground font-bold">সকল তথ্য আলাদা শিট আকারে এক্সেল ফাইলে সেভ হবে।</p>
                        </div>
                        <p className="text-sm leading-relaxed text-emerald-900 italic">"পাস করা শিক্ষার্থী, স্টাফ তালিকা এবং হিসাবের রেকর্ড সংরক্ষণের জন্য এটি সর্বোত্তম।"</p>
                        <Button onClick={() => handleFullBackup('excel')} disabled={isExporting} className="mt-4 bg-emerald-600 hover:bg-emerald-700 shadow-md font-black h-12">
                            {isExporting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Download className="h-5 w-5 mr-2" />}
                            Excel ডাউনলোড করুন
                        </Button>
                    </Card>

                    <Card className="border-2 border-indigo-100 bg-indigo-50/20 p-6 flex flex-col gap-4 relative overflow-hidden group">
                        <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <FileJson className="h-32 w-32 text-indigo-900" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-black text-xl text-indigo-950 flex items-center gap-2"><FileJson className="h-5 w-5" /> JSON রিকভারি ফাইল</h4>
                            <p className="text-xs text-muted-foreground font-bold">পুরো ডাটাবেস স্ন্যাপশট JSON ফরম্যাটে ডাউনলোড হবে।</p>
                        </div>
                        <p className="text-sm leading-relaxed text-indigo-900 italic">"ভবিষ্যতে সিস্টেম রিসেট বা অন্য কোনো ডাটাবেসে তথ্য স্থানান্তরের জন্য এটি প্রয়োজন।"</p>
                        <Button onClick={() => handleFullBackup('json')} disabled={isExporting} className="mt-4 bg-indigo-600 hover:bg-indigo-700 shadow-md font-black h-12">
                            {isExporting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Download className="h-5 w-5 mr-2" />}
                            JSON ডাউনলোড করুন
                        </Button>
                    </Card>
                </div>

                <div className="p-6 border-2 border-amber-100 bg-amber-50 rounded-2xl flex items-start gap-4">
                    <div className="p-3 bg-amber-100 rounded-full shrink-0"><ShieldAlert className="h-6 w-6 text-amber-600" /></div>
                    <div className="space-y-1">
                        <h5 className="font-black text-amber-900">গুরুত্বপূর্ণ সতর্কতা</h5>
                        <p className="text-sm text-amber-800 leading-relaxed font-bold">
                            আপনার ডাটাবেস ব্যাকআপ ফাইলে শিক্ষার্থীদের ফোন নম্বর, ঠিকানা এবং অন্যান্য ব্যক্তিগত তথ্য থাকে। তাই ব্যাকআপ ফাইলটি নিরাপদ স্থানে সংরক্ষণ করুন এবং অননুমোদিত কাউকে ফাইলটি দেবেন না। মাসে অন্তত একবার ব্যাকআপ ডাউনলোড করার পরামর্শ দেওয়া হচ্ছে।
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---

export default function SettingsPage() {
    const [isClient, setIsClient] = useState(false);
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState('profile');

    useEffect(() => { setIsClient(true); }, []);

    const isAdmin = user?.role === 'admin';

    const sidebarItems = useMemo(() => {
        const items = [
            { id: 'profile', label: 'আমার প্রোফাইল', icon: User, color: 'text-indigo-600 bg-indigo-50' },
        ];
        if (isAdmin) {
            items.push(
                { id: 'school', label: 'প্রতিষ্ঠানের তথ্য', icon: School, color: 'text-emerald-600 bg-emerald-50' },
                { id: 'gallery', label: 'গ্যালারি সেটিংস', icon: ImageIcon, color: 'text-primary bg-primary/10' },
                { id: 'holidays', label: 'অতিরিক্ত ছুটি', icon: Calendar, color: 'text-rose-600 bg-rose-50' },
                { id: 'users', label: 'ইউজার ম্যানেজমেন্ট', icon: Users, color: 'text-blue-600 bg-blue-50' },
                { id: 'backup', label: 'ব্যাকআপ ও এক্সপোর্ট', icon: HardDriveDownload, color: 'text-amber-600 bg-amber-50' },
                { id: 'system', label: 'সিস্টেম স্ট্যাটাস', icon: Monitor, color: 'text-slate-600 bg-slate-50' }
            );
        }
        return items;
    }, [isAdmin]);

    if (!isClient) return <div className="flex h-screen items-center justify-center bg-indigo-50"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-10 pb-40">
                <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row gap-8">
                    {/* Sidebar Navigation - Fixed/Sticky */}
                    <aside className="w-full md:w-64 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
                        <h2 className="text-3xl font-black mb-8 px-4 hidden md:block text-slate-900 tracking-tight">সেটিংস</h2>
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
                                    <span className="text-base font-black">{item.label}</span>
                                    {activeSection === item.id && <ChevronRight className="ml-auto h-4 w-4 hidden md:block" />}
                                </button>
                            ))}
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4">
                        <div className="p-6 sm:p-10 lg:p-14 flex-1">
                            {activeSection === 'profile' && <ProfileSettings />}
                            {activeSection === 'school' && isAdmin && <SchoolInfoSettings />}
                            {activeSection === 'gallery' && isAdmin && <GalleryManagementSettings />}
                            {activeSection === 'holidays' && isAdmin && <HolidaySettings />}
                            {activeSection === 'users' && isAdmin && <UserManagementSettings />}
                            {activeSection === 'backup' && isAdmin && <BackupAndExportSettings />}
                            {activeSection === 'system' && isAdmin && <SystemUsageInfo />}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
