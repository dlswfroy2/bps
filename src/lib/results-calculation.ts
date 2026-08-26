'use client';
import type { Student } from './student-data';
import { getSubjects, subjectNameNormalization } from './subjects';
import type { ClassResult } from './results-data';
import type { Subject } from './subjects';

export interface GradeInfo {
  grade: string;
  point: number;
}

export interface StudentSubjectResult {
    written?: number;
    mcq?: number;
    practical?: number;
    marks: number;
    fullMarks: number;
    grade: string;
    point: number;
    isPass: boolean;
}

export interface StudentProcessedResult {
    student: Student;
    totalMarks: number;
    totalPossibleMarks: number;
    gpa: number;
    finalGrade: string;
    isPass: boolean;
    failedSubjectsCount: number;
    meritPosition?: number;
    subjectResults: Map<string, StudentSubjectResult>;
}

export const getGradePoint = (percentage: number): GradeInfo => {
    if (percentage < 33) return { grade: 'F', point: 0.0 };
    if (percentage < 40) return { grade: 'D', point: 1.0 };
    if (percentage < 50) return { grade: 'C', point: 2.0 };
    if (percentage < 60) return { grade: 'B', point: 3.0 };
    if (percentage < 70) return { grade: 'A-', point: 3.5 };
    if (percentage < 80) return { grade: 'A', point: 4.0 };
    return { grade: 'A+', point: 5.0 };
};

const getFinalGrade = (gpa: number): string => {
    if (gpa === 5.0) return 'A+';
    if (gpa >= 4.0) return 'A';
    if (gpa >= 3.5) return 'A-';
    if (gpa >= 3.0) return 'B';
    if (gpa >= 2.0) return 'C';
    if (gpa >= 1.0) return 'D';
    return 'F';
}

/**
 * Normalizes a subject name for comparison
 */
const normalize = (name: string) => {
    if (!name) return "";
    const trimmed = name.trim();
    return (subjectNameNormalization[trimmed] || trimmed).toLowerCase();
};

const groupMap: Record<string, string> = { 
    'science': 'science', 'বিজ্ঞান': 'science',
    'arts': 'arts', 'মানবিক': 'arts', 'humanities': 'arts',
    'commerce': 'commerce', 'ব্যবসায় শিক্ষা': 'commerce', 'business': 'commerce'
};

