"use client";

import { useState, useMemo } from 'react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import Link from 'next/link';
import {
    Activity,
    Droplets,
    Scale,
    Heart,
    Calendar,
    FlaskConical,
    Loader2,
    ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateHealthParametersAnalysis } from '@/app/actions/healthParameters';
import { useRouter } from 'next/navigation';

// Parameters to EXCLUDE from all views (not clinically tracked)
const EXCLUDED_PARAMS = ['weight', 'height'];
// The 4 key parameters to display
const KEY_PARAMS = ['glucose', 'cholesterol', 'pressure', 'hba1c'];

const isExcluded = (paramName: string) =>
    EXCLUDED_PARAMS.some(ex => paramName.toLowerCase().includes(ex));

export default function HealthParameters({
    history,
    analyses,
    highlightParam,
    patientUserId
}: {
    history: any[];
    analyses: Record<string, string>;
    highlightParam?: string;
    patientUserId?: string;
}) {
    const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});
    const [localAnalyses, setLocalAnalyses] = useState<Record<string, string>>({});
    const [visibleAnalyses, setVisibleAnalyses] = useState<Record<string, boolean>>({});
    const router = useRouter();

    // Filter out Weight and Height globally
    const filteredHistory = useMemo(() =>
        history.filter(r => !isExcluded(r.parameterName || '')),
        [history]);

    // Group history by CALENDAR DATE (YYYY-MM-DD) so same-day tests appear in one card
    const groupedHistory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredHistory.forEach(record => {
            // Normalise to just YYYY-MM-DD, stripping any time component
            const calendarDate = (record.testDate || '').toString().slice(0, 10);
            if (!groups[calendarDate]) groups[calendarDate] = [];
            groups[calendarDate].push(record);
        });

        return Object.entries(groups)
            .map(([date, records]) => {
                const dateObj = new Date(date);
                const day = dateObj.getDate();
                const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
                const year = dateObj.getFullYear().toString().slice(-2);

                return {
                    date,
                    fullDate: dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                    shortDate: `${day} ${month} '${year}`,
                    records,
                    labReportId: records[0]?.labReportId
                };
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filteredHistory]);

    // Prepare Chart Data
    const chartData = useMemo(() => {
        return [...groupedHistory].reverse().map(group => {
            const dataPoint: any = { date: group.shortDate };
            group.records.forEach(r => {
                const val = parseFloat(r.value.replace(/[^0-9.]/g, ''));
                if (!isNaN(val)) {
                    if (r.parameterName.includes('Glucose')) dataPoint.glucose = val;
                    if (r.parameterName.includes('Pressure')) dataPoint.bp = val;
                    if (r.parameterName.includes('HbA1c')) dataPoint.hba1c = val;
                    if (r.parameterName.includes('Cholesterol')) dataPoint.cholesterol = val;
                }
            });
            return dataPoint;
        });
    }, [groupedHistory]);

    const handleGenerateAnalysis = async (date: string, parameters: any[], patientId: string) => {
        if (!date || !parameters || parameters.length === 0) {
            console.warn("No parameters provided for analysis");
            return;
        }

        console.log("Starting analysis for date:", date);
        setAnalyzingIds(prev => ({ ...prev, [date]: true }));

        try {
            const result = await generateHealthParametersAnalysis(
                parameters,
                date,
                patientId
            );
            console.log("Analysis result:", result);

            if (result.success && result.analysis) {
                setLocalAnalyses(prev => ({ ...prev, [date]: result.analysis }));
                setVisibleAnalyses(prev => ({ ...prev, [date]: true }));
                router.refresh();
            } else {
                console.error("Analysis generation failed:", result.error || "Unknown error");
                // Set error message in local analyses
                setLocalAnalyses(prev => ({
                    ...prev,
                    [date]: `<div class="p-4 bg-red-50 text-red-600 rounded-xl">Unable to generate analysis. ${result.error || 'Please try again later.'}</div>`
                }));
            }
        } catch (error) {
            console.error("Analysis failed with exception:", error);
            setLocalAnalyses(prev => ({
                ...prev,
                [date]: `<div class="p-4 bg-red-50 text-red-600 rounded-xl">Failed to generate analysis. Please check your connection and try again.</div>`
            }));
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
            {/* Page Heading & Back Navigation */}
            <div className="px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
                        Health <span className="text-teal-600">Parameters</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Track and analyze your health metrics over time</p>
                </div>
                <Link
                    href={patientUserId ? `/dashboard?patientUserId=${patientUserId}` : '/dashboard'}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-colors self-start sm:self-auto"
                >
                    <ArrowLeft className="w-4 h-4 text-slate-500" />
                    Back to Dashboard
                </Link>
            </div>

            {/* Visual Progress Bar Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm"
            >
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 mb-3 sm:mb-4 md:mb-6">Health Trends Overview</h3>

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

                            <Bar dataKey="glucose" name="Blood Glucose (mg/dL)" fill="#ec4899" radius={[6, 6, 0, 0]} animationDuration={1500} maxBarSize={40} />
                            <Bar dataKey="bp" name="Blood Pressure (mmHg)" fill="#10b981" radius={[6, 6, 0, 0]} animationDuration={1500} maxBarSize={40} />
                            <Bar dataKey="cholesterol" name="Cholesterol (mg/dL)" fill="#f43f5e" radius={[6, 6, 0, 0]} animationDuration={1500} maxBarSize={40} />
                            <Bar dataKey="hba1c" name="HbA1c (%)" fill="#8b5cf6" radius={[6, 6, 0, 0]} animationDuration={1500} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Custom Mobile Legend - 2x2 Grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 sm:hidden">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-pink-500 flex-shrink-0"></div>
                        <span className="text-[9px] font-semibold text-slate-700">Blood Glucose (mg/dL)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                        <span className="text-[9px] font-semibold text-slate-700">Blood Pressure (mmHg)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"></div>
                        <span className="text-[9px] font-semibold text-slate-700">Cholesterol (mg/dL)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0"></div>
                        <span className="text-[9px] font-semibold text-slate-700">HbA1c (%)</span>
                    </div>
                </div>

            </motion.div>

            {/* OLD CARDS - TO BE REMOVED */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" style={{ display: 'none' }}>
                {(() => {
                    const getParameterData = (paramKey: string) => {
                        return chartData.map(d => ({
                            date: d.date,
                            value: d[paramKey]
                        })).filter(d => d.value !== null);
                    };

                    const getLatestValue = (paramKey: string) => {
                        const data = getParameterData(paramKey);
                        return data.length > 0 ? data[data.length - 1].value : null;
                    };

                    const getTrendDirection = (paramKey: string) => {
                        const data = getParameterData(paramKey);
                        if (data.length < 2) return 'stable';
                        const first = data[0].value as number;
                        const last = data[data.length - 1].value as number;
                        if (last < first) return 'down';
                        if (last > first) return 'up';
                        return 'stable';
                    };

                    const metrics = [
                        {
                            key: 'glucose',
                            name: 'Blood Glucose',
                            unit: 'mg/dL',
                            color: '#ec4899',
                            bgGradient: 'from-pink-500 to-pink-600',
                            icon: Droplets,
                            goodTrend: 'down'
                        },
                        {
                            key: 'bp',
                            name: 'Blood Pressure',
                            unit: 'mmHg',
                            color: '#10b981',
                            bgGradient: 'from-emerald-500 to-emerald-600',
                            icon: Heart,
                            goodTrend: 'stable'
                        },
                        {
                            key: 'cholesterol',
                            name: 'Cholesterol',
                            unit: 'mg/dL',
                            color: '#f43f5e',
                            bgGradient: 'from-rose-500 to-rose-600',
                            icon: Activity,
                            goodTrend: 'down'
                        },
                        {
                            key: 'hba1c',
                            name: 'HbA1c',
                            unit: '%',
                            color: '#8b5cf6',
                            bgGradient: 'from-purple-500 to-purple-600',
                            icon: FlaskConical,
                            goodTrend: 'down'
                        },
                    ];

                    return metrics.map(metric => {
                        const data = getParameterData(metric.key);
                        const latestValue = getLatestValue(metric.key);
                        const trend = getTrendDirection(metric.key);
                        const Icon = metric.icon;

                        if (data.length === 0) return null;

                        const isGoodTrend = (trend === metric.goodTrend) || (trend === 'stable');

                        return (
                            <motion.div
                                key={metric.key}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className={`p-2 bg-gradient-to-br ${metric.bgGradient} rounded-xl shadow-sm`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>
                                    {trend !== 'stable' && (
                                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${isGoodTrend ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {trend === 'down' ? (
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                </svg>
                                            ) : (
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                </svg>
                                            )}
                                            <span className="text-[10px] font-bold">{isGoodTrend ? 'Good' : 'Alert'}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Value */}
                                <div className="mb-2">
                                    <p className="text-xs text-slate-500 font-medium mb-1">{metric.name}</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black text-slate-900">{latestValue}</span>
                                        <span className="text-xs text-slate-400 font-medium">{metric.unit}</span>
                                    </div>
                                </div>

                                {/* Mini Sparkline */}
                                <div className="h-12 -mx-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data}>
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                stroke={metric.color}
                                                strokeWidth={2}
                                                dot={false}
                                                animationDuration={1000}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Date Range */}
                                <p className="text-[10px] text-slate-400 mt-2 text-center">
                                    {data[0].date} → {data[data.length - 1].date}
                                </p>
                            </motion.div>
                        );
                    });
                })()}
            </div>

            {/* History List */}
            <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 px-1">Detailed Reports</h3>

                {groupedHistory.map((group, groupIdx) => {
                    // Deduplicate records in this group by parameterName (keep last/latest per name)
                    const dedupMap = new Map<string, any>();
                    group.records.forEach((r: any) => {
                        dedupMap.set(r.parameterName?.toLowerCase(), r);
                    });
                    const uniqueRecords = Array.from(dedupMap.values());

                    // Use local state for analysis (keyed by date)
                    const analysis = localAnalyses[group.date];
                    const isAnalyzing = analyzingIds[group.date] || false;
                    const patientId = group.records[0]?.patientId || '';

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
                                                handleGenerateAnalysis(group.date, group.records, patientId);
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
                                        // Infer unit if missing
                                        const getUnit = (rec: any) => {
                                            if (rec.unit && rec.unit.trim() !== '') return rec.unit;
                                            const name = rec.parameterName?.toLowerCase() || '';
                                            if (name.includes('pressure')) return 'mmHg';
                                            if (name.includes('glucose') || name.includes('cholesterol')) return 'mg/dL';
                                            if (name.includes('hba1c')) return '%';
                                            return '';
                                        };
                                        const unit = getUnit(record);
                                        // Normalize status: default to 'Normal' if missing and value exists
                                        let statusValue = record.status?.toLowerCase() || '';
                                        if (!statusValue && record.value) {
                                            statusValue = 'normal';
                                        }

                                        const isAbnormal = statusValue.includes('high') || statusValue.includes('low') || statusValue.includes('critical');
                                        const isHighlighted = !!highlightParam && record.parameterName?.toLowerCase().includes(highlightParam.toLowerCase());

                                        return (
                                            <div
                                                key={idx}
                                                className={`rounded-lg sm:rounded-xl p-3 h-full flex flex-col justify-between transition-all ${
                                                    isHighlighted
                                                        ? 'bg-teal-50/80 border-2 border-teal-500 shadow-sm ring-2 ring-teal-200'
                                                        : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-1.5 mb-2 text-slate-500 text-[10px] sm:text-xs font-medium">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        {getParamIcon(record.parameterName)}
                                                        <span className={`truncate ${isHighlighted ? 'font-black text-teal-900' : ''}`} title={record.parameterName}>{record.parameterName}</span>
                                                    </div>
                                                    {isHighlighted && (
                                                        <span className="shrink-0 text-[8px] font-black uppercase bg-teal-600 text-white px-1.5 py-0.5 rounded-full">
                                                            Selected
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-1 mt-auto">
                                                    <span className={`text-base sm:text-lg font-black ${isAbnormal ? 'text-red-600' : 'text-emerald-600'
                                                        }`}>
                                                        {cleanValue(record.value)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium">{unit}</span>
                                                </div>
                                                {/* Status Badge */}
                                                <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${isAbnormal ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {statusValue}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* AI Analysis button - only show on mobile, after parameters */}
                                <div className="sm:hidden mt-3">
                                    <button
                                        className="w-full group relative px-4 py-2.5 bg-white/80 backdrop-blur-md border border-teal-200/50 hover:border-teal-300 hover:bg-teal-50/50 text-teal-700 hover:text-teal-800 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (analysis) {
                                                setVisibleAnalyses(prev => ({ ...prev, [group.date]: !prev[group.date] }));
                                            } else if (!isAnalyzing) {
                                                handleGenerateAnalysis(group.date, group.records, patientId);
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
                                                                    handleGenerateAnalysis(group.date, group.records, patientId);
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
