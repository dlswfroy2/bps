
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
    Search, FolderOpen, Files, ShieldCheck, Eye, Info, Clock, User, Plus, FolderPlus, Folder, ChevronRight, LayoutGrid, ShieldAlert
} from 'lucide-react';
import { 
    saveArchivedDocument, 
    getArchivedDocuments, 
    deleteArchivedDocument, 
    ArchivedDocument,
    ArchiveFolder,
    getArchiveFolders,
    saveArchiveFolder,
    deleteArchiveFolder
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
    const { user, hasPermission, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [documents, setDocuments] = useState<ArchivedDocument[]>([]);
    const [folders, setFolders] = useState<ArchiveFolder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Selection states
    const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
    
    // New Resource States
    const [newDocTitle, setNewDocTitle] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);

    const canViewArchive = hasPermission('view:archive');
    const canManageArchive = hasPermission('manage:archive');

    const fetchAllData = async () => {
        if (!db) return;
        setIsLoading(true);
        try {
            const [docsData, foldersData] = await Promise.all([
                getArchivedDocuments(db),
                getArchiveFolders(db)
            ]);
            setDocuments(docsData);
            setFolders(foldersData);
        } catch (error) {
            console.error(error);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (db && canViewArchive) fetchAllData();
    }, [db, canViewArchive]);

    const handleCreateFolder = async () => {
        if (!db || !newFolderName.trim() || !canManageArchive) return;
        setIsCreatingFolder(true);
        try {
            await saveArchiveFolder(db, { name: newFolderName.trim() });
            toast({ title: 'ফোল্ডার তৈরি হয়েছে' });
            setNewFolderName('');
            fetchAllData();
        } catch (error) {
            console.error(error);
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!db || !canManageArchive) return;
        const hasFiles = documents.some(d => d.folderId === id);
        if (hasFiles) {
            toast({ variant: 'destructive', title: 'ফোল্ডারটি খালি নয়', description: 'আগে ফোল্ডারের ফাইলগুলো ডিলিট করুন।' });
            return;
        }
        await deleteArchiveFolder(db, id);
        toast({ title: 'ফোল্ডার মুছে ফেলা হয়েছে' });
        if (selectedFolderId === id) setSelectedFolderId('all');
        fetchAllData();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !db || !user || !canManageArchive) return;

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
                    uploaderUid: user.uid,
                    folderId: selectedFolderId === 'all' ? undefined : selectedFolderId
                });

                toast({ title: 'ডকুমেন্ট আপলোড সম্পন্ন হয়েছে' });
                setNewDocTitle('');
                if (fileInputRef.current) fileInputRef.current.value = '';
                fetchAllData();
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'ত্রুটি', description: 'ফাইলটি আপলোড করা যায়নি।' });
            } finally {
                setIsUploading(false);
            }
        };

        reader.readAsDataURL(file);
    };

    const handleOpenFile = (doc: ArchivedDocument) => {
        try {
            const base64Data = doc.fileData.split(';base64,').pop();
            if (!base64Data) return;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: doc.mimeType });
            const fileURL = URL.createObjectURL(blob);
            window.open(fileURL, '_blank');
            setTimeout(() => URL.revokeObjectURL(fileURL), 1000);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'ফাইলটি ওপেন করা যাচ্ছে না' });
        }
    };

    const handleDeleteDoc = async (id: string) => {
        if (!db || !canManageArchive) return;
        await deleteArchivedDocument(db, id);
        toast({ title: 'ডকুমেন্ট মুছে ফেলা হয়েছে' });
        fetchAllData();
    };

    const filteredDocs = useMemo(() => {
        let filtered = documents;
        
        // Filter by folder
        if (selectedFolderId !== 'all') {
            filtered = filtered.filter(d => d.folderId === selectedFolderId);
        }

        // Filter by search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d => 
                d.title.toLowerCase().includes(q) || 
                d.fileName.toLowerCase().includes(q)
            );
        }

        return filtered;
    }, [documents, searchQuery, selectedFolderId]);

    const pdfFiles = useMemo(() => filteredDocs.filter(d => d.mimeType.includes('pdf')), [filteredDocs]);
    const wordFiles = useMemo(() => filteredDocs.filter(d => d.mimeType.includes('msword') || d.mimeType.includes('officedocument')), [filteredDocs]);

    function toBengaliNumber(str: string | number | undefined | null) {
        if (!str && str !== 0) return '';
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
    }

    const currentFolderName = useMemo(() => {
        if (selectedFolderId === 'all') return 'সকল নথিপত্র';
        return folders.find(f => f.id === selectedFolderId)?.name || 'অজানা ফোল্ডার';
    }, [selectedFolderId, folders]);

    if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

    if (!canViewArchive) {
        return (
            <div className="flex min-h-screen flex-col bg-slate-50 font-kalpurush">
                <Header />
                <main className="flex-1 flex items-center justify-center p-4">
                    <Card className="max-w-md w-full border-2 border-rose-200 text-center p-10 bg-white">
                        <ShieldAlert className="h-16 w-16 text-rose-500 mx-auto mb-4" />
                        <CardTitle className="text-2xl font-black text-rose-900 mb-2">প্রবেশাধিকার নেই</CardTitle>
                        <CardDescription className="text-base font-bold text-slate-600">আপনার নথিপত্র আর্কাইভ দেখার অনুমতি নেই।</CardDescription>
                        <Button className="mt-6 font-black" onClick={() => window.history.back()}>ফিরে যান</Button>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#F6F7F9] font-kalpurush">
            <Header />
            <main className="flex-1 p-4 md:p-10 pb-40">
                <div className="max-w-[1400px] mx-auto space-y-8">
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <Link href="/documents">
                                <Button variant="outline" size="icon" className="rounded-full shadow-sm">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-3xl font-black text-slate-900 tracking-tight">নথিপত্র (ডিজিটাল আর্কাইভ)</h1>
                                <p className="text-sm font-bold text-muted-foreground mt-1">বিদ্যালয়ের গুরুত্বপূর্ণ ফাইলসমূহ ফোল্ডার আকারে সাজিয়ে রাখুন</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        
                        {/* Sidebar: Folder List */}
                        <div className="space-y-6">
                            <Card className="border-[4px] border-black rounded-[32px] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                                <CardHeader className="bg-primary text-white p-6 border-b-[3px] border-black">
                                    <CardTitle className="text-xl font-black flex items-center gap-2">
                                        <FolderOpen className="h-6 w-6" /> ফোল্ডারসমূহ
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4">
                                    {canManageArchive && (
                                        <div className="flex gap-2">
                                            <Input 
                                                placeholder="নতুন ফোল্ডার..." 
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                className="h-9 text-xs border-2"
                                                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                                            />
                                            <Button 
                                                size="sm" 
                                                className="h-9 px-3" 
                                                onClick={handleCreateFolder}
                                                disabled={isCreatingFolder || !newFolderName.trim()}
                                            >
                                                {isCreatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <button 
                                            onClick={() => setSelectedFolderId('all')}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all font-black text-sm",
                                                selectedFolderId === 'all' ? "bg-primary text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                                            )}
                                        >
                                            <LayoutGrid className="h-4 w-4 shrink-0" />
                                            <span>সকল নথিপত্র</span>
                                        </button>

                                        {folders.map(folder => (
                                            <button 
                                                key={folder.id}
                                                onClick={() => setSelectedFolderId(folder.id)}
                                                className={cn(
                                                    "w-full group flex items-center gap-3 px-3 py-2 rounded-xl transition-all font-black text-sm",
                                                    selectedFolderId === folder.id ? "bg-primary text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                                                )}
                                            >
                                                <Folder className="h-4 w-4 shrink-0" />
                                                <span className="flex-1 truncate text-left">{folder.name}</span>
                                                {canManageArchive && (
                                                    <Trash2 
                                                        className="h-3.5 w-3.5 text-rose-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition-opacity" 
                                                        onClick={(e) => handleDeleteFolder(folder.id, e)}
                                                    />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-[4px] border-black rounded-[32px] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                                <CardHeader className="bg-slate-800 text-white p-6 border-b-[3px] border-black">
                                    <CardTitle className="text-lg font-black flex items-center gap-2">
                                        <Search className="h-5 w-5" /> অনুসন্ধান
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="ফাইলের নাম দিন..." 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="pl-10 h-11 border-2 font-bold"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Document Area */}
                        <div className="lg:col-span-3 space-y-8">
                            
                            {/* Upload Section (Contextual to selected folder) */}
                            {canManageArchive && (
                                <Card className="border-[4px] border-black rounded-[32px] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.1)] bg-white">
                                    <div className="bg-primary/5 p-4 border-b-[2px] border-black flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 bg-primary rounded-lg text-white">
                                                <FileUp className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-black text-slate-800">ফাইল আপলোড করুন</h3>
                                                <p className="text-[10px] font-bold text-muted-foreground">বর্তমানে <span className="text-primary font-black">[{currentFolderName}]</span> ফোল্ডারে আপলোড হবে</p>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="font-black border-primary/30 text-primary">সর্বোচ্চ ২০০০ KB</Badge>
                                    </div>
                                    <CardContent className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                            <div className="space-y-2">
                                                <Label className="font-black text-xs text-slate-700">ডকুমেন্টের শিরোনাম</Label>
                                                <Input 
                                                    value={newDocTitle}
                                                    onChange={e => setNewDocTitle(e.target.value)}
                                                    placeholder="ফাইলের একটি নাম দিন"
                                                    className="h-10 border-2 font-bold"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button 
                                                    className="flex-1 h-10 font-black gap-2"
                                                    disabled={isUploading || !newDocTitle.trim()}
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}
                                                    ফাইল সিলেক্ট করুন
                                                </Button>
                                                <input 
                                                    type="file" 
                                                    ref={fileInputRef} 
                                                    onChange={handleFileUpload} 
                                                    className="hidden" 
                                                    accept=".pdf,.doc,.docx"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Grouped View by Extension */}
                            <div className="space-y-8">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="h-8 w-1.5 bg-primary rounded-full" />
                                    <h2 className="text-2xl font-black text-slate-800">{currentFolderName}</h2>
                                </div>

                                {/* PDF Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-lg font-black text-slate-700 flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-rose-600" /> পিডিএফ ফাইলসমূহ (PDF)
                                        </h3>
                                        <Badge className="bg-rose-100 text-rose-700 border-rose-200 font-black">{toBengaliNumber(pdfFiles.length)} টি</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {pdfFiles.length === 0 ? (
                                            <div className="p-8 text-center border-4 border-dashed rounded-3xl opacity-20 italic font-bold">এই ফোল্ডারে কোনো পিডিএফ নেই</div>
                                        ) : (
                                            pdfFiles.map(doc => (
                                                <DocumentRow key={doc.id} doc={doc} onOpen={handleOpenFile} onDelete={handleDeleteDoc} canManage={canManageArchive} />
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Word Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-lg font-black text-slate-700 flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-blue-600" /> ওয়ার্ড ফাইলসমূহ (Word)
                                        </h3>
                                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-black">{toBengaliNumber(wordFiles.length)} টি</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {wordFiles.length === 0 ? (
                                            <div className="p-8 text-center border-4 border-dashed rounded-3xl opacity-20 italic font-bold">এই ফোল্ডারে কোনো ওয়ার্ড ফাইল নেই</div>
                                        ) : (
                                            wordFiles.map(doc => (
                                                <DocumentRow key={doc.id} doc={doc} onOpen={handleOpenFile} onDelete={handleDeleteDoc} canManage={canManageArchive} />
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function DocumentRow({ doc, onOpen, onDelete, canManage }: { doc: ArchivedDocument, onOpen: (d: ArchivedDocument) => void, onDelete: (id: string) => void, canManage: boolean }) {
    const isPdf = doc.mimeType.includes('pdf');
    
    function toBengaliNumber(str: string | number | undefined | null) {
        if (!str && str !== 0) return '';
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(str).replace(/[0-9]/g, (w) => bengaliDigits[parseInt(w, 10)]);
    }

    return (
        <div className="group flex items-center gap-4 p-4 border-2 border-black/5 rounded-2xl bg-white hover:border-primary/30 transition-all shadow-sm">
            <div className={cn(
                "p-3 rounded-xl shrink-0 shadow-sm transition-transform group-hover:scale-110",
                isPdf ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
            )}>
                <FileText className="h-6 w-6" />
            </div>
            
            <div className="flex-1 min-w-0">
                <h4 className="font-black text-base text-slate-800 truncate mb-1">{doc.title}</h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {format(doc.createdAt, 'dd MMM yyyy', { locale: bn })}
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
                    className="h-9 px-4 font-black gap-2 shadow-sm"
                    onClick={() => onOpen(doc)}
                >
                    <Eye className="h-4 w-4" /> দেখুন
                </Button>
                
                {canManage && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500 hover:bg-rose-50 hover:text-rose-700">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="font-kalpurush">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-rose-700 font-black">ডকুমেন্টটি মুছতে চান?</AlertDialogTitle>
                                <AlertDialogDescription className="font-bold text-base">
                                    আপনি কি নিশ্চিতভাবে এই নথিটি স্থায়ীভাবে মুছে ফেলতে চান?
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
    );
}
