import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import { patients, labReports, users } from "@/db/schema";
import LabReports from "@/components/LabReports";

// Force dynamic rendering as this page depends on user session and DB
export const dynamic = "force-dynamic";

export default async function LabReportsPage({
    searchParams,
}: {
    searchParams?: Promise<{ patientUserId?: string }> | { patientUserId?: string };
}) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/login");
    }

    // Resolve searchParams (supports Next.js 15 Promise or direct object)
    const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const requestedUserId = resolvedParams?.patientUserId;

    let targetPatient: any = null;
    let targetUser: any = session.user;

    if (requestedUserId) {
        targetPatient = await db.query.patients.findFirst({
            where: eq(patients.userId, requestedUserId),
        });
        if (targetPatient) {
            const u = await db.query.users.findFirst({
                where: eq(users.id, requestedUserId),
            });
            if (u) {
                targetUser = {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    customId: u.customId,
                    image: u.image,
                };
            }
        }
    }

    if (!targetPatient) {
        // Try session user
        targetPatient = await db.query.patients.findFirst({
            where: eq(patients.userId, session.user.id),
        });
    }

    // If still no patient found (e.g., hospital admin or doctor viewing lab reports)
    if (!targetPatient) {
        const fallbackPatient = await db.query.patients.findFirst({
            orderBy: [desc(patients.createdAt)],
        });

        if (fallbackPatient) {
            targetPatient = fallbackPatient;
            const u = await db.query.users.findFirst({
                where: eq(users.id, fallbackPatient.userId),
            });
            if (u) {
                targetUser = {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    customId: u.customId,
                    image: u.image,
                };
            }
        }
    }

    if (!targetPatient) {
        redirect("/dashboard");
    }

    // Get lab reports for this patient
    const reports = await db.query.labReports.findMany({
        where: eq(labReports.patientId, targetPatient.id),
        orderBy: (labReports, { desc }) => [desc(labReports.uploadedAt)],
    });

    return <LabReports user={targetUser} reports={reports} variant="page" />;
}
