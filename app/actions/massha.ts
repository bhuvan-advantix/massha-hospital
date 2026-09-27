"use server";

import { db } from "@/db";
import {
    patients, doctors, users, labReports, prescriptions,
    timelineEvents, doctorPatientRelations, healthParameters,
} from "@/db/schema";
import { eq, desc, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
    uploadPdfToCloudinary,
    deletePdfFromCloudinary,
    extractPublicIdFromUrl,
} from "@/lib/cloudinary";
import { LlamaParse } from "llama-parse";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MasshaPatient {
    id: string;
    userId: string;
    name: string;
    customId: string;
    age: number | null;
    gender: string | null;
    phoneNumber: string | null;
    bloodGroup: string | null;
    chronicConditions: string | null;
    allergies: string | null;
    // Doctor assigned at patient level
    assignedDoctorId: string;
    assignedDoctorName: string;
}

export interface MasshaDoctor {
    id: string;
    userId: string;
    name: string;
    email: string;
    specialization: string;
    licenseNumber: string;
    clinicName: string | null;
    password?: string;
}

export interface MasshaRecord {
    id: string;
    patientId: string;
    fileName: string;
    reportDate: string | null;
    cloudinaryUrl: string | null;
    uploadedAt: Date | number | null;
    type: "lab_report" | "prescription";
}

export interface ExtractedPatientDetails {
    patientName: string | null;
    age: string | null;
    gender: string | null;
    bloodGroup: string | null;
    phone: string | null;
    doctorName: string | null;
    labName: string | null;
    reportDate: string | null;
}

// ─── Load All Dashboard Data ───────────────────────────────────────────────────

