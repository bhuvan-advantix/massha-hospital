"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
    X, CheckCircle2, AlertCircle, User,
    ChevronDown, FlaskConical, Pill,
    UploadCloud, Loader2, FileText, Users, Search, Check, Trash2,
} from "lucide-react";
import {
    createMasshaPatient, uploadMasshaDocument,
    extractPatientDetailsFromDoc, getMasshaDashboardData, deleteMasshaPatient,
    type MasshaPatient, type MasshaDoctor,
} from "@/app/actions/massha";

// ─── Shared UI Helpers ────────────────────────────────────────────────────────

export const MField = ({ id, label, type = "text", placeholder, value, onChange, required = false }: {
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

export const MSelect = ({ id, label, value, onChange, options, placeholder = "Select" }: {
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

export const MToast = ({ message, type, onDone }: { message: string; type: "success" | "error"; onDone: () => void }) => {
    useEffect(() => { const t = setTimeout(onDone, 4500); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className={`fixed top-5 right-5 z-[150] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border-2 text-sm font-bold max-w-sm
            ${type === "success" ? "bg-white border-teal-200 text-teal-800" : "bg-white border-red-200 text-red-700"}`}>
            {type === "success" ? <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
            {message}
        </div>
    );
};

// ─── Register Patient Modal ────────────────────────────────────────────────────

export const RegisterPatientModal = ({ doctors, onClose, onSuccess }: {
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
        const items = newFiles.map(file => ({ id: Math.random().toString(36).substring(2), file, type }));
        setDocFiles(prev => [...prev, ...items]);

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
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 max-h-[95vh] flex flex-col">
                <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Register New Patient</h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Upload document(s) to auto-fill &amp; attach, or enter details manually</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Upload Documents (Optional)</span>
                            <span className="text-[11px] text-teal-600 font-bold bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">AI Auto-fills form</span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center justify-center gap-2 py-3 px-3 border-2 border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 text-blue-700 font-bold text-xs rounded-xl cursor-pointer transition-colors text-center">
                                    <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                                        onChange={e => handleDocUpload(e.target.files, "lab_report")} />
                                    <FlaskConical className="w-4 h-4 shrink-0" />
                                    <span>Add Lab Report(s)</span>
                                </label>
                                <label className="flex items-center justify-center gap-2 py-3 px-3 border-2 border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 text-violet-700 font-bold text-xs rounded-xl cursor-pointer transition-colors text-center">
                                    <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                                        onChange={e => handleDocUpload(e.target.files, "prescription")} />
                                    <Pill className="w-4 h-4 shrink-0" />
                                    <span>Add Prescription(s)</span>
                                </label>
                            </div>

                            {isExtracting && (
                                <div className="flex items-center gap-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
                                    <Loader2 className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
                                    <span>Analyzing <strong className="font-mono">{extractingFileName}</strong> to extract patient details...</span>
                                </div>
                            )}

                            {docFiles.length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{docFiles.length} Document(s) will be uploaded with registration:</p>
                                    {docFiles.map(d => (
                                        <div key={d.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                                            <div className="flex items-center gap-2 truncate">
                                                <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                                <span className="font-bold text-slate-700 truncate">{d.file.name}</span>
                                                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${d.type === "prescription" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{d.type === "prescription" ? "Rx" : "Lab"}</span>
                                            </div>
                                            <button type="button" onClick={() => removeDocFile(d.id)} className="text-slate-400 hover:text-red-500 p-1">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3.5">
                        <MField id="m-name" label="Full Name" placeholder="e.g. Ramesh Kumar" value={form.name} onChange={v => set("name", v)} required />
                        <div className="grid grid-cols-2 gap-3">
                            <MField id="m-phone" label="Phone Number" placeholder="e.g. 9876543210" value={form.phone} onChange={v => set("phone", v)} />
                            <MField id="m-age" label="Age" type="number" placeholder="e.g. 45" value={form.age} onChange={v => set("age", v)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <MSelect id="m-gender" label="Gender" value={form.gender} onChange={v => set("gender", v)} options={genderOpts} placeholder="Select gender" />
                            <MSelect id="m-bloodGroup" label="Blood Group" value={form.bloodGroup} onChange={v => set("bloodGroup", v)} options={bgOpts} placeholder="Select blood group" />
                        </div>
                        <MField id="m-email" label="Email (Optional — Auto-generated if empty)" type="email" placeholder="patient@example.com" value={form.email} onChange={v => set("email", v)} />
                        {doctorOpts.length > 0 && (
                            <MSelect id="m-doctor" label="Assign Doctor" value={form.assignedDoctorId} onChange={v => set("assignedDoctorId", v)} options={doctorOpts} placeholder="Select a doctor (optional)" />
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={onClose} disabled={isPending} className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={isPending || isExtracting} className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-teal-100 disabled:opacity-60">
                            {isPending ? "Registering & Uploading..." : "Register Patient"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Patient ID Card Modal ─────────────────────────────────────────────────────

export const PatientIdCard = ({ customId, patientName, onClose }: {
    customId: string; patientName: string; onClose: () => void;
}) => (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-teal-50 border-2 border-teal-200 rounded-2xl flex items-center justify-center mx-auto text-teal-600">
                <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Patient Registered Successfully</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">{patientName}</h3>
            </div>
            <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold text-teal-600 uppercase tracking-wider mb-1">Generated Massha Patient ID</p>
                <p className="text-3xl font-black font-mono text-teal-900 tracking-tight">{customId}</p>
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
                This ID uniquely identifies the patient across records, doctor consultations, and lab reports.
            </p>
            <button onClick={onClose} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl transition-colors shadow-lg shadow-teal-100">
                Done &amp; View Dashboard
            </button>
        </div>
    </div>
);

// ─── Update Existing Patient Modal ─────────────────────────────────────────────

export const UpdateExistingPatientModal = ({ patients, onClose, onSuccess }: {
    patients: MasshaPatient[];
    onClose: () => void;
    onSuccess: () => void;
}) => {
    const [selectedPatientId, setSelectedPatientId] = useState("");
    const [docType, setDocType] = useState<"lab_report" | "prescription">("lab_report");
    const [files, setFiles] = useState<File[]>([]);
    const [isPending, startTransition] = useTransition();
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");

    const patientOpts = patients.map(p => ({
        label: `${p.customId ? `[${p.customId}] ` : ""}${p.name}${p.bloodGroup ? ` (${p.bloodGroup})` : ""}`,
        value: p.id,
    }));

    const handleFileSelect = (selected: FileList | null) => {
        if (!selected || selected.length === 0) return;
        setFiles(prev => [...prev, ...Array.from(selected)]);
        setError("");
    };

    const removeFile = (idx: number) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleUpload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatientId) {
            setError("Please select a patient.");
            return;
        }
        if (files.length === 0) {
            setError("Please select at least one document to upload.");
            return;
        }
        setError("");
        startTransition(async () => {
            let uploaded = 0;
            for (let i = 0; i < files.length; i++) {
                setProgress(`Uploading document ${i + 1} of ${files.length}...`);
                const fd = new FormData();
                fd.append("file", files[i]);
                fd.append("patientId", selectedPatientId);
                fd.append("type", docType);
                const res = await uploadMasshaDocument(fd);
                if (res.success) uploaded++;
                else console.error(`Error uploading ${files[i].name}:`, res.error);
            }
            if (uploaded > 0) {
                onSuccess();
            } else {
                setError("Failed to upload files. Please try again.");
                setProgress("");
            }
        });
    };

    const selectedPatient = patients.find(p => p.id === selectedPatientId);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 max-h-[95vh] flex flex-col">
                <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Update Existing Patient</h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Upload new lab reports or prescriptions for an existing patient</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleUpload} className="overflow-y-auto flex-1 p-5 space-y-4">
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Select Patient <span className="text-red-400">*</span>
                        </label>
                        <MSelect
                            id="up-patient"
                            value={selectedPatientId}
                            onChange={setSelectedPatientId}
                            options={patientOpts}
                            placeholder="Choose an existing patient..."
                        />
                    </div>

                    {selectedPatient && (
                        <div className="bg-teal-50/60 border border-teal-200/70 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                            <div>
                                <p className="font-black text-teal-900">{selectedPatient.name}</p>
                                <p className="text-teal-700 font-medium">
                                    ID: <span className="font-mono font-bold">{selectedPatient.customId || "None"}</span>
                                    {selectedPatient.gender && ` • ${selectedPatient.gender}`}
                                    {selectedPatient.age && ` • ${selectedPatient.age} yrs`}
                                </p>
                            </div>
                            {selectedPatient.assignedDoctorName && (
                                <span className="text-[10px] font-bold bg-white text-teal-800 border border-teal-200 px-2 py-1 rounded-lg">
                                    Dr. {selectedPatient.assignedDoctorName}
                                </span>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Document Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setDocType("lab_report")}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-colors ${
                                    docType === "lab_report"
                                        ? "border-blue-500 bg-blue-50 text-blue-800"
                                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                                }`}
                            >
                                <FlaskConical className="w-4 h-4 text-blue-600" />
                                <span>Lab Report</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDocType("prescription")}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-colors ${
                                    docType === "prescription"
                                        ? "border-violet-500 bg-violet-50 text-violet-800"
                                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                                }`}
                            >
                                <Pill className="w-4 h-4 text-violet-600" />
                                <span>Prescription</span>
                            </button>
                        </div>
                    </div>

                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/40 rounded-2xl p-5 cursor-pointer transition-colors text-center">
                        <input
                            type="file"
                            multiple
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={e => handleFileSelect(e.target.files)}
                        />
                        <UploadCloud className="w-6 h-6 text-slate-400" />
                        <p className="text-xs font-bold text-slate-700">Click to select file(s) (PDF or Images)</p>
                        <p className="text-[11px] text-slate-400">Multiple files supported</p>
                    </label>

                    {files.length > 0 && (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {files.map((f, i) => (
                                <div key={`${f.name}-${i}`} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
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

                    {error && (
                        <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={onClose} disabled={isPending} className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending || !selectedPatientId || files.length === 0}
                            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-teal-100 disabled:opacity-50"
                        >
                            {isPending ? progress || "Uploading..." : `Upload ${files.length > 0 ? `(${files.length} File${files.length > 1 ? "s" : ""})` : ""}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Switch Patient Modal ──────────────────────────────────────────────────────

export const SwitchPatientModal = ({
    onClose,
    onSwitch,
    currentUserId,
}: {
    onClose: () => void;
    onSwitch: (patientUserId: string) => void;
    currentUserId?: string;
}) => {
    const [patients, setPatients] = useState<MasshaPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (patient: MasshaPatient) => {
        if (!confirm(`Are you sure you want to delete patient "${patient.name}" (${patient.customId || "No ID"})?\n\nThis will permanently delete the patient and all associated clinical records, lab reports, and prescriptions from the database.`)) {
            return;
        }

        setDeletingId(patient.id);
        try {
            const res = await deleteMasshaPatient(patient.id);
            if (res.success) {
                setPatients(prev => prev.filter(p => p.id !== patient.id));
                if (patient.userId === currentUserId) {
                    onClose();
                    window.location.href = "/dashboard";
                }
            } else {
                alert(res.error || "Failed to delete patient");
            }
        } catch (err: any) {
            alert("Error deleting patient: " + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => {
        getMasshaDashboardData().then(res => {
            if (res.success && res.patients) {
                setPatients(res.patients);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const filtered = patients.filter(p => {
        const q = search.toLowerCase();
        return (
            p.name.toLowerCase().includes(q) ||
            (p.customId && p.customId.toLowerCase().includes(q)) ||
            (p.bloodGroup && p.bloodGroup.toLowerCase().includes(q))
        );
    });

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
                <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-teal-600" />
                            <h2 className="text-xl font-black text-slate-900">Switch Patient View</h2>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Select a patient to inspect their live clinical dashboard &amp; reports</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name, ID (#Massha001), blood group..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-4 space-y-2">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                            <span>Loading patients...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs font-bold">
                            {patients.length === 0 ? "No patients registered in the system yet." : "No matching patients found."}
                        </div>
                    ) : (
                        filtered.map(p => {
                            const isCurrent = p.userId === currentUserId;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => onSwitch(p.userId)}
                                    className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between group cursor-pointer ${
                                        isCurrent
                                            ? "border-teal-500 bg-teal-50/50"
                                            : "border-slate-100 hover:border-teal-200 hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm group-hover:bg-teal-600 group-hover:text-white transition-colors">
                                            {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-black text-sm text-slate-900 group-hover:text-teal-700 transition-colors">
                                                    {p.name}
                                                </h4>
                                                {p.customId && (
                                                    <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                                                        {p.customId}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                                {p.gender || "Gender unspecified"}
                                                {p.age ? ` • ${p.age} yrs` : ""}
                                                {p.bloodGroup ? ` • ${p.bloodGroup}` : ""}
                                                {p.assignedDoctorName ? ` • Dr. ${p.assignedDoctorName}` : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {p.customId !== "#Massha-ADMIN" && (
                                            <button
                                                type="button"
                                                disabled={deletingId === p.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(p);
                                                }}
                                                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                                                title={`Delete ${p.name} from database`}
                                            >
                                                {deletingId === p.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                        {isCurrent ? (
                                            <span className="text-xs font-black text-teal-700 flex items-center gap-1 bg-teal-100 px-2.5 py-1 rounded-lg">
                                                <Check className="w-3.5 h-3.5" /> Viewing
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Switch →
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2.5 border-2 border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
