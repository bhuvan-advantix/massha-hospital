'use client';

import { useState, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getReportPdf, analyzeTestResult } from '@/app/actions/labReports';
import DashboardNavbar from '@/components/DashboardNavbar';
import Footer from '@/components/Footer';
import { normalizeTestResults } from '@/lib/labResults';
import {
    FileText,
    Calendar,
    Building2,
    User,
    Stethoscope,
    AlertCircle,
    Info,
    FlaskConical,
    Download,
    Loader2,
    ChevronRight,
    MapPin,
    CalendarDays,
    Sparkles,
    Brain,
    ChevronDown
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

interface SingleLabReportViewProps {
    user: any;
    report: LabReport;
}

export default function SingleLabReportView({ user, report }: SingleLabReportViewProps) {
    const [activeAnalyses, setActiveAnalyses] = useState<Record<string, boolean>>({});
    const [analysisData, setAnalysisData] = useState<Record<string, string>>({});
    const [loadingAnalysis, setLoadingAnalysis] = useState<Record<string, boolean>>({});
    const [downloading, setDownloading] = useState(false);
    const [reprocessing, setReprocessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');

    const handleDownload = async () => {
        setDownloading(true);
        try {
            window.open(`/api/report/${report.id}?mode=download`, '_blank');
        } catch (err) {
            console.error('Download error:', err);
            window.print();
        } finally {
            setDownloading(false);
        }
    };

    const handleAnalyze = async (testKey: string, test: TestResult['tests'][0]) => {
        const isCurrentlyOpen = activeAnalyses[testKey];

        setActiveAnalyses(prev => ({
            ...prev,
            [testKey]: !isCurrentlyOpen
        }));

        if (!isCurrentlyOpen && !analysisData[testKey] && !loadingAnalysis[testKey]) {
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

    const extractedMetadata = (report.extractedData as any)?.metadata || {};

    return (
        <div className="min-h-screen bg-[#F7F9FA] flex flex-col">
            <DashboardNavbar user={user} />
            <main className="flex-grow pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    {/* Header Card */}
                    <div className="bg-white rounded-2xl p-4 md:p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 md:w-14 md:h-14 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-teal-100">
                                <FileText className="w-5 h-5 md:w-7 md:h-7 text-teal-600" />
                            </div>
                            <div>
                                <h1 className="text-base md:text-xl font-black text-slate-900 mb-1 md:mb-2 line-clamp-1">
                                    {report.fileName}
                                </h1>
                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs md:text-sm text-slate-500 font-medium">
                                    <span className="flex items-center gap-1 md:gap-1.5">
                                        <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                                        {formatDate(report.reportDate || report.uploadedAt)}
                                    </span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></span>
                                    <span className="hidden sm:inline">Size: {formatFileSize(report.fileSize)}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></span>
                                    <span className="hidden sm:inline">{report.pageCount} Pages</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="w-full md:w-auto px-4 py-2.5 md:px-6 md:py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 font-bold shadow-sm shadow-teal-200 text-sm md:text-base"
                        >
                            {downloading ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Download className="w-4 h-4 md:w-5 md:h-5" />}
                            <span>{report.cloudinaryUrl ? 'Download Original PDF' : 'Print Structured Report'}</span>
                        </button>
                    </div>

                    {/* Info Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 md:mb-3 text-teal-700">
                                <Info className="w-4 h-4 md:w-5 md:h-5" />
                                <h3 className="font-bold text-sm md:text-base">Analysis Details</h3>
                            </div>
                            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
                                <div>
                                    <span className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">Report type</span>
                                    <span className="font-semibold text-slate-700 text-xs md:text-sm">Medical Lab Report</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Test Results Table */}
                    <div className="bg-white rounded-2xl p-4 md:p-6 border border-slate-200 shadow-sm">
                        <h2 className="text-lg font-black text-slate-900 mb-4">Extracted Parameters</h2>
                        {(() => {
                            const categories = normalizeTestResults(report.extractedData);

                            if (categories.length > 0) {
                                return categories.map((cat, idx) => (
                                    <div key={idx} className="mb-6 last:mb-0">
                                        <h3 className="text-sm font-bold text-teal-800 bg-teal-50 px-3 py-2 rounded-lg mb-3">
                                            {cat.category}
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs md:text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                                                        <th className="py-2 px-3">Test Name</th>
                                                        <th className="py-2 px-3">Result</th>
                                                        <th className="py-2 px-3">Unit</th>
                                                        <th className="py-2 px-3">Reference / Comparator</th>
                                                        <th className="py-2 px-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(cat.tests || []).map((test, tidx) => (
                                                        <tr key={tidx} className="border-b border-slate-100 hover:bg-slate-50">
                                                            <td className="py-2.5 px-3 font-semibold text-slate-900">{test.name}</td>
                                                            <td className="py-2.5 px-3 font-bold text-teal-600">{test.value}</td>
                                                            <td className="py-2.5 px-3 text-slate-500">{test.unit}</td>
                                                            <td className="py-2.5 px-3 text-slate-500">{test.referenceRange || 'Not provided'}</td>
                                                            <td className="py-2.5 px-3">
                                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase border ${test.status === 'high'
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                                    : test.status === 'low'
                                                                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                    }`}>
                                                                    {test.status || 'Not assessed'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ));
                            } else {
                                return (
                                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                                        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        <p className="text-slate-500 font-medium text-lg mb-4">
                                            No test results could be extracted from this report
                                        </p>
                                        <p role="status" className="text-sm text-amber-700 mb-3">{processingMessage || (report.extractedData as any)?.extractionError || ((report.extractedData as any)?.extractionStatus === 'no_measurements' ? 'Document processed; no measurable test results were found.' : '')}</p>
                                        <button
                                            disabled={reprocessing}
                                            onClick={async () => {
                                                setReprocessing(true);
                                                setProcessingMessage('');
                                                try {
                                                    const { reprocessLabReport } = await import('@/app/actions/labReports');
                                                    const res = await reprocessLabReport(report.id);
                                                    if (res.success) window.location.reload();
                                                    else setProcessingMessage(res.message);
                                                } catch {
                                                    setProcessingMessage('Reprocessing failed. Please retry.');
                                                } finally { setReprocessing(false); }
                                            }}
                                            className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition shadow-sm text-sm"
                                        >
                                            {reprocessing ? 'Extracting report…' : 'Re-extract Report Parameters'}
                                        </button>
                                    </div>
                                );
                            }
                        })()}

                    </div>
                </motion.div>
            </main>
            <Footer />
        </div>
    );
}
