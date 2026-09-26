"use client";


import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { addMedication, stopMedication, restartMedication } from '@/app/actions/medications';
import { uploadLabReport, getLabReports, deleteLabReport, processUploadedReport } from '@/app/actions/labReports';
import { getCloudinarySignature } from '@/app/actions/cloudinarySignature';
import confetti from 'canvas-confetti';
import { useRouter } from 'next/navigation';
import { signOut } from "next-auth/react";
import {
    LayoutDashboard,
    Clock,
    Stethoscope,
    UploadCloud,
    FileText,
    Pill,
    Activity,
    Heart,
    Droplets,
    Scale,
    AlertCircle,
    CheckCircle2,
    User,
    LogOut,
    Menu,
    X,
    ChevronDown,
    Phone,
    Fingerprint,
    Shield,
    Droplet,
    Ruler,
    Weight,
    HeartPulse,
    Tablet,
    Contact,
    MapPin,
    Sparkles,
    Plus,
    Ban,
    Play,
    Settings,
    HelpCircle,
    Edit2,
    Calendar,
    ArrowUpRight,
    Download
} from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import HelpSupportView from '@/components/HelpSupportView';
import DashboardNavbar from '@/components/DashboardNavbar';
import LabReports from '@/components/LabReports';
import Footer from '@/components/Footer';
import { buildOncologyBrief } from '@/lib/oncologyDemo';
import AIEarlyDetectionCard from '@/components/AIEarlyDetectionCard';
import { analyzePatientEarlyDetection } from '@/lib/aiEarlyDetection';

// --- Dashboard Components ---

interface HealthCardProps {
    user: {
        name: string;
        customId: string;
        image: string | null;
    };
    patient: {
        bloodGroup?: string | null;
        emergencyContactPhone?: string | null;
        emergencyContactName?: string | null;
        dateOfBirth?: string | null; // Matched with schema property
        dob?: string | null;
        age?: number | null;
        gender?: string | null;
        height?: string | null;
        weight?: string | null;
        allergies?: string | null;
        currentMedications?: string | null;
        chronicConditions?: string | null;
        maritalStatus?: string | null;
        address?: string | null;
        city?: string | null;
        medications?: any[] | null;
    } | null;
}

