import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHealthHistory } from "@/app/actions/labReports";
import HealthParameters from "@/components/HealthParameters";
import DashboardNavbar from "@/components/DashboardNavbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function HealthHistoryPage({
    searchParams,
}: {
    searchParams?: Promise<{ patientUserId?: string }> | { patientUserId?: string };
}) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/login");
    }

    // Resolve searchParams (supports Next.js 15 Promise or direct object)
    const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const requestedUserId = resolvedParams?.patientUserId;

    // Determine which user's data to load — switched patient or session user
    let targetUserId = session.user.id;
    let targetUser: any = session.user;

    if (requestedUserId && requestedUserId !== session.user.id) {
        const [foundUser] = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
        if (foundUser) {
            targetUserId = foundUser.id;
            targetUser = {
                id: foundUser.id,
                name: foundUser.name,
                email: foundUser.email,
                customId: foundUser.customId,
                image: foundUser.image,
            };
        }
    }

    const { success, history, analyses, error } = await getHealthHistory(targetUserId);

    if (!success) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <DashboardNavbar user={targetUser} />
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Unavailable</h2>
                        <p className="text-slate-500 mb-6">{error || "Could not load health history."}</p>
                        <Link href="/dashboard" className="px-6 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors inline-block">
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
            <DashboardNavbar user={targetUser} />

            {/* Main Content */}
            <main className="flex-1">
                <HealthParameters history={history || []} analyses={analyses || {}} />
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
}