export async function getMasshaDashboardData(): Promise<{
    success: boolean;
    patients?: MasshaPatient[];
    doctors?: MasshaDoctor[];
    recordsByPatient?: Record<string, MasshaRecord[]>;
    error?: string;
}> {
    try {
        // Doctors first (needed for patient enrichment)
        const rawDoctors = await db
            .select({
                id: doctors.id,
                userId: doctors.userId,
                specialization: doctors.specialization,
                licenseNumber: doctors.licenseNumber,
                clinicName: doctors.clinicName,
            })
            .from(doctors)
            .orderBy(desc(doctors.createdAt));

        const enrichedDoctors: MasshaDoctor[] = await Promise.all(
            rawDoctors.map(async (d) => {
                const [u] = await db
                    .select({ name: users.name, email: users.email })
                    .from(users)
                    .where(eq(users.id, d.userId))
                    .limit(1);
                return {
                    ...d,
                    name: u?.name ?? "Unknown Doctor",
                    email: u?.email ?? "",
                    password: "MasshaDoc@2026",
                };
            })
        );

        const doctorById: Record<string, MasshaDoctor> = {};
        for (const d of enrichedDoctors) doctorById[d.id] = d;

        // Patients with their assigned doctor from doctorPatientRelations
        const rawPatients = await db
            .select({
                id: patients.id,
                userId: patients.userId,
                age: patients.age,
                gender: patients.gender,
                phoneNumber: patients.phoneNumber,
                bloodGroup: patients.bloodGroup,
                chronicConditions: patients.chronicConditions,
                allergies: patients.allergies,
            })
            .from(patients)
            .orderBy(desc(patients.createdAt));

        // Helper: strip existing "Dr." prefix to avoid "Dr. Dr." duplication
        const stripDrPrefix = (name: string) => name.replace(/^Dr\.?\s+/i, "").trim();

        const enrichedPatients: MasshaPatient[] = await Promise.all(
            rawPatients.map(async (p) => {
                const [u] = await db
                    .select({ name: users.name, customId: users.customId })
                    .from(users)
                    .where(eq(users.id, p.userId))
                    .limit(1);

                // Fetch the doctor linked to this patient
                const [rel] = await db
                    .select({ doctorId: doctorPatientRelations.doctorId })
                    .from(doctorPatientRelations)
                    .where(eq(doctorPatientRelations.patientId, p.id))
                    .limit(1);

                const assignedDoctorId = rel?.doctorId ?? "";
                const assignedDoc = assignedDoctorId ? doctorById[assignedDoctorId] : null;

                return {
                    ...p,
                    name: u?.name ?? "Unknown Patient",
                    customId: u?.customId ?? "N/A",
                    assignedDoctorId,
                    assignedDoctorName: assignedDoc ? stripDrPrefix(assignedDoc.name) : "",
                };
            })
        );

        // Records (lab reports)
        const allReports = await db
            .select({
                id: labReports.id,
                patientId: labReports.patientId,
                fileName: labReports.fileName,
                reportDate: labReports.reportDate,
                cloudinaryUrl: labReports.cloudinaryUrl,
                uploadedAt: labReports.uploadedAt,
            })
            .from(labReports)
            .orderBy(desc(labReports.uploadedAt));

        // Records (prescriptions)
        const allPrescriptions = await db
            .select({
                id: prescriptions.id,
                patientId: prescriptions.patientId,
                cloudinaryUrl: prescriptions.cloudinaryUrl,
                prescribedAt: prescriptions.prescribedAt,
            })
            .from(prescriptions)
            .orderBy(desc(prescriptions.prescribedAt));

        const recordsByPatient: Record<string, MasshaRecord[]> = {};

        for (const r of allReports) {
            if (!recordsByPatient[r.patientId]) recordsByPatient[r.patientId] = [];
            recordsByPatient[r.patientId].push({
                id: r.id,
                patientId: r.patientId,
                fileName: r.fileName,
                reportDate: r.reportDate,
                cloudinaryUrl: r.cloudinaryUrl,
                uploadedAt: r.uploadedAt,
                type: "lab_report",
            });
        }

        for (const rx of allPrescriptions) {
            if (!recordsByPatient[rx.patientId]) recordsByPatient[rx.patientId] = [];
            recordsByPatient[rx.patientId].push({
                id: rx.id,
                patientId: rx.patientId,
                fileName: "Prescription",
                reportDate: rx.prescribedAt
                    ? new Date(rx.prescribedAt).toISOString().split("T")[0]
                    : null,
                cloudinaryUrl: rx.cloudinaryUrl,
                uploadedAt: rx.prescribedAt,
                type: "prescription",
            });
        }

        // Sort each patient's records newest first
        for (const pid of Object.keys(recordsByPatient)) {
            recordsByPatient[pid].sort(
                (a, b) =>
                    new Date(b.uploadedAt ?? 0).getTime() -
                    new Date(a.uploadedAt ?? 0).getTime()
            );
        }

        // Strip Dr. prefix from doctor names in the response to avoid duplication in UI
        const cleanedDoctors = enrichedDoctors.map((d) => ({
            ...d,
            name: stripDrPrefix(d.name),
        }));

        return {
            success: true,
            patients: enrichedPatients,
            doctors: cleanedDoctors,
            recordsByPatient,
        };
    } catch (err: any) {
        console.error("getMasshaDashboardData error:", err);
        return { success: false, error: err.message ?? "Failed to load dashboard data." };
    }
}

// ─── Register New Patient (simplified) ────────────────────────────────────────