function HealthCard({ user, patient }: HealthCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);

    // Format ID securely (e.g., #NRIV-8392-1029) - Fallback to PENDING if not set
    const formattedId = user.customId || "PENDING";

    // Helper for safe display of optional fields
    // Helper for safe display of optional fields
    const displayValue = (val: string | number | null | undefined) => val ? val : "N/A";

    // Helper to format list items with bold text and separator
    const formatList = (val: string | null | undefined) => {
        if (!val) return "None";

        // Split by comma, clean special chars (keep alphanumeric and spaces), trim
        const items = val.split(',').map(item => item.replace(/[^a-zA-Z0-9 ]/g, '').trim()).filter(Boolean);

        if (items.length === 0) return "None";

        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <span className="font-bold text-slate-800">{item}</span>
                        {index < items.length - 1 && (
                            <span className="text-slate-300 text-[8px] md:text-[10px] mx-0.5">||</span>
                        )}
                    </React.Fragment>
                ))}
            </span>
        );
    };

    const calculateAge = (dobString: string | null | undefined) => {
        if (!dobString) return null;
        const today = new Date();
        const birthDate = new Date(dobString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const realAge = calculateAge(patient?.dateOfBirth || patient?.dob) || patient?.age;

    // Logic to combine and deduplicate medications for the card
    const getCombinedMedications = () => {
        const uniqueNames = new Set<string>();
        const stoppedNames = new Set<string>();

        // 1. Identify Stopped or Hidden meds first to block them
        patient?.medications?.forEach((m: any) => {
            if (m.status === 'Stopped' || m.status === 'Hidden') {
                stoppedNames.add(m.name.toLowerCase());
            }
        });

        // 2. Add Active DB meds
        patient?.medications?.forEach((m: any) => {
            if (m.status !== 'Stopped' && m.status !== 'Hidden') {
                uniqueNames.add(m.name);
            }
        });

        // 3. Add Legacy meds if not already present AND not stopped
        const legacyMedsString = patient?.currentMedications || "";
        const legacyList = legacyMedsString.split(',').map(s => s.replace(/[^a-zA-Z0-9 ]/g, '').trim()).filter(Boolean);

        legacyList.forEach(name => {
            const lowerName = name.toLowerCase();
            // Don't add if it's known as stopped
            if (stoppedNames.has(lowerName)) return;

            // Don't add if already in uniqueNames (case-insensitive check best, but uniqueNames check is exact)
            // Let's check exact for now to match strict logic, or case-insensitive for better dedup
            const exists = Array.from(uniqueNames).some(u => u.toLowerCase() === lowerName);
            if (!exists) uniqueNames.add(name);
        });

        return Array.from(uniqueNames).join(', ');
    };

    const combinedMeds = getCombinedMedications();

    return (
        <div className="perspective-1000 w-[92vw] max-w-[360px] h-[220px] md:w-full md:max-w-[600px] md:h-[360px] mx-auto cursor-pointer group select-none relative" onClick={() => setIsFlipped(!isFlipped)}>
            <motion.div
                className="relative w-full h-full rounded-2xl md:rounded-[28px] shadow-2xl transition-all duration-500 ease-out"
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* ---------------- FRONT FACE (Professional ID) ---------------- */}
                <div className="absolute inset-0 w-full h-full backface-hidden rounded-2xl md:rounded-[28px] overflow-hidden bg-white border border-slate-200 shadow-xl">
                    {/* Header */}
                    <div className="h-[50px] md:h-[88px] bg-slate-50 border-b border-slate-100 flex items-center justify-between px-3 md:px-8">
                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="w-7 h-7 md:w-12 md:h-12 bg-teal-600 rounded-lg md:rounded-2xl flex items-center justify-center shadow-md shadow-teal-200">
                                <Activity className="text-white w-3.5 h-3.5 md:w-7 md:h-7" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-extrabold text-base md:text-2xl text-slate-800 leading-none tracking-tight">Niraiva<span className="text-teal-600">Health</span></span>
                                <span className="text-[7px] md:text-[11px] font-bold text-slate-400 tracking-[0.2em] uppercase mt-0.5 md:mt-1.5">Universal Health ID</span>
                            </div>
                        </div>
                        <div className="px-2 py-0.5 md:px-3 md:py-1 bg-white rounded-full border border-slate-200 shadow-sm flex items-center gap-1 md:gap-2">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[6px] md:text-[10px] font-extrabold text-emerald-600 uppercase tracking-wide">Active</span>
                        </div>
                    </div>

                    {/* Background decor */}
                    <div className="absolute bottom-[-10%] right-[-5%] opacity-[0.04] pointer-events-none">
                        <Fingerprint className="w-80 h-80 text-slate-900" />
                    </div>

                    <div className="p-3 md:p-8 flex gap-3 md:gap-8 h-[calc(100%-50px)] md:h-[calc(100%-88px)] relative z-10">
                        {/* Photo Section */}
                        <div className="flex flex-col items-center gap-1.5 md:gap-3">
                            <div className="w-14 h-14 md:w-32 md:h-32 rounded-xl md:rounded-3xl bg-slate-100 border-2 md:border-4 border-white shadow-lg overflow-hidden relative">
                                {user.image ? (
                                    <Image
                                        src={user.image}
                                        alt="Profile"
                                        width={128}
                                        height={128}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                                        <User className="w-6 h-6 md:w-14 md:h-14" />
                                    </div>
                                )}
                            </div>
                            <div className="text-center">
                                <span className="text-[6px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Blood Type</span>
                                <span className="inline-flex items-center gap-1 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-1 bg-red-50 text-red-600 rounded md:rounded-lg border border-red-100 font-black text-[10px] md:text-sm shadow-sm">
                                    <Droplet className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 fill-red-500" />
                                    {displayValue(patient?.bloodGroup)}
                                </span>
                            </div>
                        </div>

                        {/* Info Section */}
                        <div className="flex-1 flex flex-col justify-center pb-0.5 md:pb-2">
                            <h3 className="text-base md:text-3xl font-black text-slate-900 leading-tight mb-1 md:mb-2 truncate">{user.name}</h3>

                            <div className="mb-2 md:mb-6" id="patient-id">
                                <span className="text-[6px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5 md:mb-1">Patient ID</span>
                                <span className="font-mono text-xs md:text-xl font-black text-teal-700 tracking-wider bg-teal-50/80 px-2 py-0.5 md:px-4 md:py-2 rounded md:rounded-lg border border-teal-100 inline-block">
                                    {formattedId}
                                </span>
                            </div>

                            <div className="flex gap-3 md:gap-8 border-t border-slate-100 pt-2 md:pt-5">
                                <div>
                                    <p className="text-[6px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Age</p>
                                    <p className="text-sm md:text-lg font-bold text-slate-700">{realAge !== null && realAge !== undefined ? `${realAge} Yrs` : "N/A"}</p>
                                </div>
                                <div className="w-px h-6 md:h-10 bg-slate-200"></div>
                                <div>
                                    <p className="text-[6px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Gender</p>
                                    <p className="text-sm md:text-lg font-bold text-slate-700 capitalize">{displayValue(patient?.gender)}</p>
                                </div>
                                <div className="w-px h-6 md:h-10 bg-slate-200"></div>
                                <div>
                                    <p className="text-[6px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Status</p>
                                    <p className="text-sm md:text-lg font-bold text-slate-700 capitalize">{displayValue(patient?.maritalStatus)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ---------------- BACK FACE (Medical Profile) ---------------- */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden rounded-2xl md:rounded-[28px] overflow-hidden bg-white border border-slate-200 shadow-xl"
                    style={{ transform: "rotateY(180deg)" }}
                >
                    {/* Top Highlight Stripe */}
                    <div className="h-1.5 md:h-2 w-full bg-teal-600"></div>

                    <div className="p-3 md:p-5 h-full flex flex-col">

                        {/* Header */}
                        <div className="flex justify-between items-center mb-1.5 md:mb-3">
                            <h4 className="flex items-center gap-1.5 md:gap-2 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <div className="w-4 h-4 md:w-6 md:h-6 bg-teal-50 rounded md:rounded-lg flex items-center justify-center border border-teal-100">
                                    <Stethoscope className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-teal-600" />
                                </div>
                                Medical Profile
                            </h4>
                            <Fingerprint className="w-7 h-7 md:w-9 md:h-9 text-slate-100" />
                        </div>

                        {/* Emergency Contact - Ultra Compact */}
                        <div className="bg-rose-50 border border-rose-100 rounded-lg p-1.5 md:p-2.5 flex items-center gap-2 md:gap-3 mb-1.5 md:mb-2.5 shadow-sm h-8 md:h-auto">
                            <div className="w-6 h-6 md:w-8 md:h-8 rounded bg-white flex items-center justify-center flex-shrink-0 border border-rose-100 text-rose-600">
                                <Phone className="w-3 h-3 md:w-4 md:h-4 fill-rose-600" />
                            </div>
                            <div className="flex-1 flex justify-between items-center">
                                <div>
                                    <p className="text-[5px] md:text-[8px] font-extrabold text-rose-400 uppercase tracking-widest leading-none mb-0.5">Emergency SOS</p>
                                    <p className="text-[10px] md:text-lg font-black text-rose-700 tracking-tight leading-none">
                                        {(patient?.emergencyContactPhone || "N/A").replace('+91', '+91-')}
                                    </p>
                                </div>
                                {patient?.emergencyContactName && (
                                    <div className="text-right pl-2 md:pl-3 border-l border-rose-200">
                                        <p className="text-[5px] md:text-[8px] font-bold text-rose-400 uppercase tracking-wide leading-none mb-0.5">Contact</p>
                                        <p className="text-[7px] md:text-[10px] font-bold text-rose-700 leading-none whitespace-nowrap">{patient.emergencyContactName}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Address Section - Compact */}
                        <div className="flex items-center gap-2 md:gap-2.5 bg-slate-50 rounded-lg p-1.5 md:p-2 border border-slate-100 mb-1.5 md:mb-2.5 h-7 md:h-auto">
                            <div className="w-5 h-5 md:w-7 md:h-7 rounded bg-white flex items-center justify-center flex-shrink-0 border border-slate-100 text-slate-400">
                                <MapPin className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[5px] md:text-[8px] font-bold text-slate-400 uppercase tracking-wide leading-none mb-0.5">Resident Location</p>
                                <p className="text-[7px] md:text-[10px] font-bold text-slate-700 truncate leading-none">
                                    {patient?.address ? patient.address.toUpperCase() : (patient?.city?.toUpperCase() || "LOCATION NOT PROVIDED")}
                                </p>
                            </div>
                        </div>

                        {/* Vitals Grid - Small Compact Boxes */}
                        <div className="grid grid-cols-2 gap-1 md:gap-2 mb-auto h-full">
                            {/* Cell 1: Height & Weight */}
                            <div className="bg-slate-50 rounded-lg p-1 md:p-2 border border-slate-100 flex flex-col justify-center">
                                <p className="text-[5px] md:text-[8px] text-slate-400 uppercase font-bold tracking-wide mb-1 flex items-center gap-1">
                                    <Activity className="w-2.5 h-2.5 md:w-3 md:h-3 text-blue-500" />
                                    Body Vitals
                                </p>
                                <div className="flex items-center justify-between px-0.5 md:px-1">
                                    <div className="text-center">
                                        <p className="text-[4px] md:text-[7px] text-slate-400 font-bold uppercase mb-0.5">Height</p>
                                        <div className="flex items-baseline justify-center gap-0.5">
                                            <span className="text-[7px] md:text-xs font-bold text-slate-700 block leading-none">{patient?.height || "-"}</span>
                                            <span className="text-[4px] md:text-[7px] text-slate-400 font-bold uppercase">cm</span>
                                        </div>
                                    </div>
                                    <div className="w-px h-4 md:h-6 bg-slate-200 mx-1"></div>
                                    <div className="text-center">
                                        <p className="text-[4px] md:text-[7px] text-slate-400 font-bold uppercase mb-0.5">Weight</p>
                                        <div className="flex items-baseline justify-center gap-0.5">
                                            <span className="text-[7px] md:text-xs font-bold text-slate-700 block leading-none">{patient?.weight || "-"}</span>
                                            <span className="text-[4px] md:text-[7px] text-slate-400 font-bold uppercase">kg</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Cell 2: Allergies */}
                            <div className="bg-slate-50 rounded-lg p-1 md:p-2 border border-slate-100 flex flex-col justify-center">
                                <div className="flex items-center gap-1 mb-1">
                                    <AlertCircle className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                                    <p className="text-[5px] md:text-[8px] text-slate-400 uppercase font-bold tracking-wide">Allergies</p>
                                </div>
                                <div className="text-[7px] md:text-[10px] leading-tight truncate">
                                    {formatList(patient?.allergies)}
                                </div>
                            </div>

                            {/* Cell 3: Medications */}
                            <div className="bg-slate-50 rounded-lg p-1 md:p-2 border border-slate-100 flex flex-col justify-center">
                                <div className="flex items-center gap-1 mb-1">
                                    <Tablet className="w-2.5 h-2.5 md:w-3 md:h-3 text-teal-500" />
                                    <p className="text-[5px] md:text-[8px] text-slate-400 uppercase font-bold tracking-wide">Meds</p>
                                </div>
                                <div className="text-[7px] md:text-[10px] leading-tight truncate">
                                    {formatList(combinedMeds)}
                                </div>
                            </div>

                            {/* Cell 4: Conditions */}
                            <div className="bg-slate-50 rounded-lg p-1 md:p-2 border border-slate-100 flex flex-col justify-center">
                                <div className="flex items-center gap-1 mb-1">
                                    <HeartPulse className="w-2.5 h-2.5 md:w-3 md:h-3 text-purple-500" />
                                    <p className="text-[5px] md:text-[8px] text-slate-400 uppercase font-bold tracking-wide">Conditions</p>
                                </div>
                                <div className="text-[7px] md:text-[10px] leading-tight truncate">
                                    {formatList(patient?.chronicConditions)}
                                </div>
                            </div>
                        </div>

                        <div className="text-center pt-1 mt-auto">
                            <p className="text-[6px] md:text-[8px] text-slate-300 font-bold tracking-[0.2em] uppercase">Secure Token • Niraiva Health</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Click hint */}
            <div className="text-center mt-3 md:mt-5 text-sm text-slate-400 font-bold tracking-wide uppercase opacity-40">
                Tap card to flip
            </div>
        </div>
    );
}

const InfoItem = ({ label, value, badges }: { label: string, value?: string | number | null, badges?: string[] | null }) => (
    <div className="mb-4 last:mb-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">{label}</span>
        {value && <div className="text-slate-900 font-medium">{value}</div>}
        {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
                {badges.map((badge, idx) => (
                    <span key={idx} className={`px-2 py-0.5 rounded-md text-xs font-medium 
                        ${badge === 'Peanuts' || badge === 'Shellfish' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-slate-100 text-slate-600'}
                    `}>
                        {badge}
                    </span>
                ))}
            </div>
        )}
        {!value && (!badges || badges.length === 0) && (
            <div className="text-slate-300 text-sm italic">Not provided</div>
        )}
    </div>
);

