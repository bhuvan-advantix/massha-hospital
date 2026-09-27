import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, ensureLabReportsSchema, ensureMedicationsSchema } from "@/db";
import { users, patients, medications, labReports, timelineEvents, doctors, patientDiagnostics } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import PatientDashboard from "@/components/PatientDashboard";
import { getLatestHealthParameters } from "@/app/actions/labReports";
import { autoStopExpiredMedications } from "@/app/actions/medications";
import { getPrescriptionsForPatient } from "@/app/actions/consultation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
    searchParams,
}: {
    searchParams?: Promise<{ patientUserId?: string }> | { patientUserId?: string };
}) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/login");
    }

    const sessionUserId = session.user.id;

    // Verify session user exists and is onboarded
    const [sessionUserData] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);

    if (!sessionUserData) {
        redirect("/login");
    }

    if (!sessionUserData.isOnboarded) {
        redirect("/onboarding");
    }

    // Resolve searchParams (supports Next.js 15 Promise or direct object)
    const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const requestedUserId = resolvedParams?.patientUserId;

    // If requested a specific patient view, verify and load their account
    let targetUserData = sessionUserData;
    let isSwitchedPatient = false;

    if (requestedUserId) {
        const [foundUser] = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
        if (foundUser) {
            targetUserData = foundUser;
            if (foundUser.id !== sessionUserId) {
                isSwitchedPatient = true;
            }
        }
    } else {
        // If no patientUserId provided in URL:
        // Check if session user is an admin/doctor or has no active clinical records.
        // In that case, fallback to the latest registered patient so they immediately see live data.
        const isAdminOrDoc = sessionUserData.role === 'admin' || sessionUserData.role === 'doctor' || sessionUserData.email?.includes('admin') || sessionUserData.customId?.includes('ADMIN');

        let [selfPatient] = await db.select().from(patients).where(eq(patients.userId, sessionUserId)).limit(1);
        let hasActiveRecords = false;

        if (selfPatient && !isAdminOrDoc) {
            const [report] = await db.select().from(labReports).where(eq(labReports.patientId, selfPatient.id)).limit(1);
            if (report || selfPatient.age || selfPatient.gender || selfPatient.chronicConditions) {
                hasActiveRecords = true;
            }
        }

        if (!hasActiveRecords || isAdminOrDoc) {
            // Find most recent active patient
            const allPatients = await db.select().from(patients).orderBy(desc(patients.createdAt));
            const activePatient = allPatients.find(p => p.userId !== sessionUserId && (p.age || p.gender || p.chronicConditions)) || allPatients.find(p => p.userId !== sessionUserId) || allPatients[0];

            if (activePatient && activePatient.userId !== sessionUserId) {
                const [activeUser] = await db.select().from(users).where(eq(users.id, activePatient.userId)).limit(1);
                if (activeUser) {
                    targetUserData = activeUser;
                    isSwitchedPatient = true;
                }
            }
        }
    }

    const userId = targetUserData.id;
    const [patientData] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);

    let patientMedications: any[] = [];
    let patientReports: any[] = [];
    let healthParams: Record<string, any> = {};
    let patientDoctorNotes: any[] = [];
    let diagnosticConditions: { id: string; conditionName: string; conditionStatus: string; createdAt: string | null }[] = [];
    let upcomingAppointmentsForDashboard: { id: string; title: string; eventDate: string; status: string | null; description: string | null }[] = [];
    let patientPrescriptions: any[] = [];

    if (patientData) {
        await ensureLabReportsSchema();
        await ensureMedicationsSchema();
        await autoStopExpiredMedications(patientData.id);
        patientMedications = await db.select().from(medications).where(eq(medications.patientId, patientData.id));

        const diagnosticRows = await db
            .select({
                id: patientDiagnostics.id,
                conditionName: patientDiagnostics.conditionName,
                conditionStatus: patientDiagnostics.conditionStatus,
                clinicalNotes: patientDiagnostics.clinicalNotes,
                treatmentPlan: patientDiagnostics.treatmentPlan,
                nodes: patientDiagnostics.nodes,
                createdAt: patientDiagnostics.createdAt,
            })
            .from(patientDiagnostics)
            .where(eq(patientDiagnostics.patientId, patientData.id));

        diagnosticConditions = diagnosticRows.map(r => ({
            id: r.id,
            conditionName: r.conditionName,
            conditionStatus: r.conditionStatus ?? "stable",
            clinicalNotes: r.clinicalNotes ?? null,
            treatmentPlan: r.treatmentPlan ?? null,
            nodes: (r.nodes as unknown[]) ?? [],
            createdAt: r.createdAt?.toISOString() ?? null,
        }));

        patientReports = await db.query.labReports.findMany({
            where: eq(labReports.patientId, patientData.id),
            orderBy: (reports, { desc }) => [desc(reports.uploadedAt)],
            columns: {
                id: true,
                patientId: true,
                fileName: true,
                reportDate: true,
                labName: true,
                patientName: true,
                doctorName: true,
                extractedData: true,
                fileSize: true,
                pageCount: true,
                uploadedAt: true,
                cloudinaryUrl: true,
            }
        });

        const healthParamsResult = await getLatestHealthParameters(userId);
        if (healthParamsResult.success && healthParamsResult.parameters) {
            healthParams = healthParamsResult.parameters;
        }

        const doctorEvents = await db.select()
            .from(timelineEvents)
            .where(and(
                eq(timelineEvents.userId, userId),
                eq(timelineEvents.createdBy, "doctor"),
                eq(timelineEvents.eventType, "appointment"),
                eq(timelineEvents.status, "completed")
            ))
            .orderBy(desc(timelineEvents.createdAt))
            .limit(10);

        const staffAppointments = await db.select()
            .from(timelineEvents)
            .where(and(
                eq(timelineEvents.userId, userId),
                eq(timelineEvents.createdBy, "staff"),
                eq(timelineEvents.eventType, "appointment")
            ))
            .orderBy(desc(timelineEvents.eventDate))
            .limit(20);

        const doctorIds = [...new Set(doctorEvents.map(e => e.doctorId).filter(Boolean))];
        const doctorRecords: Record<string, any> = {};
        for (const docId of doctorIds) {
            if (docId) {
                const [doc] = await db.select().from(doctors).where(eq(doctors.id, docId)).limit(1);
                if (doc) {
                    const [docUser] = await db.select().from(users).where(eq(users.id, doc.userId)).limit(1);
                    if (docUser) {
                        doctorRecords[docId] = {
                            name: docUser.name || "Doctor",
                            specialty: doc.specialization || "General Physician"
                        };
                    }
                }
            }
        }

        patientDoctorNotes = doctorEvents.map(event => ({
            id: event.id,
            doctorId: event.doctorId,
            doctorName: event.doctorId && doctorRecords[event.doctorId]
                ? `Dr. ${doctorRecords[event.doctorId].name}`
                : event.title.replace("Consultation with ", "").trim(),
            specialty: event.doctorId && doctorRecords[event.doctorId]
                ? doctorRecords[event.doctorId].specialty
                : "General Physician",
            date: (() => {
                if (!event.eventDate) return "";
                try {
                    return new Date(event.eventDate).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric"
                    });
                } catch {
                    return event.eventDate;
                }
            })(),
            note: event.description || "",
            createdAt: event.createdAt?.toISOString() || null,
        }));

        upcomingAppointmentsForDashboard = staffAppointments.map(e => ({
            id: e.id,
            title: e.title,
            eventDate: e.eventDate,
            status: e.status,
            description: e.description,
        }));

        const prescriptionsResult = await getPrescriptionsForPatient(patientData.id);
        if (prescriptionsResult.success && prescriptionsResult.data) {
            patientPrescriptions = prescriptionsResult.data.map(p => ({
                ...p,
                prescribedAt: p.prescribedAt ? new Date(p.prescribedAt).toISOString() : null,
            }));
        }
    }

    const dashboardData = {
        user: {
            id: targetUserData.id,
            name: targetUserData.name || "User",
            customId: targetUserData.customId || "Pending",
            email: targetUserData.email,
            image: targetUserData.image || null,
        },
        patient: patientData ? {
            ...patientData,
            createdAt: patientData.createdAt?.toISOString() || null,
            medications: patientMedications.map(m => ({
                ...m,
                createdAt: m.createdAt?.toISOString() || null
            })),
            reports: patientReports.map(r => ({
                ...r,
                reportDate: r.reportDate ? r.reportDate.toString() : null,
                uploadedAt: r.uploadedAt?.toISOString() || null,
            }))
        } : null,
        healthParameters: healthParams,
        doctorNotes: patientDoctorNotes,
        diagnosticConditions,
        upcomingAppointments: upcomingAppointmentsForDashboard,
        prescriptions: patientPrescriptions,
        isSwitchedPatient,
        sessionUserId,
    };

    return <PatientDashboard data={dashboardData} />;
}
