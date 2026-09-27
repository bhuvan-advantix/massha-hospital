"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Stethoscope,
    Clock,
    ShieldCheck,
    Activity,
    HeartPulse,
    Info,
} from 'lucide-react';
import { EarlyDetectionResult, EarlyRiskFlag } from '@/lib/aiEarlyDetection';

interface Props {
    data: EarlyDetectionResult;
    patientName?: string;
    isDoctorView?: boolean;
}

const DOMAIN_META: Record<string, { icon: React.ReactNode; color: string; textColor: string; label: string; short: string }> = {
    'Renal & Nephrology':    { icon: <Activity className="w-4 h-4" />, color: 'bg-violet-100 border-violet-200', textColor: 'text-violet-800', label: 'Kidney & Renal', short: 'Kidney' },
    'Cardiovascular':         { icon: <HeartPulse className="w-4 h-4" />, color: 'bg-rose-100 border-rose-200', textColor: 'text-rose-800', label: 'Cardiovascular', short: 'Heart & BP' },
    'Endocrine & Thyroid':   { icon: <Activity className="w-4 h-4" />, color: 'bg-amber-100 border-amber-200', textColor: 'text-amber-800', label: 'Thyroid & Endocrine', short: 'Thyroid' },
    'Hepatic & Metabolic':   { icon: <Activity className="w-4 h-4" />, color: 'bg-orange-100 border-orange-200', textColor: 'text-orange-800', label: 'Liver & Metabolic', short: 'Liver' },
    'Oncology':               { icon: <ShieldCheck className="w-4 h-4" />, color: 'bg-red-100 border-red-200', textColor: 'text-red-800', label: 'Oncology', short: 'Cancer Screen' },
    'Pulmonary':              { icon: <Activity className="w-4 h-4" />, color: 'bg-sky-100 border-sky-200', textColor: 'text-sky-800', label: 'Pulmonary', short: 'Lungs' },
};

const SEVERITY_META: Record<string, { cls: string; label: string }> = {
    'Critical': { cls: 'bg-red-500 text-white',    label: 'Critical' },
    'Elevated': { cls: 'bg-orange-500 text-white',  label: 'Elevated' },
    'Moderate': { cls: 'bg-amber-400 text-white',   label: 'Moderate' },
    'Mild':     { cls: 'bg-slate-400 text-white',   label: 'Mild' },
};

// Clean short disease names
function getDiseaseShortName(flag: EarlyRiskFlag): string {
    const map: Record<string, string> = {
        'renal-diabetic-nephropathy': 'Diabetic Kidney Disease',
        'cardio-hypertension':        'Hypertension',
        'endocrine-thyroid':          'Hypothyroidism',
        'hepatic-steatosis':          'Fatty Liver (NAFLD)',
        'oncology-biomarker':         'Oncology Surveillance',
    };
    return map[flag.id] || flag.disease.split('&')[0].trim();
}