const HealthMetricCard = ({ title, value, unit, status, date }: any) => {
    // Format date nicely
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return '-';
        }
    };

    // Clean value (remove H/L prefixes and units mixed in value)
    const cleanValue = (val: string | null) => {
        if (!val) return null;
        // Remove High/Low/Normal/H/L prefixes
        let cleaned = val.replace(/^[HLNhln]\s+/, '').replace(/^(High|Low|Normal)\s+/i, '').trim();
        // Remove common units if they are part of the value string
        cleaned = cleaned.replace(/\s*mm\s*Hg$/i, '').replace(/\s*mg\/dL$/i, '').replace(/\s*%$/, '').trim();
        return cleaned;
    };

    const finalValue = cleanValue(value);

    // Logic: If there is a value but no status, treat as "Normal"
    let displayStatus = status;
    if (!displayStatus && finalValue) {
        displayStatus = 'Normal';
    }

    const s = (displayStatus || '').toLowerCase();
    const isWarningOrHigh = s.includes('high') || s.includes('low') || s.includes('critical') || s.includes('elevated') || s.includes('abnormal') || s.includes('warning');

    // Status Badge Details
    let badgeText = s;
    let badgeStyle = "bg-emerald-50 text-emerald-700 ring-emerald-200 font-bold";
    if (isWarningOrHigh) {
        badgeText = s.includes('low') ? 'low' : s.includes('high') ? 'elevated' : 'abnormal';
        badgeStyle = "bg-red-50 text-red-600 ring-red-300 font-extrabold";
    } else {
        badgeText = 'normal';
    }

    // Trend indicator
    let trendArrow = "•";
    let trendText = "baseline range";
    let trendStyle = "text-slate-500";

    // Enhanced trend & sparkline points for tumor markers
    const getSparklineData = (tName: string) => {
        const n = (tName || '').toLowerCase();
        if (n.includes('free psa')) return { points: [14.0, 12.5, 11.0], velocity: '↓ 21.4% (from 14% 3 mos ago)' };
        if (n.includes('ca 15-3')) return { points: [22.0, 19.5, 17.0], velocity: '↓ from 22.0 U/mL (3 mos ago)' };
        if (n.includes('cea')) return { points: [42.0, 18.4, 8.6], velocity: '↓ 79.5% from 42.0 ng/mL' };
        if (n.includes('psa')) return { points: [8.9, 5.1, 2.4], velocity: '↓ 73% velocity drop' };
        if (n.includes('cyfra')) return { points: [6.8, 5.2, 4.1], velocity: '↓ 39.7% reduction (3 mos ago)' };
        return null;
    };
    const sparkData = getSparklineData(title);

    if (sparkData) {
        trendArrow = "↓";
        trendText = sparkData.velocity;
    } else if (s.includes('high') || s.includes('elevated')) {
        trendArrow = "↑";
        trendText = "above range";
        trendStyle = "text-red-600 font-extrabold";
    } else if (s.includes('low')) {
        trendArrow = "↓";
        trendText = "below range";
        trendStyle = "text-red-600 font-extrabold";
    } else if (s === 'normal' || s === '') {
        trendArrow = "✓";
        trendText = "normal baseline";
        trendStyle = "text-emerald-600 font-semibold";
    }

    return (
        <div className="group bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col justify-between h-[185px] relative overflow-hidden">
            {/* Top row: Title and Status badge */}
            <div className="flex justify-between items-start relative z-10">
                <h3 className="text-[15px] font-semibold text-slate-900 leading-tight pr-2 group-hover:text-teal-700 transition-colors">{title}</h3>
                {finalValue && (
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide ring-1 ring-inset ${badgeStyle}`}>
                        {badgeText}
                    </span>
                )}
            </div>

            {/* Value, Unit and Sparkline */}
            <div className="flex items-end justify-between mt-auto mt-2">
                <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-bold leading-none ${finalValue ? (isWarningOrHigh ? 'text-red-600' : 'text-emerald-600') : 'text-slate-900'}`}>
                        {finalValue || "-"}
                    </span>
                    {finalValue && <span className="text-[11px] font-medium text-slate-500 pb-0.5">{unit}</span>}
                </div>

                {/* SVG Mini Sparkline */}
                {sparkData && (
                    <div className="shrink-0 pb-1">
                        <svg width="48" height="18" className="overflow-visible">
                            {(() => {
                                const pts = sparkData.points;
                                const min = Math.min(...pts);
                                const max = Math.max(...pts) || 1;
                                const range = (max - min) || 1;
                                const coords = pts.map((v, i) => {
                                    const x = (i / (pts.length - 1)) * 48;
                                    const y = 18 - ((v - min) / range) * 14 - 2;
                                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                                });
                                const strokeColor = isWarningOrHigh ? '#dc2626' : '#0d9488';
                                return (
                                    <>
                                        <path d={`M ${coords.join(' L ')}`} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        {coords.map((c, i) => {
                                            const [cx, cy] = c.split(',');
                                            return <circle key={i} cx={cx} cy={cy} r="2" fill={i === coords.length - 1 ? strokeColor : '#ffffff'} stroke={strokeColor} strokeWidth="1" />;
                                        })}
                                    </>
                                );
                            })()}
                        </svg>
                    </div>
                )}
            </div>

            {/* Trend Indicator */}
            <div className="mt-1">
                {finalValue ? (
                    <div className={`text-[11px] font-medium flex items-center gap-1 ${trendStyle}`}>
                        <span>{trendArrow}</span>
                        <span className="truncate">{trendText}</span>
                    </div>
                ) : (
                    <div className="text-[11px] font-medium text-slate-300">No data</div>
                )}
            </div>

            {/* Date and Action Link */}
            <div className="mt-2 flex items-center justify-between relative z-10">
                <p className="text-[10px] text-slate-400">
                    {finalValue ? `Last updated: ${formatDate(date)}` : ' '}
                </p>
                <div className="text-[10px] font-bold text-teal-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    View <ArrowUpRight className="w-3 h-3" />
                </div>
            </div>

            {/* Subtle background icon on hover */}
            <div className="absolute -bottom-4 -right-4 opacity-[0] group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none transform group-hover:scale-110">
                <Activity className="w-24 h-24 text-teal-900" />
            </div>
        </div>
    );
}

