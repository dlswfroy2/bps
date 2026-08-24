'use client';

import Image from 'next/image';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Student, studentFromDoc } from '@/lib/student-data';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, orderBy, FirestoreError, doc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Trash2, Smartphone, Search, AlertCircle, TrendingUp, Banknote, CreditCard, Wallet, PieChart as PieChartIcon, LayoutDashboard, Loader2, PlusCircle, MinusCircle, Landmark, Coins, FileText, Hash, ChevronRight, BookOpen, LayoutGrid, ListChecks, Printer, Phone, MessageCircle, MessageSquareDashed, Calendar, FileSpreadsheet, FileBarChart, FilePen, BarChart3, Receipt, Settings2, ShieldCheck, UserCheck, Save, Sparkles, Gift, Clock, Table as TableIcon } from 'lucide-react';
import { format, isToday, isSameMonth, startOfMonth, endOfMonth, isBefore } from 'date-fns';
import { bn } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Transaction, NewTransactionData, addTransaction, getTransactions, deleteTransaction, TransactionType, PaymentMethod } from '@/lib/transactions-data';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StudentFeeDialog } from '@/components/StudentFeeDialog';
import { DatePicker } from '@/components/ui/date-picker';
import { useAuth } from '@/hooks/useAuth';
import { FeeCollection, feeCollectionFromDoc } from '@/lib/fees-data';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MoneyReceipt } from '@/components/MoneyReceipt';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

const BENGALI_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const ENGLISH_MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const classNamesMap: { [key: string]: string } = { '6': 'ষষ্ঠ শ্রেণি', '7': 'সপ্তম শ্রেণি', '8': 'অষ্টম শ্রেণি', '9': 'নবম শ্রেণি', '10': 'দশম শ্রেণি' };

// --- Sub Components ---