export async function createMasshaPatient(data: {
    name: string;
    email?: string;
    phone?: string;
    gender?: string;
    age?: string;
    bloodGroup?: string;
    chronicConditions?: string;
    allergies?: string;
    assignedDoctorId?: string;
    preUploadedDocUrl?: string;
    preUploadedDocName?: string;
    preUploadedDocType?: "lab_report" | "prescription";
}): Promise<{
    success: boolean;
    customId?: string;
    patientId?: string;
    patientName?: string;
    error?: string;
}> {
    try {
        const cleanName = data.name.trim();
        if (!cleanName) return { success: false, error: "Patient full name is required." };

        // Auto-generate email if omitted or blank
        const userProvidedEmail = data.email?.trim().toLowerCase();
        const cleanEmail = userProvidedEmail || `patient.${Date.now()}.${Math.floor(100 + Math.random() * 900)}@masshahospital.internal`;

        if (userProvidedEmail) {
            const [existing] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, cleanEmail))
                .limit(1);

            if (existing) {
                return { success: false, error: "A patient with this email already exists." };
            }
        }

        // Auto-generate #Massha ID
        const masshaIds = await db
            .select({ customId: users.customId })
            .from(users)
            .where(like(users.customId, "#Massha%"));

        let maxNum = 0;
        for (const r of masshaIds) {
            if (r.customId) {
                const n = parseInt(r.customId.replace("#Massha", ""), 10);
                if (!isNaN(n) && n > maxNum) maxNum = n;
            }
        }

        const customId = `#Massha${(maxNum + 1).toString().padStart(3, "0")}`;
        const tempPassword = `Massha@${Math.floor(1000 + Math.random() * 9000)}`;
        const hashedPw = await bcrypt.hash(tempPassword, 12);
        const newUserId = uuidv4();

        await db.insert(users).values({
            id: newUserId,
            name: cleanName,
            email: cleanEmail,
            password: hashedPw,
            role: "patient",
            isOnboarded: true,
            customId,
            isBanned: false,
        });

        const newPatientId = uuidv4();
        await db.insert(patients).values({
            id: newPatientId,
            userId: newUserId,
            gender: data.gender || null,
            age: data.age ? parseInt(data.age, 10) : null,
            bloodGroup: data.bloodGroup || null,
            phoneNumber: data.phone?.trim() || null,
            chronicConditions: data.chronicConditions || null,
            allergies: data.allergies || null,
        });

        if (data.assignedDoctorId) {
            await db
                .insert(doctorPatientRelations)
                .values({ doctorId: data.assignedDoctorId, patientId: newPatientId })
                .catch(() => null);
        }

        // If a document was pre-uploaded during registration, attach it now
        if (data.preUploadedDocUrl && data.preUploadedDocName) {
            const todayStr = new Date().toISOString().split("T")[0];
            let doctorName = "Unassigned";
            if (data.assignedDoctorId) {
                const [doc] = await db.select({ userId: doctors.userId }).from(doctors).where(eq(doctors.id, data.assignedDoctorId)).limit(1);
                if (doc) {
                    const [du] = await db.select({ name: users.name }).from(users).where(eq(users.id, doc.userId)).limit(1);
                    if (du?.name) doctorName = du.name.replace(/^Dr\.?\s+/i, "").trim();
                }
            }
            if (data.preUploadedDocType === "prescription") {
                await db.insert(prescriptions).values({
                    patientId: newPatientId,
                    doctorId: data.assignedDoctorId || null,
                    cloudinaryUrl: data.preUploadedDocUrl,
                    consultationData: { hospital: "Massha Hospital", doctor: doctorName, date: todayStr },
                });
            } else {
                await db.insert(labReports).values({
                    patientId: newPatientId,
                    fileName: data.preUploadedDocName,
                    reportDate: todayStr,
                    labName: "Massha Hospital Diagnostic Center",
                    patientName: cleanName,
                    doctorName,
                    extractedData: { results: [], metadata: { Source: "Massha Hospital Staff Upload" } } as any,
                    rawText: "Uploaded during patient registration",
                    cloudinaryUrl: data.preUploadedDocUrl,
                });
            }
            await db.insert(timelineEvents).values({
                userId: newUserId,
                title: `${data.preUploadedDocType === "prescription" ? "Prescription" : "Lab Report"} Added — Massha Hospital`,
                description: `Document uploaded during patient registration. File: ${data.preUploadedDocName}`,
                eventDate: todayStr,
                eventType: data.preUploadedDocType === "prescription" ? "medication" : "test",
                status: "completed",
                doctorId: data.assignedDoctorId || null,
                createdBy: "staff",
            });
        }

        revalidatePath("/massha");
        return { success: true, customId, patientId: newPatientId, patientName: cleanName };
    } catch (err: any) {
        console.error("createMasshaPatient error:", err);
        return { success: false, error: err.message ?? "Failed to create patient." };
    }
}