const ConditionCard = ({ name, diagnosed, status, related, href = "/diagnostic" }: any) => {
    // Map conditionStatus from DB to display badge
    const s = (status || '').toLowerCase();
    let badgeLabel = s || 'stable';
    let badgeCls = 'bg-emerald-50 text-emerald-600 ring-emerald-200'; // default stable/mild
    if (s === 'worsening' || s.includes('critical') || s.includes('severe')) {
        badgeLabel = 'worsening';
        badgeCls = 'bg-red-50 text-red-500 ring-red-200';
    } else if (s === 'stable' || s === 'moderate') {
        badgeLabel = s === 'moderate' ? 'moderate' : 'stable';
        badgeCls = 'bg-orange-50 text-orange-500 ring-orange-200';
    } else if (s === 'improving' || s === 'mild') {
        badgeLabel = s === 'mild' ? 'mild' : 'improving';
        badgeCls = 'bg-emerald-50 text-emerald-600 ring-emerald-200';
    }

    // "Current Status" readable label
    const currentStatusLabel = s === 'improving' ? 'improving' : s === 'worsening' ? 'worsening' : 'controlled';
    const currentStatusCls = (s === 'worsening' || s.includes('critical')) ? 'text-red-500' : 'text-teal-600';

    return (
        <Link href={href} className="block group">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all duration-200 cursor-pointer h-full flex flex-col gap-3">
                {/* Top: name + severity badge */}
                <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-base leading-snug capitalize group-hover:text-teal-700 transition-colors">
                        {name}
                    </h4>
                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ring-1 ring-inset capitalize ${badgeCls}`}>
                        {badgeLabel}
                    </span>
                </div>

                {/* Diagnosed date */}
                <p className="text-xs text-slate-500">
                    Diagnosed: <span className="font-medium text-slate-700">{diagnosed || '—'}</span>
                </p>

                {/* Current Status */}
                <p className="text-xs">
                    <span className="text-slate-600 font-medium">Current Status: </span>
                    <span className={`font-bold ${currentStatusCls}`}>{currentStatusLabel}</span>
                </p>

                {/* Related Parameters (only if provided) */}
                {related && related.length > 0 && (
                    <div className="mt-auto pt-2 border-t border-slate-50">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">Related Parameters</p>
                        <div className="flex flex-wrap gap-1.5">
                            {related.map((tag: string) => (
                                <span key={tag} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[10px] font-medium border border-slate-100">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Link>
    );
};

// --- ImagesBadge Component ---
interface ImagesBadgeProps {
    text: string;
    images: string[];
    href?: string;
    className?: string;
    folderSize?: { width: number; height: number };
    hoverTranslateY?: number;
    hoverSpread?: number;
    hoverRotation?: number;
}

const ImagesBadge = ({
    text,
    images = [],
    href,
    className,
    folderSize = { width: 32, height: 24 },
    hoverTranslateY = -35,
    hoverSpread = 20,
    hoverRotation = 15,
}: ImagesBadgeProps) => {
    const badgeContent = (
        <motion.div
            initial="initial"
            whileHover="hover"
            className={cn(
                "flex h-16 w-full max-w-[320px] items-center justify-between rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-[0_0_10px_-5px_rgba(0,0,0,0.1)] transition-colors hover:border-neutral-300",
                className
            )}
        >
            <span className="truncate font-medium text-neutral-600">
                {text}
            </span>
            <div className="relative flex items-center justify-center">
                {images.slice(0, 3).map((image, idx) => {
                    return (
                        <motion.div
                            key={idx}
                            variants={{
                                initial: {
                                    y: 0,
                                    x: 0,
                                    rotate: 0,
                                    scale: 1,
                                    zIndex: images.length - idx,
                                },
                                hover: {
                                    y: hoverTranslateY,
                                    x: (idx - 1) * hoverSpread,
                                    rotate: (idx - 1) * hoverRotation,
                                    scale: 1.1,
                                    zIndex: 10 + idx,
                                },
                            }}
                            className="absolute flex items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-neutral-100 shadow-md"
                            style={{
                                width: folderSize.width,
                                height: folderSize.height,
                                right: 0,
                            }}
                        >
                            <Image
                                src={image}
                                alt={`Badge Image ${idx}`}
                                fill
                                className="object-cover"
                            />
                        </motion.div>
                    );
                })}
                <div
                    className="flex items-center justify-center rounded bg-slate-100"
                    style={{ width: folderSize.width, height: folderSize.height }}
                >
                    <span className="text-[10px] text-slate-400 font-bold">+{images.length}</span>
                </div>
            </div>
        </motion.div>
    );

    if (href) {
        return (
            <Link href={href} className="block">
                {badgeContent}
            </Link>
        );
    }

    return badgeContent;
};

// --- FolderCard Component ---
interface FolderCardProps {
    title: string;
    images: string[];
    href?: string;
    className?: string;
    count?: number;
}

const FolderCard = ({
    title,
    images = [],
    href,
    className,
    count
}: FolderCardProps) => {
    return (
        <div className={cn("group flex flex-col items-center cursor-pointer", className)}>
            {/* Interaction Container */}
            <div className="relative w-32 h-28 perspective-1000">

                {/* Back Plate of Folder (Tab) */}
                <div className="absolute top-0 left-0 w-12 h-4 bg-amber-300 rounded-t-lg z-0 transition-transform group-hover:-translate-y-1" />
                <div className="absolute top-4 bottom-0 left-0 right-0 bg-amber-300 rounded-b-lg rounded-tr-lg z-0 shadow-sm" />

                {/* Documents inside */}
                <div className="absolute left-3 right-3 bottom-3 top-6 z-10 flex justify-center items-end">
                    {images.slice(0, 3).reverse().map((src, idx) => {
                        return (
                            <motion.div
                                key={idx}
                                className="absolute bottom-0 w-24 h-28 bg-white rounded-sm border border-slate-200 shadow-sm overflow-hidden"
                                initial={{ y: 0, scale: 0.9, rotate: 0 }}
                                whileHover={{
                                    y: -30 - (idx * 15),
                                    rotate: (idx - 1) * 8, // Fan: -8, 0, 8
                                    scale: 1
                                }}
                                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                                style={{
                                    zIndex: idx,  // 0 at back, 2 at front of stack (before pocket)
                                }}
                            >
                                <Image
                                    src={src}
                                    alt="doc"
                                    fill
                                    className="object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                />
                            </motion.div>
                        )
                    })}
                </div>

                {/* Front Pocket of Folder */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-amber-400 rounded-lg shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] z-20 transition-transform origin-bottom group-hover:rotate-x-10 border-t border-amber-300/50">
                    <div className="absolute inset-0 flex items-center justify-center">
                        {/* Optional Logo or Detail */}
                        <div className="w-8 h-1 bg-amber-500/20 rounded-full" />
                    </div>
                </div>
            </div>

            {/* Label / Title Area */}
            <div className="mt-4 text-center">
                <h3 className="text-base font-bold text-slate-700 group-hover:text-teal-600 transition-colors">{title}</h3>
                <p className="text-xs text-slate-400 font-medium">{images.length} item{images.length !== 1 && 's'}</p>
            </div>
        </div>
    );
};

// --- CompactFolderCard Component ---
interface CompactFolderCardProps {
    title: string; // e.g. "Blood Reports"
    hospital: string; // e.g. "City General Hospital"
    date: string; // e.g. "Feb 05, 2026"
    images: string[];
    href?: string;
    className?: string;
    theme?: 'teal' | 'blue';
}

const CompactFolderCard = ({
    title,
    hospital,
    date,
    images = [],
    href,
    className,
    theme = 'teal',
}: CompactFolderCardProps) => {
    const isBlue = theme === 'blue';

    const CardContent = (
        <motion.div
            className={cn(
                "group flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer",
                isBlue ? "hover:border-blue-100" : "hover:border-teal-100",
                className
            )}
            initial="rest"
            whileHover="hover"
            animate="rest"
        >
            {/* Left: Mini Folder Icon with Interaction */}
            <div className="relative w-16 h-14 perspective-1000 flex-shrink-0">

                {/* Back Plate */}
                <div className={cn(
                    "absolute top-0 left-0 w-6 h-2 rounded-t-sm z-0 transition-transform group-hover:-translate-y-0.5",
                    isBlue ? "bg-blue-200" : "bg-teal-200"
                )} />
                <div className={cn(
                    "absolute top-2 bottom-0 left-0 right-0 rounded-b-md rounded-tr-md z-0 shadow-sm",
                    isBlue ? "bg-blue-200" : "bg-teal-200"
                )} />

                {/* Documents inside - Scaled down */}
                <div className="absolute left-1.5 right-1.5 bottom-1 top-3 z-10 flex justify-center items-end">
                    {images.slice(0, 3).map((src, idx) => (
                        <motion.div
                            key={idx}
                            className="absolute bottom-0 w-12 h-14 bg-white rounded-[2px] border border-slate-200 shadow-sm overflow-hidden"
                            variants={{
                                rest: { y: 0, rotate: 0 },
                                hover: {
                                    y: -15 - (idx * 5), // Pop up less
                                    rotate: (idx - 1) * 8, // Fan out
                                }
                            }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            style={{ zIndex: idx }}
                        >
                            <Image
                                src={src}
                                alt="doc"
                                fill
                                className="object-cover opacity-90"
                            />
                        </motion.div>
                    ))}
                </div>

                {/* Front Pocket */}
                <div className={cn(
                    "absolute bottom-0 left-0 right-0 h-10 rounded-md shadow-[0_2px_4px_-1px_rgba(0,0,0,0.1)] z-20 transition-transform origin-bottom group-hover:rotate-x-10 border-t flex items-center justify-center",
                    isBlue ? "bg-blue-400 border-blue-300/50" : "bg-teal-400 border-teal-300/50"
                )}>
                    {/* Mini Detail */}
                    <div className={cn(
                        "w-4 h-0.5 rounded-full",
                        isBlue ? "bg-blue-600/20" : "bg-teal-600/20"
                    )} />
                </div>
            </div>

            {/* Right: Content Content */}
            <div className="flex-grow min-w-0">
                <h3 className={cn(
                    "text-sm font-bold text-slate-900 truncate transition-colors",
                    isBlue ? "group-hover:text-blue-700" : "group-hover:text-teal-700"
                )}>{title}</h3>
                <p className="text-xs font-medium text-slate-600 truncate">{hospital}</p>
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <span>{date}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{images.length} files</span>
                </p>
            </div>
        </motion.div>
    );

    if (href) {
        return (
            <Link href={href} className="block w-full">
                {CardContent}
            </Link>
        );
    }

    return CardContent;
};

// --- Main Section Component ---
interface DiagnosticReportsSectionProps {
    reports: any[];
}

function DiagnosticReportsSection({ reports }: DiagnosticReportsSectionProps) {
    // Placeholder images for the folder effect
    const defaultImages = [
        "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&q=80&w=200",
        "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=200",
        "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=200",
    ];

    if (!reports || reports.length === 0) {
        return (
            <div className="space-y-6">
                <h2 className="text-xl font-bold text-slate-900">Diagnostic Reports</h2>
                <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No Reports Yet</h3>
                    <p className="text-slate-500 text-sm mt-1">Uploaded lab reports will appear here as folders.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Diagnostic Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {reports.map((report, idx) => {
                    // Try to format date nicely
                    let dateStr = "Unknown Date";
                    if (report.reportDate) {
                        try {
                            const d = new Date(report.reportDate);
                            // check if valid
                            if (!isNaN(d.getTime())) {
                                dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } else {
                                dateStr = report.reportDate;
                            }
                        } catch (e) { dateStr = report.reportDate }
                    } else if (report.uploadedAt) {
                        const d = new Date(report.uploadedAt);
                        dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }

                    return (
                        <CompactFolderCard
                            key={report.id || idx}
                            title={report.fileName || "Lab Report"}
                            hospital={report.labName || "Medical Center"}
                            date={dateStr}
                            images={defaultImages} // Visual decoration
                            href={`/labreports/${report.id}`}
                            className="w-full"
                        />
                    );
                })}
            </div>
        </div>
    );
}

interface DashboardProps {
    data: {
        user: any;
        patient: any;
        healthParameters?: Record<string, any>;
        doctorNotes?: Array<{
            id: string;
            doctorName: string;
            specialty: string;
            date: string;
            note: string;
            doctorId?: string | null;
            createdAt?: string | null;
        }>;
        diagnosticConditions?: Array<{
            id: string;
            conditionName: string;
            conditionStatus: string;
            createdAt: string | null;
            clinicalNotes?: string | null;
            treatmentPlan?: string | null;
            nodes?: unknown[];
        }>;
        upcomingAppointments?: Array<{
            id: string;
            title: string;
            eventDate: string;
            status: string | null;
            description?: string | null;
        }>;
        prescriptions?: Array<{
            id: string;
            patientId: string;
            doctorId: string | null;
            consultationData: any;
            cloudinaryUrl: string;
            prescribedAt: string | null;
        }>;
    }
}

// --- New User Welcome Overlay ---
const WelcomeOverlay = () => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative bg-white rounded-3xl p-12 max-w-2xl w-full mx-6 shadow-2xl text-center border-2 border-slate-50"
            >
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-8 ring-white">
                    <Sparkles className="w-10 h-10 text-white fill-white/20" />
                </div>

                <div className="mt-8 space-y-6">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                        Welcome to <span className="text-teal-600">Niraiva Health</span>
                    </h2>

                    <p className="text-slate-600 text-xl font-bold leading-relaxed max-w-lg mx-auto">
                        Your personalized health ecosystem is ready. Experience advanced care at your fingertips.
                    </p>
                </div>

                <div className="mt-10 w-full bg-slate-100 rounded-full h-2 overflow-hidden max-w-lg mx-auto">
                    <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 9.5, ease: "linear" }}
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
                    />
                </div>
                <p className="text-xs text-slate-400 mt-4 font-bold uppercase tracking-widest">
                    Initializing secure environment...
                </p>
            </motion.div>
        </motion.div>
    );
};

// --- Add Medication Modal ---
const AddMedicationModal = ({ patientId, onClose, initialData }: { patientId: string; onClose: () => void; initialData?: any }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isFrequencyOpen, setIsFrequencyOpen] = useState(false); // New state for custom dropdown
    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        dosage: initialData?.dosage === '-' ? "" : (initialData?.dosage || ""),
        purpose: initialData?.purpose === 'Self Reported' ? "" : (initialData?.purpose || ""),
        startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
        frequency: initialData?.frequency === '-' ? "Daily" : (initialData?.frequency || "Daily")
    });

    // Reset form if initialData changes (though modal usually remounts or we can rely on init)
    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || "",
                dosage: initialData.dosage === '-' ? "" : (initialData.dosage || ""),
                purpose: initialData.purpose === 'Self Reported' ? "" : (initialData.purpose || ""),
                startDate: initialData.startDate || new Date().toISOString().split('T')[0],
                frequency: initialData.frequency === '-' ? "Daily" : (initialData.frequency || "Daily")
            });
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const result = await addMedication(patientId, formData);
            if (result.success) {
                onClose();
            } else {
                setError(result.error || "Failed to add medication");
            }
        } catch (err) {
            setError("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-100"
            >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{initialData ? "Update Medication" : "Add Medication"}</h3>
                        <p className="text-slate-500 font-medium text-sm mt-1">{initialData ? "Complete the details" : "Track your daily intakes"}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 font-medium text-sm rounded-xl flex items-center gap-3 border border-red-100">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Medicine Name <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Metformin"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all outline-none font-semibold text-slate-900"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Dosage <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. 500mg"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all outline-none font-medium"
                                value={formData.dosage}
                                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Frequency <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsFrequencyOpen(!isFrequencyOpen)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all outline-none font-medium flex items-center justify-between text-left"
                                >
                                    <span className="text-slate-900">{formData.frequency}</span>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isFrequencyOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {isFrequencyOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsFrequencyOpen(false)} />
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20 py-1 max-h-48 overflow-y-auto"
                                            >
                                                {["Daily", "Twice a Day", "Thrice a Day", "Weekly", "As Needed"].map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, frequency: option });
                                                            setIsFrequencyOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-2.5 hover:bg-teal-50 text-slate-700 hover:text-teal-700 transition-colors font-medium border-b border-slate-50 last:border-0 ${formData.frequency === option ? 'bg-teal-50 text-teal-700' : ''}`}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Purpose / Condition</label>
                            <input
                                type="text"
                                placeholder="e.g. For Blood Sugar"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all outline-none font-medium"
                                value={formData.purpose}
                                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Start Date <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="date"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all outline-none font-medium"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-6 py-3.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                <>
                                    <Plus className="w-5 h-5" />
                                    {initialData ? "Save Details" : "Add Medicine"}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div >
    );
};

