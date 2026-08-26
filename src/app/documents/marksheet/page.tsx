'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAcademicYear } from '@/context/AcademicYearContext';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Student, studentFromDoc } from '@/lib/student-data';
import { Exam, getExams } from '@/lib/exam-data';
import { getAllResults, ClassResult } from '@/lib/results-data';
import { getSubjects, Subject } from '@/lib/subjects';
import { processStudentResults, StudentProcessedResult } from '@/lib/results-calculation';
import { Printer, ArrowLeft, User, Users, Info, FileBadge, Loader2, Minus, Plus } from 'lucide-react';
import { useSchoolInfo } from '@/context/SchoolInfoContext';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const classNamesMap: { [key: string]: string } = { '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম', '9': '৯ম', '10': '১০ম' };
const classMap: { [key: string]: string } = { '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine', '10': 'Ten' };
const groupMap: { [key: string]: string } = { 'science': 'Science', 'arts': 'Arts', 'commerce': 'Commerce', 'general': 'General' };
const religionMap: { [key: string]: string } = { 'islam': 'Islam', 'hinduism': 'Hinduism', 'buddhism': 'Buddhism', 'christianity': 'Christianity', 'other': 'Other' };

const examNameEnglishMap: { [key: string]: string } = {
    'অর্ধ-বার্ষিক পরীক্ষা': 'Half-Yearly Examination',
    'বার্ষিক পরীক্ষা': 'Annual Examination',
    'প্রাক-নির্বাচনী পরীক্ষা': 'Pre-Test Examination',
    'নির্বাচনী পরীক্ষা': 'Test Examination'
};

const gradingScale = [
    { interval: '80-100', point: '5.00', grade: 'A+' },
    { interval: '70-79', point: '4.00', grade: 'A' },
    { interval: '60-69', point: '3.50', grade: 'A-' },
    { interval: '50-59', point: '3.00', grade: 'B' },
    { interval: '40-49', point: '2.00', grade: 'C' },
    { interval: '33-39', point: '1.00', grade: 'D' },
    { interval: '0-32', point: '0.00', grade: 'F' },
];