// ─── Assign Doctor to Whole Patient (moves entire folder) ─────────────────────

export async function assignDoctorToPatient(data: {
    patientId: string;
    doctorId: string;
    patientUserId: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { patientId, doctorId, patientUserId } = data;

        // Get doctor name for updating records
        let doctorName = "";
        if (doctorId) {
            const [doc] = await db
                .select({ userId: doctors.userId })
                .from(doctors)
                .where(eq(doctors.id, doctorId))
                .limit(1);
            if (doc) {
                const [du] = await db
                    .select({ name: users.name })
                    .from(users)
                    .where(eq(users.id, doc.userId))
                    .limit(1);
                if (du?.name) doctorName = du.name;
            }
        }

        // Update doctorPatientRelations — delete existing, insert new
        await db
            .delete(doctorPatientRelations)
            .where(eq(doctorPatientRelations.patientId, patientId));

        if (doctorId) {
            await db
                .insert(doctorPatientRelations)
                .values({ doctorId, patientId })
                .catch(() => null);
        }

        // Update all lab reports for this patient to point to the new doctor
        await db
            .update(labReports)
            .set({ doctorName: doctorName || null })
            .where(eq(labReports.patientId, patientId));

        // Update all prescriptions for this patient
        await db
            .update(prescriptions)
            .set({ doctorId: doctorId || null })
            .where(eq(prescriptions.patientId, patientId));

        // Update all timeline events for this patient
        await db
            .update(timelineEvents)
            .set({ doctorId: doctorId || null })
            .where(eq(timelineEvents.userId, patientUserId));

        revalidatePath("/massha");
        return { success: true };
    } catch (err: any) {
        console.error("assignDoctorToPatient error:", err);
        return { success: false, error: err.message ?? "Failed to assign doctor." };
    }
}

// ─── Create Doctor Account ────────────────────────────────────────────────────

export async function createMasshaDoctor(data: {
    name: string;
    email: string;
    specialization: string;
    licenseNumber: string;
    phone?: string;
    password?: string;
}): Promise<{
    success: boolean;
    doctorId?: string;
    tempPassword?: string;
    error?: string;
}> {
    try {
        const cleanEmail = data.email.trim().toLowerCase();

        const [existing] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, cleanEmail))
            .limit(1);

        if (existing) {
            return { success: false, error: "An account with this email already exists." };
        }

        const tempPassword = data.password?.trim() || `MasshaDoc@2026`;
        const hashedPw = await bcrypt.hash(tempPassword, 12);
        const newUserId = uuidv4();

        await db.insert(users).values({
            id: newUserId,
            name: data.name.trim(),
            email: cleanEmail,
            password: hashedPw,
            role: "doctor",
            isOnboarded: true,
            isBanned: false,
        });

        const newDoctorId = uuidv4();
        await db.insert(doctors).values({
            id: newDoctorId,
            userId: newUserId,
            specialization: data.specialization.trim(),
            licenseNumber: data.licenseNumber.trim(),
            clinicName: "Massha Hospital",
            phoneNumber: data.phone?.trim() || null,
            approvalStatus: "approved",
        });

        revalidatePath("/massha");
        return { success: true, doctorId: newDoctorId, tempPassword };
    } catch (err: any) {
        console.error("createMasshaDoctor error:", err);
        return { success: false, error: err.message ?? "Failed to create doctor account." };
    }
}

// ─── Upload Document for a Specific Patient ───────────────────────────────────