export default function PatientDashboard({ data }: DashboardProps) {
    const { user, patient, healthParameters = {}, doctorNotes: propDoctorNotes = [], diagnosticConditions = [], upcomingAppointments = [], prescriptions = [] } = data;
    const router = useRouter();
    const [currentView, setCurrentView] = useState('dashboard');
    const [expandedNote, setExpandedNote] = useState<string | null>(null);
    const [showWelcome, setShowWelcome] = useState(false);
    const [showAddMedication, setShowAddMedication] = useState(false);
    const [editingMed, setEditingMed] = useState<any>(null);

    // Handle voice command ?section= param (from VoiceMic navigation)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const section = params.get('section');
        if (!section) return;

        if (section === 'labreports') {
            setCurrentView('labreports');
        } else if (section === 'medications' || section === 'health-parameters') {
            setCurrentView('dashboard');
            setTimeout(() => {
                const el = document.getElementById(`section-${section}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('voice-highlight');
                    setTimeout(() => el.classList.remove('voice-highlight'), 3000);
                }
            }, 400);
        }
        window.history.replaceState({}, '', window.location.pathname);
    }, []);

    // Lab Reports State
    const [labReportsData, setLabReportsData] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const [confirmAction, setConfirmAction] = useState<{ type: 'stop' | 'resume'; id: string; name: string } | null>(null);

    const handleStop = (id: string, name: string) => {
        setConfirmAction({ type: 'stop', id, name });
    };

    const handleRestart = (id: string, name: string) => {
        setConfirmAction({ type: 'resume', id, name });
    };

    const executeConfirmation = async () => {
        if (!confirmAction) return;

        try {
            if (confirmAction.type === 'stop') {
                await stopMedication(confirmAction.id);
            } else {
                await restartMedication(confirmAction.id);
            }
            router.refresh();
            setConfirmAction(null);
        } catch (error) {
            console.error("Action failed", error);
        }
    };

    // Load lab reports when view changes to lab reports
    useEffect(() => {
        if (currentView === 'labreports') {
            loadLabReports();
        }
    }, [currentView]);

    const loadLabReports = async () => {
        const result = await getLabReports(user.id);
        if (result.success && result.reports) {
            setLabReportsData(result.reports);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (file.type !== 'application/pdf') {
            setUploadError('Only PDF files are supported');
            // Reset input
            event.target.value = '';
            return;
        }

        setIsUploading(true);
        setUploadError('');

        try {
            // 1. Get Signature for Secure Client-Side Upload
            const { signature, timestamp, cloudName, apiKey } = await getCloudinarySignature();
            if (!cloudName || !apiKey) throw new Error("Cloud config missing on server");

            // 2. Upload directly to Cloudinary (Bypassing Vercel Limit)
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', apiKey!);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);
            formData.append('folder', 'lab_reports');
            formData.append('type', 'upload'); // Explicitly set as public upload
            formData.append('access_mode', 'public'); // Force public access

            // Use 'raw' resource type for PDFs if 'auto' fails, but 'auto' usually works. 
            // However, specialized PDFs sometimes need 'image' or 'raw'. Cloudinary 'auto' is safest.
            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Cloudinary upload failed');
            }

            const data = await response.json();
            const secureUrl = data.secure_url;

            // 3. Process on Server (AI Extraction & DB Save)
            const result = await processUploadedReport(secureUrl, user.id, file.name, file.size);

            if (result.success) {
                router.push(`/labreports/${result.reportId}`);
            } else {
                setUploadError(result.error || 'Processing failed');
            }
        } catch (error: any) {
            console.error('Upload Process Error:', error);
            setUploadError(error.message || 'Failed to upload/process file');
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const handleDeleteReport = async (reportId: string) => {
        const result = await deleteLabReport(reportId);
        if (result.success) {
            await loadLabReports();
        }
    };

    // --- Animation Variants ---
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15, // Stagger effect for children
                delayChildren: 0.2
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 30 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { type: "spring", stiffness: 50, damping: 20 }
        }
    };

    const headerVariants: Variants = {
        hidden: { opacity: 0, x: -20 },
        visible: {
            opacity: 1,
            x: 0,
            transition: { duration: 0.5, ease: "easeOut" }
        }
    };

    // --- New User Detection & Effect ---
    useEffect(() => {
        // We solely rely on the 'welcome' query param which comes from the Onboarding success redirect.
        // We use localStorage as a secondary guard to prevent it from showing on refresh if the URL param persists.
        const isWelcomeParam = window.location.search.includes('welcome=true');
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcome_v2');

        if (isWelcomeParam && !hasSeenWelcome) {
            setShowWelcome(true);

            // Trigger Confetti
            const duration = 10000;
            const end = Date.now() + duration;

            const frame = () => {
                confetti({
                    particleCount: 2,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#14b8a6', '#0d9488', '#0f766e'] // Teal shades
                });
                confetti({
                    particleCount: 2,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#14b8a6', '#0d9488', '#0f766e']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };
            frame();

            // Hide after 10 seconds and mark as seen
            const timer = setTimeout(() => {
                setShowWelcome(false);
                localStorage.setItem('hasSeenWelcome_v2', 'true');
                // Clean URL without refresh
                window.history.replaceState({}, '', window.location.pathname);
            }, 10000);

            return () => clearTimeout(timer);
        } else if (isWelcomeParam && hasSeenWelcome) {
            // If param exists but already seen, just clean the URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    // Use real doctor notes from props (patient-visible timeline events from doctor)
    const doctorNotes = propDoctorNotes;

    // Helper to parse comma separated values
    const parseList = (str: string | null) => {
        if (!str) return [];
        return str.split(',').map(s => s.trim()).filter(Boolean);
    };

    const allergies = parseList(patient?.allergies);
    const dbMeds = patient?.medications || [];

    // Deduplicate DB medications by name to prevent repeating cards
    const uniqueDbMedsMap = new Map();
    dbMeds.forEach((med: any) => {
        // Use lowercase name as key to ensure case-insensitive uniqueness
        // The last one in the list wins (latest added usually)
        uniqueDbMedsMap.set(med.name.toLowerCase(), med);
    });
    const uniqueDbMeds = Array.from(uniqueDbMedsMap.values());

    const legacyMedsList = parseList(patient?.currentMedications);

    // Convert legacy text list to objects, avoiding duplicates with DB meds
    const formattedLegacyMeds = legacyMedsList
        .filter(name => !uniqueDbMedsMap.has(name.toLowerCase()))
        .map((name, i) => ({
            id: `legacy-${i}`,
            name: name,
            dosage: '-',
            frequency: '-',
            purpose: 'Self Reported',
            startDate: '',
            status: 'Active',
            addedBy: 'Self' // Ensures Edit button appears
        }));

    // Sort: Active first, then Stopped — Hidden are excluded
    const statusOrder: Record<string, number> = { Active: 0, Stopped: 1 };
    const displayMedications = [...uniqueDbMeds, ...formattedLegacyMeds]
        .filter((m: any) => m.status !== 'Hidden')
        .sort((a: any, b: any) => (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2));
    // Conditions are now from diagnostics, not the plain text field
    const oncologyBrief = buildOncologyBrief({
        patient,
        reports: patient?.reports || [],
        diagnostics: diagnosticConditions,
    });

    const earlyDetectionResult = React.useMemo(() => {
        const paramsList = Object.entries(healthParameters || {}).map(([name, data]: any) => ({
            parameterName: name,
            value: typeof data === 'object' ? data?.value : String(data),
            unit: data?.unit || '',
            status: data?.status || '',
            testDate: data?.testDate || ''
        }));

        return analyzePatientEarlyDetection({
            chronicConditions: patient?.chronicConditions,
            lifestyle: patient?.lifestyle,
            healthParameters: paramsList,
            labReports: labReportsData,
            vitals: []
        });
    }, [patient, healthParameters, labReportsData]);

    return (
        <div className="min-h-screen bg-[#F7F9FA] flex flex-col">
            <DashboardNavbar user={user} />

            <main className="flex-grow pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8">

                {/* Header */}
                {currentView === 'dashboard' && (
                    <motion.div
                        initial="hidden"
                        animate={!showWelcome ? "visible" : "hidden"}
                        variants={headerVariants}
                        className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8"
                    >
                        <div>
                            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight pb-1">
                                Health <span className="text-teal-600">Dashboard</span>
                            </h1>
                            <p className="text-slate-500 font-medium mt-1">View and manage your health information</p>
                        </div>
                    </motion.div>
                )}

                {/* Content Rendering based on currentView */}
                {currentView === 'dashboard' && (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate={!showWelcome ? "visible" : "hidden"}
                        className="space-y-8"
                    >
                        {/* AI Universal Early Detection Card */}
                        <motion.div variants={itemVariants}>
                            <AIEarlyDetectionCard data={earlyDetectionResult} patientName={user?.name || "Patient"} />
                        </motion.div>

                        {/* General Wellness & Metabolic Baseline */}

                        {(() => {
                            const cardPool: any[] = [];
                            const addedNames = new Set<string>();

                            if (oncologyBrief.hasOncologyData && oncologyBrief.markers && oncologyBrief.markers.length > 0) {
                                oncologyBrief.markers.forEach(m => {
                                    const lowerName = m.name.toLowerCase();
                                    if (!addedNames.has(lowerName)) {
                                        addedNames.add(lowerName);
                                        cardPool.push({
                                            title: m.name,
                                            value: m.value,
                                            unit: m.unit || '',
                                            status: m.status || 'Normal',
                                            date: m.date || null,
                                        });
                                    }
                                });
                            }

                            if (healthParameters) {
                                Object.keys(healthParameters).forEach(key => {
                                    const lowerKey = key.toLowerCase();
                                    if (!addedNames.has(lowerKey)) {
                                        const p = healthParameters[key];
                                        if (p && p.value) {
                                            addedNames.add(lowerKey);
                                            cardPool.push({
                                                title: key,
                                                value: p.value,
                                                unit: p.unit || '',
                                                status: p.status || 'Normal',
                                                date: p.testDate || null,
                                            });
                                        }
                                    }
                                });
                            }

                            const defaults = [
                                { title: 'Blood Pressure', value: '122/76', unit: 'mmHg', status: 'Normal' },
                                { title: 'Blood Glucose', value: '94', unit: 'mg/dL', status: 'Normal' },
                                { title: 'HbA1c', value: '5.6', unit: '%', status: 'Normal' },
                                { title: 'Total Cholesterol', value: '176', unit: 'mg/dL', status: 'Normal' }
                            ];

                            defaults.forEach(d => {
                                if (!addedNames.has(d.title.toLowerCase())) {
                                    addedNames.add(d.title.toLowerCase());
                                    cardPool.push(d);
                                }
                            });

                            const abnormal = cardPool.filter(c => {
                                const s = (c.status || '').toLowerCase();
                                return s.includes('high') || s.includes('low') || s.includes('elevated') || s.includes('abnormal') || s.includes('critical') || s.includes('warning');
                            });

                            const normal = cardPool.filter(c => !abnormal.includes(c));
                            const finalCards = [...abnormal, ...normal].slice(0, 4);

                            return (
                                <motion.div variants={itemVariants} id="section-health-parameters">
                                    <div className="flex justify-between items-end mb-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900">General Wellness & Metabolic Baseline</h2>
                                            <p className="text-xs text-slate-500 font-medium">Routine metabolic, tumor biomarker and lipid tracking</p>
                                        </div>
                                        <Link
                                            href="/dashboard/health"
                                            className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-teal-600 hover:text-teal-700 transition-colors"
                                        >
                                            View All Details
                                            <ArrowUpRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                        {finalCards.map(card => (
                                            <Link key={card.title} href={`/dashboard/health?param=${encodeURIComponent(card.title)}`}>
                                                <HealthMetricCard
                                                    title={card.title}
                                                    value={card.value}
                                                    unit={card.unit}
                                                    status={card.status}
                                                    date={card.date}
                                                />
                                            </Link>
                                        ))}
                                    </div>
                                </motion.div>
                            );
                        })()}

                        {oncologyBrief.hasOncologyData && (
                            <motion.section
                                variants={itemVariants}
                                className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden mb-8"
                            >
                                <div className="p-6 md:p-8 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-700 mb-2">
                                                <Shield className="w-4 h-4 text-teal-600" />
                                                Primary Oncology Care Plan
                                            </div>
                                            <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">
                                                {oncologyBrief.diagnosis}
                                            </h2>
                                            <p className="text-sm text-slate-600 font-medium mt-2 max-w-3xl leading-relaxed">
                                                {oncologyBrief.patientSummary}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 md:min-w-[250px]">
                                            <div className="rounded-xl bg-white border border-teal-100 p-3 shadow-sm">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Stage</p>
                                                <p className="text-base font-black text-slate-900 mt-1">{oncologyBrief.stage}</p>
                                            </div>
                                            <div className="rounded-xl bg-white border border-teal-100 p-3 shadow-sm">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Care phase</p>
                                                <p className="text-base font-black text-teal-700 mt-1 capitalize">{oncologyBrief.carePhase}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Diagnosis date</p>
                                        <p className="text-sm font-black text-slate-900">{oncologyBrief.diagnosisDate}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 overflow-hidden">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Current regimen</p>
                                        <p
                                            className="text-sm font-bold text-slate-800 leading-snug"
                                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                        >
                                            {oncologyBrief.currentPlan}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Next restaging scan</p>
                                        <p className="text-sm font-bold text-slate-800 leading-relaxed">{oncologyBrief.nextMilestone}</p>
                                    </div>
                                </div>

                                {oncologyBrief.markers && oncologyBrief.markers.length > 0 && (
                                    <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50">
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Tracked Oncology Biomarkers & Surveillance Trends</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            {oncologyBrief.markers.map(m => {
                                                const isAbnormal = m.status && (
                                                    m.status.toLowerCase().includes('low') ||
                                                    m.status.toLowerCase().includes('high') ||
                                                    m.status.toLowerCase().includes('critical') ||
                                                    m.status.toLowerCase().includes('elevated')
                                                );
                                                return (
                                                    <div
                                                        key={m.name}
                                                        className={`rounded-xl p-3.5 border transition-all ${
                                                            isAbnormal
                                                                ? 'bg-red-50/95 border-2 border-red-300 text-red-900 shadow-sm'
                                                                : 'bg-white border-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-xs font-black ${isAbnormal ? 'text-red-950' : 'text-slate-800'}`}>
                                                                {m.name}
                                                            </span>
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                                                isAbnormal
                                                                    ? 'bg-red-600 text-white'
                                                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            }`}>
                                                                {m.status || 'Tracked'}
                                                            </span>
                                                        </div>
                                                        <p className={`text-base font-black mt-1 ${isAbnormal ? 'text-red-800' : 'text-slate-900'}`}>
                                                            {m.value} <span className={`text-[10px] font-bold ${isAbnormal ? 'text-red-600' : 'text-slate-400'}`}>{m.unit}</span>
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </motion.section>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                            {/* Left Column: Health Card */}
                            <motion.div
                                variants={itemVariants}
                                className="lg:col-span-2 flex flex-col"
                            >
                                <div className="bg-white/50 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm flex flex-col h-full relative overflow-hidden group">

                                    <div className="flex flex-row items-center justify-start gap-4 mb-6 md:mb-8 relative z-10 text-left">
                                        <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-100 text-teal-600">
                                            <Shield className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900 leading-tight">My Health Card</h2>
                                            <p className="text-sm text-slate-500 font-medium">Digital identity for seamless healthcare access</p>
                                        </div>
                                    </div>

                                    <div className="flex-grow flex items-center justify-center py-2 pb-8 relative z-10">
                                        {patient ? (
                                            <HealthCard user={user} patient={patient} />
                                        ) : (
                                            <div className="w-full max-w-[420px] h-[260px] bg-white rounded-[20px] border border-dashed border-slate-300 flex flex-col items-center justify-center p-6 shadow-sm">
                                                <p className="text-slate-500 mb-4 font-medium">Health profile not found</p>
                                                <Link href="/onboarding" className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition shadow-sm">
                                                    Complete Setup
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>

                            {/* Right Column: Upload */}
                            <motion.div
                                variants={itemVariants}
                                className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col"
                            >
                                <h2 className="text-xl font-bold text-slate-900 mb-6">Doctor Notes</h2>
                                <div className="flex-grow flex flex-col gap-3 h-[254px] overflow-y-scroll pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    {doctorNotes.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                            <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-3">
                                                <Stethoscope className="w-7 h-7 text-slate-300" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-400">No doctor notes yet</p>
                                            <p className="text-xs text-slate-300 mt-1">Notes will appear here after a consultation</p>
                                        </div>
                                    ) : doctorNotes.map((note) => (
                                        <div
                                            key={note.id}
                                            onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer ${expandedNote === note.id
                                                ? 'bg-teal-50/50 border-teal-100 shadow-sm'
                                                : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                {/* Compact avatar */}
                                                <div className={`w-9 h-9 rounded-full flex-shrink-0 overflow-hidden border border-slate-100 ${expandedNote === note.id ? 'ring-2 ring-teal-100' : ''}`}>
                                                    <Image
                                                        src="/doctor.png"
                                                        alt="Doctor"
                                                        width={36}
                                                        height={36}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>

                                                {/* Name + specialty pill */}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[13px] font-black leading-tight truncate ${expandedNote === note.id ? 'text-teal-900' : 'text-slate-900'}`}>
                                                        {note.doctorName}
                                                    </p>
                                                    <span className="inline-block mt-0.5 text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md leading-none">
                                                        {note.specialty}
                                                    </span>
                                                </div>

                                                {/* Date + chevron */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{note.date}</span>
                                                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${expandedNote === note.id ? 'rotate-180' : ''}`} />
                                                </div>
                                            </div>

                                            {/* Expanded note */}
                                            {expandedNote === note.id && (() => {
                                                const KEYS = ["Diagnosis", "Prescribed", "Doctor's Advice"];
                                                const regex = new RegExp(`(${KEYS.join('|')}):`, 'g');
                                                const parts = (note.note || '').split(regex).map((s: string) => s.trim()).filter(Boolean);
                                                const sections: { label: string; value: string }[] = [];
                                                for (let i = 0; i < parts.length; i++) {
                                                    if (KEYS.includes(parts[i]) && parts[i + 1]) {
                                                        sections.push({ label: parts[i], value: parts[i + 1].replace(/\.\s*$/, '') });
                                                        i++;
                                                    }
                                                }
                                                return (
                                                    <div className="mt-2.5 pt-2.5 border-t border-teal-100/60 space-y-1">
                                                        {sections.length > 0 ? sections.map(s => (
                                                            <p key={s.label} className="text-xs leading-relaxed text-slate-700">
                                                                <span className="font-black text-slate-900">{s.label}: </span>
                                                                <span className="font-medium">{s.value}</span>
                                                            </p>
                                                        )) : (
                                                            <p className="text-xs font-medium text-slate-700 leading-relaxed">{note.note}</p>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Medications */}
                            <motion.div
                                variants={itemVariants}
                                id="section-medications"
                                className="lg:col-span-2 bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm relative overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-6 gap-4">
                                    <h2 className="text-xl font-bold text-slate-900 leading-tight">Current Medications</h2>
                                    <button
                                        onClick={() => setShowAddMedication(true)}
                                        className="px-4 py-2 bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 transition-colors flex items-center gap-2 text-sm font-bold whitespace-nowrap shadow-sm border border-teal-100"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add New
                                    </button>
                                </div>

                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {displayMedications.length > 0 ? (
                                        displayMedications.map((med: any, idx: number) => (
                                            <div key={idx} className="flex flex-col p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all group">
                                                <div className="flex flex-col gap-2 mb-3">
                                                    <div className="flex justify-between items-start gap-4">
                                                        <h3 className="font-black text-slate-800 text-lg sm:text-xl uppercase tracking-tight leading-tight break-words flex items-center gap-3">
                                                            <div className="p-2 bg-teal-50 rounded-xl border border-teal-100 shadow-sm shrink-0">
                                                                <Pill className="w-6 h-6 text-teal-600 fill-teal-100" />
                                                            </div>
                                                            {med.name}
                                                        </h3>
                                                        <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border ${med.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                            {med.status || 'Active'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {med.dosage && med.dosage !== '-' && (
                                                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 uppercase tracking-wide">
                                                                {med.dosage}
                                                            </span>
                                                        )}
                                                        {med.frequency && med.frequency !== '-' && (
                                                            <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100 uppercase tracking-wide flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {med.frequency}
                                                            </span>
                                                        )}
                                                        {/* Duration badge */}
                                                        {med.durationDays && (() => {
                                                            if (med.status === 'Active' && med.startDate) {
                                                                const start = new Date(med.startDate);
                                                                start.setHours(0, 0, 0, 0);
                                                                const end = new Date(start);
                                                                end.setDate(start.getDate() + med.durationDays);
                                                                const today = new Date();
                                                                today.setHours(0, 0, 0, 0);
                                                                const remaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                                return (
                                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wide flex items-center gap-1 ${remaining <= 2
                                                                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                                                                        : 'bg-blue-50 text-blue-700 border-blue-100'
                                                                        }`}>
                                                                        ⏱ {remaining > 0 ? `${remaining}d left of ${med.durationDays}d` : 'Ending today'}
                                                                    </span>
                                                                );
                                                            }
                                                            return (
                                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 uppercase tracking-wide">
                                                                    {med.durationDays}d course
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                {med.purpose && (
                                                    <div className="mt-1 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Reason</p>
                                                        <p className="text-sm font-bold text-slate-700 leading-snug capitalize">{med.purpose}</p>
                                                    </div>
                                                )}

                                                {(med.startDate || med.addedBy) && (
                                                    <div className="mt-4 pt-4 border-t-2 border-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="flex items-center justify-between w-full sm:w-auto">
                                                            {med.startDate && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Started: {med.startDate}</span>
                                                                </div>
                                                            )}

                                                        </div>

                                                        {med.addedBy && (
                                                            <div className="flex items-center gap-3 w-full sm:w-auto sm:justify-end">
                                                                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 sm:text-right mt-2 sm:mt-0 items-start sm:items-end">
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                                        {med.addedBy === 'Self' ? 'Self Added' : `Prescribed / Edited By ${med.addedBy}`}
                                                                    </span>
                                                                    {(med.createdAt || med.updatedAt) && med.addedBy !== 'Self' && (
                                                                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
                                                                            • {new Date(med.updatedAt || med.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {med.addedBy === 'Self' && (
                                                                    <>
                                                                        {med.id.toString().startsWith('legacy-') && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingMed(med);
                                                                                    setShowAddMedication(true);
                                                                                }}
                                                                                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors border border-yellow-200 group/edit animate-pulse shadow-sm"
                                                                            >
                                                                                <Edit2 className="w-3.5 h-3.5 group-hover/edit:scale-110 transition-transform" />
                                                                                <span className="text-[10px] font-bold uppercase tracking-wider">Edit</span>
                                                                            </button>
                                                                        )}

                                                                        {med.status !== 'Stopped' ? (
                                                                            <button
                                                                                onClick={() => handleStop(med.id, med.name)}
                                                                                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-100 group/stop"
                                                                            >
                                                                                <Ban className="w-3.5 h-3.5 group-hover/stop:scale-110 transition-transform" />
                                                                                <span className="text-[10px] font-bold uppercase tracking-wider">Stop</span>
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => handleRestart(med.id, med.name)}
                                                                                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-100 group/play"
                                                                            >
                                                                                <Play className="w-3.5 h-3.5 group-hover/play:scale-110 transition-transform fill-current" />
                                                                                <span className="text-[10px] font-bold uppercase tracking-wider">Resume</span>
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                            <Pill className="w-8 h-8 text-slate-300 mb-2" />
                                            <p className="text-slate-500 text-sm font-medium">No medications added</p>
                                            <p className="text-slate-400 text-xs">Click "Add New" to track your medicines</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Upload Health Reports (Moved Right) */}
                            <motion.div
                                variants={itemVariants}
                                className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col"
                            >
                                <h2 className="text-xl font-bold text-slate-900 mb-6">Upload Lab Reports</h2>
                                <label
                                    htmlFor="lab-report-upload"
                                    className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6 min-h-[200px] hover:bg-slate-50 transition-colors cursor-pointer group"
                                >
                                    <input
                                        id="lab-report-upload"
                                        type="file"
                                        accept="application/pdf"
                                        onChange={handleFileUpload}
                                        disabled={isUploading}
                                        className="hidden"
                                    />
                                    {isUploading ? (
                                        <>
                                            <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-4" />
                                            <p className="text-sm font-bold text-teal-600">Processing PDF...</p>
                                            <p className="text-xs text-slate-400 mt-1">Extracting lab data</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                                <UploadCloud className="w-6 h-6 text-teal-500" />
                                            </div>
                                            <p className="text-sm font-medium text-slate-700 text-center mb-1">Click to upload your lab reports</p>
                                            <p className="text-xs text-slate-400 text-center mb-4">Supported format: PDF only</p>
                                            <span className="px-4 py-2 bg-teal-50 text-teal-700 text-sm font-bold rounded-lg hover:bg-teal-100 transition-colors">
                                                Browse Files
                                            </span>
                                        </>
                                    )}
                                </label>
                                {uploadError && (
                                    <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        {uploadError}
                                    </div>
                                )}
                            </motion.div>
                        </div>


                        {/* Prescriptions */}
                        <motion.div variants={itemVariants} className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900">My Prescriptions</h2>
                                {prescriptions.length > 0 && (
                                    <span className="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full">
                                        {prescriptions.length} prescription{prescriptions.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>

                            {prescriptions.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center justify-center text-center gap-3">
                                    <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center border border-teal-100">
                                        <FileText className="w-7 h-7 text-teal-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-base">No prescriptions yet</h3>
                                    <p className="text-sm text-slate-400 max-w-xs">
                                        Your doctor's prescriptions will appear here after a consultation. You can download them as PDF anytime.
                                    </p>
                                </div>
                            ) : (
                                (() => {
                                    const defaultImages = [
                                        "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&q=80&w=200",
                                        "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=200",
                                        "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=200",
                                    ];

                                    return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                            {prescriptions.map((rx) => {
                                                const snapshot   = rx.consultationData || {};
                                                const rawDate    = snapshot.date || rx.prescribedAt;
                                                let dateStr      = '';
                                                if (rawDate) {
                                                    const d = new Date(rawDate);
                                                    if (!isNaN(d.getTime())) {
                                                        const dp = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                                                        dateStr = dp;
                                                    }
                                                }

                                                const doctorName = snapshot.doctorName
                                                    ? `Dr. ${snapshot.doctorName}`
                                                    : 'Doctor';
                                                const clinicName = snapshot.clinicName || snapshot.doctorSpecialization || '';

                                                return (
                                                    <div key={rx.id} className="relative w-full group">
                                                        <CompactFolderCard
                                                            title="Prescription.pdf"
                                                            hospital={doctorName + (clinicName ? ` • ${clinicName}` : '')}
                                                            date={dateStr || "Unknown Date"}
                                                            images={defaultImages}
                                                            href={`/api/prescription/${rx.id}?mode=view`}
                                                            className="w-full pr-12" // Leave space for download icon
                                                            theme="blue"
                                                        />
                                                        {/* Direct Download Icon */}
                                                        <a
                                                            href={`/api/prescription/${rx.id}?mode=download`}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 shrink-0 p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-colors z-10"
                                                            title="Download PDF"
                                                        >
                                                            <Download className="w-5 h-5" />
                                                        </a>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()
                            )}
                        </motion.div>

                        {/* Chronic Conditions */}
                        <motion.div variants={itemVariants} className="space-y-6">
                            <h2 className="text-xl font-bold text-slate-900">Chronic Conditions</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {diagnosticConditions.length > 0 ? (
                                    diagnosticConditions.map((condition) => (
                                        <ConditionCard
                                            key={condition.id}
                                            href={`/diagnostic/${condition.id}`}
                                            name={condition.conditionName}
                                            diagnosed={condition.createdAt ? new Date(condition.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : "-"}
                                            status={condition.conditionStatus.charAt(0).toUpperCase() + condition.conditionStatus.slice(1)}
                                        />
                                    ))
                                ) : (
                                    <div className="col-span-full">
                                        <p className="text-slate-500 italic">No chronic conditions recorded</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Diagnostic Reports */}
                        <motion.div variants={itemVariants}>
                            <DiagnosticReportsSection reports={(patient?.reports as any[]) || []} />
                        </motion.div>

                    </motion.div>
                )}

                {/* Other Views */}
                {currentView === 'help' && <HelpSupportView />}
                {currentView === 'labreports' && (
                    <LabReports
                        user={user}
                        reports={labReportsData}
                        onDelete={handleDeleteReport}
                    />
                )}
            </main>

            {/* Add/Edit Medication Modal */}
            <AnimatePresence>
                {showAddMedication && (
                    <AddMedicationModal
                        patientId={patient?.id}
                        initialData={editingMed}
                        onClose={() => {
                            setShowAddMedication(false);
                            setEditingMed(null);
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmAction && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2rem] shadow-2xl w-[90%] max-w-lg overflow-hidden border border-slate-100 flex flex-col"
                        >
                            <div className={`p-6 sm:p-8 text-center ${confirmAction?.type === 'stop' ? 'bg-red-50' : 'bg-teal-50'} border-b ${confirmAction?.type === 'stop' ? 'border-red-100' : 'border-teal-100'}`}>
                                <div className={`w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-sm ${confirmAction?.type === 'stop' ? 'bg-red-100 text-red-600' : 'bg-teal-100 text-teal-600'}`}>
                                    {confirmAction?.type === 'stop' ? <Ban className="w-8 h-8 sm:w-12 sm:h-12" /> : <Play className="w-8 h-8 sm:w-12 sm:h-12 ml-1 sm:ml-2" />}
                                </div>
                                <h3 className={`text-xl sm:text-3xl font-black uppercase tracking-tight ${confirmAction?.type === 'stop' ? 'text-red-900' : 'text-teal-900'}`}>
                                    {confirmAction?.type === 'stop' ? 'Stop Medication?' : 'Resume Medication?'}
                                </h3>
                            </div>

                            <div className="p-6 sm:p-8 flex flex-col flex-grow">
                                <p className="text-slate-600 text-center font-medium mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed flex-grow">
                                    Are you sure you want to {confirmAction?.type === 'stop' ? 'stop taking' : 'resume taking'} <span className="font-black text-slate-800 uppercase block mt-2 text-xl sm:text-2xl">{confirmAction?.name}</span>?
                                </p>

                                <div className="grid grid-cols-2 gap-4 mt-auto">
                                    <button
                                        onClick={() => setConfirmAction(null)}
                                        className="py-3 sm:py-4 px-4 sm:px-6 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl sm:rounded-2xl hover:bg-slate-50 transition-colors uppercase tracking-wide text-xs sm:text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={executeConfirmation}
                                        className={`py-3 sm:py-4 px-4 sm:px-6 font-bold rounded-xl sm:rounded-2xl text-white shadow-xl transition-all uppercase tracking-wide text-xs sm:text-sm flex items-center justify-center gap-2 ${confirmAction?.type === 'stop' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-teal-500 hover:bg-teal-600 shadow-teal-200'}`}
                                    >
                                        {confirmAction?.type === 'stop' ? <Ban className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                                        <span className="hidden sm:inline">{confirmAction?.type === 'stop' ? 'Yes, Stop It' : 'Yes, Resume It'}</span>
                                        <span className="sm:hidden">{confirmAction?.type === 'stop' ? 'Stop' : 'Resume'}</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Welcome Popup for New Users */}
            <AnimatePresence>
                {showWelcome && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 50 }}
                        transition={{ duration: 0.5, type: "spring", stiffness: 200, damping: 20 }}
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none px-4 w-full max-w-sm"
                    >
                        <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 text-center border-2 sm:border-4 border-white">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                                className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-white rounded-full flex items-center justify-center"
                            >
                                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-teal-600" />
                            </motion.div>
                            <motion.h2
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="text-2xl sm:text-3xl font-black text-white mb-2 sm:mb-3 tracking-tight"
                            >
                                Welcome Aboard!
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6 }}
                                className="text-base sm:text-lg font-bold text-white/90 mb-1 sm:mb-2"
                            >
                                Track Health - You're the Best!
                            </motion.p>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 }}
                                className="text-white/80 font-medium text-sm"
                            >
                                Your health journey starts now 🎉
                            </motion.p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer */}
            <Footer />
        </div>
    );
}
