import { getLabReport } from '@/app/actions/labReports';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SingleLabReportView from '@/components/SingleLabReportView';
import { db } from "@/db";
import { patients, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LabReportPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/login");
    }

    const { id } = await params;
    const reportResult = await getLabReport(id);

    if (!reportResult.success || !reportResult.report) {
        redirect("/dashboard");
    }

    const report = reportResult.report;

    // Resolve patient user so navbar displays patient identity
    let displayUser: any = session.user;
    if (report.patientId) {
        const [pat] = await db.select().from(patients).where(eq(patients.id, report.patientId)).limit(1);
        if (pat?.userId) {
            const [u] = await db.select().from(users).where(eq(users.id, pat.userId)).limit(1);
            if (u) {
                displayUser = {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    isOnboarded: u.isOnboarded,
                    customId: u.customId || undefined,
                    image: u.image,
                };
            }
        }
    }

    return <SingleLabReportView user={displayUser} report={report as any} />;
}
