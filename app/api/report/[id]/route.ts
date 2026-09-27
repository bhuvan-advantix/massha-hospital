import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { labReports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchCloudinaryBuffer } from '@/lib/cloudinary';

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
        const safeFileName = fileName.replace(/["\r\n]/g, '_').replace(/[^\x20-\x7E]/g, '_');
        const disposition = `${mode === "download" ? "attachment" : "inline"}; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
        const extension = fileName.split('.').pop()?.toLowerCase() || 'pdf';
        const contentType = ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            webp: 'image/webp', gif: 'image/gif', tiff: 'image/tiff', bmp: 'image/bmp' } as Record<string, string>)[extension] || 'application/octet-stream';

        // If legacy base64 data exists
        if (report.fileData) {
            const buffer = Buffer.from(report.fileData, "base64");
            return new NextResponse(buffer, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    "Content-Disposition": disposition,
                    "Cache-Control": "private, no-cache",
                    "X-Content-Type-Options": "nosniff",
                },
            });
        }

        if (!report.cloudinaryUrl) {
            return NextResponse.json({ error: "File not available" }, { status: 404 });
        }

        const pdfBuffer = await fetchCloudinaryBuffer(report.cloudinaryUrl);

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                "Content-Type": contentType,
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
