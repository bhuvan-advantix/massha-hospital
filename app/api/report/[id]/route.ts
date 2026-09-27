import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { labReports, users, patients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getPublicIdFromUrl(url: string): string {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
}

/**
 * GET /api/report/[id]?mode=view     → Inline PDF viewer in browser
 * GET /api/report/[id]?mode=download → Force-download PDF attachment
 *
 * Uses Cloudinary signed private download to bypass public ACL delivery restrictions.
 */
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const params = await props.params;
        const reportId = params.id;
        const mode = request.nextUrl.searchParams.get("mode") ?? "view";

        const [report] = await db
            .select()
            .from(labReports)
            .where(eq(labReports.id, reportId))
            .limit(1);

        if (!report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        const fileName = report.fileName || "lab_report.pdf";
        const disposition = mode === "download"
            ? `attachment; filename="${fileName}"`
            : `inline; filename="${fileName}"`;

        // If legacy base64 data exists
        if (report.fileData) {
            const buffer = Buffer.from(report.fileData, "base64");
            return new NextResponse(buffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": disposition,
                    "Cache-Control": "private, no-cache",
                    "X-Content-Type-Options": "nosniff",
                },
            });
        }

        if (!report.cloudinaryUrl) {
            return NextResponse.json({ error: "File not available" }, { status: 404 });
        }

        const publicId = getPublicIdFromUrl(report.cloudinaryUrl);
        if (!publicId) {
            return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
        }

        // Generate signed private download URL to bypass 401 ACL error
        const isImage = report.cloudinaryUrl.includes("/image/");
        const signedDownloadUrl = cloudinary.utils.private_download_url(publicId, "", {
            resource_type: isImage ? "image" : "raw",
            type: "upload",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        });

        const cloudRes = await fetch(signedDownloadUrl);
        if (!cloudRes.ok) {
            console.error("Cloudinary signed fetch failed:", cloudRes.status);
            return NextResponse.json({ error: "Failed to retrieve document from cloud" }, { status: 502 });
        }

        const pdfBuffer = await cloudRes.arrayBuffer();

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": disposition,
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error: any) {
        console.error("Report proxy error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
