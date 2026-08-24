'use client';

import Image from 'next/image';
import { FeeCollection } from '@/lib/fees-data';
import { Student } from '@/lib/student-data';
import { SchoolInfo } from '@/lib/school-info';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { QRCodeSVG } from 'qrcode.react';

interface MoneyReceiptProps {
    collection: FeeCollection;
    student: Student;
    schoolInfo: SchoolInfo;
}

const toBengaliNumber = (str: string | number | undefined | null) => {
    if (!str && str !== 0) return '';
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
};

const numberToBengaliWords = (n: number): string => {
    const words: Record<number, string> = {
        0: 'শূন্য', 1: 'এক', 2: 'দুই', 3: 'তিন', 4: 'চার', 5: 'পাঁচ', 6: 'ছয়', 7: 'সাত', 8: 'আট', 9: 'নয়', 10: 'দশ',
        11: 'এগারো', 12: 'বারো', 13: 'তেরো', 14: 'চৌদ্দ', 15: 'পনেরো', 16: 'ষোলো', 17: 'সতেরো', 18: 'আঠারো', 19: 'উনিশ', 20: 'বিশ',
        21: 'একুশ', 22: 'বাইশ', 23: 'তেইশ', 24: 'চব্বিশ', 25: 'পঁচিশ', 26: 'ছাব্বিশ', 27: 'সাতাশ', 28: 'আটাশ', 29: 'উনত্রিশ', 30: 'ত্রিশ',
        31: 'একত্রিশ', 32: 'বত্রিশ', 33: 'তেতাল্লিশ', 34: 'চৌুরত্রিশ', 35: 'পঁয়ত্রিশ', 36: 'ছত্রিশ', 37: 'সাঁইত্রিশ', 38: 'আটত্রিশ', 39: 'উনচল্লিশ', 40: 'চল্লিশ',
        41: 'একচল্লিশ', 42: 'বিয়াল্লিশ', 43: 'তেতাল্লিশ', 44: 'চুয়াল্লিশ', 45: 'পঁয়তাল্লিশ', 46: 'ছেচল্লিশ', 47: 'সাতচল্লিশ', 48: 'আটচল্লিশ', 49: 'উনপঞ্চাশ', 50: 'পঞ্চাশ',
        51: 'একান্ন', 52: 'বায়ান্ন', 53: 'তিপ্পান্ন', 54: 'চুয়াল্লিশ', 55: 'পঞ্চান্ন', 56: 'ছাপ্পান্ন', 57: 'সাতান্ন', 58: 'আটান্ন', 59: 'উনষাট', 60: 'ষাট',
        61: 'একষট্টি', 62: 'বাষট্টি', 63: 'তেষট্টি', 64: 'চৌ্বরষট্টি', 65: 'পঁয়তাল্লিশ', 66: 'ছেষট্টি', 67: 'সাতষট্টি', 68: 'আটষট্টি', 69: 'উনসত্তর', 70: 'সত্তর',
        71: 'একাত্তর', 72: 'বাহাত্তর', 73: 'তিয়াত্তর', 74: 'চুয়াত্তর', 75: 'পঁচাত্তর', 76: 'ছিয়াত্তর', 77: 'সাতাত্তর', 78: 'আটাত্তর', 79: 'উনআশি', 80: 'আশি',
        81: 'একাশি', 82: 'বিরাশি', 83: 'তিরাশি', 84: 'চুরাশি', 85: 'পঁচাশী', 86: 'ছিয়াশি', 87: 'সাতাশি', 88: 'অষ্টাশি', 89: 'উননব্বই', 90: 'নব্বই',
        91: 'একানব্বই', 92: 'বিরানব্বই', 93: 'তিরানব্বই', 94: 'চুরানব্বই', 95: 'পঁচানব্বই', 96: 'ছেয়ানব্বই', 97: 'সাতানব্বই', 98: 'আটানব্বই', 99: 'নিরানব্বই'
    };

    if (n === 0) return 'শূন্য';

    let res = '';
    if (n >= 10000000) {
        res += numberToBengaliWords(Math.floor(n / 10000000)) + ' কোটি ';
        n %= 10000000;
    }
    if (n >= 100000) {
        res += numberToBengaliWords(Math.floor(n / 100000)) + ' লক্ষ ';
        n %= 100000;
    }
    if (n >= 1000) {
        res += numberToBengaliWords(Math.floor(n / 1000)) + ' হাজার ';
        n %= 1000;
    }
    if (n >= 100) {
        const hundreds = Math.floor(n / 100);
        res += (hundreds > 1 ? words[hundreds] : '') + ' শত ';
        n %= 100;
    }
    if (n > 0) {
        res += words[n];
    }

    return res.trim();
};

const numberToEnglishWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const inWords = (num: number): string => {
        if (num < 20) return a[num];
        const digit = num % 10;
        return b[Math.floor(num / 10)] + (digit ? ' ' + a[digit] : '');
    };
    
    let str = '';
    if (n >= 10000000) {
        str += inWords(Math.floor(n / 10000000)) + ' Crore ';
        n %= 10000000;
    }
    if (n >= 100000) {
        str += inWords(Math.floor(n / 100000)) + ' Lakh ';
        n %= 100000;
    }
    if (n >= 1000) {
        str += inWords(Math.floor(n / 1000)) + ' Thousand ';
        n %= 1000;
    }
    if (n >= 100) {
        str += inWords(Math.floor(n / 100)) + ' Hundred ';
        n %= 100;
    }
    if (n > 0) {
        str += inWords(n) + ' ';
    }
    return str.trim();
};

const classNamesMap: Record<string, string> = {
    '6': 'ষষ্ঠ', '7': 'সপ্তম', '8': 'অষ্টম', '9': 'নবম', '10': 'দশম',
};

const feeLabelsBn: Record<string, string> = {
    tuitionCurrent: 'চলতি মাসিক বেতন',
    tuitionAdvance: 'অগ্রিম মাসিক বেতন',
    tuitionDue: 'বকেয়া মাসিক বেতন',
    tuitionFine: 'জরিমানা',
    examFeeHalfYearly: 'অর্ধ-বার্ষিক পরীক্ষা ফি',
    examFeeAnnual: 'বার্ষিক পরীক্ষা ফি',
    examFeePreNirbachoni: 'প্রাক-নির্বাচনী পরীক্ষা ফি',
    examFeeNirbachoni: 'নির্বাচনী পরীক্ষা ফি',
    sessionFee: 'সেশন ফি',
    admissionFee: 'ভর্তি ফি',
    scoutFee: 'স্কাউট ফি',
    developmentFee: 'উন্নয়ন ফি',
    libraryFee: 'লাইব্রেরি ফি',
    tiffinFee: 'টিফিন ফি',
    otherFee: 'অন্যান্য ফি',
};

const feeLabelsEn: Record<string, string> = {
    tuitionCurrent: 'Current Monthly Tuition Fee',
    tuitionAdvance: 'Advance Monthly Tuition Fee',
    tuitionDue: 'Due Monthly Tuition Fee',
    tuitionFine: 'Late Fine',
    examFeeHalfYearly: 'Half-Yearly Exam Fee',
    examFeeAnnual: 'Annual Exam Fee',
    examFeePreNirbachoni: 'Pre-Test Exam Fee',
    examFeeNirbachoni: 'Test Exam Fee',
    sessionFee: 'Session Fee',
    admissionFee: 'Admission Fee',
    scoutFee: 'Scout Fee',
    developmentFee: 'Development Fee',
    libraryFee: 'Library Fee',
    tiffinFee: 'Tiffin Fee',
    otherFee: 'Other Fee',
};