export async function uploadMasshaDocument(formData: FormData): Promise<{
    success: boolean;
    recordId?: string;
    error?: string;
}> {
    try {
        const file = formData.get("file") as File;
        const patientId = formData.get("patientId") as string;
        const docType = (formData.get("type") as string) || "lab_report";

        if (!file || !file.size) return { success: false, error: "No file provided." };
        if (!patientId) return { success: false, error: "Patient ID is missing." };

        const [patient] = await db
            .select()
            .from(patients)
            .where(eq(patients.id, patientId))
            .limit(1);
        if (!patient) return { success: false, error: "Patient not found." };

        const [patientUser] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, patient.userId))
            .limit(1);

        // Look up patient's currently assigned doctor
        const [rel] = await db
            .select({ doctorId: doctorPatientRelations.doctorId })
            .from(doctorPatientRelations)
            .where(eq(doctorPatientRelations.patientId, patientId))
            .limit(1);

        const assignedDoctorId = rel?.doctorId ?? null;
        let doctorName = "Unassigned";

        if (assignedDoctorId) {
            const [doc] = await db
                .select({ userId: doctors.userId })
                .from(doctors)
                .where(eq(doctors.id, assignedDoctorId))
                .limit(1);
            if (doc) {
                const [du] = await db
                    .select({ name: users.name })
                    .from(users)
                    .where(eq(users.id, doc.userId))
                    .limit(1);
                if (du?.name) doctorName = du.name;
            }
        }

        // Upload to Cloudinary
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const cloudinaryUrl = await uploadPdfToCloudinary(buffer, file.name, patient.id);

        const todayStr = new Date().toISOString().split("T")[0];

        if (docType === "prescription") {
            const [rx] = await db
                .insert(prescriptions)
                .values({
                    patientId: patient.id,
                    doctorId: assignedDoctorId,
                    cloudinaryUrl,
                    consultationData: {
                        hospital: "Massha Hospital",
                        doctor: doctorName,
                        date: todayStr,
                        notes: `Prescription uploaded by Massha Hospital staff for ${patientUser?.name ?? "patient"}.`,
                    },
                })
                .returning();

            await db.insert(timelineEvents).values({
                userId: patient.userId,
                title: `Prescription Added — Massha Hospital`,
                description: `Document uploaded by hospital staff. File: ${file.name}`,
                eventDate: todayStr,
                eventType: "medication",
                status: "completed",
                doctorId: assignedDoctorId,
                createdBy: "staff",
            });

            revalidatePath("/massha");
            revalidatePath("/dashboard");
            return { success: true, recordId: rx.id };
        } else {
            const [report] = await db
                .insert(labReports)
                .values({
                    patientId: patient.id,
                    fileName: file.name,
                    reportDate: todayStr,
                    labName: "Massha Hospital Diagnostic Center",
                    patientName: patientUser?.name ?? "Patient",
                    doctorName,
                    extractedData: {
                        results: [],
                        metadata: { Source: "Massha Hospital Staff Upload" },
                    } as any,
                    rawText: "Uploaded by Massha Hospital staff",
                    fileSize: file.size,
                    pageCount: 1,
                    cloudinaryUrl,
                })
                .returning();

            await db.insert(timelineEvents).values({
                userId: patient.userId,
                title: `Lab Report Added — Massha Hospital`,
                description: `Report uploaded by hospital staff. File: ${file.name}`,
                eventDate: todayStr,
                eventType: "test",
                status: "completed",
                reportId: report.id,
                doctorId: assignedDoctorId,
                createdBy: "staff",
            });

            revalidatePath("/massha");
            revalidatePath("/dashboard");
            return { success: true, recordId: report.id };
        }
    } catch (err: any) {
        console.error("uploadMasshaDocument error:", err);
        return { success: false, error: err.message ?? "Upload failed." };
    }
}

// ─── Delete a Single Record ───────────────────────────────────────────────────

