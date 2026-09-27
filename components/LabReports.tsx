'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteLabReport, getReportPdf, analyzeTestResult } from '@/app/actions/labReports';
import DashboardNavbar from '@/components/DashboardNavbar';
import Footer from '@/components/Footer';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText,
    Trash2,
    Calendar,
    Building2,
    User,
    Stethoscope,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Info,
    MapPin,
    FlaskConical,
    Activity,
    Download,
    Loader2
} from 'lucide-react';

interface TestResult {
    category: string;
    tests: {
        name: string;
        value: string;
        unit: string;
        referenceRange?: string;
        status?: 'normal' | 'high' | 'low';
    }[];
}

interface LabReport {
    id: string;
    fileName: string;
    reportDate: string | null;
    labName: string | null;
    patientName: string | null;
    doctorName: string | null;
    cloudinaryUrl?: string;
    extractedData: TestResult[] | { results: TestResult[], metadata: any };
    fileSize: number;
    pageCount: number;
    uploadedAt: Date;
}

interface LabReportsProps {
    user: any;
    reports: any[];
    onDelete?: (id: string) => void;
    defaultExpandedId?: string;
    variant?: 'dashboard' | 'page';
}

export default function LabReports({
    user,
    reports: initialReports,
    onDelete,
    defaultExpandedId,
    variant = 'dashboard'
}: LabReportsProps) {
    const router = useRouter();
    const [reports, setReports] = useState<LabReport[]>(initialReports);
    const [expandedReport, setExpandedReport] = useState<string | null>(defaultExpandedId || null);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [activeAnalysis, setActiveAnalysis] = useState<string | null>(null);
    const [analysisData, setAnalysisData] = useState<Record<string, string>>({});
    const [loadingAnalysis, setLoadingAnalysis] = useState<Record<string, boolean>>({});
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    useEffect(() => {
        setReports(initialReports);
    }, [initialReports]);

    const handleDeleteReport = async (reportId: string) => {
        if (onDelete) {
            onDelete(reportId);
            return;
        }

        const result = await deleteLabReport(reportId);
        if (result.success) {
            setReports(prev => prev.filter(r => r.id !== reportId));
            router.refresh();
        }
    };

    const toggleCategory = (reportId: string, category: string) => {
        const key = `${reportId}-${category}`;
        setExpandedCategories(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleDownload = async (e: React.MouseEvent, reportId: string, fileName: string) => {
        e.stopPropagation();
        setDownloadingId(reportId);
        try {
            const report = reports.find(r => r.id === reportId);
            if (report?.id) {
                window.open(`/api/report/${report.id}?mode=view`, '_blank');
            } else {
                router.push(`/dashboard/lab-reports/${reportId}`);
            }
        } catch (err) {
            console.error('Download error:', err);
            router.push(`/dashboard/lab-reports/${reportId}`);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleAnalyze = async (testKey: string, test: TestResult['tests'][0]) => {
        if (activeAnalysis === testKey) {
            setActiveAnalysis(null);
            return;
        }

        setActiveAnalysis(testKey);

        if (!analysisData[testKey] && !loadingAnalysis[testKey]) {
            setLoadingAnalysis(prev => ({ ...prev, [testKey]: true }));
            try {
                const result = await analyzeTestResult(
                    test.name,
                    test.value,
                    test.unit,
                    test.referenceRange
                );

                if (result.success && result.analysis) {
                    setAnalysisData(prev => ({ ...prev, [testKey]: result.analysis }));
                } else {
                    setAnalysisData(prev => ({
                        ...prev,
                        [testKey]: '<div class="p-4 bg-red-50 text-red-600 rounded-lg">Failed to generate analysis. Please try again later.</div>'
                    }));
                }
            } catch (error) {
                console.error('Analysis error:', error);
                setAnalysisData(prev => ({
                    ...prev,
                    [testKey]: '<div class="p-4 bg-red-50 text-red-600 rounded-lg">An error occurred while connecting to the analysis service.</div>'
                }));
            } finally {
                setLoadingAnalysis(prev => ({ ...prev, [testKey]: false }));
            }
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (date: Date | string | null) => {
        if (!date) return 'N/A';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const content = (
        <div className="space-y-4">
            {reports.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-700 text-lg mb-1">No Lab Reports Yet</h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto">
                        Uploaded lab reports and extracted medical parameters will appear here.
                    </p>
                </div>
            ) : (
                reports.map((report) => {
                    const isExpanded = expandedReport === report.id;
                    const rawData = report.extractedData;
                    const testResults: TestResult[] = Array.isArray(rawData)
                        ? rawData
                        : (rawData?.results || []);

                    return (
                        <div
                            key={report.id}
                            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-3.5 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                                        <FileText className="w-5 h-5 text-teal-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-900 text-base truncate">
                                            {report.fileName}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium mt-1">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(report.reportDate || report.uploadedAt)}
                                            </span>
                                            {report.labName && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5" />
                                                    {report.labName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                    <button
                                        onClick={(e) => handleDownload(e, report.id, report.fileName)}
                                        disabled={downloadingId === report.id}
                                        className="p-2.5 bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-colors font-semibold text-xs flex items-center gap-1.5"
                                        title="Download PDF"
                                    >
                                        {downloadingId === report.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        <span className="hidden sm:inline">PDF</span>
                                    </button>

                                    <button
                                        onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                                        className="p-2.5 bg-teal-600 text-white hover:bg-teal-700 rounded-xl transition-colors font-bold text-xs flex items-center gap-1.5"
                                    >
                                        <span>{isExpanded ? 'Hide Details' : 'View Results'}</span>
                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Results Section */}
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5"
                                    >
                                        {testResults.length === 0 ? (
                                            <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                                                No structured parameters extracted from this report.
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {testResults.map((cat, idx) => (
                                                    <div key={idx} className="bg-white rounded-xl border border-slate-200/80 p-4">
                                                        <h4 className="text-xs font-black text-teal-800 uppercase tracking-wider mb-3">
                                                            {cat.category}
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                                            {cat.tests.map((test, tidx) => (
                                                                <div key={tidx} className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-xs font-bold text-slate-800 truncate">{test.name}</p>
                                                                        <p className="text-sm font-black text-slate-900 mt-0.5">
                                                                            {test.value} <span className="text-[10px] text-slate-400 font-semibold">{test.unit}</span>
                                                                        </p>
                                                                    </div>
                                                                    {test.status && (
                                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${test.status === 'normal' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                                                            {test.status}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })
            )}
        </div>
    );

    if (variant === 'page') {
        return (
            <div className="min-h-screen bg-[#F7F9FA] flex flex-col">
                <DashboardNavbar user={user} />
                <main className="flex-grow pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-slate-900">Lab Reports & Diagnostics</h1>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                            Longitudinal laboratory reports, extracted blood markers, and PDF documents.
                        </p>
                    </div>
                    {content}
                </main>
                <Footer />
            </div>
        );
    }

    return content;
}