function AccountsDashboardTab({ transactions, isLoading, onActionClick }: { transactions: Transaction[], isLoading: boolean, onActionClick: (type: 'income' | 'expense') => void }) {
    const stats = useMemo(() => {
        const now = new Date();
        let todayIncome = 0;
        let monthlyIncome = 0;
        let monthlyExpense = 0;
        let cashBalance = 0;
        let bankBalance = 0;

        transactions.forEach(t => {
            const amount = Number(t.amount) || 0;
            const tDate = new Date(t.date);
            const method = t.method || 'cash';
            
            if (t.accountHead === 'ব্যাংকে জমা (Cash to Bank)') {
                cashBalance -= amount;
                bankBalance += amount;
                return;
            }
            if (t.accountHead === 'ব্যাংক থেকে উত্তোলন (Bank to Cash)') {
                cashBalance += amount;
                bankBalance -= amount;
                return;
            }

            if (t.type === 'income') {
                if (method === 'cash') cashBalance += amount;
                else bankBalance += amount;

                if (isToday(tDate)) todayIncome += amount;
                if (isSameMonth(tDate, now)) monthlyIncome += amount;
            } else {
                if (method === 'cash') cashBalance -= amount;
                else bankBalance -= amount;

                if (isSameMonth(tDate, now)) monthlyExpense += amount;
            }
        });

        return { todayIncome, monthlyIncome, monthlyExpense, cashBalance, bankBalance };
    }, [transactions]);

    const chartData = useMemo(() => {
        return [
            { name: 'আয়', value: stats.monthlyIncome, color: '#10b981' },
            { name: 'ব্যয়', value: stats.monthlyExpense, color: '#ef4444' }
        ];
    }, [stats]);

    const last7DaysData = useMemo(() => {
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            return d;
        }).reverse();

        return last7Days.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            let income = 0;
            let expense = 0;
            transactions.forEach(t => {
                if (format(new Date(t.date), 'yyyy-MM-dd') === dateStr) {
                    if (t.accountHead.includes('উত্তোলন') || t.accountHead.includes('জমা')) return;
                    if (t.type === 'income') income += t.amount;
                    else expense += t.amount;
                }
            });
            return {
                label: format(date, 'd MMM', { locale: bn }),
                income,
                expense
            };
        });
    }, [transactions]);

    if (isLoading) {
        return (
            <div className="p-12 text-center italic text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-primary" /> 
                <span>ডেটা লোড হচ্ছে...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-2 border-emerald-500/20 bg-emerald-50/30 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <Banknote className="h-24 w-24 text-emerald-900" />
                    </div>
                    <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-xs font-black uppercase text-emerald-700">আজকের মোট আদায়</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-3xl font-black text-emerald-950">{stats.todayIncome.toLocaleString('bn-BD')} ৳</div>
                        <p className="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> রিয়েল-টাইম ডাটা
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-2 border-primary/20 bg-primary/5 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <Wallet className="h-24 w-24 text-primary" />
                    </div>
                    <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-xs font-black uppercase text-primary">এই মাসের মোট আয়</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-3xl font-black text-slate-900">{stats.monthlyIncome.toLocaleString('bn-BD')} ৳</div>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1">{BENGALI_MONTHS[new Date().getMonth()]} মাস</p>
                    </CardContent>
                </Card>

                <Card className="border-2 border-amber-500/20 bg-amber-50/30 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <Coins className="h-24 w-24 text-amber-900" />
                    </div>
                    <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-xs font-black uppercase text-amber-700">হাতে নগদ (Cash)</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-3xl font-black text-amber-950">{stats.cashBalance.toLocaleString('bn-BD')} ৳</div>
                        <p className="text-[10px] font-bold text-amber-600 mt-1">অফিস ব্যালেন্স</p>
                    </CardContent>
                </Card>

                <Card className="border-2 border-blue-500/20 bg-blue-50/30 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <Landmark className="h-24 w-24 text-blue-900" />
                    </div>
                    <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-xs font-black uppercase text-blue-700">ব্যাংক ব্যালেন্স</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-3xl font-black text-blue-950">{stats.bankBalance.toLocaleString('bn-BD')} ৳</div>
                        <p className="text-[10px] font-bold text-blue-600 mt-1">ব্যাংক একাউন্ট</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button onClick={() => onActionClick('income')} className="h-16 text-lg font-black bg-emerald-600 hover:bg-emerald-700 shadow-xl border-b-4 border-emerald-800 active:border-b-0 transition-all">
                    <PlusCircle className="mr-2 h-6 w-6" /> আয় যোগ করুন
                </Button>
                <Button onClick={() => onActionClick('expense')} variant="destructive" className="h-16 text-lg font-black shadow-xl border-b-4 border-rose-800 active:border-b-0 transition-all">
                    <MinusCircle className="mr-2 h-6 w-6" /> ব্যয় যোগ করুন
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-2 border-black/10 shadow-lg bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b border-black/5">
                        <CardTitle className="text-base font-black flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" /> গত ৭ দিনের আয়-ব্যয় চিত্র
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={last7DaysData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} />
                                <Tooltip 
                                    cursor={{fill: '#f1f5f9'}}
                                    contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 'bold', fontSize: '12px', boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' }}
                                    formatter={(value: number) => [`${value.toLocaleString('bn-BD')} ৳`, '']}
                                />
                                <Legend verticalAlign="top" align="right" iconType="circle" />
                                <Bar dataKey="income" name="আয়" fill="#10b981" radius={[6, 6, 0, 0]} barSize={35} />
                                <Bar dataKey="expense" name="ব্যয়" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={35} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-2 border-black/10 shadow-lg bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b border-black/5">
                        <CardTitle className="text-base font-black flex items-center gap-2">
                            <PieChartIcon className="h-5 w-5 text-primary" /> এই মাসের আয়-ব্যয় (Pie Chart)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px] pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={95}
                                    paddingAngle={8}
                                    dataKey="value"
                                    strokeWidth={3}
                                    stroke="#fff"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 'bold', fontSize: '12px', boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' }}
                                    formatter={(value: number) => [`${value.toLocaleString('bn-BD')} ৳`, '']}
                                />
                                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StudentFreeConfigDialog({ student, open, onOpenChange, onApply }: { student: Student | null, open: boolean, onOpenChange: (o: boolean) => void, onApply: (id: string, data: any) => void }) {
    const [waivers, setWaivers] = useState({
        tuition: 'none', // none, half, full
        exam: false,
        session: false,
        admission: false,
        other: false
    });

    useEffect(() => {
        if (student) {
            setWaivers({
                tuition: student.feeCategory === 'full-free' ? 'full' : (student.feeCategory === 'half-free' ? 'half' : 'none'),
                exam: false,
                session: false,
                admission: false,
                other: false
            });
        }
    }, [student]);

    if (!student) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md font-kalpurush">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black flex items-center gap-2 text-primary">
                        <Gift className="h-5 w-5" /> ফ্রি সেটিংস (Waiver Setup)
                    </DialogTitle>
                    <DialogDescription className="font-bold">
                        {student.studentNameBn} - রোল: {toBengaliNumber(student.roll)}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 space-y-6">
                    <div className="space-y-3">
                        <Label className="font-black text-slate-700">মাসিক বেতন মওকুফ (Tuition Waiver)</Label>
                        <RadioGroup value={waivers.tuition} onValueChange={(v) => setWaivers({...waivers, tuition: v})} className="grid grid-cols-3 gap-2">
                            <div className="flex items-center space-x-2 border p-2 rounded-lg cursor-pointer hover:bg-slate-50">
                                <RadioGroupItem value="none" id="t-none" /><Label htmlFor="t-none" className="cursor-pointer font-bold">নেই</Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-2 rounded-lg cursor-pointer hover:bg-slate-50">
                                <RadioGroupItem value="half" id="t-half" /><Label htmlFor="t-half" className="cursor-pointer font-bold">হাফ-ফ্রি</Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-2 rounded-lg cursor-pointer hover:bg-slate-50">
                                <RadioGroupItem value="full" id="t-full" /><Label htmlFor="t-full" className="cursor-pointer font-bold">ফুল-ফ্রি</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                        <Label className="font-black text-slate-700">অন্যান্য ফি মওকুফ করুন (১০০% মওকুফ হবে)</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-3 bg-muted/20 p-2 rounded-lg">
                                <Checkbox id="w-exam" checked={waivers.exam} onCheckedChange={(v) => setWaivers({...waivers, exam: !!v})} />
                                <Label htmlFor="w-exam" className="font-bold cursor-pointer">সকল পরীক্ষা ফি</Label>
                            </div>
                            <div className="flex items-center space-x-3 bg-muted/20 p-2 rounded-lg">
                                <Checkbox id="w-session" checked={waivers.session} onCheckedChange={(v) => setWaivers({...waivers, session: !!v})} />
                                <Label htmlFor="w-session" className="font-bold cursor-pointer">সেশন Charge</Label>
                            </div>
                            <div className="flex items-center space-x-3 bg-muted/20 p-2 rounded-lg">
                                <Checkbox id="w-admission" checked={waivers.admission} onCheckedChange={(v) => setWaivers({...waivers, admission: !!v})} />
                                <Label htmlFor="w-admission" className="font-bold cursor-pointer">ভর্তি ফি</Label>
                            </div>
                            <div className="flex items-center space-x-3 bg-muted/20 p-2 rounded-lg">
                                <Checkbox id="w-other" checked={waivers.other} onCheckedChange={(v) => setWaivers({...waivers, other: !!v})} />
                                <Label htmlFor="w-other" className="font-bold cursor-pointer">অন্যান্য ফি</Label>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bold">বাতিল</Button>
                    <Button onClick={() => onApply(student.id, waivers)} className="font-black shadow-lg">প্রয়োগ করুন</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FeeSetupTab({ allStudents, selectedYear, onPrint }: { allStudents: Student[], selectedYear: string, onPrint: () => void }) {
    const db = useFirestore();
    const { toast } = useToast();
    const [selectedClass, setSelectedClass] = useState('6');
    const [isSaving, setIsSaving] = useState(false);
    
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({
        monthly: '',
        halfYearly: '',
        annual: '',
        preTest: '',
        test: '',
        session: '',
        admission: '',
        other: ''
    });
    
    const [editedStudents, setEditedStudents] = useState<Record<string, Partial<Student>>>({});
    const [configFreeStudent, setConfigFreeStudent] = useState<Student | null>(null);

    const filteredStudents = useMemo(() => {
        return allStudents
            .filter(s => s.academicYear === selectedYear && s.className === selectedClass)
            .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
    }, [allStudents, selectedYear, selectedClass]);

    const handleBulkApply = () => {
        const next = { ...editedStudents };
        filteredStudents.forEach(s => {
            if (!next[s.id]) next[s.id] = {};
            if (bulkValues.monthly) next[s.id].monthlyFee = parseInt(bulkValues.monthly, 10);
            if (bulkValues.halfYearly) next[s.id].examFeeHalfYearly = parseInt(bulkValues.halfYearly, 10);
            if (bulkValues.annual) next[s.id].examFeeAnnual = parseInt(bulkValues.annual, 10);
            if (bulkValues.preTest) next[s.id].examFeePreNirbachoni = parseInt(bulkValues.preTest, 10);
            if (bulkValues.test) next[s.id].examFeeNirbachoni = parseInt(bulkValues.test, 10);
            if (bulkValues.session) next[s.id].sessionFee = parseInt(bulkValues.session, 10);
            if (bulkValues.admission) next[s.id].admissionFee = parseInt(bulkValues.admission, 10);
            if (bulkValues.other) next[s.id].otherFee = parseInt(bulkValues.other, 10);
        });
        setEditedStudents(next);
        toast({ title: 'সকল শিক্ষার্থীর জন্য মানগুলো যুক্ত হয়েছে।' });
    };

    const handleIndividualChange = (id: string, field: keyof Student, value: any) => {
        setEditedStudents(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
        }));
    };

    const handleSaveAll = async () => {
        if (!db || Object.keys(editedStudents).length === 0) return;
        setIsSaving(true);
        const batch = writeBatch(db);
        
        Object.entries(editedStudents).forEach(([id, data]) => {
            const ref = doc(db, 'students', id);
            batch.update(ref, { ...data, updatedAt: serverTimestamp() });
        });

        batch.commit()
            .then(() => {
                toast({ title: 'সকল তথ্য সফলভাবে আপডেট হয়েছে।' });
                setEditedStudents({});
            })
            .catch(async (serverError) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'students', operation: 'update' }));
            })
            .finally(() => {
                setIsSaving(false);
            });
    };

    const handleFreeConfigUpdate = (studentId: string, waivers: Record<string, any>) => {
        const next = { ...(editedStudents[studentId] || {}) };
        
        if (waivers.tuition === 'full') next.feeCategory = 'full-free';
        else if (waivers.tuition === 'half') next.feeCategory = 'half-free';
        else next.feeCategory = 'general';

        if (waivers.exam) {
            next.examFeeHalfYearly = 0; next.examFeeAnnual = 0; next.examFeePreNirbachoni = 0; next.examFeeNirbachoni = 0;
        }
        if (waivers.session) next.sessionFee = 0;
        if (waivers.admission) next.admissionFee = 0;
        if (waivers.other) next.otherFee = 0;
        
        setEditedStudents(prev => ({ ...prev, [studentId]: next }));
        setConfigFreeStudent(null);
        toast({ title: 'ফ্রি সেটিংস প্রয়োগ করা হয়েছে' });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-6 bg-primary/5 p-6 rounded-2xl border-2 border-primary/10">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div className="space-y-2 w-full md:w-48">
                        <Label className="font-black text-primary">শ্রেণি নির্বাচন</Label>
                        <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setEditedStudents({}); }}>
                            <SelectTrigger className="bg-white border-2 h-11 font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 items-end">
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">বেতন</Label>
                            <Input type="number" value={bulkValues.monthly} onChange={e => setBulkValues({...bulkValues, monthly: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">অর্ধ-বার্ষিক</Label>
                            <Input type="number" value={bulkValues.halfYearly} onChange={e => setBulkValues({...bulkValues, halfYearly: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">বার্ষিক ফি</Label>
                            <Input type="number" value={bulkValues.annual} onChange={e => setBulkValues({...bulkValues, annual: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">সেশন Charge</Label>
                            <Input type="number" value={bulkValues.session} onChange={e => setBulkValues({...bulkValues, session: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">ভর্তি ফি</Label>
                            <Input type="number" value={bulkValues.admission} onChange={e => setBulkValues({...bulkValues, admission: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">অন্যান্য</Label>
                            <Input type="number" value={bulkValues.other} onChange={e => setBulkValues({...bulkValues, other: e.target.value})} className="h-9 font-black bg-white" placeholder="৳" />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleBulkApply} variant="secondary" className="h-9 font-black bg-white border-2 border-primary/20 text-primary hover:bg-primary hover:text-white">
                                <Sparkles className="h-3.5 w-3.5 mr-2" /> অটো-ফিল
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Card className="border-2 border-black overflow-hidden shadow-xl">
                <CardHeader className="bg-muted/30 border-b-2 border-black">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-lg font-black text-primary">ব্যক্তিগতভাবে ফি বা ক্যাটাগরি সংশোধন করুন</CardTitle>
                            <CardDescription className="font-bold">বেতন হিসাবে প্রকৃত আদায়যোগ্য ফি ব্যবহার করুন।</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" onClick={onPrint} className="h-10 font-black border-slate-300 text-slate-700 bg-white hover:bg-slate-50 shadow-sm no-print">
                                <Printer className="h-4 w-4 mr-2" /> প্রিন্ট তালিকা
                            </Button>
                            {Object.keys(editedStudents).length > 0 && (
                                <Badge className="bg-amber-600 font-black animate-pulse">
                                    {toBengaliNumber(Object.keys(editedStudents).length)} টি পরিবর্তন করা হয়েছে
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="table-container !max-h-[600px] !border-0 !rounded-none">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-30">
                                <TableRow className="border-b-2 border-black">
                                    <TableHead className="w-16 text-center font-black border-r text-black">রোল</TableHead>
                                    <TableHead className="min-w-[150px] font-black border-r text-black">নাম ও সেটিংস</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">বেতন</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">অর্ধ-বার্ষিক</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">বার্ষিক ফি</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">সেশন ফি</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">ভর্তি ফি</TableHead>
                                    <TableHead className="w-24 text-center font-black border-r text-black">অন্যান্য</TableHead>
                                    <TableHead className="w-32 text-center font-black border-r text-black">ক্যাটাগরি</TableHead>
                                    <TableHead className="w-20 text-center font-black text-black">উপবৃত্তি</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStudents.length === 0 ? (
                                    <TableRow><TableCell colSpan={10} className="text-center py-20 italic">এই শ্রেণিতে কোনো শিক্ষার্থী নেই।</TableCell></TableRow>
                                ) : filteredStudents.map(student => {
                                    const changes = editedStudents[student.id] || {};
                                    const getVal = (field: keyof Student): number => (changes[field] !== undefined ? (changes[field] as number) : ((student[field] as number) || 0));

                                    return (
                                        <TableRow key={student.id} className={cn("hover:bg-primary/5 transition-colors", Object.keys(changes).length > 0 && "bg-amber-50")}>
                                            <TableCell className="text-center font-black border-r">{toBengaliNumber(student.roll)}</TableCell>
                                            <TableCell className="font-bold border-r text-slate-800 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate">{student.studentNameBn}</span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/10 no-print" onClick={() => setConfigFreeStudent(student)} title="ফ্রি সেটিংস"><Gift className="h-3.5 w-3.5" /></Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('monthlyFee') ?? ''} onChange={e => handleIndividualChange(student.id, 'monthlyFee', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('examFeeHalfYearly') ?? ''} onChange={e => handleIndividualChange(student.id, 'examFeeHalfYearly', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('examFeeAnnual') ?? ''} onChange={e => handleIndividualChange(student.id, 'examFeeAnnual', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('sessionFee') ?? ''} onChange={e => handleIndividualChange(student.id, 'sessionFee', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('admissionFee') ?? ''} onChange={e => handleIndividualChange(student.id, 'admissionFee', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r"><Input type="number" value={getVal('otherFee') ?? ''} onChange={e => handleIndividualChange(student.id, 'otherFee', parseInt(e.target.value) || 0)} className="h-8 text-center font-black text-blue-900 border-none bg-transparent" /></TableCell>
                                            <TableCell className="p-1 border-r">
                                                <Select value={changes.feeCategory !== undefined ? changes.feeCategory : (student.feeCategory || 'general')} onValueChange={v => handleIndividualChange(student.id, 'feeCategory', v)}>
                                                    <SelectTrigger className="h-8 text-[10px] font-bold border-none bg-transparent"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="general">সাধারণ</SelectItem><SelectItem value="half-free">হাফ-ফ্রি</SelectItem><SelectItem value="full-free">ফুল-ফ্রি</SelectItem></SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-center"><Switch checked={changes.isStipendReceiver !== undefined ? changes.isStipendReceiver : (student.isStipendReceiver || false)} onCheckedChange={v => handleIndividualChange(student.id, 'isStipendReceiver', v)} className="data-[state=checked]:bg-emerald-600 scale-75" /></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-between items-center p-6 border-t-2 border-black bg-slate-50 no-print">
                        <p className="text-xs font-bold text-muted-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> তথ্য পরিবর্তন করার পর অবশ্যই নিচের সেভ বাটনে ক্লিক করবেন।</p>
                        <Button onClick={handleSaveAll} disabled={isSaving || Object.keys(editedStudents).length === 0} className="px-12 h-14 text-lg font-black shadow-2xl transition-all">
                            {isSaving ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Save className="h-5 w-5 mr-2" />}সবগুলো তথ্য সেভ করুন
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <StudentFreeConfigDialog student={configFreeStudent} open={!!configFreeStudent} onOpenChange={(o) => !o && setConfigFreeStudent(null)} onApply={handleFreeConfigUpdate} />
        </div>
    );
}

function DefaultersTab({ allStudents, selectedYear }: { allStudents: Student[], selectedYear: string }) {
    const db = useFirestore();
    const { toast } = useToast();
    const [selectedMonth, setSelectedMonth] = useState<string>(BENGALI_MONTHS[new Date().getMonth()]);
    const [selectedClass, setSelectedClass] = useState<string>('all');
    const [collections, setCollections] = useState<FeeCollection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [reminderStudent, setReminderStudent] = useState<Student | null>(null);
    const [reminderMsg, setReminderMsg] = useState('');
    const classes = ['6', '7', '8', '9', '10'];

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const q = query(collection(db, 'feeCollections'), where('academicYear', '==', selectedYear));
        const unsubscribe = onSnapshot(q, (snapshot) => { setCollections(snapshot.docs.map(feeCollectionFromDoc).filter((f): f is FeeCollection => f !== null)); setIsLoading(false); }, (error) => { 
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'feeCollections', operation: 'list' })); 
            }
            setIsLoading(false); 
        });
        return () => unsubscribe();
    }, [db, selectedYear]);

    const getDefaulterDataForClass = (cls: string) => {
        const studentsInClass = allStudents.filter(s => s.academicYear === selectedYear && s.className === cls);
        const selectedMonthIdx = BENGALI_MONTHS.indexOf(selectedMonth);
        
        return studentsInClass.map(student => {
            if (student.feeCategory === 'full-free') return null;
            
            const hasPaidSelectedMonth = collections.some(c => c.studentId === student.id && (c.description?.includes(selectedMonth)));
            if (hasPaidSelectedMonth) return null;

            // Calculate Dues
            let effectiveMonthlyFee = student.monthlyFee || 0;
            if (student.feeCategory === 'half-free') effectiveMonthlyFee = Math.floor(effectiveMonthlyFee / 2);

            const paidMonthsSet = new Set<string>();
            const paidCategories = new Set<string>();
            
            collections.forEach(c => {
                if (c.studentId === student.id) {
                    BENGALI_MONTHS.forEach(m => {
                        if (c.description?.includes(m)) paidMonthsSet.add(m);
                    });
                    if (c.breakdown) {
                        Object.entries(c.breakdown).forEach(([k, v]) => {
                            if (v && v > 0) paidCategories.add(k);
                        });
                    }
                }
            });

            const dueMonths = BENGALI_MONTHS.filter((m, idx) => idx <= selectedMonthIdx && !paidMonthsSet.has(m));
            const tuitionDue = dueMonths.length * effectiveMonthlyFee;

            let examDue = 0;
            const examKeys = ['examFeeHalfYearly', 'examFeeAnnual', 'examFeePreNirbachoni', 'examFeeNirbachoni'];
            examKeys.forEach(k => {
                const val = student[k as keyof Student] as number;
                if (val && val > 0 && !paidCategories.has(k)) examDue += val;
            });

            let otherDue = 0;
            const otherKeys = ['sessionFee', 'admissionFee', 'scoutFee', 'developmentFee', 'libraryFee', 'tiffinFee', 'otherFee'];
            otherKeys.forEach(k => {
                const val = student[k as keyof Student] as number;
                if (val && val > 0 && !paidCategories.has(k)) otherDue += val;
            });

            return {
                student,
                dueMonthsCount: dueMonths.length,
                tuitionDue,
                examDue,
                otherDue,
                totalDue: tuitionDue + examDue + otherDue
            };
        }).filter((d): d is any => d !== null).sort((a, b) => (Number(a.student.roll) || 0) - (Number(b.student.roll) || 0));
    };

    const prepareReminder = (student: Student) => {
        const mobile = student.guardianMobile || student.studentMobile;
        if (!mobile) { toast({ variant: 'destructive', title: 'মোবাইল নম্বর নেই' }); return; }
        setReminderMsg(`সম্মানিত অভিভাবক, আপনার সন্তান ${student.studentNameBn} এর ${selectedMonth} মাসের বিদ্যালয় ফি বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। বীপৌউবি`);
        setReminderStudent(student);
    };

    const handleSendSMS = () => { if (!reminderStudent) return; const mobile = reminderStudent.guardianMobile || reminderStudent.studentMobile; const encodedMsg = encodeURIComponent(reminderMsg); const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent); window.location.href = `sms:${mobile}${isIOS ? '&' : '?'}body=${encodedMsg}`; setReminderStudent(null); };
    const handleSendWhatsApp = () => { if (!reminderStudent) return; const mobile = reminderStudent.guardianMobile || reminderStudent.studentMobile || ''; let cleanNum = mobile.replace(/[^\d]/g, ''); if (cleanNum.startsWith('0')) cleanNum = '88' + cleanNum; if (!cleanNum.startsWith('88')) cleanNum = '880' + cleanNum; window.open(`https://wa.me/${cleanNum}?text=${encodeURIComponent(reminderMsg)}`, '_blank'); setReminderStudent(null); };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-red-200 shadow-lg">
                <CardHeader className="bg-red-50/50">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div><CardTitle className="text-red-900 flex items-center gap-2"><AlertCircle className="h-5 w-5" /> বকেয়া তালিকা (শ্রেণিভিত্তিক)</CardTitle><CardDescription>বেতন পরিশোধ করেনি এমন শিক্ষার্থীদের বিস্তারিত তালিকা দেখুন</CardDescription></div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2"><Label className="font-bold text-xs">শ্রেণি:</Label><Select value={selectedClass} onValueChange={setSelectedClass}><SelectTrigger className="w-36 bg-white shadow-sm font-bold text-primary h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">সকল শ্রেণি</SelectItem>{classes.map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}</SelectContent></Select></div>
                            <div className="flex items-center gap-2"><Label className="font-bold text-xs">মাস:</Label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-36 bg-white shadow-sm font-bold text-primary h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{BENGALI_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="flex flex-col gap-8">
                        {classes.filter(c => selectedClass === 'all' || c === selectedClass).map(cls => {
                            const defaultersData = getDefaulterDataForClass(cls);
                            if (defaultersData.length === 0) return null;
                            return (
                                <div key={cls} className="space-y-3">
                                    <h3 className="font-black text-lg text-slate-800 border-l-4 border-red-500 pl-3">{classNamesMap[cls]}</h3>
                                    <div className="table-container">
                                        <Table>
                                            <TableHeader className="bg-muted/50">
                                                <TableRow>
                                                    <TableHead className="w-16 text-center">রোল</TableHead>
                                                    <TableHead>শিক্ষার্থীর নাম</TableHead>
                                                    <TableHead className="text-center">বকেয়া মাস</TableHead>
                                                    <TableHead className="text-right">বকেয়া বেতন</TableHead>
                                                    <TableHead className="text-right">পরীক্ষা ফি</TableHead>
                                                    <TableHead className="text-right">অন্যান্য বকেয়া</TableHead>
                                                    <TableHead className="text-right font-black">মোট বকেয়া</TableHead>
                                                    <TableHead className="text-right no-print">কার্যক্রম</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {defaultersData.map(({ student, dueMonthsCount, tuitionDue, examDue, otherDue, totalDue }) => (
                                                    <TableRow key={student.id}>
                                                        <TableCell className="text-center font-bold">{toBengaliNumber(student.roll)}</TableCell>
                                                        <TableCell className="font-bold">{student.studentNameBn}</TableCell>
                                                        <TableCell className="text-center font-black text-rose-700">{toBengaliNumber(dueMonthsCount)} মাস</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-700">{toBengaliNumber(tuitionDue)} ৳</TableCell>
                                                        <TableCell className="text-right font-bold text-amber-700">{toBengaliNumber(examDue)} ৳</TableCell>
                                                        <TableCell className="text-right font-bold text-indigo-700">{toBengaliNumber(otherDue)} ৳</TableCell>
                                                        <TableCell className="text-right font-black text-rose-600 bg-rose-50/50">{toBengaliNumber(totalDue)} ৳</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs font-bold" onClick={() => prepareReminder(student)}><Smartphone className="h-3.5 w-3.5 mr-2" /> মেসেজ পাঠান</Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )
                        })}
                        {isLoading && <div className="text-center p-20 italic"><span>লোড হচ্ছে...</span></div>}
                        {!isLoading && classes.filter(c => selectedClass === 'all' || c === selectedClass).every(cls => getDefaulterDataForClass(cls).length === 0) && (<div className="text-center py-20 text-emerald-600 font-black text-xl">অভিনন্দন! কারো বেতন বকেয়া নেই।</div>)}
                    </div>
                </CardContent>
            </Card>
            <Dialog open={!!reminderStudent} onOpenChange={(o) => !o && setReminderStudent(null)}><DialogContent className="font-kalpurush"><DialogHeader><DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> রিমাইন্ডার মেসেজ প্রিভিউ</DialogTitle><DialogDescription className="font-bold">{reminderStudent?.studentNameBn} এর অভিভাবককে মেসেজ পাঠান</DialogDescription></DialogHeader><div className="py-4 space-y-4"><div className="p-4 bg-muted/30 rounded-lg border-2 border-dashed font-bold leading-relaxed text-slate-700">{reminderMsg}</div></div><DialogFooter className="gap-2 sm:gap-0"><Button variant="outline" className="flex-1 font-bold h-11 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={handleSendSMS}><MessageSquareDashed className="mr-2 h-4 w-4" /> SMS ড্রাফট করুন</Button><Button className="flex-1 font-black h-11 bg-emerald-600 hover:bg-emerald-700" onClick={handleSendWhatsApp}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp করুন</Button></DialogFooter></DialogContent></Dialog>
        </div>
    );
}

function FeeCollectionTab({ studentsForYear, isLoading, onFeeCollected }: { studentsForYear: Student[], isLoading: boolean, onFeeCollected: () => void }) {
    const [feeStudent, setFeeStudent] = useState<Student | null>(null);
    const [selectedClass, setSelectedClass] = useState('6');
    const classes = ['6', '7', '8', '9', '10'];
    const filteredStudents = useMemo(() => studentsForYear.filter((student) => student.className === selectedClass).sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0)), [studentsForYear, selectedClass]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-white/50 items-end"><div className="space-y-2 flex-1"><Label className="font-bold text-primary">শ্রেণি নির্বাচন</Label><Select value={selectedClass} onValueChange={setSelectedClass}><SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}</SelectContent></Select></div></div>
            <Card className="border-2 border-teal-100 shadow-lg">
                <CardContent className="p-0">
                    <div className="table-container">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow><TableHead className="text-center w-20">রোল</TableHead><TableHead>শিক্ষার্থীর নাম</TableHead><TableHead>পিতার নাম</TableHead><TableHead className="text-right">কার্যক্রম</TableHead></TableRow></TableHeader>
                            <TableBody>{isLoading ? (<TableRow><TableCell colSpan={4} className="text-center py-20 italic"><span>লোড হচ্ছে...</span></TableCell></TableRow>) : filteredStudents.length === 0 ? (<TableRow><TableCell colSpan={4} className="text-center py-20 italic">এই শ্রেণিতে কোনো শিক্ষার্থী নেই।</TableCell></TableRow>) : (filteredStudents.map((student) => (<TableRow key={student.id}><TableCell className="font-black text-center">{toBengaliNumber(student.roll)}</TableCell><TableCell className="whitespace-nowrap font-bold text-slate-800">{student.studentNameBn}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{student.fatherNameBn}</TableCell><TableCell className="text-right"><Button onClick={() => setFeeStudent(student)} size="sm" className="bg-teal-600 hover:bg-teal-700 font-bold h-8 text-xs">বেতন আদায়</Button></TableCell></TableRow>)))}</TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            <StudentFeeDialog student={feeStudent} open={!!feeStudent} onOpenChange={() => setFeeStudent(null)} onFeeCollected={onFeeCollected} />
        </div>
    )
}

function CollectionReportTab({ allStudents, onDeleteSuccess }: { allStudents: Student[], onDeleteSuccess: () => void }) {
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    const { selectedYear } = useAcademicYear();
    const { schoolInfo } = useSchoolInfo();
    const { toast } = useToast();
    const [collections, setCollections] = useState<FeeCollection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
    const [collectorFilter, setCollectorFilter] = useState<string>('all');
    const [printingCollection, setPrintingCollection] = useState<FeeCollection | null>(null);
    const [printingStudent, setPrintingStudent] = useState<Student | null>(null);

    const canDelete = hasPermission('special:delete-transaction') || user?.role === 'admin';

    useEffect(() => {
        if (!db || !user) return;
        setIsLoading(true);
        const q = query(collection(db, 'feeCollections'), where('academicYear', '==', selectedYear));
        const unsubscribe = onSnapshot(q, (snapshot) => { const data = snapshot.docs.map(doc => feeCollectionFromDoc(doc)).filter((c): c is FeeCollection => c !== null).sort((a, b) => b.collectionDate.getTime() - a.collectionDate.getTime()); setCollections(data); setIsLoading(false); }, (error) => { 
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'feeCollections', operation: 'list' })); 
            }
            setIsLoading(false); 
        });
        return () => unsubscribe();
    }, [db, user, selectedYear]);

    const studentMap = useMemo(() => { const map = new Map<string, Student>(); allStudents.forEach(s => map.set(s.id, s)); return map; }, [allStudents]);
    const uniqueCollectors = useMemo(() => { const collectors = new Set<string>(); collections.forEach(c => { if (c.collectorName) collectors.add(c.collectorName); }); return Array.from(collectors).sort(); }, [collections]);
    const filteredCollections = useMemo(() => collections.filter(c => { const matchesCollector = collectorFilter === 'all' || c.collectorName === collectorFilter; const matchesDate = !dateFilter || format(c.collectionDate, 'yyyy-MM-dd') === format(dateFilter, 'yyyy-MM-dd'); return matchesCollector && matchesDate; }), [collections, collectorFilter, dateFilter]);

    const handlePrintReceipt = (collection: FeeCollection) => { const student = studentMap.get(collection.studentId); if (!student) return; setPrintingCollection(collection); setPrintingStudent(student); setTimeout(() => { window.print(); setPrintingCollection(null); setPrintingStudent(null); }, 300); };

    const handleDeleteCollection = async (collectionData: FeeCollection) => {
        if (!db || !canDelete) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'feeCollections', collectionData.id));
        if (collectionData.transactionIds) collectionData.transactionIds.forEach(id => batch.delete(doc(db, 'transactions', id)));
        
        batch.commit().then(() => {
            toast({ title: "আদায়ের রেকর্ডটি মুছে ফেলা হয়েছে।" });
            onDeleteSuccess();
        }).catch((error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'feeCollections', operation: 'delete' }));
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 bg-muted/30 p-4 rounded-lg"><div className="space-y-2 flex-1"><Label className="text-xs font-bold">তারিখ দিয়ে ফিল্টার</Label><DatePicker value={dateFilter} onChange={setDateFilter} placeholder="তারিখ নির্বাচন করুন" /></div><div className="space-y-2 flex-1"><Label className="font-bold text-xs">আদায়কারী</Label><Select value={collectorFilter} onValueChange={setCollectorFilter}><SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="সকল আদায়কারী" /></SelectTrigger><SelectContent><SelectItem value="all">সকল আদায়কারী</SelectItem>{uniqueCollectors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></div>
            <Card className="border-none shadow-none"><CardHeader className="px-0 pt-0"><CardTitle className="text-xl">আদায় রিপোর্ট</CardTitle></CardHeader><CardContent className="px-0 pt-2"><div className="table-container"><Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm"><TableRow><TableHead>তারিখ</TableHead><TableHead className="text-center w-20">রোল</TableHead><TableHead>নাম</TableHead><TableHead>শ্রেণি</TableHead><TableHead className="text-right">মোট আদায়</TableHead><TableHead className="text-center">রসিদ</TableHead><TableHead>আদায়কারী</TableHead><TableHead className="text-right no-print">একশন</TableHead></TableRow></TableHeader>
                            <TableBody>{isLoading ? (<TableRow><TableCell colSpan={8} className="text-center py-20 italic"><span>লোড হচ্ছে...</span></TableCell></TableRow>) : filteredCollections.length === 0 ? (<TableRow><TableCell colSpan={8} className="text-center py-20 italic">কোনো রেকর্ড পাওয়া যায়নি।</TableCell></TableRow>) : (filteredCollections.map(c => { const student = studentMap.get(c.studentId); return (<TableRow key={c.id} className="hover:bg-accent/5"><TableCell className="whitespace-nowrap">{format(c.collectionDate, 'PP', { locale: bn })}</TableCell><TableCell className="font-black text-center">{toBengaliNumber(student?.roll || '')}</TableCell><TableCell className="whitespace-nowrap font-bold text-primary">{student?.studentNameBn || '-'}</TableCell><TableCell className="whitespace-nowrap">{student ? (classNamesMap[student.className] || student.className) : '-'}</TableCell><TableCell className="text-right font-black text-emerald-700">{toBengaliNumber(c.totalAmount ?? 0)} ৳</TableCell><TableCell className="text-center"><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-primary" onClick={() => handlePrintReceipt(c)}><Printer className="h-4 w-4" /></Button></TableCell><TableCell className="whitespace-nowrap text-xs">{c.collectorName || '-'}</TableCell><TableCell className="text-right no-print">{canDelete && (<AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent className="font-kalpurush"><AlertDialogHeader><AlertDialogTitle>রেকর্ডটি মুছতে চান?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>না</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteCollection(c)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">হ্যাঁ, মুছুন</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}</TableCell></TableRow>); }))}</TableBody></Table></div></CardContent></Card>
            {printingCollection && printingStudent && (<div className="hidden print:block printable-area bg-white"><div className="flex items-center justify-center min-h-[297mm]"><MoneyReceipt collection={printingCollection} student={printingStudent} schoolInfo={schoolInfo} /></div></div>)}
        </div>
    );
}

function ExpenseReportTab({ transactions, isLoading, onDeleteSuccess }: { transactions: Transaction[], isLoading: boolean, onDeleteSuccess: () => void }) {
    const db = useFirestore(); const { user, hasPermission } = useAuth(); const { toast } = useToast(); const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined); const [headFilter, setHeadFilter] = useState<string>('all'); const canDelete = hasPermission('special:delete-transaction') || user?.role === 'admin';
    const expenseHeads = useMemo(() => { const heads = new Set<string>(); transactions.filter(t => t.type === 'expense').forEach(t => heads.add(t.accountHead)); return Array.from(heads).sort(); }, [transactions]);
    const filteredExpenses = useMemo(() => transactions.filter(t => { const isExpense = t.type === 'expense'; const matchesHead = headFilter === 'all' || t.accountHead === headFilter; const matchesDate = !dateFilter || format(t.date, 'yyyy-MM-dd') === format(dateFilter, 'yyyy-MM-dd'); return isExpense && matchesHead && matchesDate; }).sort((a, b) => b.date.getTime() - a.date.getTime()), [transactions, headFilter, dateFilter]);
    
    const handleDelete = async (id: string) => { 
        if (!db) return; 
        deleteTransaction(db, id).then(() => {
            toast({ title: 'ব্যয়ের রেকর্ডটি মুছে ফেলা হয়েছে।' });
            onDeleteSuccess();
        }).catch((error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'transactions', operation: 'delete' }));
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 bg-muted/30 p-4 rounded-lg"><div className="space-y-2 flex-1"><Label className="text-xs font-bold">তারিখ দিয়ে ফিল্টার</Label><DatePicker value={dateFilter} onChange={setDateFilter} placeholder="তারিখ নির্বাচন করুন" /></div><div className="space-y-2 flex-1"><Label className="font-bold text-xs">ব্যয়ের খাত</Label><Select value={headFilter} onValueChange={setHeadFilter}><SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="সকল খাত" /></SelectTrigger><SelectContent><SelectItem value="all">সকল খাত</SelectItem>{expenseHeads.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select></div></div>
            <Card className="border-none shadow-none"><CardHeader className="px-0 pt-0"><CardTitle className="text-xl">ব্যয় রিপোর্ট</CardTitle></CardHeader><CardContent className="px-0 pt-2"><div className="table-container"><Table><TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm"><TableRow><TableHead>তারিখ</TableHead><TableHead>ব্যয়ের খাত</TableHead><TableHead>বিবরণ</TableHead><TableHead className="text-center">পদ্ধতি</TableHead><TableHead className="text-center">ভাউচার/চেক</TableHead><TableHead className="text-right">পরিমাণ</TableHead><TableHead className="text-right no-print">একশন</TableHead></TableRow></TableHeader><TableBody>{isLoading ? (<TableRow><TableCell colSpan={7} className="text-center py-20 italic"><span>লোড হচ্ছে...</span></TableCell></TableRow>) : filteredExpenses.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-20 italic">কোনো রেকর্ড পাওয়া যায়নি।</TableCell></TableRow>) : (filteredExpenses.map(e => (<TableRow key={e.id} className="hover:bg-accent/5"><TableCell className="whitespace-nowrap">{format(e.date, 'PP', { locale: bn })}</TableCell><TableCell className="font-bold text-rose-700">{e.accountHead}</TableCell><TableCell className="max-w-[200px] truncate text-xs">{e.description}</TableCell><TableCell className="text-center"><Badge variant="outline" className={cn("text-[9px] font-black", e.method === 'bank' ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50")}>{e.method === 'bank' ? 'Bank' : 'Cash'}</Badge></TableCell><TableCell className="text-center"><div className="flex flex-col gap-1 items-center">{e.voucherNo && <Badge className="text-[8px] bg-rose-50 text-rose-600">V: {e.voucherNo}</Badge>}{e.checkNo && <Badge className="text-[8px] bg-blue-50 text-blue-600">C: {e.checkNo}</Badge>}</div></TableCell><TableCell className="text-right font-black text-rose-600">{toBengaliNumber(e.amount ?? 0)} ৳</TableCell><TableCell className="text-right no-print">{canDelete && (<AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent className="font-kalpurush"><AlertDialogHeader><AlertDialogTitle>ব্যয়ের রেকর্ডটি মুছতে চান?</AlertDialogTitle><AlertDialogDescription>আপনি কি নিশ্চিতভাবে এই ব্যয়ের রেকর্ডটি মুছে ফেলতে চান?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>না</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(e.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">হ্যাঁ, মুছুন</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}</TableCell></TableRow>)))}</TableBody></Table></div></CardContent></Card>
        </div>
    );
}

function IncomeComparisonTab({ allStudents, selectedYear, onPrintPotentialReport }: { allStudents: Student[], selectedYear: string, onPrintPotentialReport: (cls: string) => void }) {
    const db = useFirestore();
    const [collections, setCollections] = useState<FeeCollection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [previewClass, setPreviewClass] = useState<string>('6');

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const q = query(collection(db, 'feeCollections'), where('academicYear', '==', selectedYear));
        const unsubscribe = onSnapshot(q, (snapshot) => { setCollections(snapshot.docs.map(feeCollectionFromDoc).filter((f): f is FeeCollection => f !== null)); setIsLoading(false); }, (error) => { 
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'feeCollections', operation: 'list' })); 
            }
            setIsLoading(false); 
        });
        return () => unsubscribe();
    }, [db, selectedYear]);

    const chartData = useMemo(() => {
        return BENGALI_MONTHS.map((month, idx) => {
            let potential = 0; let actual = 0;
            const studentsInYear = allStudents.filter(s => s.academicYear === selectedYear);
            studentsInYear.forEach(s => {
                let effectiveTuition = s.monthlyFee || 0;
                if (s.feeCategory === 'full-free') effectiveTuition = 0;
                else if (s.feeCategory === 'half-free') effectiveTuition = Math.floor(effectiveTuition / 2);
                potential += effectiveTuition;
                if (idx === 0) potential += (s.admissionFee || 0) + (s.sessionFee || 0) + (s.otherFee || 0);
                if (idx === 5) potential += (s.examFeeHalfYearly || 0);
                if (idx === 11) potential += (s.examFeeAnnual || 0);
            });
            collections.forEach(c => { if (new Date(c.collectionDate).getMonth() === idx) actual += (c.totalAmount || 0); });
            return { name: month, potential, actual };
        });
    }, [allStudents, collections, selectedYear]);

    const stats = useMemo(() => {
        const potential = chartData.reduce((acc, curr) => acc + curr.potential, 0);
        const actual = chartData.reduce((acc, curr) => acc + curr.actual, 0);
        return { potential, actual, due: Math.max(0, potential - actual) };
    }, [chartData]);

    const potentialPreviewData = useMemo(() => {
        const students = allStudents
            .filter(s => s.academicYear === selectedYear && s.className === previewClass)
            .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));

        return students.map(student => {
            let tuition = student.monthlyFee || 0;
            if (student.feeCategory === 'full-free') tuition = 0;
            else if (student.feeCategory === 'half-free') tuition = Math.floor(tuition / 2);

            const admission = student.admissionFee || 0;
            const session = student.sessionFee || 0;
            const exam = (student.examFeeHalfYearly || 0) + (student.examFeeAnnual || 0) + (student.examFeePreNirbachoni || 0) + (student.examFeeNirbachoni || 0);
            const other = (student.otherFee || 0) + (student.scoutFee || 0) + (student.developmentFee || 0) + (student.libraryFee || 0) + (student.tiffinFee || 0);
            const total = admission + session + (tuition * 12) + exam + other;

            return { roll: student.roll, name: student.studentNameBn, admission, session, tuition, exam, other, total };
        });
    }, [allStudents, selectedYear, previewClass]);

    const potentialGrandTotals = useMemo(() => {
        const totals = { admission: 0, session: 0, months: Array(12).fill(0), exam: 0, other: 0, total: 0 };
        potentialPreviewData.forEach(row => {
            totals.admission += row.admission;
            totals.session += row.session;
            totals.exam += row.exam;
            totals.other += row.other;
            totals.total += row.total;
            for(let i=0; i<12; i++) totals.months[i] += row.tuition;
        });
        return totals;
    }, [potentialPreviewData]);

    if (isLoading) {
        return (
            <div className="p-12 text-center italic text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-primary" /> 
                <span>ডাটা বিশ্লেষণ করা হচ্ছে...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-2 border-primary/20 bg-primary/5 shadow-md"><CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-primary tracking-widest">বার্ষিক মোট সম্ভাব্য পাওনা</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-slate-900">{toBengaliNumber(stats.potential)} ৳</div><p className="text-[10px] font-bold text-muted-foreground mt-1">টিউশন ও সকল ওয়ান-টাইম ফি মিলিয়ে</p></CardContent></Card>
                <Card className="border-2 border-emerald-500/20 bg-emerald-50/30 shadow-md"><CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-emerald-700 tracking-widest">বার্ষিক মোট প্রকৃত আদায়</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-emerald-950">{toBengaliNumber(stats.actual)} ৳</div><p className="text-[10px] font-bold text-emerald-600 mt-1">নগদ ও ব্যাংক আদায়ের সমষ্টি</p></CardContent></Card>
                <Card className="border-2 border-rose-500/20 bg-rose-50/30 shadow-md"><CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-rose-700 tracking-widest">মোট বকেয়া / অনাদায়ী</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-rose-950">{toBengaliNumber(stats.due)} ৳</div><p className="text-[10px] font-bold text-rose-600 mt-1">প্রাক্কলিত অবশিষ্ট পাওনা</p></CardContent></Card>
            </div>
            
            <Card className="border-2 border-black/10 shadow-xl bg-white rounded-2xl overflow-hidden"><CardHeader className="bg-primary/5 border-b border-black/5"><div><CardTitle className="text-base font-black flex items-center gap-2 text-primary"><BarChart3 className="h-5 w-5" /> সম্ভাব্য আয় বনাম প্রকৃত আদায় (তুলনামূলক চিত্র)</CardTitle><CardDescription className="font-bold text-[10px]">প্রতি মাসের সম্ভাব্য পাওনা এবং আদায়ের গ্রাফ</CardDescription></div></CardHeader><CardContent className="pt-8 h-[400px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} /><Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 'bold', fontSize: '12px', boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' }} formatter={(value: number) => [`${toBengaliNumber(value)} ৳`, '']} /><Legend verticalAlign="top" align="right" iconType="circle" /><Bar dataKey="potential" name="সম্ভাব্য পাওনা" fill="#6366f1" radius={[4, 4, 0, 0]} /><Bar dataKey="actual" name="প্রকৃত আদায়" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
            
            <Card className="border-2 border-emerald-100 bg-white shadow-lg overflow-hidden">
                <CardHeader className="bg-emerald-50/50 border-b flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-black text-emerald-800 flex items-center gap-2"><TableIcon className="h-5 w-5" /> শ্রেণিভিত্তিক বার্ষিক সম্ভাব্য পাওনা বিবরণী</CardTitle>
                        <CardDescription className="font-bold">সারা বছরের সম্ভাব্য পাওনার বিস্তারিত প্রিভিউ এবং প্রিন্ট</CardDescription>
                    </div>
                    <div className="flex items-center gap-4 no-print">
                        <div className="flex items-center gap-2">
                            <Label className="font-black text-xs">শ্রেণি:</Label>
                            <Select value={previewClass} onValueChange={setPreviewClass}>
                                <SelectTrigger className="w-40 bg-white border-2 font-bold h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>{['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <Button onClick={() => onPrintPotentialReport(previewClass)} className="font-black h-9 bg-emerald-600 hover:bg-emerald-700 shadow-md"><Printer className="mr-2 h-4 w-4" /> প্রিন্ট করুন</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="table-container !max-h-[500px] !border-0 !rounded-none">
                        <Table className="border-separate border-spacing-0 w-full min-w-[1300px] border-collapse border-2 border-black">
                            <TableHeader className="bg-slate-100 sticky top-0 z-30 shadow-sm">
                                <TableRow className="h-8 border-b-2 border-black">
                                    <TableHead className="border-r border-b border-black font-black text-[13px] text-center w-14 text-black sticky left-0 z-40 bg-slate-100">রোল</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[13px] min-w-[100px] text-black sticky left-14 z-40 bg-slate-100">শিক্ষার্থীর নাম</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">ভর্তি ফি</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">সেশন Charge</TableHead>
                                    {BENGALI_MONTHS.map(m => <TableHead key={m} className="border-r border-b border-black font-black text-[11px] text-center text-black px-1">{m}</TableHead>)}
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">পরীক্ষা ফি</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">অন্যান্য</TableHead>
                                    <TableHead className="font-black border-b border-black text-[13px] text-right pr-4 text-white bg-blue-900 sticky right-0 z-40">মোট পাওনা</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {potentialPreviewData.map((row, i) => (
                                    <TableRow key={i} className="h-7 border-b border-black hover:bg-slate-50 transition-colors">
                                        <TableCell className="border-r border-black text-center font-black text-[13px] sticky left-0 z-20 bg-white">{toBengaliNumber(row.roll)}</TableCell>
                                        <TableCell className="border-r border-black font-black text-[13px] truncate sticky left-14 z-20 bg-white">{row.name}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.admission > 0 ? toBengaliNumber(row.admission) : '-'}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.session > 0 ? toBengaliNumber(row.session) : '-'}</TableCell>
                                        {Array(12).fill(row.tuition).map((val, j) => (
                                            <TableCell key={j} className="border-r border-black text-center text-[11px] font-black">{val > 0 ? toBengaliNumber(val) : '-'}</TableCell>
                                        ))}
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.exam > 0 ? toBengaliNumber(row.exam) : '-'}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.other > 0 ? toBengaliNumber(row.other) : '-'}</TableCell>
                                        <TableCell className="text-right pr-4 font-black text-[14px] bg-blue-50 text-blue-900 sticky right-0 z-20 border-l border-black">{toBengaliNumber(row.total)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="sticky bottom-0 z-30">
                                <TableRow className="h-7 border-t-2 border-black bg-slate-200 font-black">
                                    <TableCell colSpan={2} className="text-right pr-4 border-r border-black text-[13px] sticky left-0 z-50 bg-slate-200">সর্বমোট সম্ভাব্য পাওনা:</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(potentialGrandTotals.admission)}</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(potentialGrandTotals.session)}</TableCell>
                                    {potentialGrandTotals.months.map((val: number, j: number) => <TableCell key={j} className="border-r border-black text-center text-[11px]">{toBengaliNumber(Math.round(val))}</TableCell>)}
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(potentialGrandTotals.exam)}</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(potentialGrandTotals.other)}</TableCell>
                                    <TableCell className="text-right pr-4 text-[16px] bg-blue-950 text-white sticky right-0 z-50 border-l border-black">{toBengaliNumber(potentialGrandTotals.total)} ৳</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function ClasswiseAnnualReportTab({ allStudents, selectedYear, onPrint }: { allStudents: Student[], selectedYear: string, onPrint: (reportData: any[]) => void }) {
    const db = useFirestore();
    const [selectedClass, setSelectedClass] = useState('6');
    const [collections, setCollections] = useState<FeeCollection[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchCollections = useCallback(async () => {
        if (!db) return;
        setIsLoading(true);
        const q = query(collection(db, 'feeCollections'), where('academicYear', '==', selectedYear));
        const snap = await getDocs(q);
        setCollections(snap.docs.map(feeCollectionFromDoc).filter((c): c is FeeCollection => c !== null));
        setIsLoading(false);
    }, [db, selectedYear]);

    useEffect(() => { fetchCollections(); }, [fetchCollections]);

    const reportData = useMemo(() => {
        const classStudents = allStudents
            .filter(s => s.academicYear === selectedYear && s.className === selectedClass)
            .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));

        return classStudents.map(student => {
            const studentCollections = collections.filter(c => c.studentId === student.id);
            const row: any = { 
                roll: student.roll, 
                name: student.studentNameBn, 
                admission: 0, 
                session: 0, 
                months: Array(12).fill(0), 
                exam: 0, 
                other: 0, 
                total: 0 
            };

            studentCollections.forEach(c => {
                row.total += (c.totalAmount || 0);
                if (c.breakdown) {
                    row.admission += (c.breakdown.admissionFee || 0);
                    row.session += (c.breakdown.sessionFee || 0);
                    row.other += (c.breakdown.otherFee || 0) + (c.breakdown.scoutFee || 0) + (c.breakdown.developmentFee || 0) + (c.breakdown.libraryFee || 0) + (c.breakdown.tiffinFee || 0) + (c.breakdown.tuitionFine || 0);
                    row.exam += (c.breakdown.examFeeHalfYearly || 0) + (c.breakdown.examFeeAnnual || 0) + (c.breakdown.examFeePreNirbachoni || 0) + (c.breakdown.examFeeNirbachoni || 0);
                    
                    const monthlyTuition = (c.breakdown.tuitionCurrent || 0) + (c.breakdown.tuitionDue || 0) + (c.breakdown.tuitionAdvance || 0);
                    if (monthlyTuition > 0) {
                        const monthsInDesc = BENGALI_MONTHS.filter(month => c.description.includes(month));
                        if (monthsInDesc.length > 0) {
                            const perMonth = monthlyTuition / monthsInDesc.length;
                            BENGALI_MONTHS.forEach((m, i) => {
                                if (monthsInDesc.includes(m)) {
                                    row.months[i] += perMonth;
                                }
                            });
                        }
                    }
                }
            });
            return row;
        });
    }, [allStudents, selectedYear, selectedClass, collections]);

    const grandTotals = useMemo(() => {
        const totals = { admission: 0, session: 0, months: Array(12).fill(0), exam: 0, other: 0, total: 0 };
        reportData.forEach(row => {
            totals.admission += row.admission;
            totals.session += row.session;
            totals.exam += row.exam;
            totals.other += row.other;
            totals.total += row.total;
            row.months.forEach((val: number, i: number) => totals.months[i] += val);
        });
        return totals;
    }, [reportData]);

    if (isLoading) {
        return (
            <div className="p-12 text-center italic text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-primary" /> 
                <span>বিশ্লেষণ করা হচ্ছে...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 p-4 border rounded-xl bg-white/50 no-print">
                <div className="space-y-2 w-full sm:w-48">
                    <Label className="font-black text-primary">শ্রেণি নির্বাচন করুন</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger className="bg-white border-2 font-bold h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['6', '7', '8', '9', '10'].map(c => <SelectItem key={c} value={c}>{classNamesMap[c]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => onPrint(reportData)} className="font-black px-10 h-10 shadow-lg"><Printer className="mr-2 h-4 w-4" /> রিপোর্ট প্রিন্ট করুন</Button>
            </div>

            <Card className="border-2 border-black overflow-hidden shadow-2xl">
                <CardHeader className="bg-primary/5 border-b-2 border-black no-print">
                    <CardTitle className="text-base font-black flex justify-between items-center">
                        <span>শ্রেণিভিত্তিক বার্ষিক আদায় বিবরণী - {toBengaliNumber(selectedYear)} ({classNamesMap[selectedClass]})</span>
                        <Badge variant="outline" className="font-bold border-primary text-primary">মোট শিক্ষার্থী: {toBengaliNumber(reportData.length)}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="table-container !max-h-[500px] !border-0 !rounded-none">
                        <Table className="border-separate border-spacing-0 w-full min-w-[1300px] border-collapse border-2 border-black">
                            <TableHeader className="bg-slate-100 sticky top-0 z-30 shadow-sm">
                                <TableRow className="h-8 border-b-2 border-black">
                                    <TableHead className="border-r border-b border-black font-black text-[13px] text-center w-14 text-black sticky left-0 z-40 bg-slate-100">রোল</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[13px] min-w-[100px] text-black sticky left-14 z-40 bg-slate-100">শিক্ষার্থীর নাম</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">ভর্তি ফি</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">সেশন ফি</TableHead>
                                    {BENGALI_MONTHS.map(m => <TableHead key={m} className="border-r border-b border-black font-black text-[11px] text-center text-black px-1">{m}</TableHead>)}
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">পরীক্ষা ফি</TableHead>
                                    <TableHead className="border-r border-b border-black font-black text-[12px] text-center text-black">অন্যান্য</TableHead>
                                    <TableHead className="font-black border-b border-black text-[13px] text-right pr-4 text-white bg-blue-900 sticky right-0 z-40">মোট আদায়</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.map((row, i) => (
                                    <TableRow key={i} className="h-7 border-b border-black hover:bg-slate-50 transition-colors">
                                        <TableCell className="border-r border-black text-center font-black text-[13px] sticky left-0 z-20 bg-white group-hover:bg-slate-50">{toBengaliNumber(row.roll)}</TableCell>
                                        <TableCell className="border-r border-black font-black text-[13px] truncate sticky left-14 z-20 bg-white group-hover:bg-slate-50">{row.name}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.admission > 0 ? toBengaliNumber(row.admission) : '-'}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.session > 0 ? toBengaliNumber(row.session) : '-'}</TableCell>
                                        {row.months.map((val: number, j: number) => (
                                            <TableCell key={j} className="border-r border-black text-center text-[11px] font-black">{val > 0 ? toBengaliNumber(Math.round(val)) : '-'}</TableCell>
                                        ))}
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.exam > 0 ? toBengaliNumber(row.exam) : '-'}</TableCell>
                                        <TableCell className="border-r border-black text-center text-[12px] font-black">{row.other > 0 ? toBengaliNumber(row.other) : '-'}</TableCell>
                                        <TableCell className="text-right pr-4 font-black text-[14px] bg-blue-50 text-blue-900 sticky right-0 z-20 border-l border-black">{toBengaliNumber(row.total)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="sticky bottom-0 z-30">
                                <TableRow className="h-7 border-t-2 border-black bg-slate-200 font-black">
                                    <TableCell colSpan={2} className="text-right pr-4 border-r border-black text-[13px] sticky left-0 z-50 bg-slate-200">সর্বমোট আদায়:</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(grandTotals.admission)}</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(grandTotals.session)}</TableCell>
                                    {grandTotals.months.map((val: number, j: number) => <TableCell key={j} className="border-r border-black text-center text-[11px]">{toBengaliNumber(Math.round(val))}</TableCell>)}
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(grandTotals.exam)}</TableCell>
                                    <TableCell className="border-r border-black text-center text-[12px]">{toBengaliNumber(grandTotals.other)}</TableCell>
                                    <TableCell className="text-right pr-4 text-[16px] bg-blue-950 text-white sticky right-0 z-50 border-l border-black">{toBengaliNumber(grandTotals.total)} ৳</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function MonthlyReportTab({ transactions, selectedYear }: { transactions: Transaction[], selectedYear: string }) {
    const { schoolInfo } = useSchoolInfo(); 
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());
    
    const reportData = useMemo(() => {
        const monthIndex = parseInt(selectedMonth); 
        const reportYear = parseInt(selectedYear); 
        const firstDayOfMonth = new Date(reportYear, monthIndex, 1); 
        const lastDayOfMonth = new Date(reportYear, monthIndex + 1, 0);
        
        let openingCash = 0; 
        let openingBank = 0; 
        const incomeHeads: Record<string, number> = {}; 
        const expenseHeads: Record<string, number> = {};
        
        transactions.forEach(t => { 
            const tDate = new Date(t.date); 
            const amount = Number(t.amount) || 0; 
            const method = t.method || 'cash';
            
            if (isBefore(tDate, firstDayOfMonth)) { 
                if (t.accountHead === 'ব্যাংকে জমা (Cash to Bank)') { 
                    openingCash -= amount; openingBank += amount; 
                } else if (t.accountHead === 'ব্যাংক থেকে উত্তোলন (Bank to Cash)') { 
                    openingCash += amount; openingBank -= amount; 
                } else if (t.type === 'income') { 
                    if (method === 'cash') openingCash += amount; else openingBank += amount; 
                } else { 
                    if (method === 'cash') openingCash -= amount; else openingBank -= amount; 
                } 
            } else if (tDate >= firstDayOfMonth && tDate <= lastDayOfMonth) { 
                if (t.accountHead.includes('উত্তোলন') || t.accountHead.includes('জমা')) return; 
                if (t.type === 'income') incomeHeads[t.accountHead] = (incomeHeads[t.accountHead] || 0) + amount; 
                else expenseHeads[t.accountHead] = (expenseHeads[t.accountHead] || 0) + amount; 
            } 
        });

        const totalIncome = Object.values(incomeHeads).reduce((a, b) => a + b, 0); 
        const totalExpense = Object.values(expenseHeads).reduce((a, b) => a + b, 0); 
        let closingCash = openingCash; 
        let closingBank = openingBank;

        transactions.filter(t => new Date(t.date) >= firstDayOfMonth && new Date(t.date) <= lastDayOfMonth).forEach(t => { 
            const amount = Number(t.amount) || 0; 
            const method = t.method || 'cash'; 
            if (t.accountHead === 'ব্যাংকে জমা (Cash to Bank)') { closingCash -= amount; closingBank += amount; } 
            else if (t.accountHead === 'ব্যাংক থেকে উত্তোলন (Bank to Cash)') { closingCash += amount; closingBank -= amount; } 
            else if (t.type === 'income') { if (method === 'cash') closingCash += amount; else closingBank += amount; } 
            else { if (method === 'cash') closingCash -= amount; else closingBank -= amount; } 
        });

        return { openingCash, openingBank, incomeHeads, expenseHeads, totalIncome, totalExpense, closingCash, closingBank };
    }, [transactions, selectedMonth, selectedYear]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <style jsx global>{`
                @media print {
                    @page { size: A4 portrait; margin: 0.4in !important; }
                    .printable-area { padding: 0 !important; margin: 0 !important; border: none !important; }
                }
            `}</style>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 no-print bg-white p-4 rounded-xl border-2 border-indigo-100">
                <div className="space-y-2 flex-1">
                    <Label className="font-bold text-xs">মাস নির্বাচন করুন:</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="h-10 font-bold border-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {BENGALI_MONTHS.map((m, i) => <SelectItem key={m} value={i.toString()}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => window.print()} className="font-black px-10 h-10 shadow-lg">
                    <Printer className="mr-2 h-4 w-4" /> রিপোর্ট প্রিন্ট করুন
                </Button>
            </div>

            <div className="printable-area bg-white text-black p-10 font-kalpurush border-2">
                <div className="text-center mb-8 border-b-4 border-emerald-800 pb-4">
                    <h1 className="text-3xl font-black text-emerald-950">{schoolInfo.name}</h1>
                    <p className="font-bold text-slate-700">{schoolInfo.address}</p>
                    <div className="mt-4 inline-block bg-emerald-50 px-6 py-1 rounded-full border-2 border-emerald-200">
                        <h2 className="text-xl font-black uppercase tracking-widest">
                            মাসিক আয়-ব্যয় বিবরণী - {BENGALI_MONTHS[parseInt(selectedMonth)]} {toBengaliNumber(selectedYear)}
                        </h2>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                        <h3 className="text-xl font-black border-b-2 border-emerald-700 pb-1 text-emerald-800">আয় (Incomes)</h3>
                        <Table className="border">
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-black">বিবরণ</TableHead>
                                    <TableHead className="text-right font-black">পরিমাণ (৳)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="bg-emerald-50/30 font-bold">
                                    <TableCell>প্রারম্ভিক জের (Opening Balance)</TableCell>
                                    <TableCell className="text-right">{toBengaliNumber(reportData.openingCash + reportData.openingBank)}</TableCell>
                                </TableRow>
                                {Object.entries(reportData.incomeHeads).map(([head, amount]) => (
                                    <TableRow key={head}>
                                        <TableCell className="pl-6">{head}</TableCell>
                                        <TableCell className="text-right">{toBengaliNumber(amount)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-emerald-100 font-black text-emerald-900 border-t-2">
                                    <TableCell>সর্বমোট আয় (ব্যালেন্স সহ)</TableCell>
                                    <TableCell className="text-right">{toBengaliNumber(reportData.openingCash + reportData.openingBank + reportData.totalIncome)} ৳</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-xl font-black border-b-2 border-rose-700 pb-1 text-rose-800">ব্যয় (Expenditures)</h3>
                        <Table className="border">
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-black">বিবরণ</TableHead>
                                    <TableHead className="text-right font-black">পরিমাণ (৳)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(reportData.expenseHeads).map(([head, amount]) => (
                                    <TableRow key={head}>
                                        <TableCell className="pl-6">{head}</TableCell>
                                        <TableCell className="text-right">{toBengaliNumber(amount)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-rose-100 font-black text-rose-900 border-t-2">
                                    <TableCell>সর্বমোট ব্যয়</TableCell>
                                    <TableCell className="text-right">{toBengaliNumber(reportData.totalExpense)} ৳</TableCell>
                                </TableRow>
                                <TableRow className="font-bold">
                                    <TableCell className="pt-8">সমাপনী জের (Closing Balance):</TableCell>
                                    <TableCell className="text-right pt-8">{toBengaliNumber(reportData.closingCash + reportData.closingBank)} ৳</TableCell>
                                </TableRow>
                                <TableRow className="text-[10px] italic text-muted-foreground">
                                    <TableCell className="pl-6">- হাতে নগদ: {toBengaliNumber(reportData.closingCash)}</TableCell>
                                    <TableCell className="text-right">- ব্যাংকে: {toBengaliNumber(reportData.closingBank)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <div className="mt-16 flex justify-between px-10">
                    <div className="text-center w-48 border-t-2 border-black pt-1 font-black">ক্যাশিয়ার / হিসাবরক্ষক</div>
                    <div className="text-center w-48 border-t-2 border-black pt-1 font-black">অডিটর / কমিটির স্বাক্ষর</div>
                    <div className="text-center w-48 border-t-2 border-black pt-1 font-black">প্রধান শিক্ষকের স্বাক্ষর</div>
                </div>
            </div>
        </div>
    );
}

function NewTransactionTab({ onTransactionAdded, initialType = 'income' }: { onTransactionAdded: () => void, initialType?: TransactionType }) {
    const { toast } = useToast(); const db = useFirestore(); const { user } = useAuth(); const { selectedYear } = useAcademicYear(); const [date, setDate] = useState<Date | undefined>(new Date()); const [type, setType] = useState<TransactionType>(initialType); const [method, setMethod] = useState<PaymentMethod>('cash'); const [accountHead, setAccountHead] = useState(''); const [description, setDescription] = useState(''); const [amount, setAmount] = useState<number | ''>(''); const [voucherNo, setVoucherNo] = useState(''); const [checkNo, setCheckNo] = useState(''); const incomeHeads = ['Tuition Fee', 'Exam Fee', 'Admission Fee', 'Session Fee', 'Donation', 'Bank to Cash', 'Other']; const expenseHeads = ['Staff Salary', 'Electricity & Utility', 'Stationery', 'Repair & Maintenance', 'Entertainment', 'Cash to Bank', 'Other'];
    useEffect(() => { setType(initialType); setAccountHead(''); }, [initialType]);
    
    const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!db || !user || !date || !type || !accountHead || !amount || amount <= 0) { toast({ variant: 'destructive', title: 'অনুগ্রহ করে সকল তথ্য পূরণ করুন।' }); return; } const newTransaction: NewTransactionData = { date, type, method, accountHead, description, amount: Number(amount), academicYear: selectedYear, voucherNo: type === 'expense' ? voucherNo : undefined, checkNo: method === 'bank' ? checkNo : undefined }; 
        addTransaction(db, newTransaction).then(() => {
            toast({ title: 'লেনদেন সফলভাবে যোগ হয়েছে।' }); setAccountHead(''); setDescription(''); setAmount(''); setVoucherNo(''); setCheckNo(''); onTransactionAdded();
        }).catch((error) => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'transactions', operation: 'create' })); });
    };

    return (
        <Card className={cn("border-2 shadow-lg animate-in fade-in duration-500", type === 'income' ? "border-emerald-100" : "border-rose-100")}><CardHeader className={cn("rounded-t-lg p-4", type === 'income' ? "bg-emerald-50/50" : "bg-rose-50/50")}><CardTitle className="flex items-center gap-2 text-lg">{type === 'income' ? <PlusCircle className="text-emerald-600" /> : <MinusCircle className="text-rose-600" />}নতুন {type === 'income' ? 'আয়' : 'ব্যয়'} এন্ট্রি করুন</CardTitle></CardHeader><CardContent className="pt-6"><form onSubmit={handleSubmit} className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"><div className="space-y-2"><Label className="text-xs font-bold">তারিখ</Label><DatePicker value={date} onChange={setDate} /></div><div className="space-y-2"><Label className="text-xs font-bold">লেনদেনের ধরণ</Label><RadioGroup value={type} onValueChange={(v) => { setType(v as TransactionType); setAccountHead(''); }} className="flex items-center space-x-4 pt-2"><div className="flex items-center space-x-2"><RadioGroupItem value="income" id="inc" /><Label htmlFor="inc" className="font-bold text-emerald-700">আয়</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="expense" id="exp" /><Label htmlFor="exp" className="font-bold text-rose-700">ব্যয়</Label></div></RadioGroup></div><div className="space-y-2"><Label className="text-xs font-bold">পেমেন্ট পদ্ধতি</Label><RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="flex items-center space-x-4 pt-2"><div className="flex items-center space-x-2"><RadioGroupItem value="cash" id="m-cash" /><Label htmlFor="m-cash" className="font-black">নগদ</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="bank" id="m-bank" /><Label htmlFor="m-bank" className="font-black">ব্যাংক</Label></div></RadioGroup></div><div className="space-y-2"><Label className="text-xs font-bold">খাত (Account Head)</Label><Select value={accountHead} onValueChange={setAccountHead}><SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger><SelectContent>{(type === 'income' ? incomeHeads : expenseHeads).map(head => <SelectItem key={head} value={head}>{head}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs font-bold">টাকার পরিমাণ</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} required className="h-10 text-lg font-black" /></div></div><div className="flex justify-end pt-4"><Button type="submit" size="lg" className={cn("px-12 font-black shadow-lg h-12", type === 'income' ? "bg-emerald-600" : "bg-rose-600")}>সেভ করুন</Button></div></form></CardContent></Card>
    );
}

