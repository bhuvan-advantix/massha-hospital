import { db, ensureLabReportsSchema } from '@/db';
import { labReports, healthParameters, patients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { fetchCloudinaryBuffer } from '@/lib/cloudinary';
import { extractLabDataWithAI, normalizeTestResults, type TestResult, ExtractionError, structureParsedLabText } from '@/lib/labExtraction';

type Writer = Pick<typeof db, 'insert' | 'delete'>;
export async function storeHealthParameters(writer: Writer, patientId: string, reportId: string, results: TestResult[], date: string | null) {
    const seen = new Set<string>();
    const rows = normalizeTestResults(results).flatMap(group => group.tests).flatMap(test => {
        const key = `${test.name.toLowerCase()}|${test.unit.toLowerCase()}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ patientId, labReportId: reportId, parameterName: test.name, value: test.value,
            unit: test.unit, referenceRange: test.referenceRange || null, status: test.status || null, testDate: date }];
    });
    // Keep batches below SQLite's parameter limit. All batches belong to one transaction.
    for (let index = 0; index < rows.length; index += 50) await writer.insert(healthParameters).values(rows.slice(index, index + 50));
    return rows.length;
}

export async function processStoredLabReport(reportId: string, buffer?: Buffer) {
    await ensureLabReportsSchema();
    const report = await db.query.labReports.findFirst({ where: eq(labReports.id, reportId) });
    if (!report) throw new Error('Report not found');
    const saved = report.extractedData as { extractionStatus?: string } | null;
    const reuseParsedText = !buffer && saved?.extractionStatus === 'failed' && Boolean(report.rawText?.trim());
    const source = reuseParsedText ? null : buffer ?? (report.cloudinaryUrl ? await fetchCloudinaryBuffer(report.cloudinaryUrl)
        : report.fileData ? Buffer.from(report.fileData, 'base64') : null);
    if (!source && !reuseParsedText) throw new Error('Original document is not available');
    // Do not erase existing results when a provider fails.
    let extracted;
    try {
        extracted = reuseParsedText
            ? await structureParsedLabText(report.rawText!, report.pageCount)
            : await extractLabDataWithAI(source!, report.fileName);
    } catch (error) {
        if (!normalizeTestResults(report.extractedData).length) {
            await db.update(labReports).set({
                extractedData: { ...(report.extractedData as object), results: [], extractionStatus: 'failed', extractionError: error instanceof Error ? error.message : 'Extraction failed' },
                ...(error instanceof ExtractionError && error.rawText ? { rawText: error.rawText, pageCount: error.pageCount } : {}),
            }).where(eq(labReports.id, reportId));
        }
        throw error;
    }
    if (!extracted.testResults.length && normalizeTestResults(report.extractedData).length) {
        throw new Error('No measurements were found on retry. Existing report results were preserved.');
    }
    const date = extracted.reportDate;
    return db.transaction(async tx => {
        await tx.update(labReports).set({
            reportDate: date, labName: extracted.labName || report.labName, patientName: extracted.patientName, doctorName: extracted.doctorName,
            extractedData: { results: extracted.testResults, metadata: extracted.metadata,
                extractionStatus: extracted.testResults.length ? 'complete' : 'no_measurements' },
            rawText: extracted.rawText, pageCount: extracted.pageCount, fileSize: source?.length ?? report.fileSize, analysis: null,
        }).where(eq(labReports.id, reportId));
        await tx.delete(healthParameters).where(eq(healthParameters.labReportId, reportId));
        return storeHealthParameters(tx, report.patientId, reportId, extracted.testResults, date);
    });
}

export async function saveUploadedLabReport(data: {
    patientId: string; cloudinaryUrl: string; fileName: string; fileSize: number; labNameOverride?: string | null;
}, buffer?: Buffer): Promise<{ success: boolean; reportId?: string; error?: string; warning?: string }> {
    await ensureLabReportsSchema();
    const patient = await db.query.patients.findFirst({ where: eq(patients.id, data.patientId) });
    if (!patient) return { success: false, error: 'Patient not found' };
    // Retrieve before saving so a broken Cloudinary upload cannot appear as a saved report.
    const source = buffer ?? await fetchCloudinaryBuffer(data.cloudinaryUrl);
    const [report] = await db.insert(labReports).values({
        patientId: data.patientId, fileName: data.fileName, cloudinaryUrl: data.cloudinaryUrl,
        fileSize: source.length, labName: data.labNameOverride || null, extractedData: { results: [], metadata: {}, extractionStatus: 'pending' },
    }).returning();
    try {
        await processStoredLabReport(report.id, source);
        return { success: true, reportId: report.id };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Extraction failed';
        await db.update(labReports).set({ extractedData: {
            results: [], metadata: {}, extractionStatus: 'failed', extractionError: message,
        } }).where(eq(labReports.id, report.id));
        return { success: true, reportId: report.id, warning: `Document saved, but extraction failed: ${message}. Open the report to retry.` };
    }
}
