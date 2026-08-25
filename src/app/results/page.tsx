
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from "@/hooks/use-toast";
import { useAcademicYear } from '@/context/AcademicYearContext';
import { Student, studentFromDoc, getStudentPlaceholderImage, sanitizePhotoUrl, addStudent, updateStudent } from '@/lib/student-data';
import { getSubjects, Subject as SubjectType, subjectNameNormalization } from '@/lib/subjects';
import { saveClassResults, getResultsForClass, getAllResults, deleteClassResult, ClassResult, StudentResult } from '@/lib/results-data';
import { processStudentResults, StudentProcessedResult, getGradePoint } from '@/lib/results-calculation';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
    Trash2, FileUp, Download, FilePen, BookOpen, AlertCircle, Trophy, Printer, Loader2, 
    FileSpreadsheet, CheckCircle2, Save, Star, ChevronRight, LayoutGrid, FileText, 
    Search, Sparkles, Settings, ListTodo, List, XCircle, UserCheck, RefreshCw, Plus, AlertTriangle, Info, History
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, where, orderBy, FirestoreError, getDocs, limit, doc, writeBatch, serverTimestamp, Timestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { getExams, Exam } from '@/lib/exam-data';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { SpecialClassResult, saveSpecialResults, getSpecialResultsForClass } from '@/lib/special-results-data';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

const BENGALI_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const classNamesMap: { [key: string]: string } = { '6': 'ষষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': 'দশম' };
const groupNamesMap: { [key: string]: string } = { 'science': 'বিজ্ঞান', 'arts': 'মানবিক', 'commerce': 'ব্যবসায় শিক্ষা', 'all': 'সকল শাখা' };
const groupMap: Record<string, string> = { 
    'science': 'science', 'বিজ্ঞান': 'science',
    'arts': 'arts', 'মানবিক': 'arts', 'humanities': 'arts',
    'commerce': 'commerce', 'ব্যবসায় শিক্ষা': 'commerce', 'business': 'commerce'
};

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const normalize = (name: string) => {
    if (!name) return "";
    const trimmed = name.trim();
    return (subjectNameNormalization[trimmed] || trimmed).toLowerCase();
};

type Marks = {
    written?: number;
    mcq?: number;
    practical?: number;
}

// --- Sub Tab Components ---