function CashbookTab({ transactions, isLoading, refetch }: { transactions: Transaction[], isLoading: boolean, refetch: () => void }) {
    const db = useFirestore(); const { toast } = useToast(); const { user, hasPermission } = useAuth(); const isAdmin = user?.role === 'admin'; const canDeleteTransaction = hasPermission('special:edit-transaction') || isAdmin; const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const cashbookData = useMemo(() => { let balance = 0; const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); const calculated = sorted.map(tx => { if (tx.accountHead === 'ব্যাংকে জমা (Cash to Bank)') balance -= tx.amount; else if (tx.accountHead === 'ব্যাংক থেকে উত্তোলন (Bank to Cash)') balance += tx.amount; else if (tx.type === 'income') balance += tx.amount; else balance -= tx.amount; return { ...tx, balance }; }); if (selectedMonth === 'all') return calculated; return calculated.filter(tx => new Date(tx.date).getMonth().toString() === selectedMonth); }, [transactions, selectedMonth]);
    
    const handleDelete = async (id: string) => { 
        if(!db || !canDeleteTransaction) return; 
        deleteTransaction(db, id).then(() => {
            toast({ title: 'লেনদেন মুছে ফেলা হয়েছে।' }); refetch();
        }).catch((error) => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'transactions', operation: 'delete' })); });
    };

    return (
        <Card className="border-none shadow-none animate-in fade-in duration-500"><CardHeader className="px-0 pt-0"><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><CardTitle className="text-xl">ক্যাশবুক</CardTitle><div className="flex items-center gap-2"><Label className="font-bold text-xs">মাস নির্বাচন:</Label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-40 bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সকল মাস" /></SelectTrigger><SelectContent><SelectItem value="all">সকল মাস</SelectItem>{BENGALI_MONTHS.map((m, i) => (<SelectItem key={m} value={i.toString()}>{m}</SelectItem>))}</SelectContent></Select></div></div></CardHeader><CardContent className="px-0 pt-4"><div className="table-container"><Table className="min-w-[950px]"><TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm"><TableRow><TableHead>তারিখ</TableHead><TableHead>বিবরণ</TableHead><TableHead className="text-center">পদ্ধতি</TableHead><TableHead className="text-center">ভাউচার/চেক</TableHead><TableHead className="text-right">আয়</TableHead><TableHead className="text-right">ব্যয়</TableHead><TableHead className="text-right font-black">ব্যালেন্স</TableHead><TableHead className="text-right">কার্যক্রম</TableHead></TableRow></TableHeader><TableBody>{isLoading ? (<TableRow><TableCell colSpan={8} className="text-center py-20 italic">লোড হচ্ছে...</TableCell></TableRow>) : cashbookData.length === 0 ? (<TableRow><TableCell colSpan={8} className="text-center py-20 italic">কোনো লেনদেন পাওয়া যায়নি।</TableCell></TableRow>) : ([...cashbookData].reverse().map(tx => (<TableRow key={tx.id}><TableCell className="whitespace-nowrap">{format(new Date(tx.date), 'PP', { locale: bn })}</TableCell><TableCell><p className="font-bold text-xs">{tx.accountHead}</p><p className="text-[9px] text-muted-foreground truncate max-w-[200px]">{tx.description}</p></TableCell><TableCell className="text-center"><Badge variant="outline" className={cn("text-[9px] font-black", tx.method === 'bank' ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50")}>{tx.method === 'bank' ? 'Bank' : 'Cash'}</Badge></TableCell><TableCell className="text-center"><div className="flex flex-col gap-1 items-center">{tx.voucherNo && <Badge className="text-[8px] bg-rose-50 text-rose-600">V: {tx.voucherNo}</Badge>}{tx.checkNo && <Badge className="text-[8px] bg-blue-50 text-blue-600">C: {tx.checkNo}</Badge>}</div></TableCell><TableCell className="text-right text-emerald-600 font-bold">{tx.type === 'income' ? toBengaliNumber(tx.amount) : '-'}</TableCell><TableCell className="text-right text-rose-600 font-bold">{tx.type === 'expense' ? toBengaliNumber(tx.amount) : '-'}</TableCell><TableCell className="text-right font-black text-primary">{toBengaliNumber(tx.balance)} ৳</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1">{canDeleteTransaction && (<AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={!!tx.feeCollectionId && !isAdmin} className="text-rose-50 h-8 w-8"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent className="font-kalpurush"><AlertDialogHeader><AlertDialogTitle>মুছে ফেলতে চান?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>না</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(tx.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black">হ্যাঁ</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}</div></TableCell></TableRow>)))}</TableBody></Table></div></CardContent></Card>
    );
}

function LedgerTab({ transactions, isLoading }: { transactions: Transaction[], isLoading: boolean }) {
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const ledgerData = useMemo(() => { const grouped: Record<string, { income: number, expense: number, items: Transaction[] }> = {}; const filtered = selectedMonth === 'all' ? transactions : transactions.filter(tx => new Date(tx.date).getMonth().toString() === selectedMonth); filtered.forEach(tx => { if (!grouped[tx.accountHead]) grouped[tx.accountHead] = { income: 0, expense: 0, items: [] }; if (tx.type === 'income') grouped[tx.accountHead].income += tx.amount; else grouped[tx.accountHead].expense += tx.amount; grouped[tx.accountHead].items.push(tx); }); return grouped; }, [transactions, selectedMonth]);
    return (<Card className="border-none shadow-none animate-in fade-in duration-500"><CardHeader className="px-0 pt-0"><div className="flex justify-between items-center"><CardTitle className="text-xl">খতিয়ান (লেজার)</CardTitle><div className="flex items-center gap-2"><Label className="font-bold text-xs">মাস নির্বাচন:</Label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-40 bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সকল মাস" /></SelectTrigger><SelectContent><SelectItem value="all">সকল মাস</SelectItem>{BENGALI_MONTHS.map((m, i) => (<SelectItem key={m} value={i.toString()}>{m}</SelectItem>))}</SelectContent></Select></div></div></CardHeader><CardContent className="px-0 pt-4">{isLoading ? <p className="text-center py-20 italic">লোড হচ্ছে...</p> : Object.keys(ledgerData).length === 0 ? <p className="text-center py-20 italic">তথ্য নেই</p> : (<Accordion type="multiple" className="w-full space-y-3">{Object.entries(ledgerData).map(([head, data]) => (<AccordionItem value={head} key={head} className="border-2 rounded-xl px-4 bg-white shadow-sm overflow-hidden"><AccordionTrigger className="hover:no-underline font-black text-base py-4"><div className="flex justify-between w-full pr-4 text-left"><span>{head}</span><div className="flex gap-4 text-[10px]"><Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-100">আয়: {toBengaliNumber(data.income)}</Badge><Badge variant="outline" className="text-rose-700 bg-rose-50 border-rose-100">ব্যয়: {toBengaliNumber(data.expense)}</Badge></div></div></AccordionTrigger><AccordionContent className="pt-2 p-0"><div className="table-container max-h-[300px]"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>তারিখ</TableHead><TableHead>বিবরণ</TableHead><TableHead className="text-right">আয়</TableHead><TableHead className="text-right">ব্যয়</TableHead></TableRow></TableHeader><TableBody>{data.items.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (<TableRow key={tx.id} className="h-10"><TableCell className="text-xs">{format(new Date(tx.date), 'PP', { locale: bn })}</TableCell><TableCell className="text-[10px]">{tx.description || '-'}</TableCell><TableCell className="text-right font-bold text-emerald-600 text-xs">{tx.type === 'income' ? toBengaliNumber(tx.amount) : '-'}</TableCell><TableCell className="text-right font-bold text-rose-600 text-xs">{tx.type === 'expense' ? toBengaliNumber(tx.amount) : '-'}</TableCell></TableRow>))}</TableBody></Table></div></AccordionContent></AccordionItem>))}</Accordion>)}</CardContent></Card>);
}

// --- Helper Functions ---

function toBengaliNumber(str: string | number | undefined | null) { if (!str && str !== 0) return ''; const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']; return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]); }

// --- Main Page Component ---

export default function AccountsPage() {
  const [isClient, setIsClient] = useState(false); const db = useFirestore(); const { user, hasPermission } = useAuth(); const { selectedYear } = useAcademicYear(); const { schoolInfo } = useSchoolInfo(); const [transactions, setTransactions] = useState<Transaction[]>([]); const [allStudents, setAllStudents] = useState<Student[]>([]); const [isLoading, setIsLoading] = useState(true); const [isLoadingStudents, setIsLoadingStudents] = useState(true); const [activeSection, setActiveSection] = useState("dashboard"); const [pendingEntryType, setPendingEntryType] = useState<TransactionType>('income');
  
  const [activePrintReport, setActivePrintReport] = useState<AccountsPrintType>(null);
  const [potentialPrintParams, setPotentialPrintParams] = useState<{ cls: string } | null>(null);
  const [annualReportPrintData, setAnnualReportPrintData] = useState<any[]>([]);
  
  const fetchTransactions = useCallback(async () => { if (!db || !user) return; setIsLoading(true); const fetched = await getTransactions(db, selectedYear); setTransactions(fetched); setIsLoading(false); }, [db, user, selectedYear]);
  const fetchStudents = useCallback(() => { if (!db || !user) return; setIsLoadingStudents(true); const q = query(collection(db, 'students'), where('academicYear', '==', selectedYear)); const unsubscribe = onSnapshot(q, (snap) => { setAllStudents(snap.docs.map(studentFromDoc)); setIsLoadingStudents(false); }, (error) => { 
    if (error.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'students', operation: 'list' })); 
    }
    setIsLoadingStudents(false); 
  }); return unsubscribe; }, [db, user, selectedYear]);
  useEffect(() => { setIsClient(true); fetchTransactions(); const unsub = fetchStudents(); return () => unsub?.(); }, [fetchTransactions, fetchStudents]);
  
  const sidebarItems = useMemo(() => { 
      const items = [{ id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard, color: 'text-indigo-600 bg-indigo-50' }]; 
      if (hasPermission('manage:fee-setup')) items.push({ id: 'fee-setup', label: 'ফি সেটআপ', icon: Settings2, color: 'text-blue-600 bg-blue-50' }); 
      if (hasPermission('collect:fees')) { items.push({ id: 'fee-collection', label: 'বেতন আদায়', icon: Banknote, color: 'text-emerald-600 bg-emerald-50' }); items.push({ id: 'defaulters', label: 'বকেয়া তালিকা', icon: AlertCircle, color: 'text-rose-600 bg-rose-50' }); } 
      if (hasPermission('view:collection-report')) { items.push({ id: 'collection-report', label: 'আদায় রিপোর্ট', icon: ListChecks, color: 'text-violet-600 bg-violet-50' }); items.push({ id: 'income-comparison', label: 'সম্ভাব্য পাওনা বনাম আদায়', icon: BarChart3, color: 'text-amber-600 bg-amber-50' }); items.push({ id: 'classwise-annual-report', label: 'শ্রেণিভিত্তিক বার্ষিক আদায়', icon: TableIcon, color: 'text-emerald-600 bg-emerald-50' }); } 
      if (hasPermission('view:expense-report')) items.push({ id: 'expense-report', label: 'ব্যয় রিপোর্ট', icon: Receipt, color: 'text-rose-600 bg-rose-50' }); 
      if (hasPermission('view:cashbook-ledger')) { items.push({ id: 'cashbook', label: 'ক্যাশবুক', icon: BookOpen, color: 'text-blue-600 bg-blue-50' }); items.push({ id: 'ledger', label: 'খতিয়ান (লেজার)', icon: LayoutGrid, color: 'text-amber-600 bg-amber-50' }); } 
      if (hasPermission('view:accounts-monthly-report')) items.push({ id: 'monthly-report', label: 'মাসিক রিপোর্ট', icon: FileBarChart, color: 'text-emerald-600 bg-emerald-50' }); 
      if (hasPermission('manage:transactions')) items.push({ id: 'new-transaction', label: 'আয়/ব্যয় এন্ট্রি', icon: PlusCircle, color: 'text-primary bg-primary/10' }); 
      return items; 
  }, [hasPermission]);
  
  const handlePrintPotentialReport = (cls: string) => {
    setPotentialPrintParams({ cls });
    setActivePrintReport('annual-potential');
    setTimeout(() => {
        window.print();
        setActivePrintReport(null);
    }, 3000);
  };

  const handlePrintAnnualReport = (data: any[]) => {
      setAnnualReportPrintData(data);
      setActivePrintReport('annual-collection');
      setTimeout(() => {
          window.print();
          setActivePrintReport(null);
      }, 3000);
  };

  const handlePrintFeeSetup = () => {
      setActivePrintReport('fee-setup');
      setTimeout(() => {
          window.print();
          setActivePrintReport(null);
      }, 500);
  };

  if (!isClient) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
      <Header />
      <main className="flex-1 flex flex-col md:flex-row h-full max-w-[1600px] mx-auto w-full md:p-6 lg:p-10 gap-8 pb-[500px]">
        <aside className="w-full md:w-60 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start"><h2 className="text-2xl font-black mb-6 px-4 hidden md:block text-slate-900 tracking-tight">হিসাব শাখা</h2><div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">{sidebarItems.map(item => (<button key={item.id} onClick={() => setActiveSection(item.id)} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit", activeSection === item.id ? "bg-white shadow-md text-primary scale-105" : "text-muted-foreground hover:bg-slate-200/50")}><div className={cn("p-1.5 rounded-lg shrink-0", activeSection === item.id ? item.color : "bg-muted")}> <item.icon className="h-4 w-4" /> </div><span className="text-sm font-black">{item.label}</span>{activeSection === item.id && <ChevronRight className="ml-auto h-4 w-4 hidden md:block" />}</button>))}</div></aside>
        <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4"><div className="p-4 sm:p-6 lg:p-8 flex-1">{isLoadingStudents && allStudents.length === 0 ? <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div> : (<><div className="mb-6 border-b pb-4 flex justify-between items-center no-print"><div><h2 className="text-2xl font-black text-slate-800">{sidebarItems.find(i => i.id === activeSection)?.label}</h2><p className="text-xs font-bold text-muted-foreground mt-1">শিক্ষাবর্ষ: {toBengaliNumber(selectedYear)}</p></div></div>{activeSection === 'dashboard' && <AccountsDashboardTab transactions={transactions} isLoading={isLoading} onActionClick={(t) => { setPendingEntryType(t); setActiveSection('new-transaction'); }} />}{activeSection === 'fee-setup' && <FeeSetupTab allStudents={allStudents} selectedYear={selectedYear} onPrint={handlePrintFeeSetup} />}{activeSection === 'fee-collection' && <FeeCollectionTab studentsForYear={allStudents.filter(s => s.academicYear === selectedYear)} isLoading={isLoadingStudents} onFeeCollected={fetchTransactions} />}{activeSection === 'defaulters' && <DefaultersTab allStudents={allStudents} selectedYear={selectedYear} />}{activeSection === 'collection-report' && <CollectionReportTab allStudents={allStudents} onDeleteSuccess={fetchTransactions} />}{activeSection === 'income-comparison' && <IncomeComparisonTab allStudents={allStudents} selectedYear={selectedYear} onPrintPotentialReport={handlePrintPotentialReport} />}{activeSection === 'classwise-annual-report' && <ClasswiseAnnualReportTab allStudents={allStudents} selectedYear={selectedYear} onPrint={handlePrintAnnualReport} />}{activeSection === 'expense-report' && <ExpenseReportTab transactions={transactions} isLoading={isLoading} onDeleteSuccess={fetchTransactions} />}{activeSection === 'cashbook' && <CashbookTab transactions={transactions} isLoading={isLoading} refetch={fetchTransactions} />}{activeSection === 'ledger' && <LedgerTab transactions={transactions} isLoading={isLoading} />}{activeSection === 'monthly-report' && <MonthlyReportTab transactions={transactions} selectedYear={selectedYear} />}{activeSection === 'new-transaction' && <NewTransactionTab onTransactionAdded={fetchTransactions} initialType={pendingEntryType} />}</>)}</div></div>
      </main>

      {/* Printable Areas */}
      {activePrintReport === 'fee-setup' && <PrintableFeeSetupArea allStudents={allStudents} selectedYear={selectedYear} schoolInfo={schoolInfo} />}
      {activePrintReport === 'annual-potential' && potentialPrintParams && <PrintablePotentialAnnualReport allStudents={allStudents} selectedYear={selectedYear} schoolInfo={schoolInfo} cls={potentialPrintParams.cls} />}
      {activePrintReport === 'annual-collection' && <PrintableClasswiseAnnualReport reportData={annualReportPrintData} selectedYear={selectedYear} schoolInfo={schoolInfo} />}
    </div>
  );
}

