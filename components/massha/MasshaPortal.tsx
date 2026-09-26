"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
    UserPlus, X, CheckCircle2, AlertCircle, User, Stethoscope,
    ChevronDown, Trash2, FlaskConical, Pill, RefreshCw, BadgeCheck,
    Eye, Plus, UploadCloud, Loader2, FileText,
} from "lucide-react";
import {
    createMasshaPatient, createMasshaDoctor, uploadMasshaDocument,
    assignDoctorToPatient, deleteMasshaRecord, deleteMasshaPatient,
    deleteMasshaDoctor, getMasshaDashboardData, extractPatientDetailsFromDoc,
    type MasshaPatient, type MasshaDoctor, type MasshaRecord,
} from "@/app/actions/massha";

// ─── Shared UI ────────────────────────────────────────────────────────────────

const Field = ({ id, label, type = "text", placeholder, value, onChange, required = false }: {
    id: string; label: string; type?: string; placeholder: string;
    value: string; onChange: (v: string) => void; required?: boolean;
}) => (
    <div>
        <label htmlFor={id} className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
            {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <input id={id} type={type} placeholder={placeholder} value={value} required={required}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-300 focus:outline-none focus:border-teal-500 transition-colors" />
    </div>
);

const Select = ({ id, label, value, onChange, options, placeholder = "Select" }: {
    id: string; label?: string; value: string; onChange: (v: string) => void;
    options: { label: string; value: string }[]; placeholder?: string;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);
    const sel = options.find((o) => o.value === value);
    return (
        <div ref={ref} className="relative">
            {label && <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>}
            <button id={id} type="button" onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between border-2 rounded-xl px-3.5 py-2.5 text-sm font-medium bg-white text-left transition-colors ${open ? "border-teal-500" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={sel ? "text-slate-800" : "text-slate-300"}>{sel?.label ?? placeholder}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 ml-2 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border-2 border-slate-200 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                    <button type="button" onClick={() => { onChange(""); setOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-50 font-medium">{placeholder}</button>
                    {options.map(o => (
                        <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-teal-50 hover:text-teal-700 transition-colors ${value === o.value ? "bg-teal-50 text-teal-700 font-black" : "text-slate-700"}`}>
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const Toast = ({ message, type, onDone }: { message: string; type: "success" | "error"; onDone: () => void }) => {
    useEffect(() => { const t = setTimeout(onDone, 4500); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border-2 text-sm font-bold max-w-sm
            ${type === "success" ? "bg-white border-teal-200 text-teal-800" : "bg-white border-red-200 text-red-700"}`}>
            {type === "success" ? <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
            {message}
        </div>
    );
};

// ─── Register Patient Modal ────────────────────────────────────────────────────
// Upload doc to auto-fill, or fill manually. Both paths supported.

const RegisterPatientModal = ({ doctors, onClose, onSuccess }: {
    doctors: MasshaDoctor[];
    onClose: () => void;
    onSuccess: (customId: string, patientName: string) => void;
}) => {
    const [isPending, startTransition] = useTransition();
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractingFileName, setExtractingFileName] = useState("");
    const [error, setError] = useState("");
    const [docFiles, setDocFiles] = useState<{ id: string; file: File; type: "lab_report" | "prescription" }[]>([]);

    const [form, setForm] = useState({
        name: "", email: "", phone: "", gender: "", age: "",
        bloodGroup: "", chronicConditions: "", allergies: "", assignedDoctorId: "",
    });
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const doctorOpts = doctors.map(d => ({ label: `Dr. ${d.name} — ${d.specialization}`, value: d.id }));
    const genderOpts = [{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }, { label: "Other", value: "Other" }];
    const bgOpts = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(v => ({ label: v, value: v }));

    const handleDocUpload = async (selectedFiles: FileList | null, type: "lab_report" | "prescription") => {
        if (!selectedFiles || selectedFiles.length === 0) return;
        const newFiles = Array.from(selectedFiles);

        // Append new files to state
        const items = newFiles.map(file => ({ id: Math.random().toString(36).substring(2), file, type }));
        setDocFiles(prev => [...prev, ...items]);

        // If this is the first file set, extract details from the first file to auto-fill form
        if (docFiles.length === 0 && newFiles[0]) {
            const firstFile = newFiles[0];
            setExtractingFileName(firstFile.name);
            setIsExtracting(true);
            setError("");

            const fd = new FormData();
            fd.append("file", firstFile);
            const res = await extractPatientDetailsFromDoc(fd);
            setIsExtracting(false);

            if (res.success && res.extracted) {
                const ext = res.extracted;
                setForm(f => ({
                    ...f,
                    name: ext.patientName ?? f.name,
                    phone: ext.phone ?? f.phone,
                    age: ext.age ?? f.age,
                    gender: (ext.gender === "Male" || ext.gender === "Female" || ext.gender === "Other") ? ext.gender : f.gender,
                    bloodGroup: ext.bloodGroup ?? f.bloodGroup,
                }));
            }
        }
    };

    const removeDocFile = (id: string) => {
        setDocFiles(prev => prev.filter(d => d.id !== id));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError("Full Name is required.");
            return;
        }
        setError("");
        startTransition(async () => {
            const res = await createMasshaPatient({ ...form });
            if (res.success && res.customId && res.patientId) {
                // Upload all attached documents sequentially
                for (const doc of docFiles) {
                    const fd = new FormData();
                    fd.append("file", doc.file);
                    fd.append("patientId", res.patientId);
                    fd.append("type", doc.type);
                    await uploadMasshaDocument(fd).catch(() => null);
                }
                onSuccess(res.customId, form.name.trim());
            } else {
                setError(res.error ?? "Registration failed.");
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Register New Patient</h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Upload document(s) to auto-fill &amp; attach, or enter details manually</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">
                    {/* ── DOCUMENT UPLOAD SECTION ── */}
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                    Step 1 — Upload Lab Report(s) or Prescription(s)
                                </p>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Details auto-extracted from document to pre-fill details below</p>
                            </div>
                            {docFiles.length > 0 && (
                                <span className="text-xs font-black text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                                    {docFiles.length} Attached
                                </span>
                            )}
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="cursor-pointer group">
                                    <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                                        onChange={e => handleDocUpload(e.target.files, "lab_report")} />
                                    <div className="border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-2xl p-3 text-center transition-colors group-hover:border-blue-400">
                                        <FlaskConical className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                                        <p className="text-xs font-black text-blue-700">+ Lab Report(s)</p>
                                        <p className="text-[10px] text-blue-400 font-medium mt-0.5">PDF or Image (Multiple)</p>
                                    </div>
                                </label>
                                <label className="cursor-pointer group">
                                    <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                                        onChange={e => handleDocUpload(e.target.files, "prescription")} />
                                    <div className="border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 rounded-2xl p-3 text-center transition-colors group-hover:border-violet-400">
                                        <Pill className="w-6 h-6 text-violet-500 mx-auto mb-1" />
                                        <p className="text-xs font-black text-violet-700">+ Prescription(s)</p>
                                        <p className="text-[10px] text-violet-400 font-medium mt-0.5">PDF or Image (Multiple)</p>
                                    </div>
                                </label>
                            </div>

                            {isExtracting && (
                                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 text-teal-600 animate-spin shrink-0" />
                                    <div>
                                        <p className="text-xs font-black text-teal-800">Auto-extracting details with AI...</p>
                                        <p className="text-[10px] text-teal-600 font-medium truncate">{extractingFileName}</p>
                                    </div>
                                </div>
                            )}

                            {docFiles.length > 0 && (
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                                    {docFiles.map((doc) => (
                                        <div key={doc.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                                            <div className="flex items-center gap-2 truncate">
                                                {doc.type === "prescription" ? <Pill className="w-4 h-4 text-violet-500 shrink-0" /> : <FlaskConical className="w-4 h-4 text-blue-500 shrink-0" />}
                                                <span className="font-bold text-slate-800 truncate">{doc.file.name}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">({doc.type === "prescription" ? "Rx" : "Report"})</span>
                                            </div>
                                            <button type="button" onClick={() => removeDocFile(doc.id)} className="text-slate-400 hover:text-red-500 p-1">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── PATIENT DETAILS ── */}
                    <div className="space-y-4">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                            Step 2 — Patient Details
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                            <p className="text-xs font-bold text-amber-700">Full Name is required. Email address is auto-generated if left blank.</p>
                        </div>
                        <Field id="reg-name" label="Full Name" placeholder="e.g. Mrs. Anasuya Devi" value={form.name} onChange={v => set("name", v)} required />
                        <Field id="reg-email" label="Email Address (Optional)" type="email" placeholder="patient@email.com (Auto-generated if blank)" value={form.email} onChange={v => set("email", v)} />
                        <Field id="reg-phone" label="Phone Number (Optional)" type="tel" placeholder="+91 99999 99999 (Optional)" value={form.phone} onChange={v => set("phone", v)} />

                        <div className="grid grid-cols-3 gap-3">
                            <Select id="reg-gender" label="Gender" value={form.gender} onChange={v => set("gender", v)} options={genderOpts} placeholder="Gender" />
                            <Field id="reg-age" label="Age" type="number" placeholder="e.g. 54" value={form.age} onChange={v => set("age", v)} />
                            <Select id="reg-bg" label="Blood Group" value={form.bloodGroup} onChange={v => set("bloodGroup", v)} options={bgOpts} placeholder="Blood" />
                        </div>
                        <Field id="reg-cond" label="Chronic Conditions" placeholder="e.g. Diabetes, Hypertension" value={form.chronicConditions} onChange={v => set("chronicConditions", v)} />
                        <Field id="reg-allergy" label="Known Allergies" placeholder="e.g. Penicillin, Latex" value={form.allergies} onChange={v => set("allergies", v)} />

                        <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Step 3 — Assign Doctor (Optional)</p>
                            <Select id="reg-doc" label="" value={form.assignedDoctorId} onChange={v => set("assignedDoctorId", v)} options={doctorOpts} placeholder="No doctor assigned yet" />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-red-700 text-sm font-bold">{error}</p>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1 pb-1">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                        <button type="submit" disabled={isPending || isExtracting}
                            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-sm rounded-xl transition-colors shadow-lg shadow-teal-100 disabled:opacity-60">
                            {isPending ? "Registering..." : "Register Patient"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Patient ID card (Name + ID only) ─────────────────────────────────────────

const PatientIdCard = ({ customId, patientName, onClose }: { customId: string; patientName: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
        <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 p-8 text-center">
            <div className="w-14 h-14 bg-teal-50 border-2 border-teal-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-teal-600" />
            </div>
            <h2 className="text-lg font-black text-slate-900 mb-1">Patient Registered</h2>
            <p className="text-xs text-slate-400 font-medium mb-6">Share the Patient ID — doctors use this to search the patient</p>
            <div className="space-y-3 text-left mb-6">
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient Name</p>
                    <p className="text-lg font-black text-slate-900">{patientName}</p>
                </div>
                <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest mb-2">Patient ID</p>
                    <p className="text-3xl font-black text-teal-700 tracking-widest font-mono">{customId}</p>
                </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-sm transition-colors">Done</button>
        </div>
    </div>
);

// ─── Create Doctor Modal ───────────────────────────────────────────────────────

const CreateDoctorModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: (name: string, pw: string) => void }) => {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [form, setForm] = useState({ name: "", email: "", specialization: "", licenseNumber: "", phone: "", password: "" });
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.specialization.trim() || !form.licenseNumber.trim()) {
            setError("Name, email, specialization, and license number are required."); return;
        }
        setError("");
        startTransition(async () => {
            const res = await createMasshaDoctor(form);
            if (res.success && res.tempPassword) { onSuccess(form.name.trim(), res.tempPassword); }
            else { setError(res.error ?? "Failed."); }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
                <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Create Doctor Account</h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Auto-approved — doctor can login immediately</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
                    <Field id="dc-name" label="Full Name" placeholder="e.g. Ananya Rao (no Dr. prefix needed)" value={form.name} onChange={v => set("name", v)} required />
                    <Field id="dc-email" label="Email (Login ID)" type="email" placeholder="doctor@massha.com" value={form.email} onChange={v => set("email", v)} required />
                    <Field id="dc-pw" label="Login Password (Optional)" type="text" placeholder="MasshaDoc@2026 (Default)" value={form.password} onChange={v => set("password", v)} />
                    <Field id="dc-spec" label="Specialization" placeholder="e.g. Medical Oncology" value={form.specialization} onChange={v => set("specialization", v)} required />
                    <Field id="dc-lic" label="Medical License Number" placeholder="e.g. MCI-987654" value={form.licenseNumber} onChange={v => set("licenseNumber", v)} required />
                    <Field id="dc-ph" label="Phone (Optional)" type="tel" placeholder="+91 99999 99999" value={form.phone} onChange={v => set("phone", v)} />
                    {error && <div className="flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><p className="text-red-700 text-sm font-bold">{error}</p></div>}
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                        <button type="submit" disabled={isPending} className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-sm rounded-xl transition-colors shadow-lg shadow-teal-100 disabled:opacity-60">
                            {isPending ? "Creating..." : "Create Account"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DoctorCredsModal = ({ doctorName, tempPassword, onClose }: { doctorName: string; tempPassword: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
        <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 p-8 text-center">
            <div className="w-14 h-14 bg-teal-50 border-2 border-teal-200 rounded-2xl flex items-center justify-center mx-auto mb-4"><BadgeCheck className="w-7 h-7 text-teal-600" /></div>
            <h2 className="text-lg font-black text-slate-900 mb-1">Doctor Account Created</h2>
            <p className="text-sm text-slate-500 font-medium mb-5">Share with <strong>Dr. {doctorName}</strong></p>
            <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl p-4 text-left mb-5">
                <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-1">Temporary Password</p>
                <p className="text-xl font-black text-teal-800 tracking-wider font-mono">{tempPassword}</p>
            </div>
            <p className="text-xs text-slate-400 font-medium mb-5">Doctor should update password after first login.</p>
            <button onClick={onClose} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-sm transition-colors">Done</button>
        </div>
    </div>
);

// ─── Inline Upload Panel ───────────────────────────────────────────────────────

const UploadPanel = ({ patient, docType, onUploaded, onCancel }: {
    patient: MasshaPatient; docType: "lab_report" | "prescription";
    onUploaded: () => void; onCancel: () => void;
}) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isPending, startTransition] = useTransition();
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");

    const handleFileSelect = (selected: FileList | null) => {
        if (!selected || selected.length === 0) return;
        const newFiles = Array.from(selected);
        setFiles(prev => [...prev, ...newFiles]);
        setError("");
    };

    const removeFile = (idx: number) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleUpload = (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) { setError("Please select at least one file."); return; }
        setError("");
        startTransition(async () => {
            let count = 0;
            for (let i = 0; i < files.length; i++) {
                setProgress(`Uploading file ${i + 1} of ${files.length}...`);
                const fd = new FormData();
                fd.append("file", files[i]);
                fd.append("patientId", patient.id);
                fd.append("type", docType);
                const res = await uploadMasshaDocument(fd);
                if (res.success) count++;
                else console.error(`Failed to upload ${files[i].name}:`, res.error);
            }
            if (count > 0) {
                onUploaded();
            } else {
                setError("Failed to upload files. Please try again.");
                setProgress("");
            }
        });
    };

    return (
        <form onSubmit={handleUpload} className="mt-3 bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden">
            <div className={`px-4 py-2.5 border-b border-slate-200 ${docType === "prescription" ? "bg-violet-50" : "bg-blue-50"}`}>
                <p className={`text-[11px] font-black uppercase tracking-widest ${docType === "prescription" ? "text-violet-600" : "text-blue-600"}`}>
                    Uploading {docType === "prescription" ? "Prescription(s)" : "Lab Report(s)"}
                    {patient.assignedDoctorName && ` — will link to Dr. ${patient.assignedDoctorName}`}
                </p>
            </div>
            <div className="p-4 space-y-3">
                {!patient.assignedDoctorName && (
                    <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        No doctor assigned yet. Documents will upload without a doctor link.
                    </p>
                )}

                {/* Dropzone / File Picker */}
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/50 rounded-xl p-4 cursor-pointer transition-colors text-center">
                    <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                        onChange={e => handleFileSelect(e.target.files)} />
                    <UploadCloud className="w-6 h-6 text-slate-400" />
                    <p className="text-xs font-bold text-slate-600">Click to select file(s) (PDF or Images — multiple allowed)</p>
                </label>

                {/* Selected File List */}
                {files.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {files.map((f, i) => (
                            <div key={`${f.name}-${i}`} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                                <div className="flex items-center gap-2 truncate">
                                    <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                                    <span className="font-bold text-slate-800 truncate">{f.name}</span>
                                    <span className="text-[10px] text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                                </div>
                                <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 p-1">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {progress && (
                    <div className="flex items-center gap-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        {progress}
                    </div>
                )}

                {error && <p className="text-red-600 text-xs font-bold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}

                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onCancel} disabled={isPending} className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-white transition-colors">Cancel</button>
                    <button type="submit" disabled={isPending || files.length === 0} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-colors disabled:opacity-60">
                        {isPending ? progress || "Uploading..." : `Upload ${files.length > 0 ? `(${files.length} File${files.length > 1 ? "s" : ""})` : ""}`}
                    </button>
                </div>
            </div>
        </form>
    );
};

// ─── Patient Card ──────────────────────────────────────────────────────────────

const PatientCard = ({ patient, records, doctors, onToast, onRefresh }: {
    patient: MasshaPatient; records: MasshaRecord[]; doctors: MasshaDoctor[];
    onToast: (msg: string, type: "success" | "error") => void; onRefresh: () => void;
}) => {
    const [uploadMode, setUploadMode] = useState<null | "lab_report" | "prescription">(null);
    const [isPending, startTransition] = useTransition();
    const doctorOpts = doctors.map(d => ({ label: `Dr. ${d.name} — ${d.specialization}`, value: d.id }));

    const handleDoctorAssign = (doctorId: string) => {
        startTransition(async () => {
            const res = await assignDoctorToPatient({ patientId: patient.id, doctorId, patientUserId: patient.userId });
            if (res.success) {
                const name = doctors.find(d => d.id === doctorId)?.name;
                onToast(doctorId ? `All records moved to Dr. ${name}.` : `Doctor removed from ${patient.name}.`, "success");
                onRefresh();
            } else { onToast(res.error ?? "Failed.", "error"); }
        });
    };

    const handleDeleteRecord = (recordId: string, type: "lab_report" | "prescription") => {
        if (!confirm("Delete this document permanently?")) return;
        startTransition(async () => {
            const res = await deleteMasshaRecord(recordId, type);
            if (res.success) { onToast("Document deleted.", "success"); onRefresh(); }
            else { onToast(res.error ?? "Failed.", "error"); }
        });
    };

    const handleDeletePatient = () => {
        if (!confirm(`Permanently delete ${patient.name} (${patient.customId})?\n\nThis removes the patient, all lab reports, prescriptions, and timeline entries. Cannot be undone.`)) return;
        startTransition(async () => {
            const res = await deleteMasshaPatient(patient.id);
            if (res.success) { onToast(`Patient "${patient.name}" fully deleted.`, "success"); onRefresh(); }
            else { onToast(res.error ?? "Failed.", "error"); }
        });
    };

    return (
        <div className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm flex flex-col overflow-hidden">
            {/* Patient Header */}
            <div className="p-5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 border-2 border-teal-100 flex items-center justify-center shrink-0">
                        <User className="w-6 h-6 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {/* BOLD Name + ID */}
                        <h3 className="text-xl font-black text-slate-900 leading-tight">{patient.name}</h3>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-teal-700 bg-teal-50 border-2 border-teal-200 px-3 py-0.5 rounded-full font-mono tracking-wider">
                                {patient.customId}
                            </span>
                            {patient.bloodGroup && (
                                <span className="text-xs font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{patient.bloodGroup}</span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-1.5">
                            {[patient.age ? `${patient.age} yrs` : null, patient.gender, patient.phoneNumber].filter(Boolean).join(" · ")}
                        </p>
                        {(patient.chronicConditions || patient.allergies) && (
                            <p className="text-[11px] text-amber-700 font-semibold mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 inline-block">
                                {[patient.chronicConditions, patient.allergies].filter(Boolean).join(" · ")}
                            </p>
                        )}
                    </div>
                    {/* Upload Buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                        <button onClick={() => setUploadMode(uploadMode === "lab_report" ? null : "lab_report")}
                            className={`flex items-center gap-1.5 px-3 py-2 border-2 text-[11px] font-black rounded-xl transition-colors whitespace-nowrap
                                ${uploadMode === "lab_report" ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"}`}>
                            <FlaskConical className="w-3.5 h-3.5" /> Lab Report
                        </button>
                        <button onClick={() => setUploadMode(uploadMode === "prescription" ? null : "prescription")}
                            className={`flex items-center gap-1.5 px-3 py-2 border-2 text-[11px] font-black rounded-xl transition-colors whitespace-nowrap
                                ${uploadMode === "prescription" ? "bg-violet-600 text-white border-violet-600" : "bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200"}`}>
                            <Pill className="w-3.5 h-3.5" /> Prescription
                        </button>
                    </div>
                </div>

                {/* Doctor Assignment — Patient Level */}
                <div className="mt-4 bg-slate-50 border-2 border-slate-100 rounded-xl p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Connected Doctor — all documents follow</p>
                    <Select id={`doc-${patient.id}`} label="" value={patient.assignedDoctorId} onChange={handleDoctorAssign} options={doctorOpts} placeholder="No doctor assigned" />
                    {patient.assignedDoctorName && (
                        <p className="text-xs text-teal-600 font-bold mt-2 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Dr. {patient.assignedDoctorName}
                        </p>
                    )}
                </div>

                {/* Upload Panel */}
                {uploadMode && (
                    <UploadPanel patient={patient} docType={uploadMode}
                        onUploaded={() => { setUploadMode(null); onToast("Document uploaded.", "success"); onRefresh(); }}
                        onCancel={() => setUploadMode(null)} />
                )}
            </div>

            {/* Documents */}
            {records.length > 0 && (
                <div className="border-t-2 border-slate-100 px-5 py-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Documents ({records.length})</p>
                    <div className="space-y-2">
                        {records.map(rec => (
                            <div key={rec.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <div className="shrink-0">
                                    {rec.type === "prescription" ? <Pill className="w-4 h-4 text-violet-500" /> : <FlaskConical className="w-4 h-4 text-blue-500" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-slate-800 truncate">{rec.fileName}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">
                                        {rec.type === "prescription" ? "Prescription" : "Lab Report"}{rec.reportDate ? ` · ${rec.reportDate}` : ""}
                                    </p>
                                </div>
                                {rec.cloudinaryUrl && (
                                    <a href={rec.cloudinaryUrl} target="_blank" rel="noopener noreferrer"
                                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg transition-colors">
                                        <Eye className="w-3.5 h-3.5" /> View
                                    </a>
                                )}
                                <button onClick={() => handleDeleteRecord(rec.id, rec.type)} disabled={isPending}
                                    className="shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Delete Patient — full-width red */}
            <div className="mt-auto border-t-2 border-slate-100 px-5 py-3">
                <button onClick={handleDeletePatient} disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-600 border-2 border-red-200 hover:border-red-600 text-red-600 hover:text-white text-xs font-black rounded-xl transition-all disabled:opacity-50">
                    <Trash2 className="w-4 h-4" /> Delete Entire Patient Record
                </button>
            </div>
        </div>
    );
};

// ─── Doctor Row ────────────────────────────────────────────────────────────────

const DoctorRow = ({ doctor, onToast, onRefresh }: { doctor: MasshaDoctor; onToast: (m: string, t: "success" | "error") => void; onRefresh: () => void }) => {
    const [isPending, startTransition] = useTransition();
    return (
        <tr className="hover:bg-slate-50 transition-colors">
            <td className="py-3.5 px-4 font-black text-slate-900">Dr. {doctor.name}</td>
            <td className="py-3.5 px-4 font-semibold text-teal-700">{doctor.specialization}</td>
            <td className="py-3.5 px-4 font-mono text-slate-500 text-xs">{doctor.licenseNumber}</td>
            <td className="py-3.5 px-4 text-slate-400 text-xs">{doctor.email}</td>
            <td className="py-3.5 px-4 text-xs font-mono">
                <span className="bg-teal-50 border border-teal-200 text-teal-800 font-bold px-2 py-1 rounded-md">
                    {doctor.password || "MasshaDoc@2026"}
                </span>
            </td>
            <td className="py-3.5 px-4 text-slate-400 text-xs">{doctor.clinicName ?? "Massha Hospital"}</td>
            <td className="py-3.5 px-4 text-right">
                <button disabled={isPending} title="Delete"
                    onClick={() => { if (!confirm(`Delete Dr. ${doctor.name}?`)) return; startTransition(async () => { const r = await deleteMasshaDoctor(doctor.id); if (r.success) { onToast(`Dr. ${doctor.name} deleted.`, "success"); onRefresh(); } else onToast(r.error ?? "Failed.", "error"); }); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                    <Trash2 className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
};

// ─── Setup Guide Card ─────────────────────────────────────────────────────────

const SetupGuideCard = ({ onOpenDoctorModal, onOpenRegisterModal, onSwitchToDoctors }: {
    onOpenDoctorModal: () => void;
    onOpenRegisterModal: () => void;
    onSwitchToDoctors: () => void;
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm transition-all">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                        <BadgeCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-black tracking-tight text-slate-900">
                                Massha Hospital Operational Setup Guide
                            </h2>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                                Step-by-Step Workflow
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Follow these 3 steps to create doctor accounts, register patients, auto-extract clinical data, and connect diagnostic pathways.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5 shrink-0"
                >
                    {isCollapsed ? "Show Guide" : "Hide Guide"}
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                </button>
            </div>

            {!isCollapsed && (
                <div className="mt-6 pt-5 border-t-2 border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Step 1 */}
                    <div className="bg-slate-50/70 border-2 border-slate-200 hover:border-teal-300 rounded-2xl p-5 flex flex-col justify-between transition-all">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="w-7 h-7 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                                    1
                                </span>
                                <span className="text-[10px] font-black text-teal-700 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                                    Doctor Setup
                                </span>
                            </div>
                            <h3 className="font-black text-sm text-slate-900 mb-2">1. Create Doctor Account</h3>
                            <ul className="text-xs text-slate-600 space-y-1.5 font-medium leading-relaxed">
                                <li className="flex items-start gap-1.5">
                                    <span className="text-teal-600 font-bold">•</span>
                                    <span>Click <strong className="text-slate-800">"Create Doctor Account"</strong> at top right.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-teal-600 font-bold">•</span>
                                    <span>Enter doctor name, specialization, license &amp; email.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-teal-600 font-bold">•</span>
                                    <span>Set password or default <code className="bg-teal-50 border border-teal-200 text-teal-800 font-mono px-1.5 py-0.5 rounded text-[11px] font-bold">MasshaDoc@2026</code>.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-teal-600 font-bold">•</span>
                                    <span>Doctors log in at <code className="bg-slate-200 text-slate-800 font-mono px-1 py-0.5 rounded text-[11px] font-bold">/login</code>.</span>
                                </li>
                            </ul>
                        </div>
                        <div className="mt-5 pt-3 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={onOpenDoctorModal}
                                className="w-full text-center py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl transition-colors shadow-md shadow-teal-100 flex items-center justify-center gap-1.5"
                            >
                                <Stethoscope className="w-4 h-4" /> Create Doctor Account
                            </button>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="bg-slate-50/70 border-2 border-slate-200 hover:border-blue-300 rounded-2xl p-5 flex flex-col justify-between transition-all">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                                    2
                                </span>
                                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                    Patient &amp; Uploads
                                </span>
                            </div>
                            <h3 className="font-black text-sm text-slate-900 mb-2">2. Register Patient &amp; Lab Reports</h3>
                            <ul className="text-xs text-slate-600 space-y-1.5 font-medium leading-relaxed">
                                <li className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>Click <strong className="text-slate-800">"Register New Patient"</strong>.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>Attach PDF/Image lab reports or prescriptions.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>AI auto-extracts patient name, vitals, age &amp; gender.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>System generates unique ID e.g. <code className="bg-blue-50 border border-blue-200 text-blue-800 font-mono px-1.5 py-0.5 rounded text-[11px] font-bold">MASSHA-XXXX</code>.</span>
                                </li>
                            </ul>
                        </div>
                        <div className="mt-5 pt-3 border-slate-200 border-t">
                            <button
                                type="button"
                                onClick={onOpenRegisterModal}
                                className="w-full text-center py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition-colors shadow-md shadow-blue-100 flex items-center justify-center gap-1.5"
                            >
                                <UserPlus className="w-4 h-4" /> Register New Patient
                            </button>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="bg-slate-50/70 border-2 border-slate-200 hover:border-violet-300 rounded-2xl p-5 flex flex-col justify-between transition-all">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="w-7 h-7 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                                    3
                                </span>
                                <span className="text-[10px] font-black text-violet-700 uppercase tracking-wider bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200">
                                    Connect &amp; EHR
                                </span>
                            </div>
                            <h3 className="font-black text-sm text-slate-900 mb-2">3. Connect Patient to Doctor</h3>
                            <ul className="text-xs text-slate-600 space-y-1.5 font-medium leading-relaxed">
                                <li className="flex items-start gap-1.5">
                                    <span className="text-violet-600 font-bold">•</span>
                                    <span>Select assigned doctor during patient registration.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-violet-600 font-bold">•</span>
                                    <span>Doctor logs in to open patient EHR at <code className="bg-violet-50 border border-violet-200 text-violet-800 font-mono px-1 py-0.5 rounded text-[11px] font-bold">/doctor/patient/[id]</code>.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-violet-600 font-bold">•</span>
                                    <span>Review reports, prescribe &amp; view diagnostic pathway.</span>
                                </li>
                                <li className="flex items-start gap-1.5">
                                    <span className="text-violet-600 font-bold">•</span>
                                    <span>View/manage passwords under <strong className="text-slate-800">"Doctors"</strong> tab below.</span>
                                </li>
                            </ul>
                        </div>
                        <div className="mt-5 pt-3 border-slate-200 border-t">
                            <button
                                type="button"
                                onClick={onSwitchToDoctors}
                                className="w-full text-center py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl transition-colors shadow-md shadow-violet-100 flex items-center justify-center gap-1.5"
                            >
                                <Stethoscope className="w-4 h-4" /> View Doctor Accounts
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Main Portal ───────────────────────────────────────────────────────────────

export default function MasshaPortal({ initialPatients, initialDoctors, initialRecordsByPatient }: {
    initialPatients: MasshaPatient[];
    initialDoctors: MasshaDoctor[];
    initialRecordsByPatient: Record<string, MasshaRecord[]>;
}) {
    const [patients, setPatients] = useState(initialPatients);
    const [doctors, setDoctors] = useState(initialDoctors);
    const [recordsByPatient, setRecordsByPatient] = useState(initialRecordsByPatient);
    const [isRefreshing, startRefresh] = useTransition();
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
    const [showRegister, setShowRegister] = useState(false);
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [patientCard, setPatientCard] = useState<{ customId: string; patientName: string } | null>(null);
    const [doctorCreds, setDoctorCreds] = useState<{ doctorName: string; tempPassword: string } | null>(null);
    const [activeSection, setActiveSection] = useState<"patients" | "doctors">("patients");
    const [search, setSearch] = useState("");

    const showToast = (message: string, type: "success" | "error" = "success") => setToast({ message, type });
    const refresh = () => startRefresh(async () => {
        const res = await getMasshaDashboardData();
        if (res.success) { setPatients(res.patients ?? []); setDoctors(res.doctors ?? []); setRecordsByPatient(res.recordsByPatient ?? {}); }
    });

    const q = search.toLowerCase();
    const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(q) || p.customId.toLowerCase().includes(q) || (p.phoneNumber ?? "").includes(q));
    const filteredDoctors = doctors.filter(d => d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q) || d.email.toLowerCase().includes(q));
    const totalRecords = Object.values(recordsByPatient).reduce((s, r) => s + r.length, 0);

    return (
        <div className="min-h-screen bg-slate-50 font-sans antialiased">
            {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

            <header className="sticky top-0 z-40 bg-white border-b-2 border-slate-100 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center font-black text-white text-lg">M</div>
                        <div>
                            <p className="text-base font-black text-slate-900 leading-tight">Massha Hospital</p>
                            <p className="text-[11px] text-slate-400 font-medium">Clinical Records &amp; Patient Operations</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={refresh} disabled={isRefreshing} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors disabled:opacity-40" title="Refresh">
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </button>
                        <button onClick={() => setShowDoctorModal(true)} className="flex items-center gap-2 px-4 py-2 border-2 border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs font-black rounded-xl transition-colors">
                            <Stethoscope className="w-4 h-4 text-teal-600" /> Create Doctor Account
                        </button>
                        <button onClick={() => setShowRegister(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-teal-100">
                            <UserPlus className="w-4 h-4" /> Register New Patient
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
                {/* Interactive Setup & Workflow Guide */}
                <SetupGuideCard
                    onOpenDoctorModal={() => setShowDoctorModal(true)}
                    onOpenRegisterModal={() => setShowRegister(true)}
                    onSwitchToDoctors={() => setActiveSection("doctors")}
                />

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: "Total Patients", value: patients.length, icon: <User className="w-5 h-5 text-teal-600" />, bg: "bg-teal-50 border-teal-200" },
                        { label: "Doctors", value: doctors.length, icon: <Stethoscope className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50 border-blue-200" },
                        { label: "Clinical Uploads", value: totalRecords, icon: <FileText className="w-5 h-5 text-violet-600" />, bg: "bg-violet-50 border-violet-200" },
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} border-2 rounded-2xl p-4 flex items-center gap-4`}>
                            <div className="bg-white rounded-xl p-2.5 shadow-sm">{s.icon}</div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</p>
                                <p className="text-2xl font-black text-slate-900 mt-0.5">{s.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs + Search */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex bg-white border-2 border-slate-200 p-1 rounded-xl gap-1">
                        {(["patients", "doctors"] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveSection(tab)}
                                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors ${activeSection === tab ? "bg-teal-600 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>
                                {tab === "patients" ? `Patients (${patients.length})` : `Doctors (${doctors.length})`}
                            </button>
                        ))}
                    </div>
                    <div className="relative w-full sm:w-72">
                        <input type="text" placeholder="Search by name, ID, phone..." value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-800 focus:outline-none focus:border-teal-500 transition-colors" />
                        <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* Patients */}
                {activeSection === "patients" && (
                    filteredPatients.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                            <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                            <p className="font-black text-slate-400">No patients registered yet</p>
                            <p className="text-sm text-slate-400 font-medium mt-1">Click "Register New Patient" to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {filteredPatients.map(p => (
                                <PatientCard key={p.id} patient={p} records={recordsByPatient[p.id] ?? []}
                                    doctors={doctors} onToast={showToast} onRefresh={refresh} />
                            ))}
                        </div>
                    )
                )}

                {/* Doctors */}
                {activeSection === "doctors" && (
                    <div className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-black text-slate-900 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-teal-600" /> Doctor Accounts</h2>
                            <button onClick={() => setShowDoctorModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-colors">
                                <Plus className="w-3.5 h-3.5" /> Add Doctor
                            </button>
                        </div>
                        {filteredDoctors.length === 0 ? (
                            <div className="p-12 text-center"><Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="font-black text-slate-400">No doctor accounts yet</p></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>{["Doctor Name", "Specialization", "License No.", "Email", "Password", "Clinic", ""].map(h => <th key={h} className="py-3 px-4 font-black text-slate-500 uppercase tracking-wider">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredDoctors.map(d => <DoctorRow key={d.id} doctor={d} onToast={showToast} onRefresh={refresh} />)}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {showRegister && <RegisterPatientModal doctors={doctors} onClose={() => setShowRegister(false)}
                onSuccess={(customId, patientName) => { setShowRegister(false); setPatientCard({ customId, patientName }); refresh(); }} />}
            {patientCard && <PatientIdCard customId={patientCard.customId} patientName={patientCard.patientName} onClose={() => setPatientCard(null)} />}
            {showDoctorModal && <CreateDoctorModal onClose={() => setShowDoctorModal(false)}
                onSuccess={(doctorName, tempPassword) => { setShowDoctorModal(false); setDoctorCreds({ doctorName, tempPassword }); refresh(); }} />}
            {doctorCreds && <DoctorCredsModal doctorName={doctorCreds.doctorName} tempPassword={doctorCreds.tempPassword} onClose={() => setDoctorCreds(null)} />}
        </div>
    );
}