export async function deleteMasshaRecord(
    recordId: string,
    type: "lab_report" | "prescription"
): Promise<{ success: boolean; error?: string }> {
    try {
        if (type === "prescription") {
            const [rx] = await db
                .select({ url: prescriptions.cloudinaryUrl })
                .from(prescriptions)
                .where(eq(prescriptions.id, recordId));
            await db.delete(prescriptions).where(eq(prescriptions.id, recordId));
            if (rx?.url) {
                const pid = extractPublicIdFromUrl(rx.url);
                if (pid) await deletePdfFromCloudinary(pid).catch(() => null);
            }
        } else {
            const [rep] = await db
                .select({ url: labReports.cloudinaryUrl })
                .from(labReports)
                .where(eq(labReports.id, recordId));
            await db.delete(labReports).where(eq(labReports.id, recordId));
            if (rep?.url) {
                const pid = extractPublicIdFromUrl(rep.url);
                if (pid) await deletePdfFromCloudinary(pid).catch(() => null);
            }
        }
        revalidatePath("/massha");
        return { success: true };
    } catch (err: any) {
        console.error("deleteMasshaRecord error:", err);
        return { success: false, error: err.message ?? "Failed to delete record." };
    }
}

// ─── Delete Entire Patient (full cascade) ────────────────────────────────────

export async function deleteMasshaPatient(
    patientId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const [p] = await db
            .select({ userId: patients.userId })
            .from(patients)
            .where(eq(patients.id, patientId))
            .limit(1);

        if (!p) return { success: false, error: "Patient not found." };

        // Delete all records from Cloudinary + DB
        const patientReports = await db
            .select({ id: labReports.id, url: labReports.cloudinaryUrl })
            .from(labReports)
            .where(eq(labReports.patientId, patientId));

        for (const rep of patientReports) {
            if (rep.url) {
                const pid = extractPublicIdFromUrl(rep.url);
                if (pid) await deletePdfFromCloudinary(pid).catch(() => null);
            }
        }

        const patientRx = await db
            .select({ id: prescriptions.id, url: prescriptions.cloudinaryUrl })
            .from(prescriptions)
            .where(eq(prescriptions.patientId, patientId));

        for (const rx of patientRx) {
            if (rx.url) {
                const pid = extractPublicIdFromUrl(rx.url);
                if (pid) await deletePdfFromCloudinary(pid).catch(() => null);
            }
        }

        // Delete from DB (cascade should handle child rows, but do explicitly)
        await db.delete(healthParameters).where(eq(healthParameters.patientId, patientId)).catch(() => null);
        await db.delete(labReports).where(eq(labReports.patientId, patientId));
        await db.delete(prescriptions).where(eq(prescriptions.patientId, patientId));
        await db.delete(doctorPatientRelations).where(eq(doctorPatientRelations.patientId, patientId));
        await db.delete(timelineEvents).where(eq(timelineEvents.userId, p.userId));
        await db.delete(patients).where(eq(patients.id, patientId));
        await db.delete(users).where(eq(users.id, p.userId));

        revalidatePath("/massha");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        console.error("deleteMasshaPatient error:", err);
        return { success: false, error: err.message ?? "Failed to delete patient." };
    }
}

// ─── Delete Doctor ────────────────────────────────────────────────────────────

export async function deleteMasshaDoctor(
    doctorId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const [d] = await db
            .select({ userId: doctors.userId })
            .from(doctors)
            .where(eq(doctors.id, doctorId))
            .limit(1);

        if (d) {
            await db.delete(doctorPatientRelations).where(eq(doctorPatientRelations.doctorId, doctorId));
            await db.delete(doctors).where(eq(doctors.id, doctorId));
            await db.delete(users).where(eq(users.id, d.userId));
        }

        revalidatePath("/massha");
        return { success: true };
    } catch (err: any) {
        console.error("deleteMasshaDoctor error:", err);
        return { success: false, error: err.message ?? "Failed to delete doctor." };
    }
}


// ─── Extract Patient Details from Uploaded Document ───────────────────────────
// Only runs AI extraction (LlamaParse + Mistral). Does NOT upload to Cloudinary.
// Cloudinary upload happens separately in uploadMasshaDocument after patient creation.