function PrintableFeeSetupArea({ allStudents, selectedYear, schoolInfo }: { allStudents: Student[], selectedYear: string, schoolInfo: any }) {
    const classes = ['6', '7', '8', '9', '10'];
    return (
        <div className="printable-area bg-white text-black font-kalpurush p-10">
            <style jsx global>{`
                @media print {
                    @page { size: A4 portrait; margin: 0.4in !important; }
                    .printable-area { padding: 0 !important; margin: 0 !important; }
                }
            `}</style>
            {classes.map(cls => {
                const classStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === cls).sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
                if (classStudents.length === 0) return null;
                return (
                    <div key={cls} className="mb-10 break-after-page">
                        <header className="flex items-center gap-6 border-b-4 border-emerald-800 pb-4 mb-6">
                            {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={60} height={60} className="object-contain" />}
                            <div className="text-center flex-grow">
                                <h1 className="text-3xl font-black text-emerald-950">{schoolInfo.name}</h1>
                                <p className="text-sm font-bold text-slate-700">{schoolInfo.address}</p>
                                <div className="mt-2 inline-block bg-emerald-50 px-6 py-0.5 rounded-full border-2 border-emerald-800">
                                    <h2 className="text-lg font-black uppercase">শিক্ষার্থীর ফি নির্ধারণ তালিকা - {toBengaliNumber(selectedYear)}</h2>
                                </div>
                                <p className="text-sm font-black mt-1">শ্রেণি: {classNamesMap[cls]}</p>
                            </div>
                        </header>
                        <Table className="border-2 border-black">
                            <TableHeader className="bg-slate-100">
                                <TableRow className="border-b-2 border-black">
                                    <TableHead className="w-12 text-center font-black border-r-2 border-black text-black">রোল</TableHead>
                                    <TableHead className="font-black border-r-2 border-black text-black">নাম</TableHead>
                                    <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">বেতন</TableHead>
                                    <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">অর্ধ-বার্ষিক</TableHead>
                                    <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">বার্ষিক ফি</TableHead>
                                    <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">সেশন ফি</TableHead>
                                    <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">ভর্তি ফি</TableHead>
                                    <TableHead className="w-20 text-center font-black text-black">অন্যান্য</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {classStudents.map(student => (
                                    <TableRow key={student.id} className="border-b border-slate-300 h-9">
                                        <TableCell className="text-center font-bold border-r-2 border-black">{toBengaliNumber(student.roll)}</TableCell>
                                        <TableCell className="font-bold border-r-2 border-black">{student.studentNameBn}</TableCell>
                                        <TableCell className="text-center border-r-2 border-black">{toBengaliNumber(student.monthlyFee || 0)}</TableCell>
                                        <TableCell className="text-center border-r-2 border-black">{toBengaliNumber(student.examFeeHalfYearly || 0)}</TableCell>
                                        <TableCell className="text-center border-r-2 border-black">{toBengaliNumber(student.examFeeAnnual || 0)}</TableCell>
                                        <TableCell className="text-center border-r-2 border-black">{toBengaliNumber(student.sessionFee || 0)}</TableCell>
                                        <TableCell className="text-center border-r-2 border-black">{toBengaliNumber(student.admissionFee || 0)}</TableCell>
                                        <TableCell className="text-center">{toBengaliNumber(student.otherFee || 0)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <footer className="mt-12 flex justify-between px-10">
                            <div className="text-center w-48 border-t-2 border-black pt-1 font-black">হিসাবরক্ষক</div>
                            <div className="text-center w-48 border-t-2 border-black pt-1 font-black">প্রধান শিক্ষক</div>
                        </footer>
                    </div>
                );
            })}
        </div>
    );
}

function PrintablePotentialAnnualReport({ allStudents, selectedYear, schoolInfo, cls }: { allStudents: Student[], selectedYear: string, schoolInfo: any, cls: string }) {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const months = isEn ? ENGLISH_MONTHS : BENGALI_MONTHS;
    const displaySchoolName = isEn ? (schoolInfo.nameEn || schoolInfo.name) : schoolInfo.name;
    const fmt = (val: number | string) => isEn ? String(val) : toBengaliNumber(val);

    const students = allStudents.filter(s => s.academicYear === selectedYear && s.className === cls).sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
    const grandTotals = { admission: 0, session: 0, months: Array(12).fill(0), exam: 0, other: 0, total: 0 };
    const studentRows = students.map(student => {
        let tuition = student.monthlyFee || 0;
        if (student.feeCategory === 'half-free') tuition = Math.floor(tuition / 2);
        else if (student.feeCategory === 'full-free') tuition = 0;
        const admission = student.admissionFee || 0;
        const session = student.sessionFee || 0;
        const exam = (student.examFeeHalfYearly || 0) + (student.examFeeAnnual || 0) + (student.examFeePreNirbachoni || 0) + (student.examFeeNirbachoni || 0);
        const other = student.otherFee || 0;
        const total = admission + session + (tuition * 12) + exam + other;
        grandTotals.admission += admission; grandTotals.session += session; grandTotals.exam += exam; grandTotals.other += other; grandTotals.total += total;
        const monthTotals = Array(12).fill(tuition);
        for(let i=0; i<12; i++) grandTotals.months[i] += tuition;
        const studentName = isEn ? (student.studentNameEn || student.studentNameBn) : student.studentNameBn;
        return { roll: student.roll, name: studentName, admission, session, months: monthTotals, exam, other, total };
    });

    return (
        <div className="printable-area bg-white text-black font-kalpurush p-2 w-full">
            <style jsx global>{`@media print { @page { size: A4 landscape; margin: 0.4in !important; } .printable-area { width: 100% !important; padding: 0 !important; } .printable-area table { border-collapse: collapse !important; border: 2px solid black !important; width: 100% !important; table-layout: auto !important; } .printable-area th, .printable-area td { border: 1px solid black !important; padding: 2px !important; } }`}</style>
            <div className="mb-20 break-after-page min-h-screen w-full">
                <header className="flex items-center justify-between border-b-4 border-[#2d572c] pb-2 mb-4">
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={50} height={50} className="object-contain" />}
                    <div className="text-center flex-grow">
                        <h1 className="text-2xl font-black text-slate-900">{displaySchoolName}</h1>
                        <p className="text-xs font-bold text-slate-700">{schoolInfo.address}</p>
                        <h2 className="text-base font-black underline uppercase mt-1 text-black">
                            {isEn ? `Class-wise Annual Estimated Dues Statement - ${selectedYear}` : `শ্রেণিভিত্তিক বার্ষিক সম্ভাব্য পাওনা বিবরণী - ${toBengaliNumber(selectedYear)}`}
                        </h2>
                        <p className="text-xs font-black">{isEn ? `Class: ${cls}` : `শ্রেণি: ${classNamesMap[cls]}`}</p>
                    </div>
                </header>
                <Table className="border-collapse border-2 border-black w-full text-[10px]">
                    <TableHeader className="bg-slate-100">
                        <TableRow className="h-6 border-b-2 border-black bg-slate-100">
                            <TableHead className="border-r border-b border-black font-black text-center w-8 text-black">{isEn ? 'Roll' : 'রোল'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black w-28 text-black text-left pl-2">{isEn ? "Student's Name" : 'শিক্ষার্থীর নাম'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Admission' : 'ভর্তি ফি'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Session Fee' : 'সেশন ফি'}</TableHead>
                            {months.map(m => <TableHead key={m} className="border-r border-b border-black font-black text-center text-black px-0.5 w-7 text-[9px]">{m.slice(0,3)}</TableHead>)}
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Exam' : 'পরীক্ষা'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Other' : 'অন্যান্য'}</TableHead>
                            <TableHead className="font-black border border-black text-right pr-1 text-black bg-slate-200 w-16">{isEn ? 'Total Dues' : 'মোট পাওনা'}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {studentRows.map((row, i) => (
                            <TableRow key={i} className="h-[18px] border-b border-black">
                                <TableCell className="border-r border-black text-center font-black text-black p-0 w-8">{fmt(row.roll)}</TableCell>
                                <TableCell className="border-r border-black font-bold whitespace-nowrap text-black text-left pl-2 p-0 w-28 border-r border-black">{row.name}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.admission > 0 ? fmt(row.admission) : '-'}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.session > 0 ? fmt(row.session) : '-'}</TableCell>
                                {row.months.map((val, j) => (
                                    <TableCell key={j} className="border-r border-black text-center text-black font-black p-0 w-7 text-[9px]">{val > 0 ? fmt(Math.round(val)) : '-'}</TableCell>
                                ))}
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.exam > 0 ? fmt(row.exam) : '-'}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.other > 0 ? fmt(row.other) : '-'}</TableCell>
                                <TableCell className="text-right pr-1 font-black bg-slate-100 text-black border border-black p-0 w-16">{fmt(row.total)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="h-6 border-t-2 border-black bg-slate-200 font-black">
                            <TableCell colSpan={2} className="text-right pr-2 border-r border-black text-black w-36 border-r border-black">{isEn ? 'Grand Total:' : 'সর্বমোট:'}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.admission)}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.session)}</TableCell>
                            {grandTotals.months.map((val, j) => <TableCell key={j} className="border-black text-center text-black w-7 text-[9px]">{fmt(Math.round(val))}</TableCell>)}
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.exam)}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.other)}</TableCell>
                            <TableCell className="text-right pr-1 text-black border-black w-16">{fmt(grandTotals.total)} ৳</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
                <footer className="mt-8 flex justify-between px-10">
                    <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">{isEn ? 'Accountant' : 'হিসাবরক্ষক'}</div>
                    <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">{isEn ? 'Headmaster' : 'প্রধান শিক্ষক'}</div>
                </footer>
            </div>
        </div>
    );
}

