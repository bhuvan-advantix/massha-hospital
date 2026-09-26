"use client";

import { useState, useRef, useEffect } from 'react';
import {
    Activity, ArrowLeft, Stethoscope, Save, Plus, X, Upload, Calendar, Phone, UserPlus, User, Ruler, FileText, Pill, Trash2, MapPin, Weight, ChevronDown, CheckCircle2, AlertCircle, Loader2, AlertTriangle, Heart, ShieldCheck,
    Brain, TrendingUp, TrendingDown, Minus, GripVertical, ChevronRight, FlaskConical, Syringe, Mic, MicOff, Waves
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { finishConsultation, appendPatientClinicalContext, savePrescription } from '@/app/actions/consultation';
import { saveDiagnostic } from '@/app/actions/diagnostic';
import { processReportUploadedByDoctor } from '@/app/actions/labReports';
import { getCloudinarySignature } from '@/app/actions/cloudinarySignature';
import { addLabOrders } from '@/app/actions/labOrders';
import PrintPrescription from './PrintPrescription';

export default function DoctorConsultationView({
    patient, doctor, healthParams, privateNotes, staffVitals
}: any) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [printMode, setPrintMode] = useState(false);
    const [isPdfUploading, setIsPdfUploading] = useState(false);
    // Ref to the hidden print layout DOM node — used for PDF generation
    const prescriptionRef = useRef<HTMLDivElement>(null);

    // Voice Assistant State
    const [isListening, setIsListening] = useState(false);

    const [commonDiagnoses, setCommonDiagnoses] = useState([
        "Fever", "Stomach Ache", "Common Cold", "Influenza", "Headache", "Migraine",
        "Hypertension", "Diabetes Type 2", "Allergic Rhinitis", "Asthma", "Gastritis",
        "Gastroenteritis", "Acid Reflux (GERD)", "Urinary Tract Infection", "Bronchitis",
        "Pneumonia", "Pharyngitis", "Tonsillitis", "Sinusitis", "Otitis Media (Ear Infection)",
        "Conjunctivitis", "Dermatitis", "Eczema", "Anemia", "Hypothyroidism", "Hyperthyroidism",
        "Osteoarthritis", "Rheumatoid Arthritis", "Osteoporosis", "Gout", "Kidney Stones",
        "Gallstones", "Hemorrhoids", "Constipation", "Diarrhea", "Irritable Bowel Syndrome",
        "Insomnia", "Anxiety", "Depression", "Muscle Spasm", "Sprain/Strain",
        "Back Pain (Lumbago)", "Sciatica", "Acne", "Psoriasis", "Chickenpox",
        "Dengue Fever", "Typhoid Fever", "Malaria", "COVID-19"
    ]);

    const commonMedications = [
        "Paracetamol 500mg", "Amoxicillin 500mg", "Ibuprofen 400mg", "Cetirizine 10mg", "Azithromycin 500mg",
        "Pantoprazole 40mg", "Metformin 500mg", "Losartan 50mg", "Amlodipine 5mg", "Atorvastatin 20mg",
        "Omeprazole 20mg", "Ciprofloxacin 500mg", "Dolo 650mg", "Vitamin C 500mg", "Crocine 500mg",
        "Levocetirizine 5mg", "Diclofenac 50mg"
    ];

    const getLatestValue = (paramName: string) => {
        const param = healthParams.find((p: any) => p.parameterName === paramName);
        return param ? param.value : '';
    };

    const age = patient.dateOfBirth ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / 31557600000) : null;

    // Form States
    const [diagnoses, setDiagnoses] = useState<string[]>([]);
    const [customDiagnosis, setCustomDiagnosis] = useState('');
    const [isDiagDropdownOpen, setIsDiagDropdownOpen] = useState(false);
    const [diagSearch, setDiagSearch] = useState('');

    const handleAddDiagnosis = (diag: string) => {
        const trimmed = diag.trim();
        if (trimmed) {
            if (!diagnoses.includes(trimmed)) {
                setDiagnoses([...diagnoses, trimmed]);
            }
            if (!commonDiagnoses.includes(trimmed)) {
                setCommonDiagnoses([...commonDiagnoses, trimmed]);
            }
        }
        setCustomDiagnosis('');
    };

    const handleRemoveDiagnosis = (diag: string) => {
        setDiagnoses(diagnoses.filter((d) => d !== diag));
    };

    // Medications
    const [medications, setMedications] = useState<Array<{ id: number, name: string, morning: boolean, afternoon: boolean, night: boolean, days: string, beforeFood: boolean, afterFood: boolean, isPrescribed?: boolean }>>([
        { id: Date.now(), name: '', morning: false, afternoon: false, night: false, days: '', beforeFood: false, afterFood: false, isPrescribed: true }
    ]);
    const [activeMedDropdown, setActiveMedDropdown] = useState<number | null>(null);
    const [medSearch, setMedSearch] = useState('');

    // Vitals - prefer the most-recent staff-recorded entry; fall back to healthParams / patient
    const cleanValue = (raw: string) => raw.replace(/^[HLhl]\s+/, '').trim();
    const latestStaffVital = staffVitals && staffVitals.length > 0 ? staffVitals[0] : null;

    const [vitals, setVitals] = useState({
        weight:        latestStaffVital?.weight        ? cleanValue(latestStaffVital.weight.toString().replace(/kg/i, '').trim())        : cleanValue((getLatestValue('Weight')       || patient.weight || '').toString().replace(/kg/i, '').trim()),
        height:        latestStaffVital?.height        ? cleanValue(latestStaffVital.height.toString().replace(/cm/i, '').trim())        : cleanValue((getLatestValue('Height')       || patient.height || '').toString().replace(/cm/i, '').trim()),
        bloodPressure: latestStaffVital?.bloodPressure ? cleanValue(latestStaffVital.bloodPressure.toString().replace(/mm\s*Hg/i, '').trim()) : cleanValue((getLatestValue('Blood Pressure') || '').toString().replace(/mm\s*Hg/i, '').trim()),
        temperature:   latestStaffVital?.temperature  ? cleanValue(latestStaffVital.temperature.toString().replace(/[°f℃c]/gi, '').trim())  : '',
        pulseRate:     latestStaffVital?.pulseRate     ? cleanValue(latestStaffVital.pulseRate.toString().replace(/bpm/i, '').trim())      : '',
        spO2:          latestStaffVital?.spO2          ? cleanValue(latestStaffVital.spO2.toString().replace(/%/i, '').trim())             : '',
        bloodGlucose:  cleanValue((getLatestValue('Blood Glucose') || getLatestValue('Blood Sugar') || '').toString().replace(/mg\/dL/i, '').trim()),
        cholesterol:   cleanValue((getLatestValue('Total Cholesterol') || getLatestValue('Cholesterol') || '').toString().replace(/mg\/dL/i, '').trim()),
        hba1c:         cleanValue((getLatestValue('HbA1c') || '').toString().replace(/%/i, '').trim()),
    });

    // Notes
    const [doctorNote, setDoctorNote] = useState(privateNotes?.[0]?.noteContent || '');
    const [patientNote, setPatientNote] = useState('');
    const [summaryType, setSummaryType] = useState<'manual' | 'ai'>('manual');
    const [summaryText, setSummaryText] = useState('');

    // Clinical Context — always-visible inline inputs (saved with main consultation submit)
    const [newAllergies, setNewAllergies] = useState('');
    const [newSurgeries, setNewSurgeries] = useState('');
    const [newLifestyle, setNewLifestyle] = useState('');

    // ── Diagnostic Pathway state ────────────────────────────────────
    const NODE_TYPES = [
        { value: 'initial', label: 'Start / Presentation', color: '#10B981' },
        { value: 'symptoms', label: 'Symptoms', color: '#F59E0B' },
        { value: 'diagnosis', label: 'Diagnosis / Finding', color: '#8B5CF6' },
        { value: 'treatment', label: 'Treatment / Medication', color: '#22C55E' },
        { value: 'care', label: 'Ongoing Care / Monitoring', color: '#0EA5E9' },
        { value: 'terminal', label: 'Current Status / Follow-up', color: '#3B82F6' },
    ];

    const [diagConditionName, setDiagConditionName] = useState('');
    const [diagStatus, setDiagStatus] = useState<'improving' | 'stable' | 'worsening'>('stable');
    const [diagNodes, setDiagNodes] = useState<Array<{
        id: string; title: string; description: string; type: string;
        connections: string[]; parameters: { name: string; value: string; unit: string }[];
        x: number; y: number;
    }>>([]);
    const [diagClinicalNotes, setDiagClinicalNotes] = useState('');
    const [diagTreatmentPlan, setDiagTreatmentPlan] = useState('');
    const [isSavingDiag, setIsSavingDiag] = useState(false);
    const [diagSaved, setDiagSaved] = useState(false);
    const [diagError, setDiagError] = useState('');
    const [diagOpen, setDiagOpen] = useState(false);

    const addDiagNode = () => {
        const id = `node-${Date.now()}`;
        const col = diagNodes.filter(n => n.x === Math.max(0, ...diagNodes.map(n => n.x))).length;
        setDiagNodes(prev => [...prev, {
            id, title: '', description: '', type: 'diagnosis',
            connections: prev.length > 0 ? [prev[prev.length - 1].id] : [],
            parameters: [], x: prev.length, y: 0
        }]);
    };

    const updateDiagNode = (id: string, field: string, value: any) =>
        setDiagNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));

    const removeDiagNode = (id: string) =>
        setDiagNodes(prev => prev
            .filter(n => n.id !== id)
            .map(n => ({ ...n, connections: n.connections.filter(c => c !== id) }))
        );

    const addNodeParam = (nodeId: string) =>
        setDiagNodes(prev => prev.map(n => n.id === nodeId
            ? { ...n, parameters: [...n.parameters, { name: '', value: '', unit: '' }] }
            : n
        ));

    const updateNodeParam = (nodeId: string, idx: number, field: string, val: string) =>
        setDiagNodes(prev => prev.map(n => {
            if (n.id !== nodeId) return n;
            const params = [...n.parameters];
            params[idx] = { ...params[idx], [field]: val };
            return { ...n, parameters: params };
        }));

    const removeNodeParam = (nodeId: string, idx: number) =>
        setDiagNodes(prev => prev.map(n => {
            if (n.id !== nodeId) return n;
            return { ...n, parameters: n.parameters.filter((_, i) => i !== idx) };
        }));

    const handleSaveDiagnostic = async () => {
        if (!diagConditionName.trim()) { setDiagError('Please enter a condition name.'); return; }
        if (diagNodes.length === 0) { setDiagError('Add at least one pathway step.'); return; }
        setIsSavingDiag(true); setDiagError('');
        try {
            const res = await saveDiagnostic(patient.id, {
                conditionName: diagConditionName,
                conditionStatus: diagStatus,
                nodes: diagNodes.map((n, i) => ({ ...n, date: new Date().toISOString() })),
                clinicalNotes: diagClinicalNotes,
                treatmentPlan: diagTreatmentPlan,
            });
            if (res.success) {
                setDiagSaved(true);
                setTimeout(() => setDiagSaved(false), 3000);
            } else setDiagError(res.error || 'Failed to save');
        } catch (e: any) {
            setDiagError(e.message || 'Unexpected error');
        } finally { setIsSavingDiag(false); }
    };
    // ──────────────────────────────────────────────────────────────────

    // Follow up
    const [followUp, setFollowUp] = useState('');
    const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
    const followUpRef = useRef<HTMLDivElement>(null);
    const FOLLOWUP_OPTIONS = [
        { value: '', label: 'No Follow-up Scheduled' },
        { value: 'In 3 days', label: 'In 3 days' },
        { value: 'In 1 week', label: 'In 1 week' },
        { value: 'In 2 weeks', label: 'In 2 weeks' },
        { value: 'In 1 month', label: 'In 1 month' },
        { value: 'SOS / When needed', label: 'SOS / When needed' },
    ];

    // Lab Tests & Injections ordered (staff/lab only — NOT visible to patient)
    const [labTests, setLabTests] = useState<Array<{ id: number; name: string; notes: string }>>([]);
    const [injections, setInjections] = useState<Array<{ id: number; name: string; notes: string }>>([]);
    const [labOrderInput, setLabOrderInput] = useState('');
    const [injectionInput, setInjectionInput] = useState('');

    const addLabTest = () => {
        const n = labOrderInput.trim();
        if (!n) return;
        setLabTests(prev => [...prev, { id: Date.now(), name: n, notes: '' }]);
        setLabOrderInput('');
    };
    const removeLabTest = (id: number) => setLabTests(prev => prev.filter(t => t.id !== id));

    const addInjection = () => {
        const n = injectionInput.trim();
        if (!n) return;
        setInjections(prev => [...prev, { id: Date.now(), name: n, notes: '' }]);
        setInjectionInput('');
    };
    const removeInjection = (id: number) => setInjections(prev => prev.filter(i => i.id !== id));

    // Lab upload state
    const [isUploadingLab, setIsUploadingLab] = useState(false);
    const [uploadedReports, setUploadedReports] = useState<Array<{ name: string; labName: string | null; date: string; reportId: string }>>([]);
    const [uploadError, setUploadError] = useState('');
    const [labNote, setLabNote] = useState('');
    const labFileRef = useRef<HTMLInputElement>(null);

    // AI Summary state
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    const handleGenerateAISummary = async () => {
        if (!diagnoses.length && !medications.find(m => m.name.trim() !== '')) {
            alert("Please add at least one diagnosis or medication to generate a summary.");
            return;
        }

        setIsGeneratingSummary(true);
        try {
            const formattedMeds = medications
                .filter(m => m.name.trim() !== '')
                .map(m => {
                    const times = [];
                    if (m.morning) times.push('Morning');
                    if (m.afternoon) times.push('Afternoon');
                    if (m.night) times.push('Night');
                    
                    const timing = times.length > 0 ? times.join(' - ') : 'As directed';
                    const relation = m.beforeFood ? '(Before Food)' : m.afterFood ? '(After Food)' : '';
                    let daysStr = m.days;
                    if (daysStr && !isNaN(Number(daysStr))) daysStr = `${daysStr} days`;
                    else if (!daysStr) daysStr = 'Duration not specified';
                    
                    return `${m.name} - ${timing} ${relation} - ${daysStr}`;
                });

            const reqBody = {
                diagnoses,
                medications: formattedMeds,
                patientName: patient.name,
                age: age,
                gender: patient.gender,
                vitals: {
                    bloodPressure: vitals.bloodPressure,
                    bloodGlucose: vitals.bloodGlucose,
                    weight: vitals.weight,
                    height: vitals.height
                },
                labTests: labTests.map(t => t.name),
                injections: injections.map(i => i.name),
                patientNote,
                diagClinicalNotes,
                followUp
            };

            const response = await fetch('/api/ai-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to generate AI summary');
            }

            const data = await response.json();
            if (data.summary) {
                setSummaryText(data.summary);
            } else {
                throw new Error("Empty summary received from AI");
            }

        } catch (error: any) {
            console.error('Error generating AI summary:', error);
            alert(error.message || "An error occurred while generating the AI summary. Please try again or switch to manual.");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    // Close followup dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (followUpRef.current && !followUpRef.current.contains(e.target as Node)) {
                setIsFollowUpOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Voice recognition effect
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        let recognition: any = null;

        if (isListening) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                const current = event.resultIndex;
                const transcriptLine = event.results[current][0].transcript;
                
                const processTranscript = (text: string) => {
                    const commandMap: Record<string, string> = {
                        'diagnosis': 'diagnosis',
                        'diagnoses': 'diagnosis',
                        'medicine': 'medicine',
                        'medicines': 'medicine',
                        'lab test': 'lab test',
                        'lab tests': 'lab test',
                        'injection': 'injection',
                        'injections': 'injection',
                        'follow up': 'follow up',
                        'followup': 'follow up',
                        'next follow up': 'follow up',
                        'next followup': 'follow up',
                        'advice': 'advice',
                        'patient advice': 'advice',
                        'patient advice note': 'advice',
                        'advice note': 'advice',
                        'private note': 'private note',
                        'doctor note': 'private note',
                        'allergies': 'allergies',
                        'allergy': 'allergies',
                        'surgeries': 'surgeries',
                        'surgery': 'surgeries',
                        'past surgeries': 'surgeries',
                        'past surgery': 'surgeries',
                        'lifestyle': 'lifestyle',
                        'diet': 'lifestyle',
                        'patient clinical context': 'context',
                        'clinical context': 'context'
                    };
                    
                    // Sort by length descending to match longest sequences first
                    const triggerKeys = Object.keys(commandMap).sort((a, b) => b.length - a.length);
                    // Build regex without backslashes to avoid escaping bugs: replace spaces with [ ]+
                    const regexSrc = `(${triggerKeys.map(k => k.replace(/ /g, '[ ]+')).join('|')})`;
                    const regex = new RegExp(regexSrc, 'gi');
                    const parts = text.split(regex);
                    let currentCommand: string | null = null;
                    
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i].trim();
                        if (!part) continue;
                        
                        // Check if part is a trigger word by ignoring case
                        // Also normalize spaces in part to match triggerKeys format
                        const normalizedPart = part.toLowerCase().replace(/[ ]+/g, ' ');
                        const isTriggerKey = triggerKeys.find(k => k.toLowerCase() === normalizedPart);
                        
                        if (isTriggerKey) {
                            currentCommand = commandMap[isTriggerKey.toLowerCase()];
                        } else if (currentCommand) {
                            const payload = part.charAt(0).toUpperCase() + part.slice(1);
                            switch(currentCommand) {
                                case 'diagnosis':
                                    const diagLower = payload.toLowerCase();
                                    const matchedDiags = commonDiagnoses.filter(d => diagLower.includes(d.toLowerCase()));
                                    if (matchedDiags.length > 0) {
                                        setDiagnoses(prev => {
                                            let newDiags = [...prev];
                                            matchedDiags.forEach(matched => {
                                                if (!newDiags.includes(matched)) newDiags.push(matched);
                                            });
                                            return newDiags;
                                        });
                                    } else {
                                        setDiagnoses(prev => !prev.includes(payload) ? [...prev, payload] : prev);
                                    }
                                    break;
                                case 'medicine':
                                    const lowerPart = payload.toLowerCase();
                                    const morning = lowerPart.includes('morning');
                                    const afternoon = lowerPart.includes('afternoon');
                                    const night = lowerPart.includes('night');
                                    const beforeFood = lowerPart.includes('before');
                                    const afterFood = lowerPart.includes('after');
                                    
                                    let days = '';
                                    const digitMatch = payload.match(/([0-9]+)[ ]*(days?|day)/i) || payload.match(/for[ ]*([0-9]+)/i);
                                    let wordMatched = '';
                                    const wordMap: Record<string, string> = {
                                        'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
                                        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
                                        'eleven': '11', 'twelve': '12', 'fourteen': '14', 'fifteen': '15',
                                        'twenty': '20', 'thirty': '30'
                                    };
                                    if (digitMatch && digitMatch[1]) {
                                        days = digitMatch[1];
                                    } else {
                                        for (const [word, num] of Object.entries(wordMap)) {
                                            if (new RegExp(`(?:for[ ]+)?(^|[ ])${word}([ ]|$)(?:[ ]+days?)?`, 'i').test(payload)) {
                                                days = num;
                                                wordMatched = word;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    let cleanRegexOptions = ['morning', 'afternoon', 'night', 'before food', 'after food', 'before', 'after'];
                                    if (days) {
                                        cleanRegexOptions.push(`for[ ]*${days}[ ]*days?`, `${days}[ ]*days?`, `for[ ]*${days}`);
                                    }
                                    let cleanRegex = new RegExp(`(${cleanRegexOptions.join('|')})`, 'gi');
                                    let nameRaw = payload.replace(cleanRegex, '').trim();
                                    
                                    if (wordMatched) {
                                        nameRaw = nameRaw.replace(new RegExp(`(?:for[ ]+)?(^|[ ])${wordMatched}([ ]|$)(?:[ ]+days?)?`, 'gi'), '').trim();
                                    }
                                    nameRaw = nameRaw.replace(/(^|[ ])(?:for|days?)([ ]|$)/gi, ' ').replace(/[ ]+/g, ' ');
                                    nameRaw = nameRaw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
                                    
                                    let finalName = nameRaw.charAt(0).toUpperCase() + nameRaw.slice(1);
                                    
                                    if (nameRaw) {
                                        const matchedMed = commonMedications.find(m => m.toLowerCase().includes(nameRaw.toLowerCase()) || nameRaw.toLowerCase().includes(m.toLowerCase()));
                                        if (matchedMed) finalName = matchedMed;
                                        
                                        setMedications((prev: any) => {
                                            const newMed = { id: Date.now() + Math.random(), name: finalName, morning, afternoon, night, days, beforeFood, afterFood, isPrescribed: true };
                                            return [...prev.filter((m: any) => m.name.trim() !== ''), newMed];
                                        });
                                    }
                                    break;
                                case 'lab test':
                                    setLabTests((prev: any) => [...prev, { id: Date.now() + Math.random(), name: payload, notes: '' }]);
                                    break;
                                case 'injection':
                                    setInjections((prev: any) => [...prev, { id: Date.now() + Math.random(), name: payload, notes: '' }]);
                                    break;
                                case 'follow up':
                                    const fwLower = payload.toLowerCase();
                                    const fwOptions = ['In 3 days', 'In 1 week', 'In 2 weeks', 'In 1 month', 'SOS / When needed'];
                                    let matchedFw = fwOptions.find(fw => fwLower.includes(fw.toLowerCase()));
                                    if (!matchedFw) matchedFw = fwOptions.find(fw => fw.toLowerCase().includes(fwLower.replace(/in[ ]+/g,'').trim()));
                                    
                                    if (!matchedFw) {
                                        if (fwLower.includes('week') || fwLower.includes('7 days')) matchedFw = 'In 1 week';
                                        else if (fwLower.includes('month') || fwLower.includes('30 days')) matchedFw = 'In 1 month';
                                        else if (fwLower.includes('3') || fwLower.includes('three')) matchedFw = 'In 3 days';
                                        else if (fwLower.includes('14') || fwLower.includes('2 weeks') || fwLower.includes('two weeks')) matchedFw = 'In 2 weeks';
                                        else if (fwLower.includes('sos') || fwLower.includes('need') || fwLower.includes('emergency')) matchedFw = 'SOS / When needed';
                                        else if (fwLower.includes('none') || fwLower.includes('no')) matchedFw = '';
                                    }
                                    
                                    setFollowUp(matchedFw !== undefined ? matchedFw : payload);
                                    break;
                                case 'allergies':
                                    setNewAllergies((prev: string) => prev ? prev + ", " + payload : payload);
                                    break;
                                case 'surgeries':
                                    setNewSurgeries((prev: string) => prev ? prev + ", " + payload : payload);
                                    break;
                                case 'lifestyle':
                                    setNewLifestyle((prev: string) => prev ? prev + "\n" + payload : payload);
                                    break;
                                case 'context':
                                    setNewLifestyle((prev: string) => prev ? prev + "\n" + payload : payload);
                                    break;
                                case 'advice':
                                    setPatientNote((prev: string) => prev + (prev ? "\n" : "") + payload);
                                    break;
                                case 'private note':
                                    setDoctorNote((prev: string) => prev + (prev ? "\n" : "") + payload);
                                    break;
                            }
                            currentCommand = null;
                        }
                    }
                };

                processTranscript(transcriptLine);
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                if (event.error === 'not-allowed' || event.error === 'network') {
                    setIsListening(false);
                }
            };
            
            recognition.onend = () => {
                 if (isListening) {
                     try { recognition.start(); } catch(e) {}
                 }
            }

            try {
                recognition.start();
            } catch (e) {
                console.error(e);
            }
        }

        return () => {
            if (recognition) {
                recognition.onend = null;
                recognition.stop();
            }
        };
    }, [isListening]);

    const handleLabUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setUploadError('Only PDF files are supported');
            event.target.value = '';
            return;
        }
        setIsUploadingLab(true);
        setUploadError('');
        try {
            // 1. Get cloudinary signature
            const { signature, timestamp, cloudName, apiKey } = await getCloudinarySignature();
            if (!cloudName || !apiKey) throw new Error('Cloud config missing');

            // 2. Upload to Cloudinary client-side
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', apiKey!);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);
            formData.append('folder', 'lab_reports');
            formData.append('type', 'upload');
            formData.append('access_mode', 'public');

            const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
                method: 'POST',
                body: formData,
            });
            if (!uploadRes.ok) {
                const errData = await uploadRes.json();
                throw new Error(errData.error?.message || 'Upload to cloud failed');
            }
            const uploadData = await uploadRes.json();
            const secureUrl = uploadData.secure_url;

            // 3. Process on server: AI extraction + save to patient DB
            // Use the doctor's clinic name as the lab name for display
            const clinicName = doctor?.clinicName || null;
            const result = await processReportUploadedByDoctor(
                secureUrl,
                patient.id,
                file.name,
                file.size,
                clinicName || undefined,
                labNote.trim() || undefined
            );

            if (result.success) {
                const displayName = clinicName || result.labName || 'Clinic';
                setUploadedReports(prev => [
                    ...prev,
                    {
                        name: file.name,
                        labName: displayName,
                        date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                        reportId: result.reportId!,
                    }
                ]);
            } else {
                setUploadError(result.error || 'Upload failed');
            }
        } catch (err: any) {
            setUploadError(err.message || 'Unexpected error during upload');
        } finally {
            setIsUploadingLab(false);
            event.target.value = '';
        }
    };


    const handleAddMedication = () => {
        setMedications([...medications, { id: Date.now(), name: '', morning: false, afternoon: false, night: false, days: '', beforeFood: false, afterFood: false, isPrescribed: true }]);
    };

    const handleRemoveMedication = (id: number) => {
        setMedications(medications.filter(m => m.id !== id));
    };

    const updateMedication = (id: number, field: string, value: any) => {
        setMedications(medications.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const handleSubmit = async (shouldPrint = false) => {
        setIsSaving(true);
        try {
            // Process medications format
            const formattedMeds = medications.filter(m => m.name.trim() !== '' && m.isPrescribed !== false).map(m => {
                const times = [];
                if (m.morning) times.push('Morning');
                if (m.afternoon) times.push('Afternoon');
                if (m.night) times.push('Night');
                let timeStr = times.length > 0 ? times.join(', ') : 'As needed';
                let foodStr = [];
                if (m.beforeFood) foodStr.push('Before Food');
                if (m.afterFood) foodStr.push('After Food');
                if (foodStr.length > 0) {
                    timeStr += ` (${foodStr.join(' / ')})`;
                }
                return {
                    name: m.name,
                    time: timeStr,
                    days: m.days
                };
            });

            const formattedVitals = [
                { name: 'Blood Pressure', value: vitals.bloodPressure, unit: 'mm Hg' },
                { name: 'Blood Glucose', value: vitals.bloodGlucose, unit: 'mg/dL' },
                { name: 'Weight', value: vitals.weight, unit: 'kg' },
                { name: 'Height', value: vitals.height, unit: 'cm' },
                { name: 'Cholesterol', value: vitals.cholesterol, unit: 'mg/dL' },
                { name: 'HbA1c', value: vitals.hba1c, unit: '%' },
            ].filter(v => v.value.trim() !== '');

            const result = await finishConsultation(patient.id, {
                height: vitals.height,
                weight: vitals.weight,
                vitals: formattedVitals,
                medications: formattedMeds,
                clinicalNotesPrivate: doctorNote,
                patientNote: patientNote,
                diagnosis: diagnoses.join(', '),
                followUp: followUp
            });

            // Save lab orders (staff/lab only — not shown to patient)
            const allOrders = [
                ...labTests.map(t => ({ name: t.name, type: 'lab' as const, notes: t.notes })),
                ...injections.map(i => ({ name: i.name, type: 'injection' as const, notes: i.notes })),
            ];
            if (allOrders.length > 0) {
                await addLabOrders(patient.id, allOrders);
            }

            // Append clinical context if doctor filled anything in
            if (newAllergies.trim() || newSurgeries.trim() || newLifestyle.trim()) {
                await appendPatientClinicalContext(patient.id, {
                    allergies: newAllergies.trim() || undefined,
                    pastSurgeries: newSurgeries.trim() || undefined,
                    lifestyle: newLifestyle.trim() || undefined,
                });
            }

            // Save Diagnostic Pathway automatically on consultation submit
            if (diagConditionName.trim() || diagnoses.length > 0 || diagNodes.length > 0) {
                const finalCondName = diagConditionName.trim() || diagnoses.join(', ') || 'Clinical Evaluation';
                const finalNodes = diagNodes.length > 0 ? diagNodes : [
                    {
                        id: 'node-consult',
                        title: 'Consultation & Clinical Assessment',
                        description: `Diagnosis: ${diagnoses.join(', ') || 'Under evaluation'}.${patientNote ? ` Advice: ${patientNote}` : ''}`,
                        type: 'diagnosis',
                        connections: [],
                        parameters: formattedVitals.map(v => ({ name: v.name, value: v.value, unit: v.unit })),
                        x: 0,
                        y: 0
                    }
                ];
                await saveDiagnostic(patient.id, {
                    conditionName: finalCondName,
                    conditionStatus: diagStatus,
                    nodes: finalNodes.map(n => ({ ...n, date: new Date().toISOString() })),
                    clinicalNotes: diagClinicalNotes || doctorNote || '',
                    treatmentPlan: diagTreatmentPlan || (formattedMeds.length > 0 ? formattedMeds.map(m => m.name).join(', ') : ''),
                }).catch(err => console.error('[Consultation] saveDiagnostic error:', err));
            }

            if (result.success) {
                if (shouldPrint) {
                    // ── Generate prescription PDF ─────────────────────────────
                    try {
                        setIsPdfUploading(true);
                        const { jsPDF } = await import('jspdf');

                        const doctorName     = (doctor as any)?.userName || doctor?.name || 'Doctor';
                        const clinicName     = doctor?.clinicName || 'Niraiva Health Care';
                        const specialization = doctor?.specialization || '';
                        const degree         = doctor?.degree || doctor?.qualification || '';
                        const clinicAddress  = doctor?.address
                            ? `${doctor.address}${doctor.city ? ', ' + doctor.city : ''}`
                            : '';
                        const clinicPhone = doctor?.phoneNumber || '';

                        const today = new Date();
                        const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
                        const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

                        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                        const PW  = pdf.internal.pageSize.getWidth();   // 210
                        const PH  = pdf.internal.pageSize.getHeight();  // 297
                        const ML  = 15;   // left margin
                        const MR  = 15;   // right margin
                        const CW  = PW - ML - MR;                       // 180 mm
                        const ROW = 12;   // standard row height
                        let   y   = 0;

                        const newPage = () => { pdf.addPage(); y = 20; };
                        const check   = (need: number) => { if (y + need > PH - 20) newPage(); };

                        // ── HEADER (teal bar, 32mm) ────────────────────────────────
                        pdf.setFillColor(13, 148, 136);
                        pdf.rect(0, 0, PW, 32, 'F');

                        // Clinic name
                        pdf.setTextColor(255, 255, 255);
                        pdf.setFontSize(20);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(clinicName.toUpperCase(), ML, 13);

                        // Doctor row
                        pdf.setFontSize(9.5);
                        pdf.setFont('helvetica', 'normal');
                        const drLine = `Dr. ${doctorName}${degree ? '  |  ' + degree : ''}${specialization ? '  |  ' + specialization : ''}`;
                        pdf.text(drLine, ML, 21);

                        // Address
                        if (clinicAddress || clinicPhone) {
                            const addrLine = [clinicAddress, clinicPhone].filter(Boolean).join('  |  ');
                            pdf.text(addrLine, ML, 27);
                        }

                        // Date + time top-right
                        pdf.setFontSize(8.5);
                        pdf.text(`${dateStr},  ${timeStr}`, PW - MR, 21, { align: 'right' });

                        y = 40;

                        // ── PATIENT INFO BAR ──────────────────────────────────────
                        pdf.setFillColor(241, 245, 249);
                        pdf.rect(ML, y, CW, ROW + 4, 'F');

                        // Left: name + ID
                        pdf.setTextColor(15, 23, 42);
                        pdf.setFontSize(10.5);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(`Patient: ${patient.name || ''}`, ML + 4, y + 5);
                        pdf.setFontSize(8.5);
                        pdf.setFont('helvetica', 'normal');
                        pdf.setTextColor(100, 116, 139);
                        pdf.text(`ID: ${patient.customId || '—'}`, ML + 4, y + 11);

                        // Right: age | gender | follow-up
                        const rightParts: string[] = [];
                        if (patient.age)    rightParts.push(`Age: ${patient.age}`);
                        if (patient.gender) rightParts.push(`Gender: ${patient.gender}`);
                        if (followUp)       rightParts.push(`Follow-up: ${followUp}`);
                        pdf.setFontSize(8.5);
                        pdf.setTextColor(100, 116, 139);
                        pdf.text(rightParts.join('   '), PW - MR - 2, y + 8, { align: 'right' });

                        y += ROW + 8;

                        // ── SUMMARY (Optional) ───────────────────────────────────
                        if (summaryText?.trim()) {
                            check(30);
                            pdf.setFillColor(13, 148, 136);
                            pdf.rect(ML, y, CW, 7, 'F');
                            pdf.setTextColor(255, 255, 255);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            pdf.text('PRESCRIPTION SUMMARY', ML + 3, y + 5);
                            y += 9;

                            pdf.setTextColor(51, 65, 85);
                            pdf.setFontSize(9);
                            pdf.setFont('helvetica', 'italic');
                            const sumLines = pdf.splitTextToSize(summaryText.trim(), CW - 6);
                            pdf.text(sumLines, ML + 3, y + 2);
                            y += sumLines.length * 4.5 + 6;
                        }

                        // ── DIAGNOSES ─────────────────────────────────────────────
                        if (diagnoses.length > 0) {
                            check(20);
                            // Section title bar
                            pdf.setFillColor(13, 148, 136);
                            pdf.rect(ML, y, CW, 7, 'F');
                            pdf.setTextColor(255, 255, 255);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            pdf.text('DIAGNOSIS', ML + 3, y + 5);
                            y += 9;

                            pdf.setTextColor(30, 41, 59);
                            pdf.setFontSize(9.5);
                            pdf.setFont('helvetica', 'normal');
                            const diagText = diagnoses.map((d: string) => `\u2022 ${d}`).join('   ');
                            const diagLines = pdf.splitTextToSize(diagText, CW - 6);
                            pdf.text(diagLines, ML + 3, y + 1);
                            y += diagLines.length * 5.5 + 5;
                        }

                        // ── MEDICATIONS ──────────────────────────────────────────
                        if (formattedMeds.length > 0) {
                            check(30);
                            pdf.setFillColor(13, 148, 136);
                            pdf.rect(ML, y, CW, 7, 'F');
                            pdf.setTextColor(255, 255, 255);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            pdf.text('Rx  MEDICATIONS', ML + 3, y + 5);
                            y += 9;

                            formattedMeds.forEach((med: any, i: number) => {
                                check(ROW + 2);
                                // Alternating rows
                                pdf.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
                                pdf.rect(ML, y, CW, ROW, 'F');

                                // Circle icon
                                pdf.setFillColor(204, 251, 241);
                                pdf.circle(ML + 5, y + 6, 3.5, 'F');
                                pdf.setTextColor(13, 148, 136);
                                pdf.setFontSize(9);
                                pdf.setFont('helvetica', 'bold');
                                pdf.text('\u2117', ML + 3.7, y + 7.5);

                                // Med name
                                pdf.setTextColor(15, 23, 42);
                                pdf.setFontSize(10);
                                pdf.setFont('helvetica', 'bold');
                                pdf.text(med.name, ML + 12, y + 5);

                                // Timing under name
                                pdf.setTextColor(100, 116, 139);
                                pdf.setFontSize(8);
                                pdf.setFont('helvetica', 'normal');
                                pdf.text(med.time || 'As directed', ML + 12, y + 10);

                                // Days on right
                                if (med.days) {
                                    pdf.setFillColor(204, 251, 241);
                                    pdf.roundedRect(PW - MR - 24, y + 2, 22, 7, 1, 1, 'F');
                                    pdf.setTextColor(13, 148, 136);
                                    pdf.setFontSize(8);
                                    pdf.setFont('helvetica', 'bold');
                                    pdf.text(`${med.days} days`, PW - MR - 13, y + 7, { align: 'center' });
                                }
                                y += ROW + 1;
                            });
                            y += 4;
                        }

                        // ── VITALS ───────────────────────────────────────────────
                        if (formattedVitals.length > 0) {
                            check(40);
                            pdf.setFillColor(13, 148, 136);
                            pdf.rect(ML, y, CW, 7, 'F');
                            pdf.setTextColor(255, 255, 255);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            pdf.text('VITALS', ML + 3, y + 5);
                            y += 10;

                            // Always 3 columns, fixed width
                            const COLS    = 3;
                            const cellW   = CW / COLS;          // 60mm each
                            const cellH   = 16;
                            const cellGap = 2;

                            formattedVitals.forEach((v: any, i: number) => {
                                const col  = i % COLS;
                                const row  = Math.floor(i / COLS);
                                const xPos = ML + col * cellW;
                                const yPos = y + row * (cellH + cellGap);

                                check(cellH + 4);
                                // Cell background
                                pdf.setFillColor(248, 250, 252);
                                pdf.roundedRect(xPos, yPos, cellW - cellGap, cellH, 1.5, 1.5, 'F');

                                // Left accent bar
                                pdf.setFillColor(13, 148, 136);
                                pdf.rect(xPos, yPos, 2.5, cellH, 'F');

                                // Label
                                pdf.setTextColor(100, 116, 139);
                                pdf.setFontSize(7);
                                pdf.setFont('helvetica', 'normal');
                                pdf.text(v.name.toUpperCase(), xPos + 5, yPos + 5.5);

                                // Value
                                pdf.setTextColor(13, 148, 136);
                                pdf.setFontSize(12);
                                pdf.setFont('helvetica', 'bold');
                                pdf.text(`${v.value}`, xPos + 5, yPos + 12);

                                // Unit (smaller, next to value)
                                pdf.setTextColor(100, 116, 139);
                                pdf.setFontSize(7.5);
                                pdf.setFont('helvetica', 'normal');
                                const valWidth = pdf.getTextWidth(`${v.value}`);
                                pdf.text(v.unit, xPos + 5 + valWidth + 1, yPos + 12);
                            });

                            const vitalRows = Math.ceil(formattedVitals.length / COLS);
                            y += vitalRows * (cellH + cellGap) + 6;
                        }

                        // ── PATIENT NOTE ─────────────────────────────────────────
                        if (patientNote?.trim()) {
                            check(24);
                            pdf.setFillColor(254, 249, 195);
                            pdf.setDrawColor(253, 224, 71);
                            pdf.roundedRect(ML, y, CW, 6, 1, 1, 'F');
                            pdf.setTextColor(133, 77, 14);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            pdf.text('INSTRUCTIONS FOR PATIENT', ML + 3, y + 4.2);
                            y += 8;

                            pdf.setFontSize(9);
                            pdf.setFont('helvetica', 'normal');
                            pdf.setTextColor(92, 51, 9);
                            const noteLines = pdf.splitTextToSize(patientNote.trim(), CW - 6);
                            pdf.text(noteLines, ML + 3, y + 1);
                            y += noteLines.length * 5 + 8;
                        }

                        // ── SIGNATURE ─────────────────────────────────────────────
                        check(30);
                        // Push signature to bottom quarter of page if we have room
                        const sigY = Math.max(y + 6, PH - 48);
                        pdf.setDrawColor(203, 213, 225);
                        pdf.setLineWidth(0.4);
                        pdf.line(PW - MR - 58, sigY, PW - MR, sigY);
                        pdf.setTextColor(100, 116, 139);
                        pdf.setFontSize(8);
                        pdf.setFont('helvetica', 'normal');
                        pdf.text("Doctor's Signature", PW - MR - 29, sigY + 5, { align: 'center' });
                        pdf.setTextColor(15, 23, 42);
                        pdf.setFontSize(9.5);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(`Dr. ${doctorName}`, PW - MR - 29, sigY + 11, { align: 'center' });
                        if (degree || specialization) {
                            pdf.setFontSize(7.5);
                            pdf.setFont('helvetica', 'normal');
                            pdf.setTextColor(100, 116, 139);
                            pdf.text(
                                [degree, specialization].filter(Boolean).join('  |  '),
                                PW - MR - 29, sigY + 16.5, { align: 'center' }
                            );
                        }

                        // ── FOOTER BAR ────────────────────────────────────────────
                        pdf.setFillColor(13, 148, 136);
                        pdf.rect(0, PH - 9, PW, 9, 'F');
                        pdf.setTextColor(255, 255, 255);
                        pdf.setFontSize(7.5);
                        pdf.setFont('helvetica', 'normal');
                        pdf.text(
                            'Generated by Niraiva Health Platform  \u2022  www.niraivahealth.com',
                            PW / 2, PH - 4, { align: 'center' }
                        );

                        // ── Generate PDF blob first ───────────────────────────────
                        const pdfBlob = pdf.output('blob');
                        const pdfFile = new File(
                            [pdfBlob],
                            `prescription_${patient.id}_${Date.now()}.pdf`,
                            { type: 'application/pdf' }
                        );

                        // ── Upload to Cloudinary BEFORE printing ──────────────────
                        const { signature, timestamp, cloudName, apiKey } = await getCloudinarySignature('prescriptions');
                        if (cloudName && apiKey) {
                            const formData = new FormData();
                            formData.append('file', pdfFile);
                            formData.append('api_key', apiKey!);
                            formData.append('timestamp', timestamp.toString());
                            formData.append('signature', signature);
                            formData.append('folder', 'prescriptions');
                            formData.append('type', 'upload');
                            formData.append('access_mode', 'public');
                            const uploadRes = await fetch(
                                `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
                                { method: 'POST', body: formData }
                            );

                            if (uploadRes.ok) {
                                const uploadData = await uploadRes.json();
                                const consultationSnapshot = {
                                    patientName       : patient.name,
                                    patientCustomId   : patient.customId,
                                    doctorName,
                                    doctorSpecialization: specialization,
                                    clinicName,
                                    diagnoses,
                                    medications       : formattedMeds,
                                    vitals            : formattedVitals,
                                    followUp,
                                    patientNote,
                                    labTests          : labTests.map((t: any) => t.name),
                                    injections        : injections.map((i: any) => i.name),
                                    date              : today.toISOString(),
                                    summaryType,
                                    summaryText,
                                };
                                // ── Save prescription to patient DB ───────────────
                                await savePrescription(patient.id, uploadData.secure_url, consultationSnapshot);
                            } else {
                                const errBody = await uploadRes.json().catch(() => ({}));
                                console.error('Cloudinary prescription upload failed:', errBody);
                            }
                        } else {
                            console.error('Cloudinary config missing — prescription not saved to patient records.');
                        }

                        // ── Trigger browser print dialog AFTER saving ─────────────
                        // This ensures the prescription is saved before the dialog
                        // potentially blocks JS execution on some browsers.
                        window.print();

                    } catch (pdfError) {
                        console.error('Prescription PDF/upload failed:', pdfError);
                    } finally {
                        setIsPdfUploading(false);
                    }
                    // Small delay then navigate away
                    await new Promise(resolve => setTimeout(resolve, 400));

                }
                router.push(`/doctor/patient/${patient.id}`);
            } else {
                alert(result.error || "Failed to save consultation");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred while saving.");
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <div className="min-h-screen bg-[#F7F9FA] pb-24 font-sans print:min-h-0 print:bg-white print:pb-0">
            <div className="print:hidden">
                <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">

                    {/* Patient Header Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
                        {/* Decorative Background for Header */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-50 to-transparent rounded-bl-full -mr-20 -mt-20 opacity-60 z-0 pointer-events-none" />

                        <div className="p-6 md:p-8 relative z-10 flex flex-col md:flex-row gap-8 items-start">
                            {/* Avatar Column */}
                            <div className="flex-shrink-0">
                                <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-slate-100">
                                    {patient.image ? (
                                        <Image src={patient.image} alt={patient.name} fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-teal-50">
                                            <User className="w-12 h-12 text-teal-600" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info Column */}
                            <div className="flex-grow w-full space-y-6">
                                {/* Name and Primary Actions */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h1 className="text-3xl font-black text-slate-900 leading-tight">{patient.name}</h1>
                                        <div className="flex flex-wrap items-center gap-3 mt-3">
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-800 rounded-lg border border-teal-200 font-bold text-sm">
                                                <span className="opacity-70 text-xs uppercase tracking-widest">ID:</span>
                                                {patient.customId || 'N/A'}
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-800 rounded-lg border border-indigo-200 font-bold text-sm capitalize">
                                                <span className="opacity-70 text-xs text-indigo-600 uppercase tracking-widest">Gender:</span>
                                                {patient.gender}
                                            </div>
                                            {patient.bloodGroup && (
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-800 rounded-lg border border-red-200 font-bold text-sm">
                                                    <span className="opacity-70 text-xs text-red-600 uppercase tracking-widest">Blood:</span>
                                                    {patient.bloodGroup}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-100 w-full" />

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-6 bg-slate-50/80 p-6 rounded-2xl border border-slate-100">
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date of Birth</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <Calendar className="w-4 h-4 text-teal-600" />
                                            <span>{patient.dateOfBirth || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Age</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <User className="w-4 h-4 text-teal-600" />
                                            <span>{age ? `${age} yrs` : '--'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contact</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <Phone className="w-4 h-4 text-teal-600" />
                                            <span>{patient.phoneNumber || patient.contactNumber || '--'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Emergency</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <UserPlus className="w-4 h-4 text-teal-600" />
                                            <div className="flex flex-col leading-tight">
                                                <span>{patient.emergencyContactName || '--'}</span>
                                                {patient.emergencyContactPhone && <span className="text-slate-500 text-xs font-bold mt-0.5">{patient.emergencyContactPhone}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Marital Status</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm capitalize">
                                            <User className="w-4 h-4 text-teal-600" />
                                            <span>{patient.maritalStatus || '--'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Height</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <Ruler className="w-4 h-4 text-teal-600" />
                                            <span>{patient.height || '--'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Weight</p>
                                        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                            <Weight className="w-4 h-4 text-teal-600" />
                                            <span>{patient.weight || '--'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Address Row */}
                                {patient.address && (
                                    <div className="flex items-start gap-4 bg-slate-50/80 p-5 rounded-2xl border border-slate-100">
                                        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
                                            <MapPin className="w-5 h-5 text-teal-600" />
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Address</p>
                                            <p className="text-sm text-slate-900 font-black leading-relaxed">
                                                {patient.address}{patient.city ? `, ${patient.city}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Clinical Context — always-visible inline inputs */}
                    <section className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-rose-50 to-orange-50 border-b border-rose-100">
                            <div className="w-9 h-9 bg-white rounded-xl border border-rose-200 flex items-center justify-center shadow-sm flex-shrink-0">
                                <AlertTriangle className="w-4 h-4 text-rose-500" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-tight">Patient Clinical Context</h2>
                                <p className="text-[11px] font-semibold text-rose-500 mt-0.5">Leave blank if nothing to add — saved with consultation</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">

                            {/* Allergies */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                    </div>
                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Allergies</p>
                                </div>
                                {/* Existing */}
                                {patient.allergies ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {patient.allergies.split(',').map((a: string) => a.trim()).filter(Boolean).map((allergy: string, i: number) => (
                                            <span key={i} className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block flex-shrink-0" />
                                                {allergy}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic">No known allergies</p>
                                )}
                                {/* Add more */}
                                <input
                                    type="text"
                                    value={newAllergies}
                                    onChange={e => setNewAllergies(e.target.value)}
                                    placeholder="Add new (e.g. Latex, Sulfa)"
                                    className="w-full text-sm bg-red-50/40 border border-red-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200 placeholder:text-slate-400 font-medium"
                                />
                                <p className="text-[10px] text-slate-400">Comma-separated · won&apos;t duplicate existing</p>
                            </div>

                            {/* Past Surgeries */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
                                        <Heart className="w-3.5 h-3.5 text-purple-500" />
                                    </div>
                                    <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Past Surgeries</p>
                                </div>
                                {patient.pastSurgeries ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {patient.pastSurgeries.split(',').map((s: string) => s.trim()).filter(Boolean).map((surgery: string, i: number) => (
                                            <span key={i} className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block flex-shrink-0" />
                                                {surgery}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic">No surgery history</p>
                                )}
                                <input
                                    type="text"
                                    value={newSurgeries}
                                    onChange={e => setNewSurgeries(e.target.value)}
                                    placeholder="Add new (e.g. Appendectomy)"
                                    className="w-full text-sm bg-purple-50/40 border border-purple-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200 placeholder:text-slate-400 font-medium"
                                />
                                <p className="text-[10px] text-slate-400">Comma-separated · won&apos;t duplicate existing</p>
                            </div>

                            {/* Lifestyle */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                                        <Activity className="w-3.5 h-3.5 text-emerald-500" />
                                    </div>
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Lifestyle</p>
                                </div>
                                {patient.lifestyle && (
                                    <p className="text-xs font-semibold text-slate-600 leading-relaxed">{patient.lifestyle}</p>
                                )}
                                <textarea
                                    value={newLifestyle}
                                    onChange={e => setNewLifestyle(e.target.value)}
                                    placeholder="Add notes (e.g. Smoker, drinks occasionally)"
                                    rows={2}
                                    className="w-full text-sm bg-emerald-50/40 border border-emerald-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-slate-400 font-medium resize-none"
                                />
                                <p className="text-[10px] text-slate-400">Appended to existing notes</p>
                            </div>
                        </div>
                    </section>

                    {/* 1. Vitals & Basic Params */}
                    <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-4">
                            <Activity className="w-5 h-5 text-teal-500" />
                            Update Vitals &amp; Params
                        </h2>

                        {/* Staff recorded vitals banner */}
                        {latestStaffVital && (() => {
                            const recordedAt = latestStaffVital.recordedAt ? new Date(latestStaffVital.recordedAt) : null;
                            const dateStr = recordedAt ? recordedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                            const timeStr = recordedAt ? recordedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                            return (
                                <div className="flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4">
                                    <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Activity className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-teal-900 leading-snug">
                                            Vitals recorded by <span className="text-teal-700">{latestStaffVital.recordedBy || 'Staff'}</span>
                                            {dateStr && <span className="font-semibold text-teal-600"> &bull; {dateStr} at {timeStr}</span>}
                                        </p>
                                        <p className="text-[10px] text-teal-600 font-medium mt-0.5">Values below are pre-filled from staff entry. You can update them if needed.</p>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Weight</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={vitals.weight}
                                        onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-10 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">kg</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Height</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={vitals.height}
                                        onChange={(e) => setVitals({ ...vitals, height: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-10 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">cm</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Blood Pressure</label>
                                <div className="relative flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={vitals.bloodPressure}
                                        onChange={(e) => setVitals({ ...vitals, bloodPressure: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-16 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">mm Hg</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Sugar Level</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={vitals.bloodGlucose}
                                        onChange={(e) => setVitals({ ...vitals, bloodGlucose: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-16 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">mg/dL</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Cholesterol</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={vitals.cholesterol}
                                        onChange={(e) => setVitals({ ...vitals, cholesterol: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-16 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">mg/dL</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">HbA1c</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={vitals.hba1c}
                                        onChange={(e) => setVitals({ ...vitals, hba1c: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-8 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                                </div>
                            </div>
                            {/* Temperature */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Temperature</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="e.g. 98.6"
                                        value={vitals.temperature}
                                        onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-8 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">°F</span>
                                </div>
                            </div>
                            {/* Pulse Rate */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Pulse Rate</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="e.g. 72"
                                        value={vitals.pulseRate}
                                        onChange={(e) => setVitals({ ...vitals, pulseRate: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-12 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">bpm</span>
                                </div>
                            </div>
                            {/* SpO2 */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">SpO2</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="e.g. 98"
                                        value={vitals.spO2}
                                        onChange={(e) => setVitals({ ...vitals, spO2: e.target.value })}
                                        className="w-full bg-white border border-slate-200 text-slate-900 font-black rounded-lg pl-3 pr-8 py-2 text-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 2. Diagnosis Section */}
                    <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-4">
                            <Activity className="w-5 h-5 text-teal-500" />
                            Clinical Diagnosis
                        </h2>
                        <div className="space-y-4">
                            {diagnoses.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {diagnoses.map((diag, i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-800 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm">
                                            {diag}
                                            <button onClick={() => handleRemoveDiagnosis(diag)} className="hover:bg-teal-200 p-0.5 rounded-full transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Problems / Diagnosis</label>
                                    <div
                                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-xl px-4 py-3 cursor-pointer flex justify-between items-center transition-colors hover:border-teal-500"
                                        onClick={() => setIsDiagDropdownOpen(!isDiagDropdownOpen)}
                                    >
                                        <span className="text-slate-500">Select a common diagnosis...</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isDiagDropdownOpen ? 'rotate-180' : ''}`} />
                                    </div>

                                    {isDiagDropdownOpen && (
                                        <div className="absolute top-[80px] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
                                            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                                <input
                                                    type="text"
                                                    placeholder="Search symptoms..."
                                                    value={diagSearch}
                                                    onChange={(e) => setDiagSearch(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-bold text-slate-900"
                                                />
                                            </div>
                                            <div className="max-h-56 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-200">
                                                {commonDiagnoses
                                                    .filter(d => d.toLowerCase().includes(diagSearch.toLowerCase()))
                                                    .map((d, i) => {
                                                        const isSelected = diagnoses.includes(d);
                                                        return (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                disabled={isSelected}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddDiagnosis(d);
                                                                    setDiagSearch('');
                                                                    // optionally keep open to select multiple: setIsDiagDropdownOpen(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${isSelected ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400' : 'hover:bg-teal-50 hover:text-teal-700 text-slate-700'}`}
                                                            >
                                                                {d}
                                                            </button>
                                                        );
                                                    })}
                                                {commonDiagnoses.filter(d => d.toLowerCase().includes(diagSearch.toLowerCase())).length === 0 && (
                                                    <div className="px-3 py-4 text-center text-sm font-bold text-slate-500">No matches found</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Or add new problem</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={customDiagnosis}
                                            onChange={(e) => setCustomDiagnosis(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddDiagnosis(customDiagnosis);
                                                }
                                            }}
                                            placeholder="E.g., Back pain"
                                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-xl px-4 py-3 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleAddDiagnosis(customDiagnosis)}
                                            disabled={!customDiagnosis.trim()}
                                            className="px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors shadow-sm"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. Medications Section */}
                    <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                                <Pill className="w-5 h-5 text-teal-500" />
                                Prescribe Medications
                            </h2>
                            <button
                                onClick={handleAddMedication}
                                className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-sm rounded-lg transition-colors border border-teal-200"
                            >
                                <Plus className="w-4 h-4" /> Add Row
                            </button>
                        </div>

                        <div className="space-y-3">
                            {/* Desktop Header Row */}
                            <div className="hidden xl:grid grid-cols-[32px_1fr_max-content_max-content_80px_80px_40px] gap-2 px-4 pb-1 items-end">
                                <div></div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Tablet / Medicine</div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Dosage Timing</div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Food Timing</div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Duration</div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Total</div>
                                <div></div>
                            </div>

                            {medications.map((med, index) => {
                                const totalTabs = ((med.morning ? 1 : 0) + (med.afternoon ? 1 : 0) + (med.night ? 1 : 0)) * (parseInt(med.days) || 0);
                                const isPrescribed = med.isPrescribed !== false;

                                return (
                                    <div key={med.id} className={`flex flex-col xl:grid xl:grid-cols-[32px_1fr_max-content_max-content_80px_80px_40px] gap-4 xl:gap-2 p-4 xl:p-3 bg-slate-50 rounded-xl border items-center transition-all ${isPrescribed ? 'border-slate-200' : 'border-slate-200/50 opacity-60 grayscale'}`}>
                                        {/* Row Selector Checkbox */}
                                        <div className="flex items-center justify-center h-[44px]">
                                            <input
                                                type="checkbox"
                                                checked={isPrescribed}
                                                onChange={(e) => updateMedication(med.id, 'isPrescribed', e.target.checked)}
                                                className="w-5 h-5 text-teal-500 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
                                                title="Toggle Patient Prescription for this Medicine"
                                            />
                                        </div>

                                        {/* Medicine Selection Custom Dropdown */}
                                        <div className="w-full relative">
                                            <label className="xl:hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tablet / Medicine</label>
                                            <div className="relative">
                                                <div
                                                    className={`w-full bg-white border border-slate-200 text-slate-900 font-bold rounded-lg px-4 h-[44px] cursor-pointer flex justify-between items-center transition-colors ${isPrescribed ? 'hover:border-teal-500' : ''}`}
                                                    onClick={() => {
                                                        if (!isPrescribed) return;
                                                        setActiveMedDropdown(activeMedDropdown === med.id ? null : med.id);
                                                        setMedSearch('');
                                                    }}
                                                >
                                                    <span className={med.name ? 'text-slate-900 truncate' : 'text-slate-400 truncate'}>{med.name || 'Select a common medicine...'}</span>
                                                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${activeMedDropdown === med.id ? 'rotate-180' : ''}`} />
                                                </div>

                                                {activeMedDropdown === med.id && isPrescribed && (
                                                    <div className="absolute top-[48px] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
                                                        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                                            <input
                                                                type="text"
                                                                placeholder="Search or add custom medicine..."
                                                                value={medSearch}
                                                                onChange={(e) => setMedSearch(e.target.value)}
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-bold text-slate-900"
                                                            />
                                                        </div>
                                                        <div className="max-h-56 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-200">
                                                            {medSearch.trim() && !commonMedications.some(d => d.toLowerCase() === medSearch.trim().toLowerCase()) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        updateMedication(med.id, 'name', medSearch.trim());
                                                                        setActiveMedDropdown(null);
                                                                        setMedSearch('');
                                                                    }}
                                                                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors hover:bg-teal-50 hover:text-teal-700 text-teal-600 border border-teal-100 bg-teal-50/30 mb-1 flex items-center gap-2"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" /> Add "{medSearch.trim()}"
                                                                </button>
                                                            )}
                                                            {commonMedications
                                                                .filter(d => d.toLowerCase().includes(medSearch.toLowerCase()))
                                                                .map((d, i) => {
                                                                    return (
                                                                        <button
                                                                            key={i}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                updateMedication(med.id, 'name', d);
                                                                                setActiveMedDropdown(null);
                                                                                setMedSearch('');
                                                                            }}
                                                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors hover:bg-teal-50 hover:text-teal-700 text-slate-700`}
                                                                        >
                                                                            {d}
                                                                        </button>
                                                                    );
                                                                })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Dosage Toggles */}
                                        <div className="w-full relative">
                                            <label className="xl:hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Dosage Timing</label>
                                            <div className="flex flex-nowrap gap-1 w-full items-center h-[44px]">
                                                <label className={`flex-1 xl:flex-none flex items-center justify-center xl:justify-start gap-1 bg-white border border-slate-200 px-2 h-[44px] rounded-lg transition-colors ${isPrescribed ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}>
                                                    <input disabled={!isPrescribed} type="checkbox" checked={med.morning} onChange={(e) => updateMedication(med.id, 'morning', e.target.checked)} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500" />
                                                    <span className="text-sm font-bold text-slate-700">Morn</span>
                                                </label>
                                                <label className={`flex-1 xl:flex-none flex items-center justify-center xl:justify-start gap-1 bg-white border border-slate-200 px-2 h-[44px] rounded-lg transition-colors ${isPrescribed ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}>
                                                    <input disabled={!isPrescribed} type="checkbox" checked={med.afternoon} onChange={(e) => updateMedication(med.id, 'afternoon', e.target.checked)} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500" />
                                                    <span className="text-sm font-bold text-slate-700">Aft</span>
                                                </label>
                                                <label className={`flex-1 xl:flex-none flex items-center justify-center xl:justify-start gap-1 bg-white border border-slate-200 px-2 h-[44px] rounded-lg transition-colors ${isPrescribed ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}>
                                                    <input disabled={!isPrescribed} type="checkbox" checked={med.night} onChange={(e) => updateMedication(med.id, 'night', e.target.checked)} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500" />
                                                    <span className="text-sm font-bold text-slate-700">Night</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Food Timing Toggles */}
                                        <div className="w-full relative">
                                            <label className="xl:hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Food Timing</label>
                                            <div className="flex flex-nowrap gap-1 w-full items-center h-[44px]">
                                                <label className={`flex-1 xl:flex-none flex items-center justify-center xl:justify-start gap-1 bg-white border border-slate-200 px-2 h-[44px] rounded-lg transition-colors ${isPrescribed ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}>
                                                    <input disabled={!isPrescribed} type="checkbox" checked={med.beforeFood} onChange={(e) => updateMedication(med.id, 'beforeFood', e.target.checked)} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500" />
                                                    <span className="text-sm font-bold text-slate-700">Before</span>
                                                </label>
                                                <label className={`flex-1 xl:flex-none flex items-center justify-center xl:justify-start gap-1 bg-white border border-slate-200 px-2 h-[44px] rounded-lg transition-colors ${isPrescribed ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}>
                                                    <input disabled={!isPrescribed} type="checkbox" checked={med.afterFood} onChange={(e) => updateMedication(med.id, 'afterFood', e.target.checked)} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500" />
                                                    <span className="text-sm font-bold text-slate-700">After</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Days Input */}
                                        <div className="w-full relative">
                                            <label className="xl:hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1 text-center">Duration</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    placeholder="Days"
                                                    disabled={!isPrescribed}
                                                    value={med.days}
                                                    onChange={(e) => updateMedication(med.id, 'days', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 text-slate-900 font-bold rounded-lg px-3 h-[44px] focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-center"
                                                />
                                            </div>
                                        </div>

                                        {/* Tabs Calculator */}
                                        <div className="w-full relative">
                                            <label className="xl:hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1 text-center">Total</label>
                                            <div className={`w-full flex items-center justify-center rounded-lg h-[44px] border ${isPrescribed ? 'bg-teal-50 border-teal-100' : 'bg-slate-100 border-slate-200'}`}>
                                                <span className={`text-sm font-black ${isPrescribed ? 'text-teal-600' : 'text-slate-400'}`}>
                                                    {totalTabs > 0 ? `${totalTabs}` : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Permanent Delete Button */}
                                        <div className="w-full xl:w-auto h-[44px]">
                                            <button
                                                onClick={() => handleRemoveMedication(med.id)}
                                                className="w-full md:w-[40px] h-full flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors border border-transparent hover:border-red-100"
                                                title="Delete Row"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* 3b. Lab Tests & Injections — Staff/Lab only, NOT visible to patient */}
                    <section className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                            <div className="w-9 h-9 bg-white rounded-xl border border-blue-200 flex items-center justify-center shadow-sm flex-shrink-0">
                                <FlaskConical className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-tight">Lab Tests &amp; Injections</h2>
                                <p className="text-[11px] font-bold text-blue-500 mt-0.5 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                    Not visible to patient — visible to Staff &amp; Lab only
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-blue-100">

                            {/* Lab Tests */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                        <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                                    </div>
                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Lab Tests Ordered</p>
                                </div>

                                {/* Existing list */}
                                {labTests.length > 0 && (
                                    <div className="space-y-1.5">
                                        {labTests.map(t => (
                                            <div key={t.id} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                                                <FlaskConical className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                                <span className="text-sm font-bold text-blue-800 flex-1">{t.name}</span>
                                                <button onClick={() => removeLabTest(t.id)} className="p-0.5 hover:bg-blue-200 rounded-full transition-colors">
                                                    <X className="w-3.5 h-3.5 text-blue-500" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add input */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={labOrderInput}
                                        onChange={e => setLabOrderInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLabTest())}
                                        placeholder="e.g. CBC, LFT, Blood Sugar"
                                        className="flex-1 text-sm bg-blue-50/40 border border-blue-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-400 font-medium"
                                    />
                                    <button onClick={addLabTest} disabled={!labOrderInput.trim()}
                                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-sm rounded-xl transition-colors">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-400">Press Enter or + to add · One test per entry</p>
                            </div>

                            {/* Injections */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                                        <Syringe className="w-3.5 h-3.5 text-indigo-500" />
                                    </div>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Injections Ordered</p>
                                </div>

                                {injections.length > 0 && (
                                    <div className="space-y-1.5">
                                        {injections.map(inj => (
                                            <div key={inj.id} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                                                <Syringe className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                                <span className="text-sm font-bold text-indigo-800 flex-1">{inj.name}</span>
                                                <button onClick={() => removeInjection(inj.id)} className="p-0.5 hover:bg-indigo-200 rounded-full transition-colors">
                                                    <X className="w-3.5 h-3.5 text-indigo-500" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={injectionInput}
                                        onChange={e => setInjectionInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addInjection())}
                                        placeholder="e.g. Dexamethasone 4mg IV"
                                        className="flex-1 text-sm bg-indigo-50/40 border border-indigo-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400 font-medium"
                                    />
                                    <button onClick={addInjection} disabled={!injectionInput.trim()}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-sm rounded-xl transition-colors">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-400">Press Enter or + to add · One injection per entry</p>
                            </div>

                        </div>
                    </section>

                    {/* 4. Doctor Notes & Follow up */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Private Doctor Note - NOT visible to patient */}
                        <section className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100 flex flex-col">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="w-9 h-9 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-amber-500" />
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-slate-900 leading-tight">Private Doctor Note</h2>
                                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                        Not visible to patient
                                    </p>
                                </div>
                            </div>
                            <textarea
                                value={doctorNote}
                                onChange={(e) => setDoctorNote(e.target.value)}
                                placeholder="Personal clinical notes, observations, differential diagnosis..."
                                className="flex-1 w-full bg-amber-50/40 border border-amber-100 text-slate-900 font-medium rounded-xl p-4 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 resize-none min-h-[160px] placeholder:text-slate-400 placeholder:font-normal text-sm"
                            ></textarea>
                        </section>

                        {/* Patient-Visible Advice + Follow Up */}
                        <section className="bg-white rounded-2xl p-6 shadow-sm border border-teal-100 flex flex-col gap-5">

                            {/* Patient Advice Note */}
                            <div className="flex flex-col flex-1">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-teal-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-black text-slate-900 leading-tight">Patient Advice Note</h2>
                                        <p className="text-xs font-bold text-teal-600 flex items-center gap-1 mt-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block"></span>
                                            Visible to patient in their Doctor Notes
                                        </p>
                                    </div>
                                </div>
                                <textarea value={patientNote} onChange={(e) => setPatientNote(e.target.value)} placeholder="Medication instructions, lifestyle advice, dietary recommendations..." className="flex-1 w-full bg-teal-50/30 border border-teal-100 text-slate-900 font-medium rounded-xl p-4 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none min-h-[100px] placeholder:text-slate-400 placeholder:font-normal text-sm" />
                            </div>

                            {/* Divider */}
                            <div className="border-t border-slate-100" />

                            {/* Prescription Summary */}
                            <div className="flex flex-col flex-1">
                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-9 h-9 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-blue-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-black text-slate-900 leading-tight">Prescription Summary</h2>
                                            <p className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                                                Included in the printed prescription
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Toggle AI / Manual */}
                                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                                        <button
                                            type="button"
                                            onClick={() => setSummaryType('manual')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${summaryType === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Manual
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSummaryType('ai')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${summaryType === 'ai' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <Brain className="w-3.5 h-3.5" />
                                            AI 
                                        </button>
                                    </div>
                                </div>

                                {summaryType === 'ai' && (
                                    <div className="mb-3">
                                        <button
                                            type="button"
                                            onClick={handleGenerateAISummary}
                                            disabled={isGeneratingSummary}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50"
                                        >
                                            {isGeneratingSummary ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Generating Clinical Summary...</>
                                            ) : (
                                                <><Brain className="w-4 h-4" /> Generate AI Summary</>
                                            )}
                                        </button>
                                    </div>
                                )}

                                <textarea
                                    value={summaryText}
                                    onChange={(e) => setSummaryText(e.target.value)}
                                    placeholder={summaryType === 'ai' ? "AI summary will appear here. You can safely edit it." : "Enter a brief summary of the consultation..."}
                                    className="flex-1 w-full bg-blue-50/30 border border-blue-100 text-slate-900 font-medium rounded-xl p-4 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none min-h-[100px] placeholder:text-slate-400 placeholder:font-normal text-sm"
                                    disabled={summaryType === 'ai' && isGeneratingSummary}
                                ></textarea>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-slate-100" />

                            {/* Next Follow Up */}
                            {/* Next Follow Up — custom dropdown */}
                            <div ref={followUpRef}>
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="w-9 h-9 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <Calendar className="w-4 h-4 text-purple-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-black text-slate-900 leading-tight">Next Follow Up</h2>
                                        <p className="text-xs font-bold text-purple-600 flex items-center gap-1 mt-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                                            Creates a pending event in patient&apos;s timeline
                                        </p>
                                    </div>
                                </div>

                                {/* Custom dropdown trigger */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsFollowUpOpen(!isFollowUpOpen)}
                                        className="w-full flex items-center justify-between bg-purple-50/40 border border-purple-100 hover:border-purple-300 text-slate-900 font-bold rounded-xl px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300"
                                    >
                                        <span className={followUp ? 'text-slate-900' : 'text-slate-400 font-normal'}>
                                            {followUp || 'No Follow-up Scheduled'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-purple-400 transition-transform duration-200 ${isFollowUpOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Dropdown list */}
                                    {isFollowUpOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                            {FOLLOWUP_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => { setFollowUp(opt.value); setIsFollowUpOpen(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${followUp === opt.value
                                                        ? 'bg-purple-50 text-purple-700'
                                                        : 'text-slate-700 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {followUp && followUp !== '' && (
                                    <p className="mt-2 text-xs font-bold text-purple-600 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                                        A follow-up event will be added to the patient&apos;s timeline
                                    </p>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* 5. Lab Reports Upload UI */}
                    <section className="bg-white rounded-2xl p-6 shadow-sm border border-orange-100">
                        <div className="flex items-start gap-3 mb-5">
                            <div className="w-9 h-9 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <Upload className="w-4 h-4 text-orange-500" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-tight">Upload Lab Reports</h2>
                                <p className="text-xs font-semibold text-slate-500 mt-0.5">Upload PDF reports — they will appear instantly on the patient&apos;s Diagnostics page with hospital name and date</p>
                            </div>
                        </div>

                        {/* Uploaded reports list */}
                        {uploadedReports.length > 0 && (
                            <div className="mb-4 space-y-2">
                                {uploadedReports.map((r, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-2.5">
                                        <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>
                                            <p className="text-xs text-slate-500">{r.labName} · {r.date}</p>
                                        </div>
                                        <span className="text-xs font-bold text-teal-600 bg-teal-100/70 px-2 py-0.5 rounded-full">Saved</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Error message */}
                        {uploadError && (
                            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <p className="text-sm font-semibold text-red-600">{uploadError}</p>
                            </div>
                        )}

                        {/* Upload trigger */}
                        <div className="flex items-center gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed font-bold text-sm cursor-pointer transition-all ${isUploadingLab
                                ? 'border-teal-200 bg-teal-50 text-teal-400 cursor-not-allowed'
                                : 'border-teal-200 bg-teal-50/50 text-teal-600 hover:bg-teal-100 hover:border-teal-400'
                                }`}>
                                {isUploadingLab ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing PDF with AI...</>
                                ) : (
                                    <><Upload className="w-4 h-4" /> Select PDF File</>
                                )}
                                <input
                                    ref={labFileRef}
                                    type="file"
                                    accept=".pdf"
                                    disabled={isUploadingLab}
                                    onChange={handleLabUpload}
                                    className="hidden"
                                />
                            </label>
                            {uploadedReports.length > 0 && (
                                <span className="text-xs font-bold text-teal-600">{uploadedReports.length} report{uploadedReports.length > 1 ? 's' : ''} uploaded</span>
                            )}
                        </div>
                        {/* Lab Note */}
                        <div className="mt-4">
                            <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-widest">
                                Lab Note <span className="text-slate-400 font-normal normal-case tracking-normal">(Optional — visible to patient)</span>
                            </label>
                            <textarea
                                rows={2}
                                value={labNote}
                                onChange={(e) => setLabNote(e.target.value)}
                                placeholder='e.g. "We updated the report — please review it by 28 Feb 2026 and follow the dietary advice."​'
                                className="w-full px-4 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-300 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                            />
                            <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-wider">This note will appear on the patient&apos;s timeline alongside the report upload</p>
                        </div>

                        <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-wider">PDF will be AI-processed and stored in patient&apos;s records · Report will appear under patient&apos;s Diagnostics</p>
                    </section>

                    {/* 6. Diagnostic Pathway Builder */}
                    <section className="bg-white rounded-2xl shadow-sm border border-violet-100 overflow-hidden">
                        {/* Header toggle */}
                        <button
                            type="button"
                            onClick={() => setDiagOpen(v => !v)}
                            className="w-full flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-violet-50 to-indigo-50 hover:from-violet-100 hover:to-indigo-100 transition-colors border-b border-violet-100"
                        >
                            <div className="w-9 h-9 bg-white rounded-xl border border-violet-200 flex items-center justify-center shadow-sm flex-shrink-0">
                                <Brain className="w-4 h-4 text-violet-600" />
                            </div>
                            <div className="flex-1 text-left">
                                <h2 className="text-base font-black text-slate-900 leading-tight">Diagnostic Pathway</h2>
                                <p className="text-[11px] font-semibold text-violet-500 mt-0.5">Build a condition mind-map — visible to patient on their Diagnostic page</p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-violet-400 transition-transform duration-200 ${diagOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {diagOpen && (
                            <div className="p-5 sm:p-6 space-y-6">

                                {/* Condition Name + Status */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">Condition Name *</label>
                                        <input
                                            type="text"
                                            value={diagConditionName}
                                            onChange={e => setDiagConditionName(e.target.value)}
                                            placeholder="e.g. Type 2 Diabetes, Hypertension"
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-xl px-4 py-3 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 transition-colors text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">Patient Status</label>
                                        <div className="flex gap-2">
                                            {([['improving', 'Improving', 'emerald'], ['stable', 'Stable', 'amber'], ['worsening', 'Worsening', 'red']] as const).map(([val, label, color]) => (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => setDiagStatus(val)}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black border transition-all ${diagStatus === val
                                                        ? color === 'emerald' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                                                            : color === 'amber' ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                                                                : 'bg-red-500 text-white border-red-500 shadow-md'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                        }`}
                                                >
                                                    {val === 'improving' ? <TrendingDown className="w-3.5 h-3.5" /> : val === 'worsening' ? <TrendingUp className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Patient Info (auto-filled from DB) */}
                                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Patient Information (auto-filled)</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[['Name', patient.name], ['Age', age ? `${age} yrs` : '--'], ['Gender', patient.gender || '--'], ['Blood Group', patient.bloodGroup || '--']].map(([label, val]) => (
                                            <div key={label}>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
                                                <p className="text-sm font-black text-slate-800 capitalize">{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Mind-map Nodes */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900">Pathway Steps</h3>
                                            <p className="text-[11px] text-slate-500 mt-0.5">Each step is a node in the diagnostic mind-map</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addDiagNode}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-xs rounded-xl border border-violet-200 transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add Step
                                        </button>
                                    </div>

                                    {diagNodes.length === 0 ? (
                                        <div className="flex flex-col items-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                            <Brain className="w-8 h-8 text-slate-300 mb-2" />
                                            <p className="text-sm font-bold text-slate-500">No steps yet</p>
                                            <p className="text-xs text-slate-400 mt-1">Click &ldquo;Add Step&rdquo; to build the pathway</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {diagNodes.map((node, idx) => {
                                                const nodeStyle = NODE_TYPES.find(t => t.value === node.type);
                                                return (
                                                    <div key={node.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                                                        {/* Node header */}
                                                        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100" style={{ borderLeftColor: nodeStyle?.color, borderLeftWidth: 4 }}>
                                                            <span className="text-xs font-black text-slate-400 w-5 text-center flex-shrink-0">{idx + 1}</span>
                                                            <input
                                                                type="text"
                                                                value={node.title}
                                                                onChange={e => updateDiagNode(node.id, 'title', e.target.value)}
                                                                placeholder="Step title (e.g. Initial Presentation)"
                                                                className="flex-1 bg-transparent text-sm font-black text-slate-900 placeholder:text-slate-300 focus:outline-none min-w-0"
                                                            />
                                                            {/* Type selector */}
                                                            <select
                                                                value={node.type}
                                                                onChange={e => updateDiagNode(node.id, 'type', e.target.value)}
                                                                className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300 bg-white text-slate-700 max-w-[120px] sm:max-w-[160px]"
                                                            >
                                                                {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                            </select>
                                                            <button type="button" onClick={() => removeDiagNode(node.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        {/* Description */}
                                                        <div className="px-4 pt-3 pb-2">
                                                            <textarea
                                                                value={node.description}
                                                                onChange={e => updateDiagNode(node.id, 'description', e.target.value)}
                                                                placeholder="Describe this step — symptoms, findings, medications, or next steps..."
                                                                rows={2}
                                                                className="w-full text-sm text-slate-700 bg-white border border-slate-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-300 placeholder:text-slate-300 resize-none font-medium"
                                                            />
                                                        </div>

                                                        {/* Parameters */}
                                                        <div className="px-4 pb-4 space-y-2">
                                                            {node.parameters.map((param, pi) => (
                                                                <div key={pi} className="grid grid-cols-[1fr_80px_60px_28px] gap-2 items-center">
                                                                    <input
                                                                        type="text"
                                                                        value={param.name}
                                                                        onChange={e => updateNodeParam(node.id, pi, 'name', e.target.value)}
                                                                        placeholder="Parameter (e.g. HbA1c)"
                                                                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 text-slate-800"
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        value={param.value}
                                                                        onChange={e => updateNodeParam(node.id, pi, 'value', e.target.value)}
                                                                        placeholder="Value"
                                                                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 text-slate-800"
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        value={param.unit}
                                                                        onChange={e => updateNodeParam(node.id, pi, 'unit', e.target.value)}
                                                                        placeholder="Unit"
                                                                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 text-slate-800"
                                                                    />
                                                                    <button type="button" onClick={() => removeNodeParam(node.id, pi)} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                                                                        <X className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={() => addNodeParam(node.id)}
                                                                className="text-[11px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1 mt-1 transition-colors"
                                                            >
                                                                <Plus className="w-3 h-3" /> Add parameter (e.g. HbA1c: 6.2%)
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Clinical Notes + Treatment Plan */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">Clinical Notes</label>
                                        <textarea
                                            value={diagClinicalNotes}
                                            onChange={e => setDiagClinicalNotes(e.target.value)}
                                            rows={4}
                                            placeholder="Progress, observations, emerging risk factors..."
                                            className="w-full text-sm bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-xl px-4 py-3 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 resize-none placeholder:text-slate-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">Treatment Plan</label>
                                        <textarea
                                            value={diagTreatmentPlan}
                                            onChange={e => setDiagTreatmentPlan(e.target.value)}
                                            rows={4}
                                            placeholder="Medications, lifestyle plan, follow-up schedule..."
                                            className="w-full text-sm bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-xl px-4 py-3 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 resize-none placeholder:text-slate-400"
                                        />
                                    </div>
                                </div>

                                {/* Error */}
                                {diagError && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <p className="text-sm font-semibold text-red-600">{diagError}</p>
                                    </div>
                                )}

                                {/* Save Diagnostic button */}
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] text-slate-400 font-bold">Saved separately · visible immediately on patient&apos;s Diagnostic page</p>
                                    <button
                                        type="button"
                                        onClick={handleSaveDiagnostic}
                                        disabled={isSavingDiag}
                                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all shadow-sm ${diagSaved
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60'
                                            }`}
                                    >
                                        {isSavingDiag ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                        ) : diagSaved ? (
                                            <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                                        ) : (
                                            <><Brain className="w-4 h-4" /> Save Diagnostic Pathway</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Submit / Finish */}
                    <div className="flex flex-col sm:flex-row justify-center sm:justify-end gap-4 pt-4 print:hidden">
                        <button
                            onClick={() => { setPrintMode(false); setShowConfirm(true); }}
                            disabled={isSaving}
                            className="group relative w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-black text-base rounded-2xl transition-all duration-300 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSaving ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                            ) : (
                                <><Save className="w-5 h-5" /> Save Only</>
                            )}
                        </button>
                        <button
                            onClick={() => { setPrintMode(true); setShowConfirm(true); }}
                            disabled={isSaving}
                            className="group relative w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 text-white font-black text-base rounded-2xl transition-all duration-300 shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 sm:hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                            {isSaving ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Saving Consultation...</>
                            ) : isPdfUploading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Uploading PDF...</>
                            ) : (
                                <><FileText className="w-5 h-5" /> Save &amp; Print</>
                            )}
                        </button>
                    </div>

                </main>

                {/* Global Voice Assistant FAB */}
                <div className="fixed bottom-8 sm:bottom-12 right-6 sm:right-10 z-50 animate-in fade-in slide-in-from-bottom print:hidden flex flex-col items-end gap-3">
                    {isListening && (
                        <div className="bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 mb-1 animate-pulse max-w-[280px] sm:max-w-xs text-right">
                            <span className="leading-snug">Listening... say <span className="text-teal-400 font-bold">"diagnosis fever"</span> or <span className="text-teal-400 font-bold">"medicine crocin morning night"</span></span>
                            <Waves className="w-5 h-5 text-teal-400 flex-shrink-0" />
                        </div>
                    )}
                    <button
                        onClick={() => setIsListening(!isListening)}
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 border-4 border-white ${isListening ? 'bg-rose-500 scale-110 shadow-rose-500/50 hover:bg-rose-600' : 'bg-teal-600 hover:bg-teal-700 hover:scale-105 shadow-teal-500/40 text-white'}`}
                        title="Voice Assistant Dictation"
                    >
                        {isListening ? (
                            <MicOff className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        ) : (
                            <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        )}
                    </button>
                </div>

                {/* ── Save Confirmation Modal ── */}
                {showConfirm && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm"
                        onClick={() => setShowConfirm(false)}
                    >
                        <div
                            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm mx-auto overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Drag handle — mobile only */}
                            <div className="flex justify-center pt-3 pb-0 sm:hidden">
                                <div className="w-10 h-1 bg-slate-200 rounded-full" />
                            </div>

                            {/* Icon + Message */}
                            <div className="flex flex-col items-center text-center px-6 pt-6 pb-5">
                                <div className="w-14 h-14 rounded-2xl bg-teal-50 border-2 border-teal-100 flex items-center justify-center mb-4">
                                    <ShieldCheck className="w-7 h-7 text-teal-600" />
                                </div>
                                <h3 className="text-lg font-black text-slate-900">{printMode ? 'Save & Print Consultation?' : 'Save Consultation?'}</h3>
                                <p className="text-sm font-semibold text-slate-500 mt-1.5 leading-relaxed max-w-xs">
                                    This will {printMode ? 'save and automatically print a prescription for ' : 'permanently save the consultation for '}<span className="text-slate-800 font-black">{patient.name}</span>. You can still edit individual records later.
                                </p>
                            </div>

                            {/* Buttons — always side by side */}
                            <div className="px-5 pb-8 sm:pb-6 flex flex-row gap-3">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 px-4 py-3.5 text-sm font-black text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { setShowConfirm(false); handleSubmit(printMode); }}
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-3.5 text-sm font-black text-white bg-gradient-to-r from-teal-600 to-teal-500 active:from-teal-700 active:to-teal-600 rounded-xl shadow-md shadow-teal-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {printMode ? <FileText className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                    {printMode ? 'Save & Print' : 'Yes, Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Print Layout — also used as source for PDF generation */}
            <div ref={prescriptionRef}>
                <PrintPrescription
                    patient={patient}
                    doctor={doctor}
                    vitals={vitals}
                    diagnoses={diagnoses}
                    medications={medications}
                    followUp={followUp}
                    doctorNote={doctorNote}
                    patientNote={patientNote}
                    labTests={labTests}
                    injections={injections}
                    newAllergies={newAllergies}
                    newSurgeries={newSurgeries}
                    newLifestyle={newLifestyle}
                    summaryText={summaryText}
                />
            </div>

        </div>
    );
}