export default function AIEarlyDetectionCard({ data, patientName = "Patient", isDoctorView = false }: Props) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedFlag = data.detectedRisks.find(flag => flag.id === selectedId) || data.detectedRisks[0] || null;

    const hasRisks = data.detectedRisks.length > 0;
    const isCritical = data.overallRiskLevel === 'Critical Alert';
    const isElevated = data.overallRiskLevel === 'Elevated Risk';
    const isModerate = data.overallRiskLevel === 'Moderate Watch';

    const insufficient = data.overallRiskLevel === 'Insufficient data';
    const bannerCls = insufficient ? 'bg-slate-50 border-slate-200 text-slate-700' : isCritical
        ? 'bg-red-50 border-red-200 text-red-900'
        : isElevated
        ? 'bg-orange-50 border-orange-200 text-orange-900'
        : isModerate
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-emerald-50 border-emerald-200 text-emerald-900';

    const bannerIconCls = insufficient ? 'bg-slate-400' : isCritical ? 'bg-red-500' : isElevated ? 'bg-orange-500' : isModerate ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="w-full font-sans">
            {/* ── Compact Top Banner ── */}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border mb-3 ${bannerCls}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${bannerIconCls}`}>
                        {hasRisks
                            ? <AlertTriangle className="w-4 h-4 text-white" />
                            : <CheckCircle2 className="w-4 h-4 text-white" />
                        }
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider opacity-70">{data.overallRiskLevel}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-bold truncate">
                                {hasRisks
                                    ? `Early indicators detected for: ${data.detectedRisks.map(r => getDiseaseShortName(r)).join(' · ')}`
                                    : data.summaryText}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white border border-current/20 text-xs font-bold flex items-center gap-1 shrink-0 transition-all"
                >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isExpanded ? 'Collapse' : 'View Report'}
                </button>
            </div>

            {/* ── Main AI Card ── */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="bg-white rounded-3xl border border-slate-200/80 shadow-lg overflow-hidden"
                    >
                        {/* Header */}
                        <div className="bg-slate-900 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-teal-900/30 to-transparent pointer-events-none" />
                            <div className="flex items-center gap-3 z-10">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shrink-0">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                                        Niraiva AI — Early Disease Detection
                                        <span className="text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Report-based screening for <span className="text-teal-300 font-semibold">{patientName}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 z-10">
                                <div className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide border ${
                                    isCritical ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                    isElevated ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                    isModerate ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                }`}>
                                    {data.overallRiskLevel}
                                </div>
                            </div>
                        </div>

                        <div className="p-5 sm:p-6 space-y-5">
                            {!hasRisks ? (
                                <div className={`flex items-center gap-4 p-5 rounded-2xl border ${insufficient ? "bg-slate-50 border-slate-200" : "bg-emerald-50 border-emerald-100"}`}>
                                    {insufficient ? <Info className="w-8 h-8 text-slate-500 shrink-0" /> : <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />}
                                    <div>
                                        <p className="font-bold text-emerald-900 text-sm">{data.overallRiskLevel}</p>
                                        <p className="text-xs text-emerald-700 mt-0.5">{data.summaryText}</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* ── Disease Summary Cards ── */}
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                            Flagged Report Results — {data.detectedRisks.length} Found
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {data.detectedRisks.map((flag) => {
                                                const meta = DOMAIN_META[flag.domain] || { icon: <Activity className="w-4 h-4" />, color: 'bg-slate-100 border-slate-200', textColor: 'text-slate-800', label: flag.domain, short: flag.domain };
                                                const sev = SEVERITY_META[flag.severity] || SEVERITY_META['Moderate'];
                                                const isSelected = selectedFlag?.id === flag.id;
                                                return (
                                                    <button
                                                        key={flag.id}
                                                        onClick={() => setSelectedId(flag.id)}
                                                        className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
                                                            isSelected
                                                                ? 'border-teal-500 bg-teal-50 shadow-sm shadow-teal-100'
                                                                : 'border-slate-100 bg-white hover:border-teal-200 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${meta.color} ${meta.textColor}`}>
                                                                {meta.icon}
                                                                {meta.label}
                                                            </div>
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${sev.cls}`}>
                                                                {sev.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-extrabold text-slate-900 leading-tight">
                                                            {getDiseaseShortName(flag)}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1">
                                                            <Stethoscope className="w-3 h-3 text-teal-500" />
                                                            {flag.recommendedSpecialist}
                                                        </p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ── Detail Panel for Selected Disease ── */}
                                    {selectedFlag && (
                                        <motion.div
                                            key={selectedFlag.id}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                                                <div>
                                                    <p className="text-[11px] font-black text-teal-600 uppercase tracking-wider">{selectedFlag.domain} — Clinical Detail</p>
                                                    <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{getDiseaseShortName(selectedFlag)}</h4>
                                                </div>
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shadow-sm shrink-0">
                                                    <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                                                    Consult: {selectedFlag.recommendedSpecialist}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Biomarkers */}
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Flagged Biomarkers & Vitals</p>
                                                    <div className="space-y-1.5">
                                                        {selectedFlag.indicators.map((ind, i) => (
                                                            <div key={i} className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                                                                <span className="text-xs font-semibold text-rose-900">{ind}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    {selectedFlag.trend1Year && (
                                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" /> Recorded Results
                                                            </p>
                                                            <p className="text-xs font-semibold text-amber-900">{selectedFlag.trend1Year}</p>
                                                        </div>
                                                    )}
                                                    <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                                                        <p className="text-[10px] font-black text-teal-700 uppercase tracking-wider mb-1">Recommended Action</p>
                                                        <p className="text-xs font-semibold text-teal-900">{selectedFlag.actionPlan}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </>
                            )}

                            {/* ── One-Line Disclaimer ── */}
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <p className="text-[11px] text-slate-400 font-medium">
                                    <span className="font-bold text-slate-500">Disclaimer:</span> This AI screening is for early awareness only — not a medical diagnosis. Please consult your doctor for clinical evaluation.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