export async function extractPatientDetailsFromDoc(formData: FormData): Promise<{
    success: boolean;
    extracted?: ExtractedPatientDetails;
    fileName?: string;
    error?: string;
}> {
    try {
        const file = formData.get("file") as File;
        if (!file || !file.size) return { success: false, error: "No file provided." };

        const llamaKey = process.env.LLAMA_PARSE_API_KEY;
        const mistralKey = process.env.MISTRAL_API_KEY;

        const empty: ExtractedPatientDetails = {
            patientName: null, age: null, gender: null, bloodGroup: null,
            phone: null, doctorName: null, labName: null, reportDate: null,
        };

        if (!llamaKey || !mistralKey) {
            return { success: true, extracted: empty, fileName: file.name };
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        try {
            const parser = new LlamaParse({ apiKey: llamaKey });
            const uint8Array = new Uint8Array(buffer);
            const pdfFile = new File([uint8Array], file.name, { type: file.type || "application/pdf" });
            const result = await parser.parseFile(pdfFile);
            const rawMarkdown = result.markdown ?? "";

            const prompt = `You are a medical document parser. Extract patient personal details from this document.

Document:
"""
${rawMarkdown.substring(0, 12000)}
"""

Return ONLY valid JSON with these exact keys (null if not found):
{
  "patientName": "full patient name",
  "age": "age as number string e.g. '54'",
  "gender": "Male or Female or Other or null",
  "bloodGroup": "e.g. O+ or AB- or null",
  "phone": "phone number string or null",
  "doctorName": "doctor name without Dr. prefix or null",
  "labName": "lab or hospital name or null",
  "reportDate": "YYYY-MM-DD or null"
}`;

            const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];
            let content = "";
            for (const model of mistralModels) {
                try {
                    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${mistralKey}`,
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: "user", content: prompt }],
                            temperature: 0.1,
                            response_format: { type: "json_object" },
                        }),
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.choices?.[0]?.message?.content) {
                            content = data.choices[0].message.content;
                            break;
                        }
                    }
                } catch { /* try next model */ }
            }

            let extracted: ExtractedPatientDetails = empty;
            if (content) {
                try {
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
                    extracted = {
                        patientName: parsed.patientName ?? null,
                        age: parsed.age ? String(parsed.age) : null,
                        gender: parsed.gender ?? null,
                        bloodGroup: parsed.bloodGroup ?? null,
                        phone: parsed.phone ? String(parsed.phone) : null,
                        doctorName: parsed.doctorName ?? null,
                        labName: parsed.labName ?? null,
                        reportDate: parsed.reportDate ?? null,
                    };
                } catch { /* use empty */ }
            }

            // Fallback: If AI did not extract patientName, derive candidate name from filename
            if (!extracted.patientName && file.name) {
                const derivedName = derivePatientNameFromFilename(file.name);
                if (derivedName) {
                    extracted.patientName = derivedName;
                }
            }

            return { success: true, extracted, fileName: file.name };
        } catch (aiErr) {
            console.warn("AI extraction failed, using filename fallback:", aiErr);
            const fallbackName = derivePatientNameFromFilename(file.name);
            return {
                success: true,
                extracted: { ...empty, patientName: fallbackName },
                fileName: file.name,
            };
        }
    } catch (err: any) {
        console.error("extractPatientDetailsFromDoc error:", err);
        return { success: false, error: err.message ?? "Extraction failed." };
    }
}

function derivePatientNameFromFilename(fileName: string): string | null {
    if (!fileName) return null;
    const clean = fileName
        .replace(/\.[^/.]+$/, "") // strip extension
        .replace(/[_.-]+/g, " ") // replace dividers with spaces
        .replace(/\b(labreport|lab\s*report|prescription|report|prescription\s*file|blood\s*test|test|result|scan|medical|massha|hospital|pdf|jpg|jpeg|png|doc|docx)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    if (clean.length >= 2 && /[a-zA-Z]/.test(clean)) {
        return clean;
    }
    return null;
}
