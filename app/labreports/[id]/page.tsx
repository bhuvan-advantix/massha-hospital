import { getLabReport } from '@/app/actions/labReports';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from '@/db';
import { patients, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import SingleLabReportView from '@/components/SingleLabReportView';

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

    const patient = await db.query.patients.findFirst({ where: eq(patients.id, report.patientId) });
    const patientUser = patient ? await db.query.users.findFirst({ where: eq(users.id, patient.userId) }) : null;
    const displayUser = patientUser ? { id: patientUser.id, name: patientUser.name, email: patientUser.email,
        customId: patientUser.customId, image: patientUser.image } : session.user;
    return <SingleLabReportView user={displayUser} report={report as any} />;
}