const MarkManagementTab = ({ allStudents }: { allStudents: Student[] }) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    
    const isSubjectPermitted = useCallback((cls: string, sub: string) => {
        if (user?.role === 'admin') return true;
        if (hasPermission('manage:results')) return true;
        return (user as any)?.marksPermissions?.[cls]?.includes(sub) ?? false;
    }, [user, hasPermission]);

    const [exams, setExams] = useState<Exam[]>([]);
    const [examName, setExamName] = useState('');
    const [className, setClassName] = useState('');
    const [group, setGroup] = useState('');
    const [subject, setSubject] = useState('');
    const [fullMarks, setFullMarks] = useState<number>(100);
    
    const [availableSubjects, setAvailableSubjects] = useState<SubjectType[]>([]);
    const [selectedSubjectInfo, setSelectedSubjectInfo] = useState<SubjectType | null>(null);

    const [studentsForClass, setStudentsForClass] = useState<Student[]>([]);
    const [marks, setMarks] = useState<Map<string, Marks>>(new Map());
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canUploadMarks = hasPermission('upload:marks');

    useEffect(() => {
        if (!db || !user) return;
        getExams(db, selectedYear).then(setExams);
    }, [db, selectedYear, user]);

    const showGroupSelector = useMemo(() => parseInt(className) >= 9, [className]);

    useEffect(() => {
        let newSubjects = getSubjects(className, group).filter(s => s.isExamSubject !== false);
        if (user?.role !== 'admin' && !hasPermission('manage:results') && hasPermission('input:results') && className) {
            newSubjects = newSubjects.filter(s => isSubjectPermitted(className, s.name));
        }
        setAvailableSubjects(newSubjects);
        if (subject && !newSubjects.some(s => s.name === subject)) {
            setSubject('');
            setSelectedSubjectInfo(null);
        }
    }, [className, group, subject, user, hasPermission, isSubjectPermitted]);

    useEffect(() => {
        if (subject) {
            const subInfo = availableSubjects.find(s => s.name === subject);
            setSelectedSubjectInfo(subInfo || null);
        } else setSelectedSubjectInfo(null);
    }, [subject, availableSubjects]);
    
    const handleLoadStudents = async () => {
        if (!examName || !className || !subject || !db || !user) {
            toast({ variant: 'destructive', title: 'তথ্য অসম্পূর্ণ', description: 'অনুগ্রহ করে পরীক্ষা, শ্রেণি ও বিষয় নির্বাচন করুন।' });
            return;
        }
        setIsLoadingStudents(true);
        const filteredStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === className && (!showGroupSelector || !group || s.group === group)).sort((a,b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
        setStudentsForClass(filteredStudents);
        
        const effectiveGroup = parseInt(className) < 9 ? undefined : group;
        const existingResults = await getResultsForClass(db, selectedYear, examName, className, subject, effectiveGroup).catch(() => undefined);
        const initialMarks = new Map<string, Marks>();
        if (existingResults) {
            setFullMarks(existingResults.fullMarks);
            existingResults.results.forEach(res => initialMarks.set(res.studentId, { written: res.written, mcq: res.mcq, practical: res.practical }));
        } else {
            const subInfo = availableSubjects.find(s => s.name === subject);
            setFullMarks(subInfo?.fullMarks || 100);
        }
        filteredStudents.forEach(student => { if (!initialMarks.has(student.id)) initialMarks.set(student.id, { written: undefined, mcq: undefined, practical: undefined }); });
        setMarks(initialMarks);
        setIsLoadingStudents(false);
    };

    const handleMarkChange = (studentId: string, field: keyof Marks, value: string) => {
        const numValue = value === '' ? undefined : parseInt(value, 10);
        const newMarks = new Map(marks);
        const studentMarks = { ...(newMarks.get(studentId) || {}) };
        studentMarks[field] = isNaN(numValue!) ? undefined : numValue;
        newMarks.set(studentId, studentMarks);
        setMarks(newMarks);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const table = e.currentTarget.closest('table');
            if (!table) return;
            
            const inputs = Array.from(table.querySelectorAll('tbody input[type="number"]')) as HTMLInputElement[];
            const index = inputs.indexOf(e.currentTarget);
            
            if (index >= 0 && index < inputs.length - 1) {
                const nextInput = inputs[index + 1];
                nextInput.focus();
                nextInput.select();
            }
        }
    };

    const handleSaveResults = async () => {
        if (!db || !user) return;
        if (!isSubjectPermitted(className, subject)) { toast({ variant: 'destructive', title: 'পারমিশন নেই' }); return; }
        if (studentsForClass.length === 0) { toast({ variant: 'destructive', title: 'কোনো শিক্ষার্থী নেই' }); return; }
        
        const resultsData: StudentResult[] = Array.from(marks.entries()).map(([studentId, marks]) => ({ studentId, ...marks }));
        const effectiveGroup = parseInt(className) < 9 ? undefined : group;
        
        await saveClassResults(db, { 
            academicYear: selectedYear, 
            examName, 
            className, 
            group: effectiveGroup || undefined, 
            subject, 
            fullMarks: fullMarks, 
            results: resultsData 
        });
        
        toast({ title: 'ফলাফল সেভ হয়েছে' });
    };

    const handleDownloadSample = () => {
       const ws = XLSX.utils.aoa_to_sheet([['রোল', 'লিখিত', 'বহুনির্বাচনী', 'ব্যবহারিক']]);
       const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'নম্বর নমুনা'); XLSX.writeFile(wb, 'marks_sample.xlsx');
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!db || !user || !className || !subject || !examName) { toast({ variant: "destructive", title: "তথ্য অসম্পূর্ণ" }); return; }
        if (!isSubjectPermitted(className, subject)) { toast({ variant: 'destructive', title: 'পারমিশন নেই' }); return; }
        if (!canUploadMarks) { toast({ variant: 'destructive', title: 'পারমিশন নেই', description: 'এক্সেল ফাইল আপলোড করার অনুমতি নেই।' }); return; }

        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const workbook = XLSX.read(e.target?.result, { type: 'array' });
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                if (json.length === 0 || studentsForClass.length === 0) return;
                const newMarks = new Map(marks); let count = 0;
                for (const row of json as any[]) {
                    const rollStr = String(row['রোল'] || row['roll'] || '');
                    const roll = parseInt(rollStr.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                    const student = studentsForClass.find(s => s.roll === roll);
                    if (!student) continue;
                    const sm = { ...(newMarks.get(student.id) || {}) };
                    const getVal = (k: string) => parseInt(String(row[k] || '').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                    const w = getVal('লিখিত') || getVal('written'); if (!isNaN(w)) sm.written = w;
                    const m = getVal('বহুনির্বাচনী') || getVal('mcq'); if (!isNaN(m)) sm.mcq = m;
                    const p = getVal('ব্যবহারিক') || getVal('practical'); if (!isNaN(p)) sm.practical = p;
                    newMarks.set(student.id, sm); count++;
                }
                setMarks(newMarks); toast({ title: "নম্বর লোড হয়েছে", description: `${count} জনের তথ্য পাওয়া গেছে।` });
            } catch (error: any) { toast({ variant: "destructive", title: "ত্রুটি", description: error.message }); }
        };
        reader.readAsArrayBuffer(file);
    };

    const numberInputClass = "h-9 font-bold border-2 border-black focus:ring-primary shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-white/50 shadow-sm">
                <div className="space-y-2">
                    <Label>পরীক্ষা</Label>
                    <Select value={examName} onValueChange={setExamName}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="পরীক্ষা নির্বাচন" /></SelectTrigger>
                        <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="class">শ্রেণি</Label>
                    <Select value={className} onValueChange={(v) => { setClassName(v); setGroup(''); setSubject(''); }}>
                        <SelectTrigger id="class" className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="শ্রেণি নির্বাচন" /></SelectTrigger>
                        <SelectContent><SelectItem value="6">৬ষ্ঠ</SelectItem><SelectItem value="7">৭ম</SelectItem><SelectItem value="8">৮ম</SelectItem><SelectItem value="9">৯ম</SelectItem><SelectItem value="10">১০ম</SelectItem></SelectContent>
                    </Select>
                </div>
                {showGroupSelector && (
                    <div className="space-y-2">
                        <Label htmlFor="group">গ্রুপ</Label>
                        <Select value={group} onValueChange={setGroup} required>
                            <SelectTrigger id="group" className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="গ্রুপ নির্বাচন" /></SelectTrigger>
                            <SelectContent><SelectItem value="science">বিজ্ঞান</SelectItem><SelectItem value="arts">মানবিক</SelectItem><SelectItem value="commerce">ব্যবসায় শিক্ষা</SelectItem></SelectContent>
                        </Select>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="subject">বিষয়</Label>
                    <Select value={subject} onValueChange={setSubject} disabled={!className || (showGroupSelector && !group)}>
                        <SelectTrigger id="subject" className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="বিষয় নির্বাচন" /></SelectTrigger>
                        <SelectContent>{availableSubjects.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <Button onClick={handleLoadStudents} disabled={isLoadingStudents || !subject || !examName} className="h-9 text-xs font-black">{isLoadingStudents ? 'লোড হচ্ছে...' : 'লোড করুন'}</Button>
            </div>
            
            {studentsForClass.length > 0 && (
                <Card className="overflow-hidden border-2 shadow-lg">
                    <CardHeader className="bg-muted/30 p-3 flex flex-row justify-between items-center space-y-0 border-b">
                         <div className="flex items-center gap-4">
                            <span className="font-black text-sm text-primary">{subject} ({studentsForClass.length.toLocaleString('bn-BD')} জন)</span>
                            <Badge variant="outline" className="bg-white font-black text-[10px] px-3">পূর্ণমান: {toBengaliNumber(fullMarks)}</Badge>
                         </div>
                         {canUploadMarks && (
                             <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleDownloadSample} className="h-8 text-[10px] bg-white"><Download className="mr-2 h-3.5 w-3.5" /> নমুনা</Button>
                                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-8 text-[10px] bg-white"><FileUp className="mr-2 h-3.5 w-3.5" /> আপলোড</Button>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
                            </div>
                         )}
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[500px] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-white z-20 shadow-sm">
                                    <TableRow>
                                        <TableHead className="w-20 text-center font-black">রোল</TableHead>
                                        <TableHead className="font-black">শিক্ষার্থীর নাম</TableHead>
                                        <TableHead className="w-32 font-black">লিখিত</TableHead>
                                        <TableHead className="w-32 font-black">MCQ</TableHead>
                                        {selectedSubjectInfo?.practical && <TableHead className="w-32 font-black">ব্যবহারিক</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {studentsForClass.map(student => (
                                        <TableRow key={student.id} className="hover:bg-accent/5">
                                            <TableCell className="font-black text-center">{toBengaliNumber(student.roll)}</TableCell>
                                            <TableCell className="font-bold text-slate-700">{student.studentNameBn}</TableCell>
                                            <TableCell><Input type="number" value={marks.get(student.id)?.written ?? ''} onChange={(e) => handleMarkChange(student.id, 'written', e.target.value)} onKeyDown={handleKeyDown} className={numberInputClass} /></TableCell>
                                            <TableCell><Input type="number" value={marks.get(student.id)?.mcq ?? ''} onChange={(e) => handleMarkChange(student.id, 'mcq', e.target.value)} onKeyDown={handleKeyDown} className={numberInputClass} /></TableCell>
                                            {selectedSubjectInfo?.practical && <TableCell><Input type="number" value={marks.get(student.id)?.practical ?? ''} onChange={(e) => handleMarkChange(student.id, 'practical', e.target.value)} onKeyDown={handleKeyDown} className={numberInputClass} /></TableCell>}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex justify-end p-4 border-t bg-muted/10"><Button onClick={handleSaveResults} size="lg" className="px-10 font-black shadow-md">প্রাপ্ত নম্বর সেভ করুন</Button></div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

const SubjectReportTab = ({ allStudents, onPrintRequested }: { allStudents: Student[], onPrintRequested: (data: any) => void }) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    
    const [exams, setExams] = useState<Exam[]>([]);
    const [examName, setExamName] = useState('');
    const [className, setClassName] = useState('');
    const [group, setGroup] = useState('');
    const [subject, setSubject] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [availableSubjects, setAvailableSubjects] = useState<SubjectType[]>([]);
    const [results, setResults] = useState<ClassResult | null>(null);

    const isSubjectPermitted = useCallback((cls: string, sub: string) => {
        if (user?.role === 'admin') return true;
        if (hasPermission('manage:results')) return true;
        return (user as any)?.marksPermissions?.[cls]?.includes(sub) ?? false;
    }, [user, hasPermission]);

    useEffect(() => {
        if (!db || !user) return;
        getExams(db, selectedYear).then(setExams);
    }, [db, selectedYear, user]);

    useEffect(() => {
        let newSubjects = getSubjects(className, group).filter(s => s.isExamSubject !== false);
        if (user?.role !== 'admin' && !hasPermission('manage:results') && className) {
            newSubjects = newSubjects.filter(s => isSubjectPermitted(className, s.name));
        }
        setAvailableSubjects(newSubjects);
    }, [className, group, user, hasPermission, isSubjectPermitted]);

    const handleLoadReport = async () => {
        if (!examName || !className || !subject || !db) {
            toast({ variant: 'destructive', title: 'তথ্য অসম্পূর্ণ' });
            return;
        }
        setIsLoading(true);
        try {
            const effectiveGroup = parseInt(className) < 9 ? undefined : group;
            const data = await getResultsForClass(db, selectedYear, examName, className, subject, effectiveGroup).catch(() => undefined);
            if (!data) {
                toast({ title: 'কোনো ফলাফল পাওয়া যায়নি' });
                setResults(null);
            } else {
                setResults(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrintBlank = () => {
        if (!className || !subject) {
            toast({ variant: 'destructive', title: 'শ্রেণি ও বিষয় নির্বাচন করুন' });
            return;
        }
        const students = allStudents
            .filter(s => s.academicYear === selectedYear && s.className === className && (!group || s.group === group))
            .sort((a, b) => a.roll - b.roll)
            .map(student => ({
                student,
                marks: {},
                obtainedMarks: '',
                grade: '',
                point: 0,
                isPass: true
            }));

        onPrintRequested({ 
            studentData: students, 
            info: { examName: examName || 'ফাঁকা ফরম', className, subject, group, fullMarks: availableSubjects.find(s => s.name === subject)?.fullMarks || 100 },
            isBlank: true 
        });
    };

    const reportStudents = useMemo(() => {
        if (!results) return [];
        return allStudents
            .filter(s => s.academicYear === selectedYear && s.className === className && (parseInt(className) < 9 || !group || s.group === group))
            .sort((a, b) => a.roll - b.roll)
            .map(student => {
                const marks = results.results.find(r => r.studentId === student.id);
                const obtainedMarks = (marks?.written || 0) + (marks?.mcq || 0) + (marks?.practical || 0);
                const percentage = results.fullMarks > 0 ? (obtainedMarks / results.fullMarks) * 100 : 0;
                const passMark = Math.ceil(results.fullMarks * 0.33);
                const isPass = obtainedMarks >= passMark;
                const { grade, point } = getGradePoint(percentage);

                return {
                    student,
                    marks: marks || { studentId: student.id },
                    obtainedMarks,
                    grade: isPass ? grade : 'F',
                    point: isPass ? point : 0,
                    isPass
                };
            });
    }, [results, allStudents, selectedYear, className, group]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end p-4 border rounded-lg bg-white/50 shadow-sm">
                <div className="space-y-2">
                    <Label className="text-xs font-bold">পরীক্ষা</Label>
                    <Select value={examName} onValueChange={setExamName}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                        <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="font-bold text-xs">শ্রেণি</Label>
                    <Select value={className} onValueChange={setClassName}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                        <SelectContent>{Object.entries(classNamesMap).map(([v, l]) => <SelectItem key={v} value={v}>{l} শ্রেণি</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                {parseInt(className) >= 9 && (
                    <div className="space-y-2">
                        <Label className="text-xs font-bold">শাখা</Label>
                        <Select value={group} onValueChange={setGroup}>
                            <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সকল" /></SelectTrigger>
                            <SelectContent><SelectItem value="science">বিজ্ঞান</SelectItem><SelectItem value="arts">মানবিক</SelectItem><SelectItem value="commerce">ব্যবসায় শিক্ষা</SelectItem></SelectContent>
                        </Select>
                    </div>
                )}
                <div className="space-y-2">
                    <Label className="text-xs font-bold">বিষয়</Label>
                    <Select value={subject} onValueChange={setSubject} disabled={!className}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="বিষয়" /></SelectTrigger>
                        <SelectContent>{availableSubjects.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <Button onClick={handleLoadReport} disabled={isLoading || !subject || !examName} className="h-9 text-xs font-black">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'রিপোর্ট দেখুন'}
                </Button>
                <Button onClick={handlePrintBlank} variant="outline" className="h-9 text-xs font-black border-amber-600 text-amber-700 hover:bg-amber-50">
                    <Printer className="mr-2 h-4 w-4" /> ফাঁকা মার্কশিট
                </Button>
            </div>

            {results && (
                <Card className="border-2 shadow-lg overflow-hidden">
                    <CardHeader className="bg-primary/5 p-4 border-b flex flex-row justify-between items-center space-y-0">
                        <div>
                            <CardTitle className="text-base font-black text-primary">{subject} - নম্বর ফর্দ ({examName})</CardTitle>
                            <CardDescription className="text-[10px] font-bold">শ্রেণি: {classNamesMap[className]} | শাখা: {groupNamesMap[group || 'all']}</CardDescription>
                        </div>
                        <Button variant="outline" className="font-black h-9 border-primary text-primary" onClick={() => onPrintRequested({ studentData: reportStudents, info: { examName, className, subject, group, fullMarks: results.fullMarks }, isBlank: false })}>
                            <Printer className="mr-2 h-4 w-4" /> প্রিন্ট (PDF)
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="table-container !max-h-[550px]">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead className="w-20 text-center font-black">রোল</TableHead>
                                        <TableHead className="font-black">নাম</TableHead>
                                        <TableHead className="text-center font-black">লিখিত</TableHead>
                                        <TableHead className="text-center font-black">MCQ</TableHead>
                                        <TableHead className="text-center font-black">ব্যবহারিক</TableHead>
                                        <TableHead className="text-center font-black">প্রাপ্ত নম্বর</TableHead>
                                        <TableHead className="text-center font-black">গ্রেড</TableHead>
                                        <TableHead className="text-right pr-6 font-black">পয়েন্ট</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportStudents.map(({ student, marks, obtainedMarks, grade, point, isPass }) => (
                                        <TableRow key={student.id} className={cn("hover:bg-slate-50 h-10", !isPass && "bg-rose-50/50")}>
                                            <TableCell className={cn("text-center font-black", !isPass && "text-rose-600")}>{toBengaliNumber(student.roll)}</TableCell>
                                            <TableCell className={cn("font-bold text-slate-700", !isPass && "text-rose-700")}>{student.studentNameBn}</TableCell>
                                            <TableCell className={cn("text-center", !isPass && "text-rose-600")}>{marks.written ?? '-'}</TableCell>
                                            <TableCell className={cn("text-center", !isPass && "text-rose-600")}>{marks.mcq ?? '-'}</TableCell>
                                            <TableCell className={cn("text-center", !isPass && "text-rose-600")}>{marks.practical ?? '-'}</TableCell>
                                            <TableCell className={cn("text-center font-black", isPass ? "text-blue-900" : "text-rose-700")}>
                                                {toBengaliNumber(obtainedMarks)}
                                            </TableCell>
                                            <TableCell className={cn("text-center font-black", isPass ? "text-emerald-700" : "text-rose-700")}>{grade}</TableCell>
                                            <TableCell className={cn("text-right pr-6 font-black", isPass ? "text-slate-700" : "text-rose-700")}>{toBengaliNumber(point.toFixed(2))}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

const ResultSheetTab = ({ allStudents, onPrint }: { allStudents: Student[], onPrint: (data: any) => void }) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user } = useAuth();
    const [exams, setExams] = useState<Exam[]>([]);
    const [examName, setExamName] = useState('');
    const [className, setClassName] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [processedResults, setProcessedResults] = useState<StudentProcessedResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [classResults, setClassResults] = useState<ClassResult[]>([]);

    const bulkUploadRef = useRef<HTMLInputElement>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);

    // Dynamic ref tracking for scroll syncing
    const tableContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const topScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const scrollingRef = useRef<string | null>(null);

    const handleScrollSync = (key: string, source: 'top' | 'table') => {
        const top = topScrollRefs.current[key];
        const table = tableContainerRefs.current[key];
        if (!top || !table) return;

        // Prevent feedback loop using a frame-based guard
        if (scrollingRef.current && scrollingRef.current !== source + key) return;
        
        scrollingRef.current = source + key;
        if (source === 'top') {
            table.scrollLeft = top.scrollLeft;
        } else {
            top.scrollLeft = table.scrollLeft;
        }
        
        requestAnimationFrame(() => {
            scrollingRef.current = null;
        });
    };

    // Calculate a more precise table width based on column widths used in CSS
    const calculateTableWidth = (subs: SubjectType[]) => {
        let width = 60 + 200 + 350; // Sticky columns: Roll (60) + Name (200) + End Summary (5 * 70 = 350)
        subs.forEach(s => {
            const isEng = s.name.includes('ইংরেজি');
            if (isEng) {
                width += 144; // 3 columns (Obtained: 56, Grade: 40, Point: 48)
            } else if (s.practical) {
                width += 288; // 6 columns (Written: 48, MCQ: 48, Practical: 48, Obtained: 56, Grade: 40, Point: 48)
            } else {
                width += 240; // 5 columns (Written: 48, MCQ: 48, Obtained: 56, Grade: 40, Point: 48)
            }
        });
        return width;
    };

    useEffect(() => { 
        if (db && user) getExams(db, selectedYear).then(setExams); 
    }, [db, selectedYear, user]);

    const handleViewResults = async () => {
        if (!examName || !className || !db || !user) { toast({ variant: 'destructive', title: 'তথ্য অসম্পূর্ণ' }); return; }
        setIsLoading(true);
        try {
            const students = allStudents.filter(s => s.academicYear === selectedYear && s.className === className && (parseInt(className) < 9 || groupFilter === 'all' || (s.group || '').toLowerCase().trim() === groupFilter.toLowerCase().trim())).sort((a,b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
            if (students.length === 0) { toast({ title: 'কোনো শিক্ষার্থী নেই' }); setProcessedResults([]); setIsLoading(false); return; }
            
            const allResults = await getAllResults(db, selectedYear, examName).catch(() => []);
            const classRes = allResults.filter(r => r.className === className);
            setClassResults(classRes);
            const subs = getSubjects(className, groupFilter === 'all' ? undefined : groupFilter).filter(s => s.isExamSubject !== false);
            setProcessedResults(processStudentResults(students, classRes, subs));
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    };

    const handleDownloadExcel = () => {
        if (processedResults.length === 0) return;
        const data: any[] = [];
        const subs = getSubjects(className, groupFilter === 'all' ? undefined : groupFilter).filter(s => {
            if (!s.isExamSubject) return false;
            const matchingRecord = classResults.find(r => normalize(r.subject) === normalize(s.name));
            const effectiveFullMarks = matchingRecord?.fullMarks ?? s.fullMarks;
            return effectiveFullMarks > 0;
        });

        processedResults.forEach(res => {
            const row: any = { 'রোল': res.student.roll, 'শিক্ষার্থীর নাম': res.student.studentNameBn, 'বিভাগ': groupNamesMap[res.student.group || ''] || res.student.group || 'সাধারণ' };
            subs.forEach(s => {
                const sr = res.subjectResults.get(s.name);
                const isEng = s.name.includes('ইংরেজি');
                if (!isEng) { 
                    row[`${s.name} (লিখিত)`] = sr?.written ?? '-'; 
                    row[`${s.name} (MCQ)`] = sr?.mcq ?? '-'; 
                    if (s.practical) row[`${s.name} (ব্যবহারিক)`] = sr?.practical ?? '-'; 
                }
                row[`${s.name} (প্রাপ্ত)`] = sr?.marks ?? '-'; 
                row[`${s.name} (গ্রেড)`] = sr?.grade ?? '-'; 
                row[`${s.name} (পয়েন্ট)`] = sr?.point ?? '-';
            });
            row['মোট নম্বর'] = res.totalMarks; 
            row['জি.পি.এ'] = res.gpa.toFixed(2); 
            row['গ্রেড'] = res.isPass ? res.finalGrade : `F${res.failedSubjectsCount}`; 
            row['মেধাস্থান'] = res.isPass ? (res.meritPosition || '-') : 'ফেল';
            data.push(row);
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "Result Sheet");
        XLSX.writeFile(wb, `${examName}_${classNamesMap[className]}_Result.xlsx`);
        toast({ title: 'Excel ডাউনলোড সম্পন্ন হয়েছে' });
    };

    const handleDownloadBulkSample = () => {
        if (!className || !examName) {
            toast({ variant: 'destructive', title: 'শ্রেণি ও পরীক্ষা নির্বাচন করুন' });
            return;
        }
        
        const students = allStudents
            .filter(s => s.academicYear === selectedYear && s.className === className)
            .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
        
        const subjects = getSubjects(className).filter(s => s.isExamSubject !== false);
        
        const headers = ['রোল', 'নাম', 'বিভাগ'];
        subjects.forEach(s => {
            const isEng = s.name.includes('ইংরেজি');
            if (!isEng) {
                headers.push(`${s.name} - লিখিত`);
                headers.push(`${s.name} - MCQ`);
                if (s.practical) headers.push(`${s.name} - ব্যবহারিক`);
            } else {
                headers.push(`${s.name} - প্রাপ্ত`);
            }
        });

        getAllResults(db!, selectedYear, examName).then(allRes => {
            const classRes = allRes.filter(r => r.className === className);
            const sheetData = students.map(s => {
                const row: any = { 'রোল': s.roll, 'নাম': s.studentNameBn, 'বিভাগ': s.group || 'সাধারণ' };
                subjects.forEach(sub => {
                    const subRes = classRes.find(r => normalize(r.subject) === normalize(sub.name));
                    const marks = subRes?.results.find(mr => mr.studentId === s.id);
                    const isEng = sub.name.includes('ইংরেজি');
                    if (!isEng) {
                        row[`${sub.name} - লিখিত`] = marks?.written ?? '';
                        row[`${sub.name} - MCQ`] = marks?.mcq ?? '';
                        if (sub.practical) row[`${sub.name} - ব্যবহারিক`] = marks?.practical ?? '';
                    } else {
                        row[`${sub.name} - প্রাপ্ত`] = (marks?.written || 0) + (marks?.mcq || 0) + (marks?.practical || 0) || '';
                    }
                });
                return row;
            });

            const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Result Entry");
            XLSX.writeFile(wb, `Bulk_Result_Entry_Class_${className}_${examName}.xlsx`);
        });
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !db || !className || !examName) return;

        setIsBulkUploading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const workbook = XLSX.read(evt.target?.result, { type: 'binary', cellDates: true });
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                
                if (json.length === 0) {
                    toast({ variant: 'destructive', title: 'ফাইলটি খালি' });
                    setIsBulkUploading(false);
                    return;
                }

                const studentsInClass = allStudents.filter(s => s.academicYear === selectedYear && s.className === className);
                const subjects = getSubjects(className).filter(s => s.isExamSubject !== false);
                
                const subjectsToSave: Record<string, ClassResult> = {};
                const allExisting = await getAllResults(db, selectedYear, examName);
                const classExisting = allExisting.filter(r => r.className === className);

                for (const row of json) {
                    const roll = parseInt(String(row['রোল'] || row['roll'] || '0').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                    const student = studentsInClass.find(s => s.roll === roll);
                    if (!student) continue;

                    const rawGroup = (student.group || 'none').toLowerCase().trim();
                    let studentGroup = groupMap[rawGroup] || rawGroup;
                    if (parseInt(className) < 9) studentGroup = 'none';

                    subjects.forEach(sub => {
                        const isEng = sub.name.includes('ইংরেজি');
                        let marks: StudentResult | null = null;

                        if (!isEng) {
                            const wVal = row[`${sub.name} - লিখিত`];
                            const mVal = row[`${sub.name} - MCQ`];
                            const pVal = row[`${sub.name} - ব্যবহারিক`];
                            
                            const w = parseInt(String(wVal || '').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                            const m = parseInt(String(mVal || '').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                            const p = parseInt(String(pVal || '').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                            
                            if (!isNaN(w) || !isNaN(m) || !isNaN(p)) {
                                marks = { studentId: student.id, written: isNaN(w) ? undefined : w, mcq: isNaN(m) ? undefined : m, practical: isNaN(p) ? undefined : p };
                            }
                        } else {
                            const totalVal = row[`${sub.name} - প্রাপ্ত`];
                            const total = parseInt(String(totalVal || '').replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)]), 10);
                            if (!isNaN(total)) {
                                marks = { studentId: student.id, written: total, mcq: 0, practical: 0 };
                            }
                        }

                        if (marks) {
                            const normalizedName = subjectNameNormalization[sub.name] || sub.name;
                            const uniqueKey = `${normalizedName}-${studentGroup}`;
                            
                            if (!subjectsToSave[uniqueKey]) {
                                const existing = classExisting.find(r => 
                                    (normalize(r.subject) === normalize(normalizedName)) && 
                                    ((groupMap[(r.group || 'none').toLowerCase()] || (r.group || 'none').toLowerCase()) === studentGroup)
                                );
                                
                                subjectsToSave[uniqueKey] = existing ? JSON.parse(JSON.stringify(existing)) : { 
                                    academicYear: selectedYear, 
                                    examName, 
                                    className, 
                                    group: studentGroup === 'none' ? undefined : studentGroup, 
                                    subject: normalizedName, 
                                    fullMarks: sub.fullMarks, 
                                    results: [] 
                                };
                            }
                            
                            const resultArr = subjectsToSave[uniqueKey].results;
                            const existingIdx = resultArr.findIndex(r => r.studentId === student.id);
                            if (existingIdx > -1) resultArr[existingIdx] = marks;
                            else resultArr.push(marks);
                        }
                    });
                }

                const promises = Object.values(subjectsToSave).map(cr => saveClassResults(db, cr));
                await Promise.all(promises);

                toast({ title: 'ফলাফল আপলোড সম্পন্ন', description: `${Object.keys(subjectsToSave).length} টি বিষয়ের তথ্য সিঙ্ক করা হয়েছে।` });
                handleViewResults();
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'ত্রুটি', description: 'ফাইলটি প্রসেস করা সম্ভব হয়নি। ' + error });
            } finally {
                setIsBulkUploading(false);
                if (bulkUploadRef.current) bulkUploadRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const groupedData = useMemo(() => {
        const groups: Record<string, StudentProcessedResult[]> = {};
        processedResults.forEach(res => {
            const g = (parseInt(className) >= 9 && groupFilter !== 'all') ? (res.student.group || 'all') : 'all';
            if (!groups[g]) groups[g] = [];
            groups[g].push(res);
        });
        return groups;
    }, [processedResults, className, groupFilter]);

    const subBgColors = ['bg-[#f0f9ff]', 'bg-[#ecfdf5]', 'bg-[#fffbeb]', 'bg-[#f5f3ff]', 'bg-[#fff7ed]', 'bg-[#fff1f2]'];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end p-4 border rounded-lg bg-white/50 shadow-sm">
                <div className="space-y-2">
                    <Label className="font-bold text-xs">পরীক্ষা</Label>
                    <Select value={examName} onValueChange={setExamName}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                        <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="font-bold text-xs">শ্রেণি</Label>
                    <Select value={className} onValueChange={c => { setClassName(c); setGroupFilter('all'); setProcessedResults([]); }}>
                        <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                        <SelectContent><SelectItem value="6">৬ষ্ঠ</SelectItem><SelectItem value="7">৭ম</SelectItem><SelectItem value="8">৮ম</SelectItem><SelectItem value="9">৯ম</SelectItem><SelectItem value="10">১০ম</SelectItem></SelectContent>
                    </Select>
                </div>
                {parseInt(className) >= 9 && (
                    <div className="space-y-2">
                        <Label className="font-bold text-xs">শাখা</Label>
                        <Select value={groupFilter} onValueChange={setGroupFilter}>
                            <SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সকল শাখা" /></SelectTrigger>
                            <SelectContent><SelectItem value="all">সকল শাখা</SelectItem><SelectItem value="science">বিজ্ঞান</SelectItem><SelectItem value="arts">মানবিক</SelectItem><SelectItem value="commerce">ব্যবসায় শিক্ষা</SelectItem></SelectContent>
                        </Select>
                    </div>
                )}
                <Button onClick={handleViewResults} disabled={isLoading || !examName || !className} className="lg:col-span-1 shadow-md h-9 font-black text-xs">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ফলাফল দেখুন'}</Button>
                <div className="flex flex-col gap-1.5 lg:col-span-2">
                    <div className="flex gap-2">
                        <Button onClick={handleDownloadExcel} disabled={processedResults.length === 0} variant="outline" className="flex-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 h-9 font-black text-xs"><FileSpreadsheet className="h-3 w-3 mr-1" /> Excel</Button>
                        <Button onClick={() => onPrint({ results: groupedData, classResults, className, groupFilter, examName })} disabled={processedResults.length === 0} variant="outline" className="flex-1 border-primary text-primary hover:bg-primary/5 h-9 font-black text-xs"><Printer className="h-3 w-3 mr-1" /> প্রিন্ট</Button>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleDownloadBulkSample} disabled={!className || !examName} variant="outline" className="flex-1 text-[9px] h-7 font-bold border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50"><Download className="h-3 w-3 mr-1" /> নমুনা ডাউনলোড</Button>
                        <Button onClick={() => bulkUploadRef.current?.click()} disabled={isBulkUploading || !className || !examName} className="flex-1 text-[9px] h-7 font-black bg-indigo-600 hover:bg-indigo-700 shadow-md">
                            {isBulkUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileUp className="h-3 w-3 mr-1" />}
                            Excel আপলোড (সব বিষয়)
                        </Button>
                        <input type="file" ref={bulkUploadRef} className="hidden" accept=".xlsx, .xls" onChange={handleBulkUpload} />
                    </div>
                </div>
            </div>

            {Object.keys(groupedData).map(gk => {
                const results = groupedData[gk];
                const subs = getSubjects(className, gk === 'all' ? undefined : gk).filter(s => {
                    if (!s.isExamSubject) return false;
                    const matchingRecord = classResults.find(r => normalize(r.subject) === normalize(s.name));
                    const effectiveFullMarks = matchingRecord?.fullMarks ?? s.fullMarks;
                    return effectiveFullMarks > 0;
                });

                const totalTableWidth = calculateTableWidth(subs);

                return (
                    <div key={gk} className="space-y-0">
                        <div className="flex justify-between items-center bg-primary/10 p-2 rounded-t-lg border-2 border-black">
                            <h3 className="font-black text-primary text-sm uppercase">শাখা: {groupNamesMap[gk] || gk}</h3>
                            <Badge variant="secondary" className="font-black px-3 text-xs">মোট: {toBengaliNumber(results.length)} জন</Badge>
                        </div>
                        
                        {/* Top Scroll Sync Bar - Optimized with guard and matching width */}
                        <div 
                            ref={el => { topScrollRefs.current[gk] = el; }}
                            onScroll={() => handleScrollSync(gk, 'top')}
                            className="overflow-x-auto no-print mb-1 h-3 scrollbar-thin scrollbar-thumb-primary/20"
                            style={{ width: '100%' }}
                        >
                            <div style={{ width: `${totalTableWidth}px`, height: '1px' }} />
                        </div>

                        <div 
                            ref={el => { tableContainerRefs.current[gk] = el; }}
                            onScroll={() => handleScrollSync(gk, 'table')}
                            className="table-container !border-2 !border-black relative rounded-b-lg !overflow-auto"
                        >
                            <table className="min-w-max border-separate border-spacing-0 w-full">
                                <thead className="z-30">
                                    <tr>
                                        <th rowSpan={2} className="text-center font-black bg-white border-r-2 border-b-2 border-black sticky left-0 top-0 z-50 w-[60px] text-[12px] p-1 h-[64px] box-border">রোল</th>
                                        <th rowSpan={2} className="text-center font-black bg-white border-r-2 border-b-2 border-black sticky left-[60px] top-0 z-50 min-w-[200px] text-[12px] p-1 h-[64px] box-border">শিক্ষার্থীর নাম</th>
                                        {subs.map((s, idx) => (
                                            <th 
                                                key={s.name} 
                                                colSpan={s.name.includes('ইংরেজি') ? 3 : (s.practical ? 6 : 5)} 
                                                className={cn(
                                                    "text-center border-r-2 border-b-2 border-black font-black py-1 text-[12px] sticky top-0 z-40 px-2 h-[32px] box-border",
                                                    subBgColors[idx % subBgColors.length]
                                                )}
                                            >
                                                {s.name}
                                            </th>
                                        ))}
                                        <th rowSpan={2} className="text-center font-black border-l-2 border-r-2 border-b-2 border-black text-[14px] bg-[#fff1f2] p-1 sticky top-0 right-[280px] z-50 w-[70px] h-[64px] box-border">মোট</th>
                                        <th rowSpan={2} className="text-center font-black border-r-2 border-b-2 border-black text-[14px] bg-[#fff1f2] p-1 sticky top-0 right-[210px] z-50 w-[70px] h-[64px] box-border">GPA</th>
                                        <th rowSpan={2} className="text-center font-black border-r-2 border-b-2 border-black text-[13px] p-0.5 sticky top-0 right-[140px] bg-[#fff1f2] z-50 w-[70px] h-[64px] box-border">গ্রেড</th>
                                        <th rowSpan={2} className="text-center font-black border-r-2 border-b-2 border-black text-[13px] p-0.5 sticky top-0 right-[70px] bg-[#fff1f2] z-50 w-[70px] h-[64px] box-border">মেধা</th>
                                        <th rowSpan={2} className="text-center font-black border-b-2 border-black text-[14px] bg-[#fff1f2] p-1 sticky top-0 right-0 z-50 w-[70px] h-[64px] box-border">প্রিন্ট</th>
                                    </tr>
                                    <tr className="h-[32px]">
                                        {subs.map((s, idx) => {
                                            const isEng = s.name.includes('ইংরেজি');
                                            const bgColor = subBgColors[idx % subBgColors.length];
                                            return (
                                                <React.Fragment key={s.name}>
                                                    {!isEng && (
                                                        <>
                                                            <th className={cn("text-[11px] text-center border-r-2 border-b-2 border-black font-bold p-0.5 sticky top-[32px] z-30 w-12 h-[32px] box-border", bgColor)}>লিখিত</th>
                                                            <th className={cn("text-[11px] text-center border-r-2 border-b-2 border-black font-bold p-0.5 sticky top-[32px] z-30 w-12 h-[32px] box-border", bgColor)}>MCQ</th>
                                                            {s.practical && <th className={cn("text-[11px] text-center border-r-2 border-black font-bold p-0.5 sticky top-[32px] z-30 w-12 h-[32px] box-border", bgColor)}>ব্যবহারিক</th>}
                                                        </>
                                                    )}
                                                    <th className={cn("text-[11px] text-center border-r-2 border-b-2 border-black font-black bg-blue-200 text-blue-950 p-0.5 sticky top-[32px] z-30 w-14 h-[32px] box-border", bgColor)}>প্রাপ্ত</th>
                                                    <th className={cn("text-[11px] text-center border-r-2 border-b-2 border-black font-bold p-0.5 sticky top-[32px] z-30 w-10 h-[32px] box-border", bgColor)}>গ্রেড</th>
                                                    <th className={cn("text-[11px] text-center border-r-2 border-b-2 border-black font-bold p-0.5 sticky top-[32px] z-30 w-12 h-[32px] box-border", bgColor)}>পয়েন্ট</th>
                                                </React.Fragment>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(res => (
                                        <tr key={res.student.id} className="h-10 hover:bg-slate-50 transition-colors">
                                            <td className="text-center font-black sticky left-0 z-20 bg-white border-r-2 border-b-2 border-black text-[13px] p-0.5 w-[60px] h-[40px] box-border">{toBengaliNumber(res.student.roll)}</td>
                                            <td className="font-bold sticky left-[60px] z-20 bg-white border-r-2 border-b-2 border-black text-[13px] p-0.5 px-3 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] h-[40px] box-border">{res.student.studentNameBn}</td>
                                            {subs.map((s, idx) => {
                                                const sr = res.subjectResults.get(s.name);
                                                const isEng = s.name.includes('ইংরেজি');
                                                const bgColor = subBgColors[idx % subBgColors.length];
                                                return (
                                                    <React.Fragment key={`${res.student.id}-${s.name}`}>
                                                        {!isEng && (
                                                            <>
                                                                <td className={cn("text-center border-r-2 border-b-2 border-black text-[12px] p-0.5 font-medium h-[40px] box-border", bgColor)}>{toBengaliNumber(sr?.written ?? '-') }</td>
                                                                <td className={cn("text-center border-r-2 border-b-2 border-black text-[12px] p-0.5 font-medium h-[40px] box-border", bgColor)}>{toBengaliNumber(sr?.mcq ?? '-') }</td>
                                                                {s.practical && <td className={cn("text-center border-r-2 border-b-2 border-black text-[12px] p-0.5 font-medium h-[40px] box-border", bgColor)}>{toBengaliNumber(sr?.practical ?? '-') }</td>}
                                                            </>
                                                        )}
                                                        <td className={cn("text-center border-r-2 border-b-2 border-black font-black bg-blue-100 text-blue-950 text-[13px] p-0.5 h-[40px] box-border", bgColor)}>{toBengaliNumber(sr?.marks ?? '-') }</td>
                                                        <td className={cn("text-center border-r-2 border-b-2 border-black text-[12px] font-black p-0.5 h-[40px] box-border", bgColor, sr && !sr.isPass && "text-rose-700 bg-rose-100")}>{sr?.grade ?? '-' }</td>
                                                        <td className={cn("text-center border-r-2 border-b-2 border-black text-[12px] p-0.5 font-bold h-[40px] box-border", bgColor)}>{toBengaliNumber(sr?.point?.toFixed(2) ?? '-') }</td>
                                                    </React.Fragment>
                                                )
                                            })}
                                            <td className="text-center font-black text-primary border-l-2 border-r-2 border-b-2 border-black text-[14px] p-0.5 sticky right-[280px] bg-[#fff1f2] z-20 w-[70px] h-[40px] box-border">{toBengaliNumber(res.totalMarks)}</td>
                                            <td className="text-center font-black border-r-2 border-b-2 border-black text-[14px] p-0.5 sticky right-[210px] bg-[#fff1f2] z-20 w-[70px] h-[40px] box-border">{toBengaliNumber(res.gpa.toFixed(2))}</td>
                                            <td className={cn("text-center font-black border-r-2 border-b-2 border-black text-[13px] p-0.5 sticky right-[140px] bg-[#fff1f2] z-20 w-[70px] h-[40px] box-border", !res.isPass && "text-rose-700")}>{res.isPass ? res.finalGrade : `F${toBengaliNumber(res.failedSubjectsCount)}`}</td>
                                            <td className={cn("text-center font-black border-r-2 border-b-2 border-black text-[13px] p-0.5 sticky right-[70px] bg-[#fff1f2] z-20 w-[70px] h-[40px] box-border", !res.isPass && "text-rose-500 italic text-[11px]")}>{res.isPass ? (toBengaliNumber(res.meritPosition || '-')) : 'ফেল'}</td>
                                            <td className="text-center p-0.5 border-b-2 border-black sticky right-0 bg-[#fff1f2] z-20 w-[70px] h-[40px] box-border">
                                                <Link href={`/marksheet/${res.student.id}?academicYear=${selectedYear}&examName=${examName}`} target="_blank">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white shadow-sm border border-slate-200"><Printer className="h-4 w-4 text-primary" /></Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const FullMarksTab = ({ allStudents }: { allStudents: Student[] }) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    
    const [exams, setExams] = useState<Exam[]>([]);
    const [examName, setExamName] = useState('');
    const [selectedClass, setSelectedClass] = useState('6');
    const [savedResults, setSavedResults] = useState<ClassResult[]>([]);
    const [fullMarksInputs, setFullMarksInputs] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState<string | null>(null);

    useEffect(() => {
        if (!db || !user) return;
        getExams(db, selectedYear).then(setExams);
    }, [db, selectedYear, user]);

    const updateSavedResults = useCallback(async () => {
        if (!db || !user) return;
        const allResults = await getAllResults(db, selectedYear, examName || undefined).catch(() => []);
        setSavedResults(allResults);
    }, [db, selectedYear, user, examName]);
    
    useEffect(() => {
        updateSavedResults();
    }, [updateSavedResults]);

    const isSubjectPermitted = useCallback((cls: string, sub: string) => {
        if (user?.role === 'admin') return true;
        if (hasPermission('manage:results') || hasPermission('manage:full-marks')) return true;
        return (user as any)?.marksPermissions?.[cls]?.includes(sub) ?? false;
    }, [user, hasPermission]);

    const handleUpdateFullMarks = (cls: string, sub: string, exam: string, currentRecord: ClassResult | null, newVal: string) => {
        const val = parseInt(newVal, 10);
        if (isNaN(val) || !db || !user) return;
        if (!isSubjectPermitted(cls, sub)) {
            toast({ variant: 'destructive', title: 'পারমিশন নেই' });
            return;
        }
        
        const inputKey = `${cls}-${sub}-${exam}`;
        setIsSaving(inputKey);

        const mutationPromise = currentRecord 
            ? saveClassResults(db, { ...currentRecord, fullMarks: val })
            : saveClassResults(db, { academicYear: selectedYear, examName: exam, className: cls, subject: sub, fullMarks: val, results: [] });

        mutationPromise.finally(() => {
            setIsSaving(null);
            updateSavedResults();
        });
        
        toast({ title: 'পূর্ণমান সংরক্ষিত হয়েছে' });
    };

    const handleDeleteResult = (id: string) => {
        if (!db || !id || !user) return;
        deleteClassResult(db, id);
        toast({ title: 'ফলাফল মোছা হয়েছে' });
        setTimeout(updateSavedResults, 500);
    }

    const classes = ['6', '7', '8', '9', '10'];
    const currentSubjects = useMemo(() => {
        const subjects = getSubjects(selectedClass).filter(s => s.isExamSubject !== false);
        return Array.from(new Set(subjects.map(s => s.name)))
            .map(name => subjects.find(s => s.name === name)!);
    }, [selectedClass]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6 items-end p-6 bg-white border-2 border-black/5 rounded-3xl shadow-sm no-print sticky top-0 z-[60] backdrop-blur-md">
                <div className="w-full md:w-64 space-y-2">
                    <Label className="font-black text-xs text-primary mb-1 block uppercase tracking-wider">১. পরীক্ষা নির্বাচন</Label>
                    <Select value={examName} onValueChange={setExamName}>
                        <SelectTrigger className="h-11 border-2 font-black"><SelectValue placeholder="পরীক্ষা নির্বাচন করুন" /></SelectTrigger>
                        <SelectContent>
                            {exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex-1 w-full space-y-2">
                    <Label className="font-black text-xs text-primary mb-1 block uppercase tracking-wider">২. শ্রেণি নির্বাচন করুন</Label>
                    <div className="flex flex-wrap gap-2">
                        {classes.map(cls => (
                            <Button 
                                key={cls}
                                onClick={() => setSelectedClass(cls)}
                                variant={selectedClass === cls ? "default" : "outline"}
                                className={cn(
                                    "font-black h-11 px-6 rounded-xl transition-all shadow-sm",
                                    selectedClass === cls ? "bg-primary text-white scale-105" : "bg-white text-slate-600 border-2"
                                )}
                            >
                                {classNamesMap[cls]} শ্রেণি
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-black text-xl text-primary flex items-center gap-2">
                        <CheckCircle2 className="h-6 w-6" /> {classNamesMap[selectedClass]} শ্রেণির বিষয় ও পূর্ণমান তালিকা
                    </h3>
                    <Badge variant="outline" className="font-black border-primary text-primary px-4 h-8">
                        মোট {toBengaliNumber(currentSubjects.length)} টি বিষয়
                    </Badge>
                </div>
                
                <Card className="border-2 border-black overflow-hidden shadow-xl rounded-2xl bg-white">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50 border-b-2 border-black">
                                    <TableRow>
                                        <TableHead className="pl-8 font-black text-black">ক্রমিক</TableHead>
                                        <TableHead className="font-black text-black">বিষয়ের নাম</TableHead>
                                        <TableHead className="text-center font-black text-black">পোস্টিং স্ট্যাটাস</TableHead>
                                        <TableHead className="w-48 text-center font-black text-black">পূর্ণমান (Full Marks)</TableHead>
                                        <TableHead className="text-right pr-8 font-black text-black">কার্যক্রম</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentSubjects.map((subInfo, i) => {
                                        const matchingRecords = savedResults.filter(r => 
                                            r.className === selectedClass && 
                                            normalize(r.subject) === normalize(subInfo.name) && 
                                            r.examName === examName
                                        );
                                        
                                        const existingRecord = matchingRecords.length > 0 ? matchingRecords[0] : null;
                                        const inputKey = `${selectedClass}-${subInfo.name}-${examName}`;
                                        const inputValue = fullMarksInputs[inputKey] !== undefined 
                                            ? fullMarksInputs[inputKey] 
                                            : (existingRecord?.fullMarks?.toString() || subInfo.fullMarks.toString());
                                        
                                        const isPermitted = isSubjectPermitted(selectedClass, subInfo.name);
                                        
                                        const totalClassStudents = allStudents.filter(s => {
                                            if (s.academicYear !== selectedYear || s.className !== selectedClass) return false;
                                            if (parseInt(selectedClass) < 9) return true;
                                            const studentGroupSubjects = getSubjects(s.className, s.group);
                                            return studentGroupSubjects.some(sub => normalize(sub.name) === normalize(subInfo.name));
                                        }).length;

                                        const uniqueStudentsWithMarks = new Set<string>();
                                        matchingRecords.forEach(record => {
                                            record.results.forEach(res => {
                                                if (res.studentId && (typeof res.written === 'number' || typeof res.mcq === 'number' || typeof res.practical === 'number')) {
                                                    uniqueStudentsWithMarks.add(res.studentId);
                                                }
                                            });
                                        });

                                        const postedCount = uniqueStudentsWithMarks.size;
                                        const remaining = Math.max(0, totalClassStudents - postedCount);
                                        const hasData = postedCount > 0;

                                        return (
                                            <TableRow key={i} className="h-16 border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="pl-8 font-bold text-muted-foreground">{toBengaliNumber(i + 1)}</TableCell>
                                                <TableCell className="font-black text-primary text-base">
                                                    {subInfo.name}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        {hasData ? (
                                                            <Badge className={cn("font-black text-[10px]", remaining === 0 ? "bg-emerald-600" : "bg-blue-600")}>
                                                                {remaining === 0 ? 'সম্পন্ন' : 'চলমান'}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">বকেয়া</Badge>
                                                        )}
                                                        <div className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                                            পোস্টিং: {toBengaliNumber(postedCount)} / {toBengaliNumber(totalClassStudents)} 
                                                            {remaining > 0 && postedCount > 0 && <span className="text-rose-600 ml-1 font-black">(বাকি: {toBengaliNumber(remaining)})</span>}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <Input 
                                                            type="number" 
                                                            value={inputValue}
                                                            onChange={(e) => setFullMarksInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                                            className="h-10 w-24 text-center font-black bg-white border-2 border-black text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                                            disabled={!isPermitted} 
                                                        />
                                                        <Button 
                                                            variant="outline" 
                                                            size="icon" 
                                                            className={cn(
                                                                "h-10 w-10 shrink-0 shadow-sm border-2",
                                                                isSaving === inputKey ? "text-slate-400" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                            )}
                                                            disabled={!isPermitted || isSaving === inputKey}
                                                            onClick={() => handleUpdateFullMarks(selectedClass, subInfo.name, examName, existingRecord || null, inputValue)}
                                                        >
                                                            {isSaving === inputKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-5 w-5" />}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-8">
                                                    {existingRecord && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="outline" size="icon" className="h-9 w-9 text-rose-600 border-rose-100 hover:bg-rose-50" disabled={!isPermitted}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="font-kalpurush">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="font-black text-rose-700">আপনি কি নিশ্চিত?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="font-bold">
                                                                        এই বিষয়ের জন্য এন্ট্রি করা সকল ফলাফল মুছে যাবে। (পূর্ণমান সংরক্ষিত থাকবে না)
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="font-bold">বাতিল</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteResult(existingRecord.id!)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black">মুছে ফেলুন</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
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
        </div>
    );
};

const MeritListTab = ({ allStudents }: { allStudents: Student[] }) => {
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    const [exams, setExams] = useState<Exam[]>([]);
    const [examName, setExamName] = useState('');
    const [className, setClassName] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [processedResults, setProcessedResults] = useState<StudentProcessedResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => { 
        if (db && user) getExams(db, selectedYear).then(setExams); 
    }, [db, selectedYear, user]);

    const handleViewMerit = async () => {
        if (!examName || !className || !db || !user) return;
        setIsLoading(true);
        try {
            const students = allStudents.filter(s => s.academicYear === selectedYear && s.className === className && (parseInt(className) < 9 || groupFilter === 'all' || (s.group || '').toLowerCase().trim() === groupFilter.toLowerCase().trim()));
            const allRes = await getAllResults(db, selectedYear, examName).catch(() => []);
            const classRes = allRes.filter(r => r.className === className);
            const subs = getSubjects(className, groupFilter === 'all' ? undefined : groupFilter).filter(s => s.isExamSubject !== false);
            const results = processStudentResults(students, classRes, subs);
            setProcessedResults(results.sort((a,b) => {
                if (a.isPass !== b.isPass) return a.isPass ? -1 : 1;
                if (!a.isPass && !b.isPass) {
                    if (a.failedSubjectsCount !== b.failedSubjectsCount) return a.failedSubjectsCount - b.failedSubjectsCount;
                }
                if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
                return a.student.roll - b.student.roll;
            }));
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-white/50 shadow-sm">
                <div className="space-y-2"><Label className="font-bold text-xs">পরীক্ষা</Label><Select value={examName} onValueChange={setExamName}><SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger><SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="font-bold text-xs">শ্রেণি</Label><Select value={className} onValueChange={c => { setClassName(c); setGroupFilter('all'); }}><SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger><SelectContent><SelectItem value="6">৬ষ্ঠ</SelectItem><SelectItem value="7">৭ম</SelectItem><SelectItem value="8">৮ম</SelectItem><SelectItem value="9">৯ম</SelectItem><SelectItem value="10">১০ম</SelectItem></SelectContent></Select></div>
                {parseInt(className) >= 9 && (<div className="space-y-2"><Label className="font-bold text-xs">শাখা</Label><Select value={groupFilter} onValueChange={setGroupFilter}><SelectTrigger className="bg-white h-9 text-xs font-bold border-2"><SelectValue placeholder="সকল" /></SelectTrigger><SelectContent><SelectItem value="all">সকল শাখা</SelectItem><SelectItem value="science">বিজ্ঞান</SelectItem><SelectItem value="arts">মানবিক</SelectItem><SelectItem value="commerce">ব্যবসায় শিক্ষা</SelectItem></SelectContent></Select></div>)}
                <Button onClick={handleViewMerit} disabled={isLoading || !examName || !className} className="lg:col-span-1 shadow-md h-9 font-black text-xs">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'মেধা তালিকা দেখুন'}</Button>
                <Link href={`/results/merit-list?academicYear=${selectedYear}&examName=${encodeURIComponent(examName)}&className=${className}&group=${groupFilter}`} target="_blank" className="lg:col-span-1">
                    <Button disabled={processedResults.length === 0} variant="outline" className="w-full border-primary text-primary hover:bg-primary/5 h-9 font-black text-xs"><Printer className="h-3 w-3 mr-1" /> প্রিন্ট তালিকা</Button>
                </Link>
            </div>
            {processedResults.length > 0 && (
                <div className="table-container shadow-xl border-2">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-16 text-center font-black">স্থান</TableHead>
                                <TableHead className="w-16 text-center font-black">রোল</TableHead>
                                <TableHead className="font-black">নাম</TableHead>
                                <TableHead className="text-center font-black">মোট নম্বর</TableHead>
                                <TableHead className="text-center font-black">GPA</TableHead>
                                <TableHead className="text-center font-black">গ্রেড</TableHead>
                                <TableHead className="text-right pr-8 font-black">ফলাফল</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {processedResults.map((res, i) => (
                                <TableRow key={res.student.id} className={cn("h-12 hover:bg-slate-50", !res.isPass && "bg-rose-50/50")}>
                                    <TableCell className="text-center font-black">{res.isPass ? toBengaliNumber(i + 1) : '-'}</TableCell>
                                    <TableCell className="text-center font-bold">{toBengaliNumber(res.student.roll)}</TableCell>
                                    <TableCell className="font-bold">{res.student.studentNameBn}</TableCell>
                                    <TableCell className="text-center font-black text-primary">{toBengaliNumber(res.totalMarks)}</TableCell>
                                    <TableCell className="text-center font-black">{toBengaliNumber(res.gpa.toFixed(2))}</TableCell>
                                    <TableCell className={cn("text-center font-black", !res.isPass && "text-rose-600")}>{res.isPass ? res.finalGrade : `F${toBengaliNumber(res.failedSubjectsCount)}`}</TableCell>
                                    <TableCell className="text-right pr-8">
                                        <Badge className={res.isPass ? "bg-emerald-600" : "bg-rose-600"}>{res.isPass ? 'কৃতকার্য' : 'অকৃতকার্য'}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
};

const PromotionTab = ({ allStudents }: { allStudents: Student[] }) => {
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    
    const [sourceClass, setSourceClass] = useState('6');
    const [targetYear, setTargetYear] = useState<string>((parseInt(selectedYear) + 1).toString());
    const [targetClass, setTargetClass] = useState<string>('7');
    const [passedStudents, setPassedStudents] = useState<StudentProcessedResult[]>([]);
    const [failedStudents, setFailedStudents] = useState<StudentProcessedResult[]>([]);
    const [selectedIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isPromoting, setIsPromoting] = useState(false);
    
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [promotionMode, setPromotionType] = useState<'pass' | 'special'>('pass');
    const [projectedPromotions, setProjectedPromotions] = useState<any[]>([]);

    // History Logic States
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyLoading, setHistoryHistoryLoading] = useState(false);
    const [promotedHistory, setPromotedHistory] = useState<any[]>([]);
    const [unpromotedHistory, setUnpromotedHistory] = useState<any[]>([]);

    const handleLoadSource = async () => {
        if (!sourceClass || !db) return;
        setIsLoading(true);
        try {
            const classStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === sourceClass);
            const allRes = await getAllResults(db, selectedYear, 'বার্ষিক পরীক্ষা').catch(() => []);
            const classRes = allRes.filter(r => r.className === sourceClass);
            const subs = getSubjects(sourceClass).filter(s => s.isExamSubject !== false);
            const processed = processStudentResults(classStudents, classRes, subs);
            
            setPassedStudents(processed.filter(r => r.isPass).sort((a,b) => (a.meritPosition || 0) - (b.meritPosition || 0)));
            setFailedStudents(processed.filter(r => !r.isPass).sort((a,b) => {
                if (a.failedSubjectsCount !== b.failedSubjectsCount) return a.failedSubjectsCount - b.failedSubjectsCount;
                return b.totalMarks - a.totalMarks;
            }));
            setSelectedStudentIds(new Set());
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const handleShowPreview = async (mode: 'pass' | 'special') => {
        if (isPromoting) return;
        setPromotionType(mode);
        const studentsToPromote = mode === 'pass' ? passedStudents : failedStudents.filter(f => selectedIds.has(f.student.id));
        if (studentsToPromote.length === 0) {
            toast({ variant: 'destructive', title: 'কোনো শিক্ষার্থী নির্বাচিত করা হয়নি' });
            return;
        }

        setIsPromoting(true);
        try {
            const startRoll = mode === 'pass' ? 1 : passedStudents.length + 1;
            
            const projected = studentsToPromote.map((res, index) => {
                const s = res.student;
                return {
                    name: s.studentNameBn,
                    id: s.id,
                    generatedId: s.generatedId,
                    currentRoll: s.roll,
                    projectedRoll: startRoll + index,
                    resData: res
                };
            });

            setProjectedPromotions(projected);
            setIsPreviewOpen(true);
        } catch (e) { console.error(e); }
        setIsPromoting(false);
    };

    const updateProjectedRoll = (studentId: string, newRoll: string) => {
        const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
        const rollNum = parseInt(bnToEn(newRoll).trim(), 10);
        setProjectedPromotions(prev => prev.map(p => 
            p.id === studentId ? { ...p, projectedRoll: isNaN(rollNum) ? 0 : rollNum } : p
        ));
    };

    const handleConfirmPromotion = async () => {
        if (!db || isPromoting) return;
        setIsPromoting(true);
        try {
            const batch = writeBatch(db);
            const targetSnap = await getDocs(query(collection(db, 'students'), where('academicYear', '==', String(targetYear)), where('className', '==', String(targetClass))));
            const existingTargetStudents = targetSnap.docs.map(studentFromDoc);
            const newAdmissions = existingTargetStudents.filter(s => !s._promoStatus);
            const alreadyPromoted = existingTargetStudents.filter(s => !!s._promoStatus);
            const studentsToPromote = projectedPromotions;
            const normalizeStr = (s: any) => String(s || '').trim().toLowerCase();

            for (let i = 0; i < studentsToPromote.length; i++) {
                const item = studentsToPromote[i];
                const res = item.resData;
                const s = res.student;
                const yearSuffix = String(targetYear).slice(-2);
                const classCode = String(targetClass).padStart(2, '0');
                const rollSerial = String(item.projectedRoll).padStart(4, '0');
                const newGeneratedId = `${yearSuffix}${classCode}${rollSerial}`;
                const studentData = { ...s, roll: item.projectedRoll, generatedId: newGeneratedId, academicYear: String(targetYear), className: String(targetClass), updatedAt: serverTimestamp(), _promoStatus: res.isPass ? 'pass' : 'fail', _promoRank: res.meritPosition || 999, _promoFailCount: res.failedSubjectsCount, _promoTotalMarks: res.totalMarks };
                delete (studentData as any).id;
                delete (studentData as any).createdAt;
                Object.keys(studentData).forEach(key => { if ((studentData as any)[key] === undefined) delete (studentData as any)[key]; });
                const existingRec = existingTargetStudents.find(ts => normalizeStr(ts.studentNameBn) === normalizeStr(s.studentNameBn) && normalizeStr(ts.fatherNameBn) === normalizeStr(s.fatherNameBn) && normalizeStr(ts.motherNameBn) === normalizeStr(s.motherNameBn));
                if (existingRec) batch.update(doc(db, 'students', existingRec.id), studentData);
                else batch.set(doc(collection(db, 'students')), studentData);
            }

            const newlyPromotedSourceIds = new Set(studentsToPromote.map(p => p.id));
            const distinctPromotedCount = alreadyPromoted.filter(ap => !newlyPromotedSourceIds.has(ap.id)).length + studentsToPromote.length;
            const totalPromotedNowCount = distinctPromotedCount;

            newAdmissions.sort((a,b) => a.roll - b.roll).forEach((nas, idx) => {
                const newRoll = totalPromotedNowCount + idx + 1;
                const yearSuffix = String(targetYear).slice(-2);
                const classCode = String(targetClass).padStart(2, '0');
                const rollSerial = String(newRoll).padStart(4, '0');
                const newId = `${yearSuffix}${classCode}${rollSerial}`;
                batch.update(doc(db, 'students', nas.id), { roll: newRoll, generatedId: newId, updatedAt: serverTimestamp() });
            });

            await batch.commit();
            toast({ title: 'প্রমোশন সফল', description: `${studentsToPromote.length} জন শিক্ষার্থীকে উন্নীত করা হয়েছে।` });
            setIsPreviewOpen(false);
            handleLoadSource();
        } catch (e) { 
            console.error(e);
            toast({ variant: 'destructive', title: 'প্রমোশন করা যায়নি' });
        }
        setIsPromoting(false);
    };

    const handleLoadHistory = async () => {
        if (!db || !sourceClass) return;
        setHistoryHistoryLoading(true);
        setIsHistoryOpen(true);
        try {
            const tYear = (parseInt(selectedYear) + 1).toString();
            const tClass = (parseInt(sourceClass) + 1).toString();

            const [sourceSnap, targetSnap] = await Promise.all([
                getDocs(query(collection(db, 'students'), where('academicYear', '==', selectedYear), where('className', '==', sourceClass))),
                getDocs(query(collection(db, 'students'), where('academicYear', '==', tYear), where('className', '==', tClass)))
            ]);

            const sourceList = sourceSnap.docs.map(studentFromDoc);
            const targetList = targetSnap.docs.map(studentFromDoc);

            const promoted: any[] = [];
            const unpromoted: any[] = [];
            const normalizeStr = (s: any) => String(s || '').trim().toLowerCase();

            sourceList.forEach(s => {
                const match = targetList.find(t => 
                    normalizeStr(t.studentNameBn) === normalizeStr(s.studentNameBn) && 
                    normalizeStr(t.fatherNameBn) === normalizeStr(s.fatherNameBn) && 
                    normalizeStr(t.motherNameBn) === normalizeStr(s.motherNameBn)
                );
                if (match) promoted.push({ ...s, targetRoll: match.roll, targetId: match.generatedId });
                else unpromoted.push(s);
            });

            setPromotedHistory(promoted.sort((a,b) => a.targetRoll - b.targetRoll));
            setUnpromotedHistory(unpromoted.sort((a,b) => a.roll - b.roll));
        } catch (e) { console.error(e); }
        setHistoryHistoryLoading(false);
    };

    const toggleSelection = (id: string) => {
        const n = new Set(selectedIds);
        if (n.has(id)) n.delete(id); else n.add(id);
        setSelectedStudentIds(n);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end p-6 border-2 border-primary/10 rounded-2xl bg-white shadow-sm">
                <div className="space-y-2">
                    <Label className="font-bold text-xs">সোর্স শ্রেণি (বর্তমান)</Label>
                    <Select value={sourceClass} onValueChange={v => { setSourceClass(v); const next = (parseInt(v)+1); setTargetClass(String(next)); setTargetYear((parseInt(selectedYear) + 1).toString()); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{['6', '7', '8', '9'].map(v => <SelectItem key={v} value={v}>{classNamesMap[v]} শ্রেণি</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2"><Label className="font-bold text-xs">টার্গেট বছর</Label><Input value={toBengaliNumber(targetYear)} disabled className="bg-slate-50 font-black" /></div>
                <div className="space-y-2"><Label className="font-bold text-xs">টার্গেট শ্রেণি</Label><Input value={classNamesMap[targetClass] + ' শ্রেণি'} disabled className="bg-slate-50 font-black" /></div>
                <Button onClick={handleLoadSource} disabled={isLoading} className="h-10 font-black"><Search className="h-4 w-4 mr-2" /> তালিকা লোড</Button>
                <Button onClick={handleLoadHistory} variant="outline" className="h-10 font-black border-primary text-primary"><History className="h-4 w-4 mr-2" /> হিস্টোরি ও সংশোধন</Button>
            </div>

            {passedStudents.length > 0 && (
                <Card className="border-2 shadow-xl rounded-3xl overflow-hidden">
                    <CardHeader className="bg-emerald-50 border-b-2 border-emerald-100 flex flex-row justify-between items-center p-6">
                        <div><CardTitle className="text-xl font-black text-emerald-800">পাস করা শিক্ষার্থীদের তালিকা</CardTitle><CardDescription className="font-bold">মেধাক্রম অনুযায়ী অটোমেটিক রোল ১ থেকে এসাইন হবে</CardDescription></div>
                        <Button onClick={() => handleShowPreview('pass')} className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 px-10 shadow-xl"><CheckCircle2 className="mr-2 h-5 v-5" /> সকল পাসকৃতদের প্রমোশন দিন</Button>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30 sticky top-0 z-10"><TableRow><TableHead className="text-center font-black">মেধাস্থান</TableHead><TableHead className="text-center font-black">বর্তমান রোল</TableHead><TableHead className="font-black">নাম</TableHead><TableHead className="text-center font-black">মোট নম্বর</TableHead><TableHead className="text-right pr-10 font-black">GPA</TableHead></TableRow></TableHeader>
                            <TableBody>{passedStudents.map(res => (<TableRow key={res.student.id} className="h-12 hover:bg-emerald-50/30 transition-colors"><TableCell className="text-center font-black text-emerald-700">{toBengaliNumber(res.meritPosition || '-')}</TableCell><TableCell className="text-center font-bold">{toBengaliNumber(res.student.roll)}</TableCell><TableCell className="font-bold">{res.student.studentNameBn}</TableCell><TableCell className="text-center font-black text-primary">{toBengaliNumber(res.totalMarks)}</TableCell><TableCell className="text-right pr-10 font-black">{toBengaliNumber(res.gpa.toFixed(2))}</TableCell></TableRow>))}</TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {failedStudents.length > 0 && (
                <Card className="border-2 shadow-xl rounded-3xl overflow-hidden">
                    <CardHeader className="bg-rose-50 border-b-2 border-rose-100 flex flex-row justify-between items-center p-6">
                        <div><CardTitle className="text-xl font-black text-rose-800">অকৃতকার্য শিক্ষার্থীদের তালিকা (বিশেষ পাশ)</CardTitle><CardDescription className="font-bold text-rose-600">কম ফেল এবং বেশি নম্বর অনুযায়ী এরা পাস করাদের পরে সিরিয়াল পাবে</CardDescription></div>
                        <Button onClick={() => handleShowPreview('special')} disabled={selectedIds.size === 0} className="bg-rose-600 hover:bg-rose-700 font-black h-12 px-8 shadow-xl"><Plus className="mr-2 h-5 v-5" /> নির্বাচিতদের প্রমোশন দিন</Button>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-12 text-center"><Checkbox onCheckedChange={c => setSelectedStudentIds(c ? new Set(failedStudents.map(f => f.student.id)) : new Set())} /></TableHead>
                                    <TableHead className="w-20 text-center font-black">বর্তমান রোল</TableHead>
                                    <TableHead className="font-black">নাম</TableHead>
                                    <TableHead className="text-center font-black">ফেল করা বিষয়</TableHead>
                                    <TableHead className="text-right pr-10 font-black">মোট নম্বর</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {failedStudents.map(res => (
                                    <TableRow key={res.student.id} className="h-14 hover:bg-rose-50/50 cursor-pointer" onClick={() => toggleSelection(res.student.id)}>
                                        <TableCell className="text-center" onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.has(res.student.id)} onCheckedChange={() => toggleSelection(res.student.id)} /></TableCell>
                                        <TableCell className="text-center font-black">{toBengaliNumber(res.student.roll)}</TableCell>
                                        <TableCell className="font-bold text-slate-800">{res.student.studentNameBn}</TableCell>
                                        <TableCell className="text-center"><Badge variant="outline" className="text-rose-600 border-rose-200">{toBengaliNumber(res.failedSubjectsCount)} টি বিষয়</Badge></TableCell>
                                        <TableCell className="text-right pr-10 font-black">{toBengaliNumber(res.totalMarks)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col font-kalpurush p-0 border-none shadow-2xl rounded-2xl overflow-hidden">
                    <DialogHeader className="p-6 bg-primary text-white shrink-0">
                        <DialogTitle className="text-2xl font-black flex items-center gap-2"><Sparkles className="h-6 w-6" /> প্রমোশন কনফার্মেশন ও প্রিভিউ</DialogTitle>
                        <DialogDescription className="text-white/80 font-bold">{classNamesMap[sourceClass]} থেকে {classNamesMap[targetClass]} শ্রেণিতে উন্নীতকরণের তালিকা</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50"><Card className="border-2 border-black/5 bg-white shadow-inner rounded-xl"><div className="grid grid-cols-4 p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center"><span>শিক্ষার্থীর নাম (আইডি)</span><span>বর্তমান রোল</span><span>স্ট্যাটাস</span><span className="text-primary">নতুন রোল</span></div><div className="divide-y-2 divide-slate-50">{projectedPromotions.map((item) => (<div key={item.id} className="grid grid-cols-4 p-4 items-center text-center hover:bg-primary/5 transition-colors"><div className="flex flex-col items-center"><span className="font-black text-slate-800 text-sm truncate px-1">{item.name}</span><span className="text-[10px] font-bold text-muted-foreground">ID: {toBengaliNumber(item.generatedId || '')}</span></div><span className="font-bold text-slate-500">{toBengaliNumber(item.currentRoll)}</span><span><Badge className={item.resData.isPass ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{item.resData.isPass ? 'কৃতকার্য' : 'বিশেষ পাশ'}</Badge></span><div className="flex justify-center"><Input type="number" value={item.projectedRoll} onChange={(e) => updateProjectedRoll(item.id, e.target.value)} className="w-20 h-9 text-center font-black border-2 border-primary/20 bg-white" /></div></div>))}</div></Card></div>
                    <DialogFooter className="p-6 bg-white border-t flex gap-3"><Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="flex-1 font-bold h-12">বাতিল</Button><Button onClick={handleConfirmPromotion} disabled={isPromoting} className="flex-1 min-w-[200px] h-12 text-lg font-black bg-emerald-600 hover:bg-emerald-700 shadow-xl">{isPromoting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2" />}প্রমোশন নিশ্চিত করুন</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Promotion History Dialog */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col font-kalpurush p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-6 bg-slate-800 text-white shrink-0">
                        <DialogTitle className="text-2xl font-black flex items-center gap-2"><History className="h-7 w-7" /> প্রমোশন হিস্টোরি ও তালিকা</DialogTitle>
                        <DialogDescription className="text-slate-300 font-bold">{classNamesMap[sourceClass]} শ্রেণি থেকে পরবর্তী শ্রেণিতে প্রমোশন স্ট্যাটাস</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden bg-slate-100 p-0 flex flex-col">
                        <Tabs defaultValue="promoted" className="w-full h-full flex flex-col">
                            <TabsList className="grid w-full grid-cols-2 h-14 bg-white/50 p-1 border-b rounded-none">
                                <TabsTrigger value="promoted" className="font-black text-base data-[state=active]:bg-white data-[state=active]:text-emerald-700">প্রমোশনপ্রাপ্ত ({toBengaliNumber(promotedHistory.length)})</TabsTrigger>
                                <TabsTrigger value="unpromoted" className="font-black text-base data-[state=active]:bg-white data-[state=active]:text-rose-700">প্রমোশনহীন ({toBengaliNumber(unpromotedHistory.length)})</TabsTrigger>
                            </TabsList>
                            <div className="flex-1 overflow-hidden">
                                <TabsContent value="promoted" className="h-full m-0 outline-none">
                                    <ScrollArea className="h-full p-4">
                                        {historyLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : promotedHistory.length === 0 ? <p className="text-center py-20 italic">কেউ প্রমোশন পায়নি</p> : (
                                            <Card className="border-none shadow-sm"><Table><TableHeader className="bg-muted/50">
                                                <TableRow><TableHead className="font-black">আইডি</TableHead><TableHead className="font-black">নাম</TableHead><TableHead className="text-center font-black">বর্তমান রোল</TableHead><TableHead className="text-right pr-6 font-black">টার্গেট আইডি</TableHead></TableRow>
                                            </TableHeader><TableBody>{promotedHistory.map(s => (
                                                <TableRow key={s.id} className="h-14"><TableCell className="font-black text-xs">{toBengaliNumber(s.generatedId)}</TableCell><TableCell className="font-bold text-slate-800">{s.studentNameBn}</TableCell><TableCell className="text-center font-black text-emerald-700 text-lg">{toBengaliNumber(s.targetRoll)}</TableCell><TableCell className="text-right pr-6 font-bold text-xs text-primary">{toBengaliNumber(s.targetId)}</TableCell></TableRow>
                                            ))}</TableBody></Table></Card>
                                        )}
                                    </ScrollArea>
                                </TabsContent>
                                <TabsContent value="unpromoted" className="h-full m-0 outline-none">
                                    <ScrollArea className="h-full p-4">
                                        {historyLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : unpromotedHistory.length === 0 ? <p className="text-center py-20 text-emerald-600 font-black">সবাই প্রমোশন পেয়েছে!</p> : (
                                            <Card className="border-none shadow-sm"><Table><TableHeader className="bg-muted/50">
                                                <TableRow><TableHead className="font-black">আইডি</TableHead><TableHead className="font-black">নাম</TableHead><TableHead className="text-center font-black">রোল</TableHead><TableHead className="text-right pr-6 font-black">অবস্থা</TableHead></TableRow>
                                            </TableHeader><TableBody>{unpromotedHistory.map(s => (
                                                <TableRow key={s.id} className="h-14"><TableCell className="font-black text-xs">{toBengaliNumber(s.generatedId)}</TableCell><TableCell className="font-bold text-slate-800">{s.studentNameBn}</TableCell><TableCell className="text-center font-bold">{toBengaliNumber(s.roll)}</TableCell><TableCell className="text-right pr-6"><Badge variant="destructive" className="bg-rose-100 text-rose-700 border-rose-200">বকেয়া</Badge></TableCell></TableRow>
                                            ))}</TableBody></Table></Card>
                                        )}
                                    </ScrollArea>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                    <DialogFooter className="p-4 bg-white border-t shrink-0"><Button variant="outline" className="font-black w-full" onClick={() => setIsHistoryOpen(false)}>বন্ধ করুন</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const ResultSearchTab = ({ allStudents }: { allStudents: Student[] }) => {
    const db = useFirestore();
    const { selectedYear } = useAcademicYear();
    const { toast } = useToast();
    const [searchRoll, setSearchRoll] = useState('');
    const [searchClass, setSearchClass] = useState('6');
    const [searchExam, setSearchExam] = useState('');
    const [exams, setExams] = useState<Exam[]>([]);
    const [searchResult, setSearchResult] = useState<StudentProcessedResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (db) getExams(db, selectedYear).then(setExams);
    }, [db, selectedYear]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchRoll || !searchClass || !searchExam) return;
        setIsSearching(true);
        try {
            const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)].toString());
            const rollNum = parseInt(bnToEn(searchRoll), 10);
            const student = allStudents.find(s => s.roll === rollNum && s.className === searchClass && s.academicYear === selectedYear);
            if (!student) { toast({ variant: 'destructive', title: 'শিক্ষার্থী পাওয়া যায়নি' }); setIsSearching(false); return; }
            const allRes = await getAllResults(db!, selectedYear, searchExam).catch(() => []);
            const classRes = allRes.filter(r => r.className === searchClass);
            const classStudents = allStudents.filter(s => s.academicYear === selectedYear && s.className === searchClass);
            const subs = getSubjects(searchClass, student.group).filter(s => s.isExamSubject !== false);
            const results = processStudentResults(classStudents, classRes, subs);
            const res = results.find(r => r.student.id === student.id);
            if (res) setSearchResult(res); else toast({ variant: 'destructive', title: 'ফলাফল পাওয়া যায়নি' });
        } catch (e) { console.error(e); }
        setIsSearching(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Card className="max-w-lg mx-auto border-2 shadow-xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-primary text-white p-6"><CardTitle className="text-xl flex items-center gap-2"><Search className="h-6 w-6" /> ফলাফল অনুসন্ধান</CardTitle></CardHeader>
                <CardContent className="p-6">
                    <form onSubmit={handleSearch} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="font-bold">রোল</Label><Input value={searchRoll} onChange={e => setSearchRoll(e.target.value)} placeholder="উদা: ১" required className="h-11 font-black text-lg" /></div>
                            <div className="space-y-2">
                                <Label className="font-bold">শ্রেণি</Label>
                                <Select value={searchClass} onValueChange={(v) => setSearchClass(v)}>
                                    <SelectTrigger className="h-11 border-2 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>{Object.entries(classNamesMap).map(([v, l]) => <SelectItem key={v} value={v}>{l} শ্রেণি</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold">পরীক্ষা</Label>
                            <Select value={searchExam} onValueChange={setSearchExam}>
                                <SelectTrigger className="h-11 border-2 font-black text-lg"><SelectValue placeholder="পরীক্ষা নির্বাচন করুন" /></SelectTrigger>
                                <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" disabled={isSearching} className="w-full h-12 text-lg font-black">{isSearching ? <Loader2 className="animate-spin mr-2" /> : 'খুঁজুন'}</Button>
                    </form>
                </CardContent>
            </Card>
            {searchResult && (
                <Card className="max-w-2xl mx-auto border-2 shadow-xl animate-in zoom-in-95 duration-300">
                    <CardHeader className="bg-muted/30 border-b flex flex-row items-center gap-4 p-6">
                        <Avatar className="h-16 w-16 border-2 border-white shadow-md">
                            <AvatarImage src={sanitizePhotoUrl(searchResult.student.photoUrl, searchResult.student.gender) || getStudentPlaceholderImage(searchResult.student.gender)} className="object-cover" />
                            <AvatarFallback className="bg-primary/20 font-black">S</AvatarFallback>
                        </Avatar>
                        <div><CardTitle className="text-2xl font-black">{searchResult.student.studentNameBn}</CardTitle><CardDescription className="font-bold text-primary">রোল: {toBengaliNumber(searchResult.student.roll)} | {classNamesMap[searchResult.student.className]} শ্রেণি</CardDescription></div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-slate-50 border rounded-xl text-center"><p className="text-[10px] font-black uppercase text-muted-foreground">মোট নম্বর</p><p className="text-xl font-black text-primary">{toBengaliNumber(searchResult.totalMarks)}</p></div>
                            <div className="p-3 bg-slate-50 border rounded-xl text-center"><p className="text-[10px] font-black uppercase text-muted-foreground">GPA</p><p className="text-xl font-black text-primary">{toBengaliNumber(searchResult.gpa.toFixed(2))}</p></div>
                            <div className="p-3 bg-slate-50 border rounded-xl text-center"><p className="text-[10px] font-black uppercase text-muted-foreground">গ্রেড</p><p className={cn("text-xl font-black", searchResult.isPass ? "text-emerald-600" : "text-rose-600")}>{searchResult.isPass ? searchResult.finalGrade : 'F'}</p></div>
                            <div className="p-3 bg-slate-50 border rounded-xl text-center"><p className="text-[10px] font-black uppercase text-muted-foreground">মেধাস্থান</p><p className="text-xl font-black text-amber-600">{searchResult.isPass ? toBengaliNumber(searchResult.meritPosition || '-') : '-'}</p></div>
                        </div>
                        <div className="table-container max-h-[300px] border-2"><Table><TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow><TableHead className="font-black">বিষয়</TableHead><TableHead className="text-center font-black">প্রাপ্ত নম্বর</TableHead><TableHead className="text-center font-black">গ্রেড</TableHead><TableHead className="text-right font-black">পয়েন্ট</TableHead></TableRow></TableHeader><TableBody>{Array.from(searchResult.subjectResults.entries()).map(([name, res]) => (<TableRow key={name} className="h-10"><TableCell className="font-bold text-xs">{name}</TableCell><TableCell className="text-center font-black text-blue-900">{toBengaliNumber(res.marks)}</TableCell><TableCell className={cn("text-center font-black", res.isPass ? "text-slate-700" : "text-rose-600")}>{res.grade}</TableCell><TableCell className="text-right font-bold text-xs">{toBengaliNumber(res.point.toFixed(2))}</TableCell></TableRow>))}</TableBody></Table></div></CardContent>
                    <CardFooter className="bg-slate-50 p-4 border-t flex justify-end gap-3">
                        <Button variant="outline" className="font-black" onClick={() => setSearchResult(null)}>অন্য ফলাফল খুঁজুন</Button>
                        <Link href={`/marksheet/${searchResult.student.id}?academicYear=${selectedYear}&examName=${encodeURIComponent(searchExam)}`} target="_blank">
                            <Button className="font-black shadow-lg"><Printer className="mr-2 h-4 w-4" /> মার্কশিট প্রিন্ট করুন</Button>
                        </Link>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}

const SpecialExamTab = ({ allStudents, onPrintRequested }: { allStudents: Student[], onPrintRequested: (data: any) => void }) => {
    const { toast } = useToast();
    const { selectedYear } = useAcademicYear();
    const db = useFirestore();
    
    const [selectedMonth, setSelectedMonth] = useState<string>(BENGALI_MONTHS[new Date().getMonth()]);
    const [selectedExam, setSelectedExam] = useState<string>('বিশেষ পরীক্ষা-১');
    const [selectedClass, setSelectedClass] = useState<string>('6');
    const [selectedSubject, setSelectedSubject] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const [specialMode, setSpecialMode] = useState<'input' | 'sheet' | 'fullmarks'>('input');
    const [specialMarks, setSpecialMarks] = useState<Map<string, number>>(new Map());
    const [specialFullMarks, setSpecialFullMarks] = useState<string>('20');
    
    const [allSpecialResults, setAllSpecialResults] = useState<SpecialClassResult[]>([]);

    const classes = ['6', '7', '8', '9', '10'];
    const specialExams = ['বিশেষ পরীক্ষা-১', 'বিশেষ পরীক্ষা-২', 'বিশেষ পরীক্ষা-৩', 'বিশেষ পরীক্ষা-৪', 'বিশেষ পরীক্ষা-৫'];

    const availableSubjects = useMemo(() => {
        if (!selectedClass) return [];
        const baseSubs = getSubjects(selectedClass).filter(s => s.isExamSubject !== false);
        
        if (specialMode === 'sheet' && parseInt(selectedClass) >= 9) {
            const resultList: any[] = [];
            const seen = new Set<string>();
            const coreNames = ['বাংলা প্রথম', 'বাংলা দ্বিতীয়', 'ইংরেজি প্রথম', 'ইংরেজি দ্বিতীয়', 'গণিত', 'ধর্ম ও নৈতিক শিক্ষা', 'তথ্য ও যোগাযোগ প্রযুক্তি'];

            baseSubs.forEach(s => {
                if (coreNames.some(cn => normalize(cn) === normalize(s.name))) {
                    if (!seen.has(normalize(s.name))) { resultList.push(s); seen.add(normalize(s.name)); }
                }
            });

            const combinedPairs = [
                { name: 'পদার্থ / ইতিহাস', isCombined: true, subList: ['পদার্থ', 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা'] },
                { name: 'রসায়ন / ভূগোল', isCombined: true, subList: ['রসায়ন', 'ভূগোল ও পরিবেশ'] },
                { name: 'জীব বিজ্ঞান / পৌরনীতি', isCombined: true, subList: ['জীব বিজ্ঞান', 'পৌরনীতি ও নাগরিকতা'] },
                { name: 'উচ্চতর গণিত / কৃষি / ফিন্যান্স', isCombined: true, subList: ['উচ্চতর গণিত', 'কৃষি শিক্ষা', 'ফিন্যান্স ও ব্যাংকিং', 'হিসাব বিজ্ঞান', 'ব্যবসায় উদ্যোগ'] },
                { name: 'বিজ্ঞান / বা ও বি', isCombined: true, subList: ['সাধারণ বিজ্ঞান', 'বাংলাদেশ ও বিশ্ব পরিচয়'] }
            ];

            combinedPairs.forEach(p => resultList.push(p));
            return resultList;
        }

        return baseSubs;
    }, [selectedClass, specialMode]);

    const handleLoadForInput = async () => {
        if (!db || !selectedMonth || !selectedClass || !selectedSubject || !selectedExam) return;
        setIsLoading(true);
        try {
            const results = await getSpecialResultsForClass(db, selectedYear, selectedClass, selectedMonth).catch(() => []);
            const matching = results.find(r => normalize(r.subject) === normalize(selectedSubject) && r.examType === selectedExam);
            
            const initialMap = new Map();
            if (matching) {
                setSpecialFullMarks(matching.fullMarks.toString());
                matching.results.forEach(r => initialMap.set(r.studentId, r.marks));
            } else setSpecialFullMarks('20');
            setSpecialMarks(initialMap);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const handleSaveSpecialMarks = async () => {
        if (!db || !selectedClass || !selectedSubject || !selectedExam || !selectedMonth) return;
        setIsLoading(true);
        try {
            const resultsData = Array.from(specialMarks.entries()).map(([id, m]) => ({ studentId: id, marks: m }));
            await saveSpecialResults(db, {
                academicYear: selectedYear,
                className: selectedClass,
                subject: selectedSubject,
                examType: selectedExam,
                month: selectedMonth,
                fullMarks: parseInt(specialFullMarks, 10) || 20,
                results: resultsData
            });
            toast({ title: 'বিশেষ পরীক্ষার নম্বর সংরক্ষিত হয়েছে' });
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    };

    const handleLoadFullSheet = async () => {
        if (!db || !selectedMonth || !selectedClass) return;
        setIsLoading(true);
        try {
            const results = await getSpecialResultsForClass(db, selectedYear, selectedClass, selectedMonth).catch(() => []);
            setAllSpecialResults(results);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const filteredStudents = useMemo(() => {
        return allStudents
            .filter(s => s.academicYear === selectedYear && s.className === selectedClass)
            .sort((a, b) => (Number(a.roll) || 0) - (Number(b.roll) || 0));
    }, [allStudents, selectedYear, selectedClass]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const table = e.currentTarget.closest('table');
            if (!table) return;
            const inputs = Array.from(table.querySelectorAll('tbody input[type="number"]')) as HTMLInputElement[];
            const index = inputs.indexOf(e.currentTarget);
            if (index >= 0 && index < inputs.length - 1) {
                const nextInput = inputs[index + 1];
                nextInput.focus();
                nextInput.select();
            }
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-wrap gap-2 no-print">
                <Button variant={specialMode === 'input' ? 'default' : 'outline'} onClick={() => setSpecialMode('input')} className="font-black h-10 px-6 rounded-xl shadow-sm"><FilePen className="h-4 w-4 mr-2" /> নম্বর ইনপুট</Button>
                <Button variant={specialMode === 'sheet' ? 'default' : 'outline'} onClick={() => setSpecialMode('sheet')} className="font-black h-10 px-6 rounded-xl shadow-sm"><LayoutGrid className="h-4 w-4 mr-2" /> ফলাফল শিট</Button>
                <Button variant={specialMode === 'fullmarks' ? 'default' : 'outline'} onClick={() => setSpecialMode('fullmarks')} className="font-black h-10 px-6 rounded-xl shadow-sm"><Settings className="h-4 w-4 mr-2" /> পূর্ণমান সেটআপ</Button>
            </div>

            {specialMode === 'input' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-6 border-2 border-black/5 bg-white shadow-sm rounded-2xl">
                        <div className="space-y-2"><Label className="font-bold text-xs text-primary">মাস</Label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="মাস" /></SelectTrigger><SelectContent>{BENGALI_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label className="font-bold text-xs text-primary">পরীক্ষা</Label><Select value={selectedExam} onValueChange={setSelectedExam}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="পরীক্ষা" /></SelectTrigger><SelectContent>{specialExams.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label className="font-bold text-xs text-primary">শ্রেণি</Label><Select value={selectedClass} onValueChange={setSelectedClass}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c} value={c}>{classNamesMap[c]} শ্রেণি</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label className="font-bold text-xs text-primary">বিষয়</Label><Select value={selectedSubject} onValueChange={setSelectedSubject} disabled={!selectedClass}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="বিষয়" /></SelectTrigger><SelectContent>{getSubjects(selectedClass).filter(s => s.isExamSubject !== false).map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                        <Button onClick={handleLoadForInput} disabled={isLoading || !selectedMonth || !selectedExam || !selectedSubject} className="font-black h-11 shadow-md">লোড করুন</Button>
                    </div>

                    {filteredStudents.length > 0 && selectedSubject && (
                        <Card className="border-2 border-black overflow-hidden shadow-xl rounded-2xl">
                            <CardHeader className="bg-primary/5 p-4 border-b-2 border-black flex flex-row justify-between items-center">
                                <div><CardTitle className="text-base font-black text-primary">{selectedSubject} - {selectedExam}</CardTitle><CardDescription className="font-bold">পূর্ণমান: {toBengaliNumber(specialFullMarks)} | মাস: {selectedMonth}</CardDescription></div>
                                <div className="flex items-center gap-3"><Label className="text-xs font-black">পূর্ণমান এডিট:</Label><Input type="number" value={specialFullMarks} onChange={e => setSpecialFullMarks(e.target.value)} className="w-16 h-8 text-center font-black border-2 border-primary/20" /></div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[500px] overflow-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white z-10 border-b-2 border-black">
                                            <TableRow><TableHead className="w-20 text-center font-black border-r-2 border-black text-black">রোল</TableHead><TableHead className="font-black border-r-2 border-black text-black">শিক্ষার্থীর নাম</TableHead><TableHead className="w-40 text-center font-black text-black">প্রাপ্ত নম্বর</TableHead></TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredStudents.map(s => (
                                                <TableRow key={s.id} className="h-12 hover:bg-slate-50 transition-colors border-b-2 border-black">
                                                    <TableCell className="text-center font-black border-r-2 border-black text-lg">{toBengaliNumber(s.roll)}</TableCell>
                                                    <TableCell className="font-bold border-r-2 border-black text-slate-800">{s.studentNameBn}</TableCell>
                                                    <TableCell className="p-1 text-center"><Input type="number" value={specialMarks.get(s.id) ?? ''} onChange={e => setSpecialMarks(prev => new Map(prev).set(s.id, parseInt(e.target.value, 10)))} onKeyDown={handleKeyDown} className="w-28 mx-auto h-9 text-center font-black border-2 border-black text-lg focus:bg-amber-50 shadow-sm" /></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="p-6 bg-slate-50 border-t-2 border-black flex justify-end"><Button onClick={handleSaveSpecialMarks} disabled={isLoading} size="lg" className="px-16 h-14 text-xl font-black shadow-2xl"><Save className="mr-2 h-6 w-6" /> প্রাপ্ত নম্বর সেভ করুন</Button></div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {specialMode === 'sheet' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 border rounded-2xl bg-white shadow-sm no-print items-end">
                        <div className="space-y-2"><Label className="font-bold">মাস নির্বাচন</Label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="মাস" /></SelectTrigger><SelectContent>{BENGALI_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label className="font-bold">শ্রেণি</Label><Select value={selectedClass} onValueChange={setSelectedClass}><SelectTrigger className="bg-slate-50 border-2 font-bold"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c} value={c}>{classNamesMap[c]} শ্রেণি</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex gap-2">
                            <Button onClick={handleLoadFullSheet} disabled={isLoading || !selectedMonth || !selectedClass} className="flex-1 font-black h-11"><Search className="mr-2 h-4 w-4" /> রিপোর্ট লোড করুন</Button>
                            <Button onClick={() => onPrintRequested({ allSpecialResults, students: filteredStudents, availableSubjects, month: selectedMonth, year: selectedYear })} variant="outline" disabled={allSpecialResults.length === 0} className="h-11 border-2 border-primary text-primary font-black shadow-sm"><Printer className="h-4 w-4" /></Button>
                        </div>
                    </div>

                    {allSpecialResults.length > 0 && (
                        <div className="special-sheet-container w-full bg-white text-black font-kalpurush overflow-hidden border-[4px] border-black rounded-[32px] shadow-2xl">
                            <div className="table-container !max-h-[550px] !overflow-auto !border-0 !rounded-none">
                                <table className="w-full border-separate border-spacing-0 border-black text-[11px]">
                                    <thead>
                                        <tr className="bg-slate-100 h-[40px]">
                                            <th rowSpan={2} className="border-r-2 border-b-2 border-black font-black p-1 w-[45px] text-center sticky left-0 top-0 z-[60] bg-slate-100 h-[80px] box-border">রোল</th>
                                            <th rowSpan={2} className="border-r-2 border-b-2 border-black font-black p-1 text-left min-w-[180px] pl-3 sticky left-[10px] top-0 z-[60] bg-slate-100 h-[80px] box-border">শিক্ষার্থীর নাম</th>
                                            {availableSubjects.map((sub, i) => (
                                                <th key={sub.name} colSpan={3} className={cn("border-r-2 border-b-2 border-black font-black p-1 text-center h-[40px] box-border sticky top-0 z-40", i % 2 === 0 ? "bg-blue-100" : "bg-emerald-100")}>{sub.name}</th>
                                            ))}
                                            <th rowSpan={2} className="border-b-2 border-black font-black p-1 w-20 text-center bg-yellow-100 text-yellow-950 h-[80px] box-border sticky top-0 right-0 z-50">মোট নম্বর</th>
                                        </tr>
                                        <tr className="bg-slate-50 h-[40px]">
                                            {availableSubjects.map((sub, sIdx) => (
                                                <React.Fragment key={`${sub.name}-h`}>
                                                    <th className={cn("border-r-2 border-b-2 border-black font-black p-0.5 w-10 sticky top-[40px] z-40 h-[40px] box-border text-center", sIdx % 2 === 0 ? "bg-blue-50" : "bg-emerald-50")}>প-১</th>
                                                    <th className={cn("border-r-2 border-b-2 border-black font-black p-0.5 w-10 sticky top-[40px] z-40 h-[40px] box-border text-center", sIdx % 2 === 0 ? "bg-blue-50" : "bg-emerald-50")}>প-২</th>
                                                    <th className={cn("border-r-2 border-b-2 border-black font-black p-0.5 w-10 sticky top-[40px] z-40 h-[40px] box-border text-center", sIdx % 2 === 0 ? "bg-blue-50" : "bg-emerald-50")}>প-৩</th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map(student => {
                                            let studentTotal = 0;
                                            return (
                                                <tr key={student.id} className="h-10 hover:bg-slate-50 transition-colors">
                                                    <td className="border-r-2 border-b-2 border-black text-center font-black sticky left-0 z-30 bg-white w-[45px] h-10 box-border">{toBengaliNumber(student.roll)}</td>
                                                    <td className="border-r-2 border-b-2 border-black font-bold px-3 whitespace-nowrap sticky left-[10px] z-30 bg-white min-w-[180px] h-10 box-border">{student.studentNameBn}</td>
                                                    {availableSubjects.map((sub, sIdx) => (
                                                        <React.Fragment key={`${student.id}-${sub.name}`}>
                                                            {['বিশেষ পরীক্ষা-১', 'বিশেষ পরীক্ষা-২', 'বিশেষ পরীক্ষা-৩'].map((type) => {
                                                                const match = allSpecialResults.find(r => {
                                                                    const normalizedSearch = normalize(sub.name);
                                                                    const normalizedRecord = normalize(r.subject);
                                                                    if (sub.isCombined) return sub.subList.some((innerSub: string) => normalize(innerSub) === normalizedRecord) && r.examType === type;
                                                                    return normalizedRecord === normalizedSearch && r.examType === type;
                                                                });
                                                                const marks = match?.results.find(res => res.studentId === student.id)?.marks;
                                                                if (marks !== undefined) studentTotal += marks;
                                                                return <td key={type} className={cn("border-r-2 border-b-2 border-black text-center font-black text-blue-900 h-10 w-10 min-w-10", sIdx % 2 === 0 ? "bg-blue-50/20" : "bg-emerald-50/20")}>{marks !== undefined ? toBengaliNumber(marks) : '-'}</td>;
                                                            })}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="text-center font-black bg-yellow-50 text-base border-b-2 border-black sticky right-0 z-20 w-20 min-w-20 h-10 box-border">{toBengaliNumber(studentTotal)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {specialMode === 'fullmarks' && (
                <div className="animate-in fade-in duration-500">
                    <Card className="max-w-md mx-auto border-2 shadow-lg rounded-3xl overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-lg font-black flex items-center gap-2"><Settings className="h-5 w-5" /> বিশেষ পরীক্ষার পূর্ণমান নির্ধারণ</CardTitle></CardHeader>
                        <CardContent className="p-8 space-y-6">
                             <div className="space-y-4">
                                <p className="text-sm font-bold text-muted-foreground leading-relaxed text-center">বিশেষ পরীক্ষার ফলাফল ইনপুট দেওয়ার সময় সরাসরি ওই সেকশন থেকেই পূর্ণমান এডিট করতে পারবেন। ডিফল্ট পূর্ণমান ২০ হিসেবে সেট করা থাকে।</p>
                                <div className="p-6 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 text-center"><AlertCircle className="h-10 w-10 text-primary mx-auto mb-3 opacity-30" /><p className="text-xs font-black uppercase tracking-widest text-primary">শীঘ্রই আরও উন্নত সেটিংস যুক্ত হবে</p></div>
                             </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

const BulkUploadTab = () => {
    return (<Card className="p-12 text-center border-2 border-dashed rounded-3xl opacity-50"><FileUp className="h-16 w-16 mx-auto mb-4 text-muted-foreground" /><CardTitle>Bulk Excel Upload</CardTitle><CardDescription>শীঘ্রই এক্সেলে সরাসরি ডাটা আপলোড করার উন্নত সুবিধা যুক্ত হবে।</CardDescription></Card>);
};

// --- Main Page Component ---

export default function ResultsPage() {
    const [isClient, setIsClient] = useState(false); 
    const [allStudents, setAllStudents] = useState<Student[]>([]); 
    const [isLoading, setIsLoading] = useState(true);
    const db = useFirestore(); 
    const { selectedYear } = useAcademicYear(); 
    const { user, hasPermission } = useAuth();
    const { schoolInfo } = useSchoolInfo();
    
    const canViewRes = hasPermission('manage:results') || hasPermission('input:results');
    const canManageFullMarks = hasPermission('manage:full-marks') || hasPermission('manage:results');

    const [activeSection, setActiveSection] = useState('management');
    const [printingReport, setPrintingReport] = useState<any>(null);
    const [fullSheetPrintData, setFullSheetPrintData] = useState<any>(null);
    const [specialPrintData, setSpecialPrintData] = useState<any>(null);

    useEffect(() => {
        setIsClient(true); 
        if (!db || !user) return;
        const unsubscribe = onSnapshot(query(collection(db, "students")), (snap) => { 
            setAllStudents(snap.docs.map(studentFromDoc)); 
            setIsLoading(false); 
        }, (err) => { 
            console.error("Firestore error:", err);
            setIsLoading(false); 
        });
        return () => unsubscribe();
    }, [db, user]);

    useEffect(() => {
        if (canViewRes) setActiveSection('management');
        else if (canManageFullMarks) setActiveSection('full-marks');
        else if (hasPermission('view:merit-list')) setActiveSection('merit');
        else if (hasPermission('promote:students')) setActiveSection('promotion');
        else if (hasPermission('manage:special-results')) setActiveSection('special-exam');
    }, [canViewRes, canManageFullMarks, hasPermission]);

    const handleSubjectPrint = (data: any) => {
        setPrintingReport(data);
        setTimeout(() => { window.print(); setPrintingReport(null); }, 300);
    };

    const handleFullSheetPrint = (data: any) => {
        setFullSheetPrintData(data);
        setTimeout(() => { window.print(); setFullSheetPrintData(null); }, 800);
    };

    const handleSpecialPrint = (data: any) => {
        setSpecialPrintData(data);
        setTimeout(() => { window.print(); setSpecialPrintData(null); }, 800);
    };

    const sidebarItems = useMemo(() => {
        const items = [];
        if (canViewRes) {
            items.push({ id: 'management', label: 'নম্বর ইনপুট', icon: FilePen, color: 'text-indigo-600 bg-indigo-50' });
            items.push({ id: 'subject-report', label: 'বিষয় ভিত্তিক রিপোর্ট', icon: FileText, color: 'text-emerald-600 bg-emerald-50' });
            items.push({ id: 'sheet', label: 'ফলাফল শিট', icon: FileSpreadsheet, color: 'text-blue-600 bg-blue-50' });
        }
        items.push({ id: 'search', label: 'ফলাফল অনুসন্ধান', icon: Search, color: 'text-blue-600 bg-blue-50' });
        if (canManageFullMarks) items.push({ id: 'full-marks', label: 'বিষয় ও পূর্ণমান', icon: CheckCircle2, color: 'text-violet-600 bg-violet-50' });
        if (hasPermission('view:merit-list')) items.push({ id: 'merit', label: 'মেধা তালিকা', icon: Trophy, color: 'text-amber-600 bg-amber-50' });
        if (hasPermission('promote:students')) items.push({ id: 'promotion', label: 'প্রমোশন', icon: Star, color: 'text-rose-600 bg-rose-50' });
        if (hasPermission('upload:marks')) items.push({ id: 'upload', label: 'Excel আপলোড', icon: FileUp, color: 'text-blue-600 bg-blue-50' });
        if (hasPermission('manage:special-results') || hasPermission('manage:results') || user?.role === 'admin') items.push({ id: 'special-exam', label: 'বিশেষ পরীক্ষা', icon: Sparkles, color: 'text-amber-600 bg-amber-50' });
        return items;
    }, [canViewRes, canManageFullMarks, hasPermission, user]);

    if (isClient && !canViewRes && !hasPermission('view:merit-list') && !hasPermission('promote:students') && !hasPermission('manage:special-results') && user?.role !== 'admin' && !canManageFullMarks) return (
        <div className="flex min-h-screen w-full flex-col bg-violet-50"><Header /><main className="flex flex-1 items-center justify-center p-4"><Card className="p-8 text-center border-2 border-primary/20"><AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" /><h2 className="text-xl font-bold">প্রবেশাধিকার সংরক্ষিত</h2></Card></main></div>
    );

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-8 no-print pb-40">
                <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row gap-8">
                    <aside className="w-full md:w-64 shrink-0 space-y-1 bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
                        <h2 className="text-2xl font-black mb-6 px-4 hidden md:block text-slate-900 tracking-tight">ফলাফল ব্যবস্থাপনা</h2>
                        <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">
                            {sidebarItems.map(item => (
                                <button key={item.id} onClick={() => setActiveSection(item.id)} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit", activeSection === item.id ? "bg-white shadow-md text-primary scale-105" : "text-muted-foreground hover:bg-slate-200/50")}><div className={cn("p-1.5 rounded-lg shrink-0", activeSection === item.id ? item.color : "bg-muted")}><item.icon className="h-4 w-4" /></div><span className="text-sm font-black">{item.label}</span>{activeSection === item.id && <ChevronRight className="ml-auto h-3.5 w-3.5 hidden md:block" />}</button>
                            ))}
                        </div>
                    </aside>
                    <div className="flex-1 min-w-0 bg-white md:rounded-[32px] shadow-2xl md:border-[1px] border-slate-200/50 overflow-hidden min-h-[700px] flex flex-col transition-all duration-500 animate-in fade-in slide-in-from-right-4">
                        <div className="p-4 sm:p-6 lg:p-8 flex-1">
                            <div className="mb-6 border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print"><div><h2 className="text-2xl font-black text-slate-800">{sidebarItems.find(i => i.id === activeSection)?.label}</h2><p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">{schoolInfo.name}</p></div></div>
                            {isLoading ? (<div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>) : (
                                <div className="animate-in fade-in duration-500">
                                    {activeSection === 'management' && <MarkManagementTab allStudents={allStudents} />}
                                    {activeSection === 'subject-report' && <SubjectReportTab allStudents={allStudents} onPrintRequested={handleSubjectPrint} />}
                                    {activeSection === 'sheet' && <ResultSheetTab allStudents={allStudents} onPrint={handleFullSheetPrint} />}
                                    {activeSection === 'search' && <ResultSearchTab allStudents={allStudents} />}
                                    {activeSection === 'full-marks' && <FullMarksTab allStudents={allStudents} />}
                                    {activeSection === 'merit' && <MeritListTab allStudents={allStudents} />}
                                    {activeSection === 'promotion' && <PromotionTab allStudents={allStudents} />}
                                    {activeSection === 'upload' && <BulkUploadTab />}
                                    {activeSection === 'special-exam' && <SpecialExamTab allStudents={allStudents} onPrintRequested={handleSpecialPrint} />}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {printingReport && (
                <div className="hidden print:block printable-area bg-white text-black p-10 font-kalpurush border-2">
                    <style jsx global>{`
                        @media print {
                            @page { size: A4; margin: 0.4in !important; }
                            .printable-area { padding: 0 !important; margin: 0 !important; border: none !important; }
                            .printable-area table tr { height: auto !important; }
                            .printable-area table td, .printable-area table th { padding: 2px 8px !important; font-size: 11px !important; border: 1px solid black !important; }
                            .no-print { display: none !important; }
                        }
                    `}</style>
                    <header className="flex items-center gap-6 border-b-4 border-emerald-800 pb-4 mb-6">{schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} alt="Logo" width={80} height={80} className="object-contain" />}<div className="text-center flex-grow"><h1 className="text-3xl font-black text-emerald-950 leading-none mb-1">{schoolInfo.name}</h1><p className="text-sm font-bold text-slate-700">{schoolInfo.address}</p><div className="mt-2 inline-block bg-emerald-50 px-6 py-0.5 rounded-full border-2 border-emerald-800"><h2 className="text-lg font-black uppercase">{printingReport.isBlank ? 'ফাঁকা নম্বর ফর্দ (Blank Mark Sheet)' : 'নম্বর ফর্দ (Mark Sheet)'} - {toBengaliNumber(selectedYear)}</h2></div></div></header>
                    <Table className="border-2 border-black">
                        <TableHeader className="bg-slate-100"><TableRow className="border-b-2 border-black"><TableHead className="w-16 text-center font-black border-r-2 border-black text-black">রোল</TableHead><TableHead className="font-black border-r-2 border-black text-black">শিক্ষার্থীর নাম</TableHead><TableHead className="w-20 text-center font-black border-r-2 border-black text-black">লিখিত</TableHead><TableHead className="w-20 text-center font-black border-r-2 border-black text-black">নৈবেত্তিক</TableHead><TableHead className="w-20 text-center font-black border-r-2 border-black text-black">ব্যবহারিক</TableHead><TableHead className={cn("w-20 text-center font-black text-black", !printingReport.isBlank && "border-r-2 border-black")}>{printingReport.isBlank ? 'মোট' : 'প্রাপ্ত'}</TableHead>{!printingReport.isBlank && <TableHead className="w-20 text-center font-black border-r-2 border-black text-black">গ্রেড</TableHead>}{!printingReport.isBlank && <TableHead className="w-20 text-center font-black text-black">পয়েন্ট</TableHead>}</TableRow></TableHeader>
                        <TableBody>
                          {printingReport.studentData.map((item: any) => (
                            <TableRow key={item.student.id} className={cn("border-b border-slate-400", printingReport.isBlank ? "h-12" : "h-7", !item.isPass && "bg-rose-50/50")}>
                                <TableCell className="text-center font-black border-r-2 border-black">{toBengaliNumber(item.student.roll)}</TableCell>
                                <TableCell className="font-bold border-r-2 border-black">{item.student.studentNameBn}</TableCell>
                                <TableCell className="text-center border-r-2 border-black">{printingReport.isBlank ? '' : toBengaliNumber(item.marks.written ?? '-')}</TableCell>
                                <TableCell className="text-center border-r-2 border-black">{printingReport.isBlank ? '' : toBengaliNumber(item.marks.mcq ?? '-')}</TableCell>
                                <TableCell className="text-center border-r-2 border-black">{printingReport.isBlank ? '' : toBengaliNumber(item.marks.practical ?? '-')}</TableCell>
                                <TableCell className="text-center font-black border-r-2 border-black">{printingReport.isBlank ? '' : toBengaliNumber(item.obtainedMarks)}</TableCell>
                                {!printingReport.isBlank && (
                                    <>
                                        <TableCell className="text-center font-black border-r-2 border-black">{item.grade}</TableCell>
                                        <TableCell className="text-center font-black">{toBengaliNumber(item.point.toFixed(2))}</TableCell>
                                    </>
                                )}
                            </TableRow>
                          ))}
                        </TableBody>
                    </Table>
                    <footer className="mt-20 flex justify-between px-10 no-screen"><div className="text-center w-48 border-t-2 border-black pt-1 font-black">শ্রেণি শিক্ষকের স্বাক্ষর</div><div className="text-center w-48 border-t-2 border-black pt-1 font-black">প্রধান শিক্ষকের স্বাক্ষর</div></footer>
                </div>
            )}

            {fullSheetPrintData && (
                <div className="hidden print:block printable-area bg-white text-black p-4 font-kalpurush w-full">
                    <style jsx global>{`
                        @media print {
                            @page { size: A4 landscape; margin: 5mm !important; }
                            .printable-area { width: 100% !important; padding: 0 !important; }
                            table { border-collapse: collapse !important; border: 1px solid black !important; width: 100% !important; table-layout: auto !important; }
                            th, td { border: 1px solid black !important; padding: 1px !important; font-size: 8px !important; line-height: 1.1 !important; }
                            .no-print { display: none !important; }
                        }
                    `}</style>
                    <header className="text-center border-b-2 border-black pb-2 mb-4 flex flex-col items-center">
                        {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="Logo" className="w-12 h-12 object-contain mb-1" />}
                        <h1 className="text-xl font-black">{schoolInfo.name}</h1>
                        <p className="text-[12px] font-bold">{schoolInfo.address}</p>
                        <div className="mt-1 inline-block border border-black px-6 py-1 rounded-full font-black text-xs uppercase">
                            {fullSheetPrintData.examName} - ফলাফল বিবরণী শিট ({classNamesMap[fullSheetPrintData.className]})
                        </div>
                        <p className="text-[12px] font-bold mt-1">শিক্ষাবর্ষ: {toBengaliNumber(selectedYear)}</p>
                    </header>

                    {Object.keys(fullSheetPrintData.results).map(groupKey => {
                        const results = fullSheetPrintData.results[groupKey];
                        const className = fullSheetPrintData.className;
                        const classResults = fullSheetPrintData.classResults;
                        
                        const allSubs = getSubjects(className, groupKey === 'all' ? undefined : groupKey);
                        const subjects = allSubs.filter(s => {
                            if (!s.isExamSubject) return false;
                            const matchingRecord = classResults.find((r: any) => normalize(r.subject) === normalize(s.name));
                            const effectiveFullMarks = matchingRecord?.fullMarks ?? s.fullMarks;
                            return effectiveFullMarks > 0;
                        });

                        return (
                            <div key={groupKey} className="mb-10 break-after-page">
                                {groupKey !== 'all' && <h3 className="font-black text-sm mb-2 text-primary border-l-4 border-primary pl-2">শাখা: {groupNamesMap[groupKey] || groupKey}</h3>}
                                <table className="w-full border-collapse border-2 border-black">
                                    <thead>
                                        <tr className="bg-slate-100">
                                            <th rowSpan={2} className="border border-black font-black p-1 w-8">রোল</th>
                                            <th rowSpan={2} className="border border-black font-black p-1 min-w-[100px]">শিক্ষার্থীর নাম</th>
                                            {subjects.map(s => (
                                                <th key={s.name} colSpan={s.name.includes('ইংরেজি') ? 3 : (s.practical ? 6 : 5)} className="border border-black font-black p-1 text-[9px]">{s.name}</th>
                                            ))}
                                            <th rowSpan={2} className="border border-black font-black p-1 w-10">মোট</th>
                                            <th rowSpan={2} className="border border-black font-black p-1 w-10">GPA</th>
                                            <th rowSpan={2} className="border border-black font-black p-1 w-10">গ্রেড</th>
                                            <th rowSpan={2} className="border border-black font-black p-1 w-10">মেধা</th>
                                        </tr>
                                        <tr className="bg-slate-50">
                                            {subjects.map(s => {
                                                const isEng = s.name.includes('ইংরেজি');
                                                return (
                                                    <React.Fragment key={`${s.name}-headers`}>
                                                        {!isEng && (
                                                            <>
                                                                <th className="border border-black font-bold p-0.5 text-[8px]">লি:</th>
                                                                <th className="border border-black font-bold p-0.5 text-[8px]">M</th>
                                                                {s.practical && <th className="border border-black font-bold p-0.5 text-[8px]">ব্যাব:</th>}
                                                            </>
                                                        )}
                                                        <th className="border border-black font-black bg-blue-100 p-0.5 text-[8px]">মোট</th>
                                                        <th className="border border-black font-bold p-0.5 text-[8px]">গ্রেড</th>
                                                        <th className="border border-black font-bold p-0.5 text-[8px]">পয়েন্ট</th>
                                                    </React.Fragment>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((res: StudentProcessedResult) => (
                                            <tr key={res.student.id} className="h-8 border border-black hover:bg-slate-50">
                                                <td className="border border-black text-center font-black">{toBengaliNumber(res.student.roll)}</td>
                                                <td className="border border-black font-bold px-2">{res.student.studentNameBn}</td>
                                                {subjects.map(s => {
                                                    const sr = res.subjectResults.get(s.name);
                                                    const isEng = s.name.includes('ইংরেজি');
                                                    return (
                                                        <React.Fragment key={`${res.student.id}-${s.name}`}>
                                                            {!isEng && (
                                                                <>
                                                                    <td className="border-black text-center">{toBengaliNumber(sr?.written ?? '-')}</td>
                                                                    <td className="border border-black text-center">{toBengaliNumber(sr?.mcq ?? '-')}</td>
                                                                    {s.practical && <td className="border border-black text-center">{toBengaliNumber(sr?.practical ?? '-')}</td>}
                                                                </>
                                                            )}
                                                            <td className="border border-black text-center font-black bg-blue-50">{toBengaliNumber(sr?.marks ?? '-')}</td>
                                                            <td className="border border-black text-center font-black">{sr?.grade ?? '-'}</td>
                                                            <td className="border border-black text-center font-bold">{toBengaliNumber(sr?.point?.toFixed(2) ?? '-')}</td>
                                                        </React.Fragment>
                                                    )
                                                })}
                                                <td className="border border-black text-center font-black text-primary">{toBengaliNumber(res.totalMarks)}</td>
                                                <td className="border border-black text-center font-black">{toBengaliNumber(res.gpa.toFixed(2))}</td>
                                                <td className={cn("border border-black text-center font-black", !res.isPass && "text-red-600")}>{res.isPass ? res.finalGrade : `F${toBengaliNumber(res.failedSubjectsCount)}`}</td>
                                                <td className="border border-black text-center font-black">{res.isPass ? toBengaliNumber(res.meritPosition || '-') : 'ফেল'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}

                    <footer className="mt-16 flex justify-between px-16">
                        <div className="text-center w-48 border-t border-black pt-1 font-black text-xs">শ্রেণি শিক্ষকের স্বাক্ষর</div>
                        <div className="text-center w-48 border-t border-black pt-1 font-black text-xs">প্রধান শিক্ষকের স্বাক্ষর</div>
                    </footer>
                </div>
            )}

            {specialPrintData && (
                <div className="hidden print:block printable-area bg-white text-black p-4 font-kalpurush w-full box-border border-[6px] border-double border-black/30">
                    <style jsx global>{`
                        @media print {
                            @page { size: A4 landscape; margin: 5mm !important; }
                            .printable-area { width: 100% !important; padding: 0 !important; }
                            table { border-collapse: collapse !important; border: 1px solid black !important; width: 100% !important; }
                            th, td { border: 1px solid black !important; padding: 1px !important; font-size: 8px !important; }
                        }
                    `}</style>
                    <header className="text-center border-b-2 border-black pb-3 mb-6">
                        {schoolInfo.logoUrl && <img src={schoolInfo.logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2" />}
                        <h1 className="text-2xl font-black">{schoolInfo.name}</h1>
                        <p className="text-xs font-bold">{schoolInfo.address}</p>
                        <div className="mt-2 inline-block border-2 border-black px-6 py-0.5 rounded-full font-black text-sm uppercase">{specialPrintData.month} মাসের বিশেষ পরীক্ষার ফলাফল শিট - {toBengaliNumber(specialPrintData.year)}</div>
                    </header>

                    <table className="w-full border-collapse border-2 border-black">
                        <thead>
                            <tr className="bg-slate-100">
                                <th rowSpan={2} className="border-2 border-black font-black p-1 w-10 text-center">রোল</th>
                                <th rowSpan={2} className="border-2 border-black font-black p-1 text-left pl-3">শিক্ষার্থীর নাম</th>
                                {specialPrintData.availableSubjects.map((sub: any) => (
                                    <th key={sub.name} colSpan={3} className="border-2 border-black font-black p-1 text-center">{sub.name}</th>
                                ))}
                                <th rowSpan={2} className="border-2 border-black font-black p-1 w-20 text-center bg-slate-50">মোট</th>
                            </tr>
                            <tr className="bg-slate-50">
                                {specialPrintData.availableSubjects.map((sub: any) => (
                                    <React.Fragment key={`${sub.name}-hp`}>
                                        <th className="border-2 border-black font-black p-0.5 w-8 text-center">প-১</th>
                                        <th className="border-2 border-black font-black p-0.5 w-8 text-center">প-২</th>
                                        <th className="border-2 border-black font-black p-0.5 w-8 text-center">প-৩</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {specialPrintData.students.map((student: any) => {
                                let total = 0;
                                return (
                                    <tr key={student.id} className="h-8 border-b border-black">
                                        <td className="border-2 border-black text-center font-black">{toBengaliNumber(student.roll)}</td>
                                        <td className="border-2 border-black font-bold px-2">{student.studentNameBn}</td>
                                        {specialPrintData.availableSubjects.map((sub: any) => (
                                            <React.Fragment key={`${student.id}-${sub.name}`}>
                                                {['বিশেষ পরীক্ষা-১', 'বিশেষ পরীক্ষা-২', 'বিশেষ পরীক্ষা-৩'].map((type) => {
                                                    const match = specialPrintData.allSpecialResults.find((r: any) => {
                                                        const normalizedSearch = normalize(sub.name);
                                                        const normalizedRecord = normalize(r.subject);
                                                        if (sub.isCombined) return sub.subList.some((innerSub: string) => normalize(innerSub) === normalizedRecord) && r.examType === type;
                                                        return normalizedRecord === normalizedSearch && r.examType === type;
                                                    });
                                                    const marks = match?.results.find((res: any) => res.studentId === student.id)?.marks;
                                                    if (marks !== undefined) total += marks;
                                                    return <td key={type} className={cn("border-2 border-black text-center font-black")}>{marks !== undefined ? toBengaliNumber(marks) : '-'}</td>;
                                                })}
                                            </React.Fragment>
                                        ))}
                                        <td className="border-2 border-black text-center font-black bg-slate-50">{toBengaliNumber(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <footer className="mt-16 flex justify-between px-10">
                        <div className="text-center w-48 border-t border-black pt-1 font-black text-xs">শ্রেণি শিক্ষকের স্বাক্ষর</div>
                        <div className="text-center w-48 border-t border-black pt-1 font-black text-xs">প্রধান শিক্ষকের স্বাক্ষর</div>
                    </footer>
                </div>
            )}
        </div>
    );
}

