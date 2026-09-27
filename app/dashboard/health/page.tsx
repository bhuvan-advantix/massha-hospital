import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHealthHistory } from "@/app/actions/labReports";
import HealthParameters from "@/components/HealthParameters";
import DashboardNavbar from "@/components/DashboardNavbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { db } from "@/db";
import { users, patients, healthParameters } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HealthHistoryPage({
    searchParams,
}: {
    searchParams?: Promise<{ patientUserId?: string; param?: string }> | { patientUserId?: string; param?: string };
}) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/login");
    }

    const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const requestedUserId = resolvedParams?.patientUserId;

    let targetUserId = session.user.id;
    let targetUserData: any = session.user;

    // 1. If explicit patientUserId was passed in searchParams, load that user
    if (requestedUserId) {
        const [foundUser] = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
        if (foundUser) {
            targetUserId = foundUser.id;
            targetUserData = foundUser;
        }
    } else {
        // 2. If logged in user is Admin/Doctor or has no parameters of their own,
        // fallback to the patient who has health parameters (or latest patient) so they see real parameters instead of an empty screen
        const isAdminOrDoc = session.user.role === 'admin' || session.user.role === 'doctor' || session.user.email?.includes('admin') || (session.user as any).customId?.includes('ADMIN');

        let [patientRecord] = await db.select().from(patients).where(eq(patients.userId, session.user.id)).limit(1);
        let hasParams = false;

        if (patientRecord && !isAdminOrDoc) {
            const [paramRow] = await db.select().from(healthParameters).where(eq(healthParameters.patientId, patientRecord.id)).limit(1);
            if (paramRow) hasParams = true;
        }

        if (!hasParams || isAdminOrDoc) {
            // Find recent patient who has health parameters or recent patient
            const allPatients = await db.select().from(patients).orderBy(desc(patients.createdAt));
            const activePatient = allPatients.find(p => p.userId !== session.user.id && (p.age || p.gender || p.chronicConditions)) || allPatients.find(p => p.userId !== session.user.id) || allPatients[0];

            if (activePatient) {
                const [activeUser] = await db.select().from(users).where(eq(users.id, activePatient.userId)).limit(1);
                if (activeUser) {
                    targetUserId = activeUser.id;
                    targetUserData = activeUser;
                }
            }
        }
    }

    const { success, history, analyses, error } = await getHealthHistory(targetUserId);

    if (!success) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <DashboardNavbar user={targetUserData} />
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Unavailable</h2>
                        <p className="text-slate-500 mb-6">{error || "Could not load health history."}</p>
                        <Link href={`/dashboard?patientUserId=${targetUserId}`} className="px-6 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors inline-block">
                            Go Back
                        </Link>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col pt-20">
            {/* Dashboard Navbar */}
            <DashboardNavbar user={targetUserData} />

            {/* Main Content */}
            <main className="flex-1">
                <HealthParameters
                    history={history || []}
                    analyses={analyses || {}}
                    highlightParam={resolvedParams?.param}
                    patientUserId={targetUserId}
                />
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
}