export function processStudentResults(
    students: Student[],
    resultsBySubject: ClassResult[],
    allSubjectsForGroup: Subject[]
): StudentProcessedResult[] {

    return students.map(student => {
        const rawGroup = (student.group || '').toLowerCase().trim();
        const studentGroupNormalized = groupMap[rawGroup] || rawGroup;
        const optionalSubjectNameNormalized = normalize(student.optionalSubject || '');
        const studentClassNum = parseInt(student.className);

        const groupAllowedSubjects = getSubjects(student.className, studentGroupNormalized);
        
        // Final subject list for this student (max 12 for 9-10)
        const subjectsForStudent = groupAllowedSubjects.filter(subInfo => {
            const currentSubNameNormalized = normalize(subInfo.name);
            
            // For 9-10 Science: Exclusive check between HM and Agri
            if (studentClassNum >= 9 && studentGroupNormalized === 'science') {
                const hmNormalized = normalize('উচ্চতর গণিত');
                const agriNormalized = normalize('কৃষি শিক্ষা');
                
                // If student takes Higher Math, exclude Agriculture
                if (optionalSubjectNameNormalized === hmNormalized && currentSubNameNormalized === agriNormalized) {
                    return false;
                }
                // If student takes Agriculture, exclude Higher Math
                if (optionalSubjectNameNormalized === agriNormalized && currentSubNameNormalized === hmNormalized) {
                    return false;
                }
                
                // Keep the chosen one
                if ((currentSubNameNormalized === hmNormalized || currentSubNameNormalized === agriNormalized) && currentSubNameNormalized !== optionalSubjectNameNormalized) {
                    return false;
                }
            }
            
            return true;
        });

        let totalMarks = 0;
        let totalPossibleMarks = 0;
        const subjectResultsMap = new Map<string, StudentSubjectResult>();

        subjectsForStudent.forEach(subjectInfo => {
            const normalizedSubjectName = normalize(subjectInfo.name);
            
            // Find result record for this specific subject and class
            const classResult = resultsBySubject.find(r => 
                normalize(r.subject) === normalizedSubjectName && 
                r.className === student.className &&
                (!r.group || r.group === 'none' || groupMap[r.group.toLowerCase()] === studentGroupNormalized || studentClassNum < 9)
            );

            const studentResult = classResult?.results.find(r => r.studentId === student.id);
            const fullMarks = classResult?.fullMarks || subjectInfo.fullMarks;

            const written = studentResult?.written;
            const mcq = studentResult?.mcq;
            const practical = studentResult?.practical;
            const obtainedMarks = (written || 0) + (mcq || 0) + (practical || 0);
            
            const passMark = Math.ceil(fullMarks * 0.33);
            const isPassSubject = obtainedMarks >= passMark;
            
            const percentageForGrade = (obtainedMarks / fullMarks) * 100;
            const { grade, point } = getGradePoint(percentageForGrade);
            
            totalMarks += obtainedMarks;
            totalPossibleMarks += fullMarks;
            
            subjectResultsMap.set(subjectInfo.name, {
                written,
                mcq,
                practical,
                marks: obtainedMarks,
                fullMarks: fullMarks,
                grade: isPassSubject ? grade : 'F',
                point: isPassSubject ? point : 0,
                isPass: isPassSubject
            });
        });
        
        let totalCompulsoryPoints = 0;
        let compulsorySubjectsCount = 0;
        let failedInCompulsoryCount = 0;
        let bonusPoints = 0;

        subjectsForStudent.forEach(subjectInfo => {
            const result = subjectResultsMap.get(subjectInfo.name);
            const isOptional = normalize(subjectInfo.name) === optionalSubjectNameNormalized;

            if (isOptional) {
                if (result && result.isPass && result.point > 2.0) {
                    bonusPoints = result.point - 2.0;
                }
            } else {
                compulsorySubjectsCount++;
                if (!result || !result.isPass) {
                    failedInCompulsoryCount++;
                } else {
                    totalCompulsoryPoints += result.point;
                }
            }
        });

        const isPass = failedInCompulsoryCount === 0;
        let gpa = 0;

        if (isPass && compulsorySubjectsCount > 0) {
            gpa = (totalCompulsoryPoints + bonusPoints) / compulsorySubjectsCount;
            if (gpa > 5.0) gpa = 5.0;
        }
        
        const finalGrade = isPass ? getFinalGrade(gpa) : 'F';
        
        return {
            student,
            totalMarks,
            totalPossibleMarks,
            gpa: isPass ? parseFloat(gpa.toFixed(2)) : 0.0,
            finalGrade,
            isPass,
            failedSubjectsCount: failedInCompulsoryCount,
            subjectResults: subjectResultsMap,
        };
    }).sort((a, b) => {
        if (a.isPass !== b.isPass) return a.isPass ? -1 : 1;
        if (a.isPass) {
            if (b.gpa !== a.gpa) return b.gpa - a.gpa;
            if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
            return a.student.roll - b.student.roll;
        }
        if (a.failedSubjectsCount !== b.failedSubjectsCount) return a.failedSubjectsCount - b.failedSubjectsCount;
        return b.totalMarks - a.totalMarks;
    }).map((res, idx, self) => {
        if (!res.isPass) return res;
        let meritPosition = idx + 1;
        if (idx > 0) {
            const prev = self[idx - 1];
            if (prev.isPass && prev.gpa === res.gpa && prev.totalMarks === res.totalMarks) {
                meritPosition = prev.meritPosition!;
            }
        }
        return { ...res, meritPosition };
    });
}
