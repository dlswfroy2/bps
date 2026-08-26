'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
    ArrowRight, FilePlus, IdCard, FileText, FileBadge, Award, Grid3X3, Contact, 
    ChevronRight, LayoutGrid, Info, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCUMENT_TOOLS = [
  { 
    id: 'marksheet', 
    label: 'মার্কশিট (Marksheet)', 
    icon: FileBadge, 
    href: '/documents/marksheet', 
    color: 'text-violet-600 bg-violet-50', 
    desc: 'শিক্ষার্থীদের বার্ষিক বা সাময়িক পরীক্ষার বিস্তারিত ফলাফল বিবরণী বা মার্কশিট প্রিন্ট করুন।' 
  },
  { 
    id: 'id-card', 
    label: 'পরিচয়পত্র (ID Card)', 
    icon: Contact, 
    href: '/documents/id-card', 
    color: 'text-indigo-600 bg-indigo-50', 
    desc: 'শিক্ষার্থীদের জন্য ছবি এবং কিউআর কোড যুক্ত প্রফেশনাল ডিজিটাল আইডি কার্ড তৈরি করুন।' 
  },
  { 
    id: 'admit-card', 
    label: 'প্রবেশ পত্র', 
    icon: IdCard, 
    href: '/documents/admit-card', 
    color: 'text-rose-600 bg-rose-50', 
    desc: 'পরীক্ষার জন্য ব্যক্তিগত বা শ্রেণিভিত্তিক ডিজিটাল প্রবেশপত্র লাইভ প্রিভিউ দেখে প্রিন্ট করুন।' 
  },
  { 
    id: 'seat-plan', 
    label: 'আসন বিন্যাস (Seat Plan)', 
    icon: Grid3X3, 
    href: '/documents/seat-plan', 
    color: 'text-teal-600 bg-teal-50', 
    desc: 'রুম অনুযায়ী শিক্ষার্থীদের বসার আসন বিন্যাস এবং বেঞ্চ লেবেল তৈরি করার সুবিধা।' 
  },
  { 
    id: 'testimonial', 
    label: 'প্রত্যয়ন পত্র', 
    icon: FileBadge, 
    href: '/documents/testimonial', 
    color: 'text-emerald-600 bg-emerald-50', 
    desc: 'অধ্যয়নরত শিক্ষার্থীদের জন্য দাপ্তরিক প্রত্যয়ন পত্র সয়ংক্রিয়ভাবে জেনারেট করুন।' 
  },
  { 
    id: 'appreciation', 
    label: 'প্রশংসাপত্র', 
    icon: Award, 
    href: '/documents/appreciation', 
    color: 'text-blue-600 bg-blue-50', 
    desc: 'ভালো ফলাফল ও চরিত্রের স্বীকৃতিস্বরূপ শিক্ষার্থীদের চারিত্রিক সনদপত্র প্রদান করুন।' 
  },
  { 
    id: 'tc', 
    label: 'ছাড়পত্র (TC)', 
    icon: FileText, 
    href: '/documents/tc', 
    color: 'text-amber-600 bg-amber-50', 
    desc: 'বিদ্যালয় ত্যাগকারী শিক্ষার্থীদের জন্য স্থানান্তর সনদ বা ছাড়পত্র তৈরি করুন।' 
  },
  { 
    id: 'custom-pad', 
    label: 'প্রতিষ্ঠানের প্যাড', 
    icon: FilePlus, 
    href: '/documents/custom-pad', 
    color: 'text-slate-600 bg-slate-50', 
    desc: 'বিদ্যালয়ের নিজস্ব লেটারহেড প্যাডে যেকোনো কাস্টম নোটিশ বা চিঠি টাইপ ও প্রিন্ট করুন।' 
  },
];

