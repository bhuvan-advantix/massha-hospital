import { NextRequest, NextResponse } from 'next/server';
import { reprocessLabReport } from '@/app/actions/labReports';

// Repair uses the selected report's original document, never patient-specific fixtures.
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (typeof body?.reportId !== 'string' || !body.reportId) {
        return NextResponse.json({ success: false, error: 'reportId is required' }, { status: 400 });
    }
    const result = await reprocessLabReport(body.reportId);
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