function PrintableClasswiseAnnualReport({ reportData, selectedYear, schoolInfo }: { reportData: any[], selectedYear: string, schoolInfo: any }) {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const months = isEn ? ENGLISH_MONTHS : BENGALI_MONTHS;
    const displaySchoolName = isEn ? (schoolInfo.nameEn || schoolInfo.name) : schoolInfo.name;
    const fmt = (val: number | string) => isEn ? String(val) : toBengaliNumber(val);

    const grandTotals = useMemo(() => {
        const totals = { admission: 0, session: 0, months: Array(12).fill(0), exam: 0, other: 0, total: 0 };
        reportData.forEach(row => {
            totals.admission += row.admission; totals.session += row.session; totals.exam += row.exam; totals.other += row.other; totals.total += row.total;
            row.months.forEach((val: number, i: number) => totals.months[i] += val);
        });
        return totals;
    }, [reportData]);

    if (reportData.length === 0) {
        return (
            <div className="printable-area p-20 text-center font-black">
                <span>{isEn ? 'Loading report data... Please wait.' : 'তথ্য লোড হচ্ছে... অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।'}</span>
            </div>
        );
    }

    return (
        <div className="printable-area bg-white text-black font-kalpurush p-2 w-full box-border">
             <style jsx global>{`@media print { @page { size: A4 landscape; margin: 0.4in !important; } .printable-area { width: 100% !important; padding: 0 !important; } .printable-area table { border-collapse: collapse !important; border: 2px solid black !important; width: 100% !important; table-layout: auto !important; } .printable-area th, .printable-area td { border: 1px solid black !important; padding: 2px !important; } }`}</style>
            <div className="mb-20 break-after-page min-h-screen w-full">
                <header className="flex items-center justify-between border-b-4 border-emerald-800 pb-2 mb-4">
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={50} height={50} className="object-contain" />}
                    <div className="text-center flex-grow">
                        <h1 className="text-2xl font-black text-emerald-950">{displaySchoolName}</h1>
                        <p className="text-xs font-bold text-slate-700">{schoolInfo.address}</p>
                        <h2 className="text-base font-black underline uppercase mt-1 text-black">
                            {isEn ? `Class-wise Annual Fee Collection Statement - ${selectedYear}` : `শ্রেণিভিত্তিক বার্ষিক আদায় বিবরণী - ${toBengaliNumber(selectedYear)}`}
                        </h2>
                    </div>
                </header>
                <Table className="border-collapse border-2 border-black w-full text-[10px]">
                    <TableHeader className="bg-slate-100">
                        <TableRow className="h-6 border-b-2 border-black bg-slate-100">
                            <TableHead className="border-r border-b border-black font-black text-center w-8 text-black">{isEn ? 'Roll' : 'রোল'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black w-28 text-black text-left pl-2">{isEn ? "Student's Name" : 'শিক্ষার্থীর নাম'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Admission' : 'ভর্তি ফি'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Session Fee' : 'সেশন ফি'}</TableHead>
                            {months.map(m => <TableHead key={m} className="border-r border-b border-black font-black text-center text-black px-0.5 w-7 text-[9px]">{m.slice(0,3)}</TableHead>)}
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Exam' : 'পরীক্ষা'}</TableHead>
                            <TableHead className="border-r border-b border-black font-black text-center text-black w-12">{isEn ? 'Other' : 'অন্যান্য'}</TableHead>
                            <TableHead className="font-black border border-black text-right pr-1 text-black bg-slate-200 w-16">{isEn ? 'Total' : 'মোট'}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reportData.map((row, i) => (
                            <TableRow key={i} className="h-[18px] border-b border-black">
                                <TableCell className="border-r border-black text-center font-black text-black p-0 w-8">{fmt(row.roll)}</TableCell>
                                <TableCell className="border-r border-black font-bold whitespace-nowrap text-black text-left pl-2 p-0 w-28 border-r border-black">{row.name}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.admission > 0 ? fmt(row.admission) : '-'}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.session > 0 ? fmt(row.session) : '-'}</TableCell>
                                {row.months.map((val: number, j: number) => (
                                    <TableCell key={j} className="border-r border-black text-center text-black font-black p-0 w-7 text-[9px]">{val > 0 ? fmt(Math.round(val)) : '-'}</TableCell>
                                ))}
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.exam > 0 ? fmt(row.exam) : '-'}</TableCell>
                                <TableCell className="border-r border-black text-center text-black font-black p-0 w-12">{row.other > 0 ? fmt(row.other) : '-'}</TableCell>
                                <TableCell className="text-right pr-1 font-black bg-slate-100 text-black border border-black p-0 w-16">{fmt(row.total)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="h-6 border-t-2 border-black bg-slate-200 font-black">
                            <TableCell colSpan={2} className="text-right pr-2 border-r border-black text-black w-36 border-r border-black">{isEn ? 'Grand Total:' : 'সর্বমোট:'}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.admission)}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.session)}</TableCell>
                            {grandTotals.months.map((val, j) => <TableCell key={j} className="border-black text-center text-black w-7 text-[9px]">{fmt(Math.round(val))}</TableCell>)}
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.exam)}</TableCell>
                            <TableCell className="border-black text-center text-black w-12">{fmt(grandTotals.other)}</TableCell>
                            <TableCell className="text-right pr-1 text-black border-black w-16">{fmt(grandTotals.total)} ৳</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
                <footer className="mt-8 flex justify-between px-10">
                    <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">{isEn ? 'Accountant' : 'হিসাবরক্ষক'}</div>
                    <div className="text-center w-40 border-t border-black pt-1 font-black text-[10px]">{isEn ? 'Headmaster' : 'প্রধান শিক্ষক'}</div>
                </footer>
            </div>
        </div>
    );
}

type AccountsPrintType = 'fee-setup' | 'annual-potential' | 'annual-collection' | null;