export const MoneyReceipt = ({ collection, student, schoolInfo }: MoneyReceiptProps) => {
    const isEn = typeof document !== 'undefined' && document.cookie.includes('googtrans=/bn/en');
    const feeLabels = isEn ? feeLabelsEn : feeLabelsBn;

    const activeFees = Object.entries(collection.breakdown || {})
        .filter(([_, amount]) => amount && amount > 0);

    const displayName = isEn ? (student.studentNameEn || student.studentNameBn) : student.studentNameBn;
    const displaySchoolName = isEn ? (schoolInfo.nameEn || schoolInfo.name) : schoolInfo.name;
    const displayCollector = collection.collectorName || (isEn ? 'Office' : 'অফিস');
    const displayMethod = collection.method === 'bank' ? (isEn ? 'Bank' : 'ব্যাংক') : (isEn ? 'Cash' : 'নগদ');

    const qrValue = `${isEn ? 'Receipt No:' : 'রসিদ নং:'} ${collection.id.slice(-6).toUpperCase()}
${isEn ? 'Student:' : 'শিক্ষার্থী:'} ${displayName}
${isEn ? 'ID:' : 'আইডি:'} ${student.generatedId || '-'}
${isEn ? 'Class:' : 'শ্রেণি:'} ${isEn ? `Class ${student.className}` : (classNamesMap[student.className] || student.className)}
${isEn ? 'Roll:' : 'রোল:'} ${student.roll}
${isEn ? 'Total Amount:' : 'মোট টাকা:'} ${collection.totalAmount} ৳
${isEn ? 'Collector:' : 'আদায়কারী:'} ${displayCollector}
${isEn ? 'Date:' : 'তারিখ:'} ${format(collection.collectionDate, 'dd/MM/yyyy')}`;

    return (
        <div className="money-receipt font-kalpurush w-[148mm] h-[210mm] p-3.5 sm:p-4 bg-white text-black border-[8px] border-double border-emerald-900 relative overflow-hidden flex flex-col mx-auto my-1 shadow-none print:m-0 box-border">
            {/* Background Watermark Pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(#064e3b 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
            
            {/* Logo Watermark */}
            {schoolInfo.logoUrl && (
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.07] pointer-events-none z-0">
                    <Image src={schoolInfo.logoUrl} alt="Watermark" width={260} height={260} />
                </div>
            )}

            <header className="relative z-10 flex items-center justify-between border-b-[3px] border-emerald-950 pb-2 mb-2">
                <div className="flex items-center gap-2.5">
                    {schoolInfo.logoUrl && (
                        <div className="relative w-14 h-14 bg-white p-1 rounded-full shadow-md border-2 border-emerald-200 shrink-0">
                            <Image src={schoolInfo.logoUrl} alt="Logo" width={56} height={56} className="object-contain rounded-full" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-[20px] font-black text-emerald-950 tracking-tighter leading-none mb-0.5">{displaySchoolName}</h1>
                        <p className="text-[11px] font-black text-slate-800 leading-tight">{schoolInfo.address} | EIIN: {isEn ? schoolInfo.eiin : toBengaliNumber(schoolInfo.eiin)}</p>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end shrink-0">
                    <div className="bg-emerald-950 text-white border-2 border-emerald-900 rounded-lg px-3.5 py-1 mb-1 font-black uppercase text-[13px] shadow-sm whitespace-nowrap">
                        {isEn ? 'MONEY RECEIPT' : 'টাকা আদায়ের রসিদ'}
                    </div>
                    <p className="text-[12px] font-black text-slate-950 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                        {isEn ? 'Date: ' : 'তারিখ: '}<span className="text-blue-900 font-black">{isEn ? format(collection.collectionDate, 'dd/MM/yyyy') : toBengaliNumber(format(collection.collectionDate, 'dd/MM/yyyy', { locale: bn }))}</span>
                    </p>
                    <p className="text-[10px] font-black text-slate-900 mt-0.5">{isEn ? 'Receipt No: ' : 'রসিদ নং: '}<span className="uppercase text-emerald-800 font-black">{collection.id.slice(-6)}</span></p>
                </div>
            </header>

            <main className="relative z-10 space-y-2.5 flex-grow flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] font-black bg-slate-50/90 p-2.5 rounded-lg border border-emerald-900/20 shadow-inner shrink-0">
                    <div className="flex gap-1.5 border-b border-dashed border-emerald-300 pb-0.5"><span className="text-slate-700 w-24">{isEn ? "Student's Name:" : 'শিক্ষার্থীর নাম:'}</span> <span className="text-emerald-950 font-black">{displayName}</span></div>
                    <div className="flex gap-1.5 border-b border-dashed border-emerald-300 pb-0.5"><span className="text-slate-700 w-16">{isEn ? 'ID:' : 'আইডি:'}</span> <span className="text-blue-800 font-black">{isEn ? (student.generatedId || '-') : toBengaliNumber(student.generatedId || '-')}</span></div>
                    <div className="flex gap-1.5 border-b border-dashed border-emerald-300 pb-0.5"><span className="text-slate-700 w-24">{isEn ? 'Class & Roll:' : 'শ্রেণি ও রোল:'}</span> <span className="text-emerald-950 font-black">{isEn ? `Class ${student.className}, Roll: ${student.roll}` : `${classNamesMap[student.className] || student.className} শ্রেণি, রোল- ${toBengaliNumber(student.roll)}`}</span></div>
                    <div className="flex gap-1.5 border-b border-dashed border-emerald-300 pb-0.5"><span className="text-slate-700 w-16">{isEn ? 'Session:' : 'শিক্ষাবর্ষ:'}</span> <span className="text-emerald-950 font-black">{isEn ? student.academicYear : toBengaliNumber(student.academicYear)}</span></div>
                    <div className="flex gap-1.5 pt-0.5"><span className="text-slate-700 w-24">{isEn ? 'Collector:' : 'আদায়কারী:'}</span> <span className="text-emerald-950 font-black">{displayCollector}</span></div>
                    <div className="flex gap-1.5 pt-0.5"><span className="text-slate-700 w-16">{isEn ? 'Method:' : 'পদ্ধতি:'}</span> <span className="text-emerald-950 font-black">{displayMethod}</span></div>
                </div>

                <div className="flex-grow flex flex-col overflow-hidden my-0.5">
                    <div className="border-[2px] border-emerald-950 rounded-lg overflow-hidden bg-white shadow-sm flex-grow flex flex-col justify-between">
                        <table className="w-full text-[12px] text-left border-collapse">
                            <thead>
                                <tr className="bg-emerald-900 text-white border-b border-emerald-950 h-7">
                                    <th className="p-1 border-r border-emerald-800 font-black w-8 text-center">{isEn ? 'SL' : 'নং'}</th>
                                    <th className="p-1 border-r border-emerald-800 font-black pl-3">{isEn ? 'Fee Particulars (Heads)' : 'আদায়ের খাত (Heads)'}</th>
                                    <th className="p-1 font-black text-right pr-4">{isEn ? 'Amount (৳)' : 'পরিমাণ (৳)'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeFees.map(([key, amount], i) => (
                                    <tr key={key} className="border-b border-slate-200 last:border-0 h-6">
                                        <td className="p-0.5 border-r border-slate-200 text-center font-black">{isEn ? i + 1 : toBengaliNumber(i + 1)}</td>
                                        <td className="p-0.5 border-r border-slate-200 font-black text-slate-900 pl-3">{feeLabels[key] || key}</td>
                                        <td className="p-0.5 text-right font-black pr-4 text-slate-950">{isEn ? amount : toBengaliNumber(amount as number)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-auto bg-emerald-50 border-t-[2px] border-emerald-950 px-3 py-1 flex justify-between items-center h-8">
                            <span className="font-black text-[13px] uppercase">{isEn ? 'Total Amount:' : 'সর্বমোট:'}</span>
                            <span className="font-black text-[20px] text-emerald-950 leading-none">{isEn ? collection.totalAmount : toBengaliNumber(collection.totalAmount)} ৳</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-2 shrink-0">
                    <div className="text-[12px] font-black bg-emerald-50/50 p-2 rounded-lg border border-dashed border-emerald-900/30">
                        <p className="leading-tight flex flex-wrap gap-1.5 items-end">
                            <span className="text-slate-800 shrink-0">{isEn ? 'In Words:' : 'কথায়:'}</span> 
                            <span className="text-emerald-950 border-b border-dotted border-slate-400 flex-grow min-w-[120px] px-1.5 italic font-black">
                                {isEn ? `${numberToEnglishWords(collection.totalAmount)} Taka only.` : `${numberToBengaliWords(collection.totalAmount)} টাকা মাত্র।`}
                            </span>
                        </p>
                        <p className="mt-1 text-[10.5px] text-slate-800 font-black leading-tight"><strong>{isEn ? 'Description:' : 'বিবরণ:'}</strong> {collection.description || (isEn ? 'Miscellaneous fee collection' : 'বিবিধ ফি আদায়')}</p>
                    </div>

                    <div className="flex justify-between items-end pt-1 pb-1">
                        <div className="flex gap-4 items-end flex-1">
                            <div className="text-center min-w-[90px]">
                                <div className="h-6 flex flex-col justify-end items-center pb-0.5">
                                    <span className="text-[10px] font-black text-emerald-950 leading-none">
                                        {displayCollector}
                                    </span>
                                </div>
                                <div className="w-24 border-t border-black pt-0.5 font-black text-[10px] text-emerald-950">{isEn ? "Collector's Signature" : 'আদায়কারীর স্বাক্ষর'}</div>
                            </div>
                            <div className="text-center min-w-[90px]">
                                <div className="h-6"></div>
                                <div className="w-24 border-t border-black pt-0.5 font-black text-[10px] text-emerald-950">{isEn ? "Headmaster's Signature" : 'প্রধান শিক্ষকের স্বাক্ষর'}</div>
                            </div>
                            <div className="text-center min-w-[90px]">
                                <div className="h-6"></div>
                                <div className="w-24 border-t border-black pt-0.5 font-black text-[10px] text-emerald-950">{isEn ? "Guardian's Signature" : 'অভিভাবকের স্বাক্ষর'}</div>
                            </div>
                        </div>
                        <div className="p-1 border border-emerald-900 bg-white rounded-md shadow-sm shrink-0">
                            <QRCodeSVG 
                                value={qrValue}
                                size={64}
                                level="M"
                                includeMargin={false}
                            />
                        </div>
                    </div>
                </div>
            </main>

            <footer className="relative z-10 pt-1 mt-auto border-t-2 border-double border-emerald-900">
                <div className="flex justify-between items-center px-1">
                    <div className="text-left text-[8.5px] font-black text-slate-800">
                        {isEn ? `Generated: ${format(new Date(), 'PPpp')}` : `জেনারেশন সময়: ${toBengaliNumber(format(new Date(), 'pp', { locale: bn }))}`}
                    </div>
                    <div className="text-right text-[8.5px] text-slate-500 font-black uppercase tracking-[0.15em]">
                        DIGITAL MANAGEMENT PORTAL | BPHS
                    </div>
                </div>
            </footer>
        </div>
    );
};
