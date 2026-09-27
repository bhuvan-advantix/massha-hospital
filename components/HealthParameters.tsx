"use client";

import { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import {
    Activity,
    Droplets,
    Scale,
    Heart,
    Calendar,
    FlaskConical,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateLabAnalysis } from '@/app/actions/labReports';
import { useRouter } from 'next/navigation';

export default function HealthParameters({ history, analyses }: { history: any[], analyses: Record<string, string> }) {
    const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});
    const [localAnalyses, setLocalAnalyses] = useState<Record<string, string>>({});
    const [visibleAnalyses, setVisibleAnalyses] = useState<Record<string, boolean>>({});
    const router = useRouter();
    const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});

    const filteredHistory = history;
    const metricKeys = [...new Set(history.map(r => `${r.parameterName} (${r.unit || 'unit not provided'})`))];
    const [selectedMetric, setSelectedMetric] = useState('');
    const activeMetric = metricKeys.includes(selectedMetric) ? selectedMetric : metricKeys[0] || '';

    // Keep each source report separate, including multiple reports on the same day.
    const groupedHistory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredHistory.forEach(record => {
            // Legacy unlinked parameters are grouped by their recorded date.
            const calendarDate = record.labReportId || (record.testDate || 'undated').toString().slice(0, 10);
            if (!groups[calendarDate]) groups[calendarDate] = [];
            groups[calendarDate].push(record);
        });

        return Object.entries(groups)
            .map(([date, records]) => {
                const dateObj = new Date(records[0]?.testDate || '');
                const hasDate = !Number.isNaN(dateObj.getTime());
                const day = dateObj.getDate();
                const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
                const year = dateObj.getFullYear().toString().slice(-2);

                return {
                    date,
                    fullDate: hasDate ? dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Report date not provided',
                    shortDate: hasDate ? `${day} ${month} '${year}` : 'Undated',
                    sortDate: hasDate ? dateObj.getTime() : 0,
                    records,
                    labReportId: records[0]?.labReportId
                };
            })
            .sort((a, b) => b.sortDate - a.sortDate);
    }, [filteredHistory]);

    const chartData = useMemo(() => [...groupedHistory].reverse().flatMap(group => {
        const record = group.records.find(r => `${r.parameterName} (${r.unit || 'unit not provided'})` === activeMetric);
        const text = String(record?.value ?? '').trim();
        if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return [];
        return [{ date: group.shortDate, value: Number(text) }];
    }), [groupedHistory, activeMetric]);

    const handleGenerateAnalysis = async (date: string, parameters: any[]) => {
        if (!date || !parameters || parameters.length === 0) {
            console.warn("No parameters provided for analysis");
            return;
        }

        console.log("Starting analysis for date:", date);
        setAnalyzingIds(prev => ({ ...prev, [date]: true }));
        setAnalysisErrors(prev => ({ ...prev, [date]: '' }));

        try {
            const reportId = parameters[0]?.labReportId;
            if (!reportId) throw new Error('No source report is linked to these parameters');
            const result = await generateLabAnalysis(reportId);
            console.log("Analysis result:", result);

            if (result.success && result.analysis) {
                setLocalAnalyses(prev => ({ ...prev, [date]: result.analysis }));
                setVisibleAnalyses(prev => ({ ...prev, [date]: true }));
                router.refresh();
            } else {
                console.error("Analysis generation failed:", result.error || "Unknown error");
                setAnalysisErrors(prev => ({ ...prev, [date]: result.error || 'Unable to generate analysis. Please retry.' }));
            }
        } catch {
            setAnalysisErrors(prev => ({ ...prev, [date]: 'Unable to generate analysis. Please retry.' }));
        } finally {
            setAnalyzingIds(prev => ({ ...prev, [date]: false }));
        }
    };

    const getParamIcon = (param: string) => {
        if (param.includes('Glucose')) return <Droplets className="w-4 h-4 text-pink-500" />;
        if (param.includes('Pressure')) return <Activity className="w-4 h-4 text-emerald-500" />;
        if (param.includes('HbA1c')) return <Scale className="w-4 h-4 text-violet-500" />;
        if (param.includes('Cholesterol')) return <Heart className="w-4 h-4 text-rose-500" />;
        return <Activity className="w-4 h-4 text-slate-500" />;
    };

    const cleanValue = (val: string | null) => {
        if (!val) return null;
        let cleaned = val.replace(/^[HLNhln]\s+/, '').replace(/^(High|Low|Normal)\s+/i, '').trim();
        cleaned = cleaned.replace(/\s*mm\s*Hg$/i, '').replace(/\s*mg\/dL$/i, '').replace(/\s*%$/, '').trim();
        return cleaned;
    };

    // --- Empty State Check ---
    if (!filteredHistory || filteredHistory.length === 0) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-12 sm:py-20 flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                    <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center animate-pulse">
                        <Activity className="w-10 h-10 text-teal-500" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-ping" />
                    </div>
                </div>

                <div className="space-y-2 max-w-lg">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                        No Health Parameters Yet
                    </h2>
                    <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
                        We haven't found any health metrics to track. Upload your first lab report to automatically extract and visualize key parameters like <span className="font-semibold text-teal-600">Blood Glucose</span>, <span className="font-semibold text-teal-600">Cholesterol</span>, and <span className="font-semibold text-teal-600">Blood Pressure</span>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
            {/* Page Heading */}
            <div className="px-1">
                <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
                    Health <span className="text-teal-600">Parameters</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">Track and analyze your health metrics over time</p>
            </div>

            {/* Visual Progress Bar Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm"
            >
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 mb-3">Health Trends Overview</h3>
                <label className="block text-sm text-slate-600 mb-4">Parameter
                    <select value={activeMetric} onChange={event => setSelectedMetric(event.target.value)} className="block w-full rounded-lg border border-slate-200 p-2 mt-1">
                        {metricKeys.map(key => <option key={key} value={key}>{key}</option>)}
                    </select>
                </label>
                {!chartData.length && <p className="text-sm text-slate-500">This result has no numeric measurements to chart.</p>}

                <div className="h-[280px] sm:h-[350px] md:h-[450px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }}
                                height={45}
                                interval={0}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }}
                                width={35}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                    padding: '12px',
                                    backgroundColor: 'white',
                                    fontSize: '12px'
                                }}
                                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                                labelStyle={{ fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '11px' }}
                            />
                            {/* Legend - visible on desktop only, custom legend on mobile */}
                            <Legend
                                wrapperStyle={{ paddingTop: '15px', paddingBottom: '5px', fontSize: '10px' }}
                                iconType="circle"
                                iconSize={10}
                                content={(props) => {
                                    // Hide on mobile (width < 640px)
                                    if (typeof window !== 'undefined' && window.innerWidth < 640) {
                                        return null;
                                    }
                                    // Default legend for desktop
                                    const { payload } = props;
                                    return (
                                        <ul style={{ display: 'flex', justifyContent: 'center', gap: '20px', paddingTop: '15px', paddingBottom: '5px', listStyle: 'none' }}>
                                            {payload?.map((entry: any, index: number) => (
                                                <li key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <svg width="10" height="10">
                                                        <circle cx="5" cy="5" r="5" fill={entry.color} />
                                                    </svg>
                                                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{entry.value}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    );
                                }}
                            />

                            <Bar dataKey="value" name={activeMetric} fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </motion.div>

            {/* History List */}
            <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 px-1">Detailed Reports</h3>

                {groupedHistory.map((group, groupIdx) => {
                    // Deduplicate records in this group by parameterName (keep last/latest per name)
                    const dedupMap = new Map<string, any>();
                    group.records.forEach((r: any) => {
                        dedupMap.set(`${r.parameterName?.toLowerCase()}|${r.unit || ""}`, r);
                    });
                    const uniqueRecords = Array.from(dedupMap.values());

                    // Use local state for analysis (keyed by date)
                    const analysis = localAnalyses[group.date] || analyses[group.labReportId];
                    const isAnalyzing = analyzingIds[group.date] || false;

                    return (
                        <motion.div
                            key={group.date}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: groupIdx * 0.1 }}
                            className="bg-white rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                        >
                            <div className="p-3 sm:p-4">
                                <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm sm:text-base font-bold text-slate-900">{group.fullDate}</h4>
                                            <p className="text-xs sm:text-sm text-slate-500">{uniqueRecords.length} Parameter{uniqueRecords.length !== 1 ? 's' : ''} Tested</p>
                                        </div>
                                    </div>
                                    {/* AI Analysis button - only show on desktop */}
                                    <button
                                        className="hidden sm:flex group relative px-4 py-2 bg-white/80 backdrop-blur-md border border-teal-200/50 hover:border-teal-300 hover:bg-teal-50/50 text-teal-700 hover:text-teal-800 rounded-xl font-semibold text-sm transition-all duration-300 items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (analysis) {
                                                setVisibleAnalyses(prev => ({ ...prev, [group.date]: !prev[group.date] }));
                                            } else if (!isAnalyzing) {
                                                handleGenerateAnalysis(group.date, group.records);
                                            }
                                        }}
                                        disabled={isAnalyzing}
                                    >
                                        <FlaskConical className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                                        <span>{analysis ? (visibleAnalyses[group.date] ? 'Hide Analysis' : 'Show Analysis') : 'AI Analysis'}</span>
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 items-stretch">
                                    {uniqueRecords.map((record: any, idx: number) => {
                                        const unit = record.unit || '';
                                        const statusValue = record.status?.toLowerCase() || 'Not assessed';

                                        const isAbnormal = statusValue.includes('high') || statusValue.includes('low') || statusValue.includes('critical');


                                        return (
                                            <div key={idx} className="bg-slate-50 rounded-lg sm:rounded-xl p-3 h-full flex flex-col justify-between hover:bg-slate-100 transition-colors">
                                                <div className="flex items-center gap-1.5 mb-2 text-slate-500 text-[10px] sm:text-xs font-medium">
                                                    {getParamIcon(record.parameterName)}
                                                    <span className="truncate" title={record.parameterName}>{record.parameterName}</span>
                                                </div>
                                                <div className="flex items-baseline gap-1 mt-auto">
                                                    <span className={`text-base sm:text-lg font-black ${isAbnormal ? 'text-red-600' : 'text-emerald-600'
                                                        }`}>
                                                        {cleanValue(record.value)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium">{unit}</span>
                                                </div>
                                                {/* Reported status */}
                                                <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${isAbnormal ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {statusValue}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {analysisErrors[group.date] && <p role="alert" className="mt-3 text-sm text-red-600">{analysisErrors[group.date]}</p>}
                                {/* AI Analysis button - only show on mobile, after parameters */}
                                <div className="sm:hidden mt-3">
                                    <button
                                        className="w-full group relative px-4 py-2.5 bg-white/80 backdrop-blur-md border border-teal-200/50 hover:border-teal-300 hover:bg-teal-50/50 text-teal-700 hover:text-teal-800 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (analysis) {
                                                setVisibleAnalyses(prev => ({ ...prev, [group.date]: !prev[group.date] }));
                                            } else if (!isAnalyzing) {
                                                handleGenerateAnalysis(group.date, group.records);
                                            }
                                        }}
                                        disabled={isAnalyzing}
                                    >
                                        <FlaskConical className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                                        <span>{analysis ? (visibleAnalyses[group.date] ? 'Hide Analysis' : 'Show Analysis') : 'AI Analysis'}</span>
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence>
                                {(visibleAnalyses[group.date] || isAnalyzing) && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="bg-gradient-to-br from-teal-50/50 to-white border-t border-slate-100"
                                    >
                                        <div className="p-5">
                                            <div className="flex items-start gap-4">
                                                <div className="flex-1 w-full">
                                                    <h5 className="font-bold text-slate-900 text-sm mb-4">AI Health Analysis</h5>

                                                    {isAnalyzing ? (
                                                        <div className="flex items-center gap-2 text-teal-600 py-4">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            <span className="text-sm font-medium">Generating health insights...</span>
                                                        </div>
                                                    ) : analysis ? (
                                                        <>
                                                            <div
                                                                className="prose prose-sm max-w-none text-slate-600"
                                                                dangerouslySetInnerHTML={{ __html: analysis }}
                                                            />
                                                            <p className="mt-6 text-center text-xs text-slate-400 italic border-t border-slate-100 pt-4">
                                                                <span className="font-semibold">Disclaimer:</span> This analysis is AI-generated and for informational purposes only. Please consult a qualified healthcare professional for medical advice and treatment.
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-red-400 text-sm">
                                                            <span>Analysis unavailable.</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleGenerateAnalysis(group.date, group.records);
                                                                }}
                                                                className="font-bold underline cursor-pointer hover:text-red-700 transition-colors"
                                                                disabled={isAnalyzing}
                                                            >
                                                                Retry
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
