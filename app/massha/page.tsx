import { getMasshaDashboardData } from "@/app/actions/massha";
import MasshaPortal from "@/components/massha/MasshaPortal";

export const metadata = {
    title: "Massha Hospital | Clinical Records & Patient Operations",
    description: "Register patients, upload lab reports and prescriptions, manage doctor accounts and review clinical timelines.",
};

export const dynamic = "force-dynamic";

export default async function MasshaPortalPage() {
    const data = await getMasshaDashboardData();

    return (
        <MasshaPortal
            initialPatients={data.patients ?? []}
            initialDoctors={data.doctors ?? []}
            initialRecordsByPatient={data.recordsByPatient ?? {}}
        />
    );
}