const MarksheetGeneratorPage = () => {
    const db = useFirestore();
    const { schoolInfo } = useSchoolInfo();
    const { selectedYear } = useAcademicYear();

    const [isClient, setIsClient] = useState(false);
    const [exams, setExams] = useState<Exam[]>([]);
    const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
    const [selectedClass, setSelectedClass] = useState<string>('6');
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [classResults, setClassResults] = useState<ClassResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'bulk' | 'single'>('bulk');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [watermarkOpacity, setWatermarkOpacity] = useState(0.15);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!db || !isClient) return;
        getExams(db, selectedYear).then(setExams);
    }, [db, selectedYear, isClient]);

    const fetchClassData = useCallback(async () => {
        if (!db || !selectedClass || !selectedExam || !isClient) return;
        setIsLoading(true);
        try {
            const studentQuery = query(
                collection(db, "students"), 
                where("academicYear", "==", selectedYear),
                where("className", "==", selectedClass)
            );
            const studentSnap = await getDocs(studentQuery);
            const students = studentSnap.docs.map(studentFromDoc);
            setAllStudents(students);

            const results = await getAllResults(db, selectedYear, selectedExam.name);
            setClassResults(results.filter(r => r.className === selectedClass));
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    }, [db, selectedClass, selectedExam, selectedYear, isClient]);

    useEffect(() => {
        fetchClassData();
    }, [fetchClassData]);

    const processedResults = useMemo(() => {
        if (allStudents.length === 0) return [];
        const subs = getSubjects(selectedClass);
        const filteredStudents = allStudents.filter(s => 
            selectedGroup === 'all' || (s.group || '').toLowerCase().trim() === selectedGroup.toLowerCase().trim()
        );
        return processStudentResults(filteredStudents, classResults, subs);
    }, [allStudents, classResults, selectedClass, selectedGroup]);

    const availableStudents = useMemo(() => {
        return processedResults.map(r => r.student).sort((a, b) => (a.roll || 0) - (b.roll || 0));
    }, [processedResults]);

    const resultsToPrint = useMemo(() => {
        if (mode === 'single') {
            const res = processedResults.find(r => r.student.id === selectedStudentId);
            return res ? [res] : [];
        }
        return processedResults.sort((a, b) => (a.student.roll || 0) - (b.student.roll || 0));
    }, [mode, selectedStudentId, processedResults]);

    if (!isClient) return null;

    return (
        <div className="flex min-h-screen w-full flex-col bg-slate-100 font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-8 no-print pb-40">
                <div className="max-w-[1400px] mx-auto space-y-6">
                    <div className="flex items-center gap-4">
                        <Link href="/documents">
                            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black text-primary">মার্কশিট (Marksheet) জেনারেটর</h1>
                            <p className="text-sm text-muted-foreground">সব শিক্ষার্থীর জন্য প্রফেশনাল মার্কশিট তৈরি ও প্রিন্ট করুন</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        {/* Configuration Column */}
                        <Card className="shadow-lg border-2">
                            <CardHeader className="bg-primary/5 border-b">
                                <CardTitle className="text-lg">প্যারামিটার সেটআপ</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="font-bold">১. পরীক্ষা নির্বাচন করুন</Label>
                                        <Select 
                                            value={selectedExam?.id || ""}
                                            onValueChange={(id) => setSelectedExam(exams.find(e => e.id === id) || null)}
                                        >
                                            <SelectTrigger className="bg-white"><SelectValue placeholder="পরীক্ষা নির্বাচন করুন" /></SelectTrigger>
                                            <SelectContent>
                                                {exams.map(exam => <SelectItem key={exam.id} value={exam.id}>{exam.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="font-bold">২. শ্রেণি</Label>
                                            <Select value={selectedClass} onValueChange={setSelectedClass}>
                                                <SelectTrigger className="bg-white"><SelectValue placeholder="শ্রেণি নির্বাচন" /></SelectTrigger>
                                                <SelectContent>
                                                    {['6', '7', '8', '9', '10'].map(cls => <SelectItem key={cls} value={cls}>{classNamesMap[cls]} শ্রেণি</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {parseInt(selectedClass) >= 9 && (
                                            <div className="space-y-2">
                                                <Label className="font-bold">৩. শাখা</Label>
                                                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">সকল শাখা</SelectItem>
                                                        <SelectItem value="science">বিজ্ঞান</SelectItem>
                                                        <SelectItem value="arts">মানবিক</SelectItem>
                                                        <SelectItem value="commerce">ব্যবসায় শিক্ষা</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="font-bold">৪. প্রিন্ট মোড</Label>
                                        <Tabs value={mode} onValueChange={(v: any) => setMode(v)}>
                                            <TabsList className="grid grid-cols-2 w-full">
                                                <TabsTrigger value="bulk" className="gap-2 font-bold"><Users className="h-4 w-4" /> শ্রেণিভিত্তিক</TabsTrigger>
                                                <TabsTrigger value="single" className="gap-2 font-bold"><User className="h-4 w-4" /> একক</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>

                                    {mode === 'single' && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <Label className="font-bold">৫. শিক্ষার্থী নির্বাচন</Label>
                                            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                                                <SelectTrigger className="bg-white">
                                                    <SelectValue placeholder="শিক্ষার্থী সিলেক্ট করুন" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableStudents.map(s => <SelectItem key={s.id} value={s.id}>রোল {s.roll} - {s.studentNameBn}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    <div className="space-y-2 pt-4 border-t">
                                        <Label className="font-bold text-xs flex items-center gap-2">জলছাপের স্বচ্ছতা (Watermark Opacity)</Label>
                                        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border">
                                            <Button variant="ghost" size="icon" onClick={() => setWatermarkOpacity(prev => Math.max(0, prev - 0.05))}><Minus className="h-4 w-4" /></Button>
                                            <span className="font-black flex-1 text-center">{Math.round(watermarkOpacity * 100)}%</span>
                                            <Button variant="ghost" size="icon" onClick={() => setWatermarkOpacity(prev => Math.min(1, prev + 0.05))}><Plus className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6">
                                    <Button 
                                        onClick={() => window.print()} 
                                        className="w-full h-12 text-lg font-black shadow-xl"
                                        disabled={isLoading || !selectedExam || (mode === 'single' && !selectedStudentId) || resultsToPrint.length === 0}
                                    >
                                        <Printer className="mr-2 h-5 w-5" /> মার্কশিট প্রিন্ট করুন ({toBengaliNumber(resultsToPrint.length)})
                                    </Button>
                                    <p className="text-[10px] text-muted-foreground mt-4 italic text-center">
                                        * ব্রাউজার থেকে 'Background Graphics' অন রাখুন। প্রতিটি মার্কশিট আলাদা পৃষ্ঠায় আসবে।
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Preview Column */}
                        <div className="sticky top-24">
                            <h3 className="text-sm font-bold text-muted-foreground mb-2 flex items-center gap-2">
                                <Info className="h-4 w-4" /> লাইভ প্রিভিউ (একটি নমুনা)
                            </h3>
                            <div className="bg-white p-4 border-4 border-dashed rounded-2xl shadow-inner min-h-[600px] flex items-start justify-center overflow-auto max-h-[80vh]">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
                                ) : resultsToPrint.length > 0 ? (
                                    <div className="origin-top scale-[0.5] sm:scale-[0.6] lg:scale-[0.7] xl:scale-[0.8] mb-[-200px]">
                                        <MarksheetTemplate 
                                            result={resultsToPrint[0]} 
                                            schoolInfo={schoolInfo} 
                                            examName={selectedExam?.name || ''} 
                                            academicYear={selectedYear}
                                            watermarkOpacity={watermarkOpacity}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground py-40 italic">
                                        <FileBadge className="h-16 w-16 mx-auto mb-4 opacity-10" />
                                        <p>তথ্য পাওয়া যায়নি</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Hidden Printable Area */}
            <div className="hidden print:block printable-area bg-white">
                {resultsToPrint.map((res, idx) => (
                    <div key={res.student.id} className="w-[210mm] h-[297mm] mx-auto overflow-hidden relative bg-white" style={{ pageBreakAfter: 'always' }}>
                        <div className="p-8 h-full w-full box-border">
                            <MarksheetTemplate 
                                result={res} 
                                schoolInfo={schoolInfo} 
                                examName={selectedExam?.name || ''} 
                                academicYear={selectedYear}
                                watermarkOpacity={watermarkOpacity}
                                isPrint
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MarksheetTemplate = ({ result, schoolInfo, examName, academicYear, watermarkOpacity, isPrint = false }: any) => {
    const student = result.student;
    const subjects = getSubjects(student.className, student.group).filter(s => s.isExamSubject !== false);
    const displayExamName = examNameEnglishMap[examName] || examName;

    const renderMeritPosition = (position?: number) => {
        if (!position) return '-';
        if (position % 10 === 1 && position % 100 !== 11) return `${position}st`;
        if (position % 10 === 2 && position % 100 !== 12) return `${position}nd`;
        if (position % 10 === 3 && position % 100 !== 13) return `${position}rd`;
        return `${position}th`;
    }

    const getRemarks = (gpa: number, isPass: boolean) => {
        if (!isPass) return "Work hard to do well in the next exam";
        if (gpa >= 5.0) return "Excellent results. Keep it up!";
        if (gpa >= 4.0) return "Satisfactory performance. Aim higher!";
        if (gpa >= 3.5) return "Good result. Needs more focus.";
        if (gpa >= 3.0) return "Average result. Improvement needed.";
        if (gpa >= 2.0) return "Below average. Study hard.";
        if (gpa >= 1.0) return "Poor performance. Needs regular study.";
        return "Work hard to do well in the next exam";
    };

    return (
        <div className="marksheet-container w-[210mm] h-[280mm] bg-white relative flex flex-col box-border font-sans text-black">
            <style jsx>{`
                .watermark-layer img { visibility: visible !important; display: block !important; }
                .marksheet-content { border: 1.5px solid black; padding: 16px; height: 100%; display: flex; flex-direction: column; background: transparent; position: relative; z-index: 10; }
            `}</style>

            {schoolInfo.logoUrl && (
                <div 
                    className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none watermark-layer"
                    style={{ opacity: watermarkOpacity }}
                >
                    <img src={schoolInfo.logoUrl} alt="Watermark" className="w-[300px] h-[300px] object-contain" />
                </div>
            )}
            
            <div className="marksheet-content">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                        {schoolInfo.logoUrl && (
                            <div className="w-20 h-20 relative">
                                <img src={schoolInfo.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div className="text-left">
                            <h1 className="text-2xl font-black uppercase text-[#003366] leading-none mb-1">
                                {schoolInfo.nameEn || "BIRGANJ POURO HIGH SCHOOL"}
                            </h1>
                            <p className="text-sm font-bold text-gray-700">{schoolInfo.address}</p>
                            <div className="mt-2 inline-block bg-[#eef6ff] px-3 py-1 rounded border border-[#b3d7ff]">
                                <p className="text-xs text-[#0056b3] font-bold">Academic Session: {academicYear}</p>
                            </div>
                        </div>
                    </div>
                    {/* Grading Table */}
                    <div className="text-[8px]">
                        <table className="border-collapse border border-black text-center w-full">
                            <thead className="bg-gray-100">
                                <tr className="border-b border-black">
                                    <th className="p-1 border-r border-black">Range</th>
                                    <th className="p-1 border-r border-black">GP</th>
                                    <th className="p-1">Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gradingScale.map(g => (
                                    <tr key={g.grade} className="border-b border-black last:border-b-0">
                                        <td className="p-0.5 border-r border-black">{g.interval}</td>
                                        <td className="p-0.5 border-r border-black">{g.point}</td>
                                        <td className="p-0.5 font-bold">{g.grade}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="text-center mb-4">
                    <h2 className="text-lg font-black underline underline-offset-8 uppercase tracking-widest">{displayExamName} Progress Report</h2>
                </div>

                {/* Info Bar */}
                <section className="mb-4 text-[11px] leading-relaxed bg-slate-50/50 p-2 border border-dashed border-gray-300 rounded">
                    <div className="grid grid-cols-[1.5fr_4fr_1fr_2fr] gap-x-4 border-b pb-1">
                        <div className="font-bold text-gray-600 uppercase">Student's Name</div><div className="font-bold uppercase text-blue-900">: {student.studentNameEn || student.studentNameBn}</div>
                        <div className="font-bold text-gray-600 text-right uppercase">Class</div><div className="font-bold">: {classMap[student.className] || student.className}</div>
                    </div>
                    <div className="grid grid-cols-[1.5fr_4fr_1fr_2fr] gap-x-4 mt-1 border-b pb-1">
                        <div className="font-bold text-gray-600 uppercase">Father's Name</div><div>: {student.fatherNameEn || student.fatherNameBn}</div>
                        <div className="font-bold text-gray-600 text-right uppercase">Roll No.</div><div className="font-bold">: {student.roll}</div>
                    </div>
                    <div className="grid grid-cols-[1.5fr_4fr_1fr_2fr] gap-x-4 mt-1">
                        <div className="font-bold text-gray-600 uppercase">Student ID</div><div className="font-black">: {student.generatedId}</div>
                        <div className="font-bold text-gray-600 text-right uppercase">Group</div><div>: {student.group ? groupMap[student.group] : 'General'}</div>
                    </div>
                </section>

                {/* Summary Table */}
                <div className="grid grid-cols-4 border-2 border-black divide-x-2 divide-black text-center text-[11px] bg-blue-900 text-white mb-4 rounded-sm">
                    <div className="py-1.5 font-bold">Status: <span className={result.isPass ? "text-green-400" : "text-red-400"}>{result.isPass ? 'PASSED' : 'FAILED'}</span></div>
                    <div className="py-1.5 font-bold">GPA: <span className="text-amber-300">{result.gpa.toFixed(2)}</span></div>
                    <div className="py-1.5 font-bold">Final Grade: <span className="text-amber-300">{result.finalGrade}</span></div>
                    <div className="py-1.5 font-bold">Merit Rank: <span>{result.isPass ? renderMeritPosition(result.meritPosition) : 'N/A'}</span></div>
                </div>

                {/* Subject Table */}
                <div className="flex-grow">
                    <table className="w-full border-collapse border-[1.5px] border-black text-[10px]">
                        <thead className="bg-gray-100 font-bold">
                            <tr className="border-b-[1.5px] border-black">
                                <th className="border-r border-black p-1 w-8">SL</th>
                                <th className="border-r border-black p-1 text-left pl-4">Subject Name</th>
                                <th className="border-r border-black p-1 w-12">Full Marks</th>
                                <th className="border-r border-black p-1 w-12">Obtained</th>
                                <th className="border-r border-black p-1 w-10">Grade</th>
                                <th className="p-1 w-10">Point</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subjects.map((sub, sIdx) => {
                                const sr = result.subjectResults.get(sub.name);
                                const isFail = sr?.isPass === false;
                                return (
                                    <tr key={sIdx} className={cn("border-b border-black", isFail && "bg-red-50/50")}>
                                        <td className="border-r border-black p-1 text-center">{sIdx + 1}</td>
                                        <td className="border-r border-black p-1 pl-4 font-semibold">{sub.englishName}</td>
                                        <td className="border-r border-black p-1 text-center">{sub.fullMarks}</td>
                                        <td className={cn("border-r border-black p-1 text-center font-bold", isFail ? "text-red-600" : "text-blue-900")}>{sr?.marks ?? '-'}</td>
                                        <td className={cn("border-r border-black p-1 text-center font-black", isFail ? "text-red-600" : "")}>{sr?.grade ?? '-'}</td>
                                        <td className={cn("p-1 text-center font-bold", isFail ? "text-red-600" : "")}>{sr?.point !== undefined ? sr.point.toFixed(2) : '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-[1.5px] border-black font-black bg-blue-50">
                                <td colSpan={3} className="p-2 pr-4 text-right border-r border-black uppercase text-[10px]">Total Marks & Final Results</td>
                                <td className="p-2 text-center border-r border-black text-blue-950 text-sm">{result.totalMarks}</td>
                                <td className="p-2 text-center border-r border-black text-blue-950 text-sm">{result.finalGrade}</td>
                                <td className="p-2 text-center text-blue-950 text-sm">{result.gpa.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="mt-4 p-2 border border-black rounded bg-gray-50/30">
                    <p className="text-[9px] font-bold uppercase text-gray-500 mb-1">Remarks:</p>
                    <p className="text-[11px] font-black italic text-blue-900">"{getRemarks(result.gpa, result.isPass)}"</p>
                </div>

                <footer className="mt-auto pt-8 flex flex-col">
                    <div className="flex justify-between px-12 mb-6">
                        <div className="text-center w-32 border-t border-black pt-1 font-bold text-[10px] uppercase">Class Teacher</div>
                        <div className="text-center w-32 border-t border-black pt-1 font-bold text-[10px] uppercase">Headmaster</div>
                    </div>
                    <div className="pt-2 border-t border-dashed flex justify-between items-center text-[8px] text-gray-400 italic">
                        <span>Report Date: {new Date().toLocaleDateString('en-GB')}</span>
                        <span>Powered by: {schoolInfo.nameEn || "BPHS"} Management System</span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default MarksheetGeneratorPage;
