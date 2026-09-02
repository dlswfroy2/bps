
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
    FileUp, FileText, Download, Trash2, Loader2, ArrowLeft, 
    Search, FolderOpen, Files, ShieldCheck, Eye, Info, Clock, User
} from 'lucide-react';
import { 
    saveArchivedDocument, 
    getArchivedDocuments, 
    deleteArchivedDocument, 
    ArchivedDocument 
} from '@/lib/document-archive-data';
import Link from 'next/link';
import { format } from 'date-fns';
import { bn } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function DocumentArchivePage() {
    const db = useFirestore();
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [documents, setDocuments] = useState<ArchivedDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // New Document Form
    const [newDocTitle, setNewDocTitle] = useState('');

    const canManageArchive = hasPermission('manage:archive');

    const fetchDocs = async () => {
        if (!db) return;
        setIsLoading(true);
        const data = await getArchivedDocuments(db);
        setDocuments(data);
        setIsLoading(false);
    };

    useEffect(() => {
        if (db) fetchDocs();
    }, [db]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !db || !user) return;

        // Updated file size check to 2000 KB as requested
        if (file.size > 2000 * 1024) {
            toast({ 
                variant: 'destructive', 
                title: 'ফাইলটি অনেক বড়', 
                description: 'সরাসরি ডাটাবেসে সেভ করার জন্য ফাইলটি অবশ্যই ২০০০ কেবি (KB) এর কম হতে হবে।' 
            });
            return;
        }

        if (!newDocTitle.trim()) {
            toast({ variant: 'destructive', title: 'শিরোনাম দিন', description: 'ডকুমেন্টের একটি নাম বা শিরোনাম লিখুন।' });
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();
        
        reader.onload = async (evt) => {
            try {
                const base64String = evt.target?.result as string;
                
                await saveArchivedDocument(db, {
                    title: newDocTitle,
                    fileData: base64String,
                    mimeType: file.type,
                    fileName: file.name,
                    uploaderName: user.displayName || user.email || 'Admin',
                    uploaderUid: user.uid
                });

                toast({ title: 'ডকুমেন্ট আপলোড সম্পন্ন হয়েছে' });
                setNewDocTitle('');
                if (fileInputRef.current) fileInputRef.current.value = '';
                fetchDocs();
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'ত্রুটি', description: 'ফাইলটি আপলোড করা যায়নি।' });
            } finally {
                setIsUploading(false);
            }
        };

        reader.readAsDataURL(file);
    };

    /**
     * নির্দেশ অনুযায়ী handleOpenPdf বিশেষ ফাংশন।
     * এটি Base64 টেক্সটকে Blob-এ রূপান্তর করে অস্থায়ী ভার্চুয়াল লিঙ্ক তৈরি করে ওপেন করে।
     */
    const handleOpenFile = (doc: ArchivedDocument) => {
        try {
            // ১. Base64 টেক্সট স্ট্রিং থেকে বাইনারি ডাটা আলাদা করা
            const base64Data = doc.fileData.split(';base64,').pop();
            if (!base64Data) return;

            // ২. Blob রূপান্তর (Binary Large Object)
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: doc.mimeType });

            // ৩. অস্থায়ী লিঙ্ক তৈরি (Virtual Link)
            const fileURL = URL.createObjectURL(blob);

            // ৪. ফরম্যাট সুরক্ষাসহ নতুন ট্যাবে ওপেন
            window.open(fileURL, '_blank');

            // ৫. মেমোরি ক্লিয়ার করা (পরবর্তীতে অটোমেটিক হবে, তাও রাখা ভালো)
            setTimeout(() => URL.revokeObjectURL(fileURL), 1000);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'ফাইলটি ওপেন করা যাচ্ছে না' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!db) return;
        await deleteArchivedDocument(db, id);
        toast({ title: 'ডকুমেন্ট মুছে ফেলা হয়েছে' });
        fetchDocs();
    };

    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim()) return documents;
        const q = searchQuery.toLowerCase();
        return documents.filter(d => 
            d.title.toLowerCase().includes(q) || 
            d.fileName.toLowerCase().includes(q)
        );
    }, [documents, searchQuery]);

    // নির্দেশ অনুযায়ী ফিল্টারিং লজিক (পিডিএফ বনাম ওয়ার্ড)
    const pdfFiles = useMemo(() => filteredDocs.filter(d => d.mimeType.includes('pdf')), [filteredDocs]);
    const wordFiles = useMemo(() => filteredDocs.filter(d => d.mimeType.includes('msword') || d.mimeType.includes('officedocument')), [filteredDocs]);

    function toBengaliNumber(str: string | number | undefined | null) {
        if (!str && str !== 0) return '';
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-10 pb-40">
                <div className="max-w-[1200px] mx-auto space-y-8">
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <Link href="/documents">
                                <Button variant="outline" size="icon" className="rounded-full shadow-sm">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-3xl font-black text-slate-900 tracking-tight">নথিপত্র (ডিজিটাল আর্কাইভ)</h1>
                                <p className="text-sm font-bold text-muted-foreground mt-1">বিদ্যালয়ের গুরুত্বপূর্ণ দাপ্তরিক ফাইলসমূহ এখানে আপলোড ও সংরক্ষণ করুন</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        {/* Sidebar: Upload & Search */}
                        <div className="space-y-6">
                            <Card className="border-[4px] border-black rounded-[32px] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                                <CardHeader className="bg-primary text-white p-6 pb-8 border-b-[3px] border-black">
                                    <CardTitle className="text-xl font-black flex items-center gap-2">
                                        <FileUp className="h-6 w-6" /> ফাইল আপলোড
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6 -mt-4">
                                    <div className="space-y-2">
                                        <Label className="font-black text-sm text-slate-700">ডকুমেন্টের শিরোনাম লিখুন</Label>
                                        <Input 
                                            value={newDocTitle}
                                            onChange={e => setNewDocTitle(e.target.value)}
                                            placeholder="উদা: ম্যানেজিং কমিটি মিটিং রেজুলেশন"
                                            className="h-11 border-2 font-bold"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="font-black text-sm text-slate-700">ফাইল নির্বাচন করুন (.pdf, .doc, .docx)</Label>
                                        <div 
                                            className={cn(
                                                "h-32 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all group",
                                                isUploading ? "bg-slate-50 border-primary/30" : "bg-slate-50/50 border-slate-200 hover:border-primary/40 hover:bg-slate-50"
                                            )}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            {isUploading ? (
                                                <div className="flex flex-col items-center gap-2 text-primary">
                                                    <Loader2 className="h-10 w-10 animate-spin" />
                                                    <span className="font-black text-sm animate-pulse">প্রসেস হচ্ছে...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <Files className="h-10 w-10 text-slate-300 group-hover:text-primary transition-colors" />
                                                    <span className="font-bold text-slate-400 mt-2">ফাইল সিলেক্ট করতে এখানে ক্লিক করুন</span>
                                                </>
                                            )}
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                onChange={handleFileUpload} 
                                                className="hidden" 
                                                accept=".pdf,.doc,.docx"
                                                disabled={!canManageArchive || isUploading}
                                            />
                                        </div>
                                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2">
                                            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="text-[10px] font-bold text-amber-800 leading-tight">
                                                * সর্বোচ্চ ফাইল সাইজ ২০০০ KB। বড় ফাইলগুলোর জন্য লিংকিং পদ্ধতি ব্যবহার করুন।
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-[4px] border-black rounded-[32px] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                                <CardHeader className="bg-slate-800 text-white p-6 border-b-[3px] border-black">
                                    <CardTitle className="text-lg font-black flex items-center gap-2">
                                        <Search className="h-5 w-5" /> নথিপত্র অনুসন্ধান
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="ফাইলের নাম বা শিরোনাম দিয়ে খুঁজুন..." 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="pl-10 h-11 border-2 font-bold"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Document List Area */}
                        <div className="lg:col-span-2 space-y-8">
                            
                            {/* PDF Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <FolderOpen className="h-6 w-6 text-rose-600" /> পিডিএফ ফাইলসমূহ (PDF)
                                    </h3>
                                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 font-black px-4">{toBengaliNumber(pdfFiles.length)} টি</Badge>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {pdfFiles.length === 0 ? (
                                        <div className="p-10 text-center border-4 border-dashed rounded-3xl opacity-30 italic font-bold">কোনো পিডিএফ ফাইল নেই</div>
                                    ) : (
                                        pdfFiles.map(doc => (
                                            <DocumentCard key={doc.id} doc={doc} onOpen={handleOpenFile} onDelete={handleDelete} canManage={canManageArchive} />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Word Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <FolderOpen className="h-6 w-6 text-blue-600" /> ওয়ার্ড ফাইলসমূহ (Word)
                                    </h3>
                                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-black px-4">{toBengaliNumber(wordFiles.length)} টি</Badge>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {wordFiles.length === 0 ? (
                                        <div className="p-10 text-center border-4 border-dashed rounded-3xl opacity-30 italic font-bold">কোনো ওয়ার্ড ফাইল নেই</div>
                                    ) : (
                                        wordFiles.map(doc => (
                                            <DocumentCard key={doc.id} doc={doc} onOpen={handleOpenFile} onDelete={handleDelete} canManage={canManageArchive} />
                                        ))
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function DocumentCard({ doc, onOpen, onDelete, canManage }: { doc: ArchivedDocument, onOpen: (d: ArchivedDocument) => void, onDelete: (id: string) => void, canManage: boolean }) {
    const isPdf = doc.mimeType.includes('pdf');
    
    function toBengaliNumber(str: string | number | undefined | null) {
        if (!str && str !== 0) return '';
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
    }

    return (
        <Card className="group border-2 border-black/10 rounded-2xl bg-white hover:border-primary/30 transition-all shadow-sm overflow-hidden">
            <CardContent className="p-0">
                <div className="flex items-center gap-4 p-4">
                    <div className={cn(
                        "p-4 rounded-xl shrink-0 shadow-sm",
                        isPdf ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                    )}>
                        <FileText className="h-8 w-8" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <h4 className="font-black text-lg text-slate-800 truncate leading-tight mb-1">{doc.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {format(doc.createdAt, 'dd MMMM yyyy, p', { locale: bn })}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> আপলোডার: {doc.uploaderName}
                            </span>
                            <span className="text-[10px] font-black text-primary truncate max-w-[150px]">
                                {doc.fileName}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-10 px-6 font-black gap-2 shadow-sm"
                            onClick={() => onOpen(doc)}
                        >
                            <Eye className="h-4 w-4" /> দেখুন ও ডাউনলোড
                        </Button>
                        
                        {canManage && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-rose-500 hover:bg-rose-50 hover:text-rose-700">
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="font-kalpurush">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-rose-700 font-black">ডকুমেন্টটি মুছতে চান?</AlertDialogTitle>
                                        <AlertDialogDescription className="font-bold text-base">
                                            আপনি কি নিশ্চিতভাবে এই নথিটি স্থায়ীভাবে মুছে ফেলতে চান? এটি আর ফিরে পাওয়া যাবে না।
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="font-bold">না, বাতিল</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => onDelete(doc.id)} className="bg-destructive text-white font-black">হ্যাঁ, মুছুন</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