export default function DocumentsPage() {
  const [activeTool, setActiveTool] = useState(DOCUMENT_TOOLS[0].id);

  const selectedTool = useMemo(() => 
    DOCUMENT_TOOLS.find(t => t.id === activeTool) || DOCUMENT_TOOLS[0]
  , [activeTool]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
      <Header />
      <main className="flex-1 flex flex-col md:flex-row h-full max-w-[1600px] mx-auto w-full md:p-6 lg:p-10 gap-8 pb-[500px]">
        
        {/* Sidebar Navigation - Sticky */}
        <aside className="w-full md:w-72 shrink-0 space-y-1 no-print bg-white md:bg-transparent p-4 md:p-0 border-b md:border-0 sticky top-20 md:top-28 self-start">
            <h2 className="text-2xl font-black mb-6 px-4 hidden md:block text-slate-900 tracking-tight">ডকুমেন্ট পোর্টাল</h2>
            <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 gap-1 scrollbar-none">
                {DOCUMENT_TOOLS.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTool(item.id)}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold whitespace-nowrap min-w-fit",
                            activeTool === item.id ? "bg-white shadow-md text-primary scale-105" : "text-muted-foreground hover:bg-slate-200/50"
                        )}
                    >
                        <div className={cn("p-1.5 rounded-lg shrink-0", activeTool === item.id ? item.color : "bg-muted")}>
                            <item.icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm">{item.label}</span>
                        {activeTool === item.id && <ChevronRight className="ml-auto h-4 w-4 hidden md:block" />}
                    </button>
                ))}
            </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0 flex flex-col gap-6 transition-all duration-500 animate-in fade-in slide-in-from-right-4">
            <Card className="md:rounded-[32px] shadow-2xl border-slate-200/50 overflow-hidden min-h-[500px] flex flex-col">
                <CardHeader className="bg-primary/5 p-8 sm:p-10 border-b">
                    <div className="flex items-center gap-6">
                        <div className={cn("p-6 rounded-3xl shadow-lg border-4 border-white", selectedTool.color)}>
                            <selectedTool.icon className="h-12 w-12" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-slate-900">{selectedTool.label}</h2>
                            <p className="text-lg font-bold text-muted-foreground leading-relaxed max-w-2xl">{selectedTool.desc}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-8 sm:p-10 flex-1 flex flex-col justify-center bg-gradient-to-br from-white to-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <h3 className="font-black text-xl text-primary flex items-center gap-2">
                                    <ShieldCheck className="h-6 w-6" /> সিস্টেমের বৈশিষ্ট্য:
                                </h3>
                                <ul className="space-y-3 font-bold text-slate-600">
                                    <li className="flex items-start gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                        <span>সয়ংক্রিয় ডাটা ফেচিং (শিক্ষার্থী তালিকা থেকে তথ্য নেবে)।</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                        <span>প্রফেশনাল লেআউট এবং বাংলা ফন্ট সাপোর্ট।</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                        <span>A4 সাইজ পেপার অপ্টিমাইজড প্রিন্টিং।</span>
                                    </li>
                                </ul>
                            </div>
                            <Link href={selectedTool.href}>
                                <Button className="h-16 px-12 text-xl font-black shadow-xl mt-4 w-full sm:w-auto">
                                    জেনারেট শুরু করুন
                                    <ArrowRight className="ml-2 h-6 w-6" />
                                </Button>
                            </Link>
                        </div>
                        <div className="hidden md:flex justify-center">
                            <div className="relative w-64 h-64 opacity-10 group">
                                <selectedTool.icon className="w-full h-full text-primary" />
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-slate-50 p-4 border-t flex justify-center gap-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <span className="flex items-center gap-1"><Info className="h-3 w-3" /> কম্পিউটার থেকে প্রিন্ট করার পরামর্শ দেওয়া হলো</span>
                    <span className="flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> সয়ংক্রিয় আসন বিন্যাস সমর্থিত</span>
                </CardFooter>
            </Card>
        </div>
      </main>
    </div>
  );
}
