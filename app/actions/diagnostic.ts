'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { doctors, patients, patientDiagnostics, users, labReports, healthParameters, medications } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface DiagnosticNodeInput {
    id: string;
    title: string;
    description: string;
    type: string;
    date?: string;
    connections: string[];
    parameters: { name: string; value: string; unit: string; status?: string }[];
    x: number;
    y: number;
}

export interface SaveDiagnosticInput {
    conditionName: string;
    conditionStatus: 'improving' | 'stable' | 'worsening';
    nodes: DiagnosticNodeInput[];
    clinicalNotes: string;
    treatmentPlan: string;
    existingId?: string; // if editing
}

export async function saveDiagnostic(patientId: string, input: SaveDiagnosticInput) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { success: false, error: 'Unauthorized' };

    // Get doctor record from the logged-in doctor user
    const [doctorRecord] = await db
        .select()
        .from(doctors)
        .where(eq(doctors.userId, session.user.id))
        .limit(1);

    if (!doctorRecord) return { success: false, error: 'Doctor not found' };

    const now = new Date();
    const nodesWithDate = input.nodes.map(n => ({ ...n, date: n.date ?? now.toISOString() }));

    if (input.existingId) {
        // Update existing
        await db
            .update(patientDiagnostics)
            .set({
                conditionName: input.conditionName.trim(),
                conditionStatus: input.conditionStatus,
                nodes: nodesWithDate,
                clinicalNotes: input.clinicalNotes.trim() || null,
                treatmentPlan: input.treatmentPlan.trim() || null,
                updatedAt: now,
            })
            .where(eq(patientDiagnostics.id, input.existingId));
    } else {
        // Insert new
        await db.insert(patientDiagnostics).values({
            id: uuidv4(),
            patientId,
            doctorId: doctorRecord.id,
            conditionName: input.conditionName.trim(),
            conditionStatus: input.conditionStatus,
            nodes: nodesWithDate,
            clinicalNotes: input.clinicalNotes.trim() || null,
            treatmentPlan: input.treatmentPlan.trim() || null,
            createdAt: now,
            updatedAt: now,
        });
    }

    revalidatePath('/diagnostic');
    revalidatePath('/dashboard');
    return { success: true };
}

export async function getDiagnosticsForPatient(patientId: string) {
    const rows = await db
        .select()
        .from(patientDiagnostics)
        .where(eq(patientDiagnostics.patientId, patientId));

    if (rows.length > 0) {
        return rows.map(r => ({
            id: r.id,
            conditionName: r.conditionName,
            conditionStatus: r.conditionStatus ?? 'stable',
            nodes: (r.nodes as any[]) ?? [],
            clinicalNotes: r.clinicalNotes ?? '',
            treatmentPlan: r.treatmentPlan ?? '',
            createdAt: r.createdAt?.toISOString() ?? null,
            updatedAt: r.updatedAt?.toISOString() ?? null,
            doctorId: r.doctorId ?? null,
        }));
    }

    // Dynamic Synthesis Fallback when no explicitly saved diagnostic pathway exists:
    const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);

    if (!patient) return [];

    const [reports, paramsData, medsData] = await Promise.all([
        db.select().from(labReports).where(eq(labReports.patientId, patientId)).orderBy(desc(labReports.uploadedAt)),
        db.select().from(healthParameters).where(eq(healthParameters.patientId, patientId)).orderBy(desc(healthParameters.testDate)),
        db.select().from(medications).where(eq(medications.patientId, patientId)).orderBy(desc(medications.createdAt)),
    ]);

    const conditionName = (patient.chronicConditions && patient.chronicConditions.toLowerCase() !== 'none' && patient.chronicConditions !== 'undefined')
        ? patient.chronicConditions
        : reports.length > 0
        ? `Clinical Report Assessment - ${reports[0].fileName.replace(/\.[^/.]+$/, "")}`
        : "General Diagnostic Evaluation";

    const baselineParams: Array<{ name: string; value: string; unit: string; status?: string }> = [];
    if (patient.gender) baselineParams.push({ name: 'Gender', value: patient.gender, unit: '' });
    if (patient.bloodGroup) baselineParams.push({ name: 'Blood Group', value: patient.bloodGroup, unit: '' });
    if (patient.height) baselineParams.push({ name: 'Height', value: patient.height, unit: 'cm' });
    if (patient.weight) baselineParams.push({ name: 'Weight', value: patient.weight, unit: 'kg' });

    const nodes: any[] = [];

    // Node 1: Presentation / Baseline
    nodes.push({
        id: 'node-1',
        title: 'Patient Presentation & Baseline Vitals',
        description: `Clinical profile baseline. Chronic conditions: ${patient.chronicConditions || 'Under diagnostic review'}.`,
        type: 'initial',
        date: patient.dateOfBirth || new Date().toISOString(),
        connections: ['node-2'],
        parameters: baselineParams,
        x: 0,
        y: 0
    });

    // Node 2: Laboratory & Clinical Evidence
    const labParams = paramsData.map(p => ({
        name: p.parameterName,
        value: p.value,
        unit: p.unit || '',
        status: (p.status || 'normal').toLowerCase()
    }));

    let reportSummaryText = "Clinical laboratory parameters recorded in patient EHR.";
    if (reports.length > 0) {
        const topReport = reports[0];
        reportSummaryText = `Document: ${topReport.fileName}${topReport.labName ? ` (${topReport.labName})` : ''}.${topReport.analysis ? ` Summary: ${topReport.analysis}` : ''}`;
    }

    nodes.push({
        id: 'node-2',
        title: reports.length > 0 ? `Lab Evidence (${reports[0].fileName})` : 'Diagnostic Investigations',
        description: reportSummaryText,
        type: 'diagnosis',
        date: reports[0]?.uploadedAt ? new Date(reports[0].uploadedAt).toISOString() : new Date().toISOString(),
        connections: ['node-3'],
        parameters: labParams,
        x: 1,
        y: 0
    });

    // Node 3: Treatment & Follow-up Care
    const medParams = medsData.map(m => ({
        name: m.name,
        value: m.dosage || m.frequency || 'Active',
        unit: m.frequency || '',
        status: 'normal'
    }));

    nodes.push({
        id: 'node-3',
        title: 'Therapeutic Plan & Monitoring',
        description: medsData.length > 0
            ? `Active treatment regime: ${medsData.map(m => m.name).join(', ')}.`
            : 'Ongoing clinical monitoring and lifestyle support.',
        type: 'treatment',
        date: new Date().toISOString(),
        connections: [],
        parameters: medParams,
        x: 2,
        y: 0
    });

    return [{
        id: `synth-${patientId}`,
        conditionName: conditionName,
        conditionStatus: 'stable',
        nodes: nodes,
        clinicalNotes: reports[0]?.analysis || `Diagnostic pathway generated from verified patient laboratory reports and clinical parameters.`,
        treatmentPlan: medsData.length > 0
            ? `Prescribed Regimen: ${medsData.map(m => `${m.name} (${m.frequency || 'Daily'})`).join(', ')}`
            : 'Routine follow-up and monitoring.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        doctorId: null
    }];
}

export async function deleteDiagnostic(diagnosticId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { success: false, error: 'Unauthorized' };

    await db.delete(patientDiagnostics).where(eq(patientDiagnostics.id, diagnosticId));
    revalidatePath('/diagnostic');
    return { success: true };
}

