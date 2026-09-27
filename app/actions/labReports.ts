'use server';

import { getMistralModel } from '@/lib/mistralModel';
import { db } from '@/db';
import { labReports, patients, healthParameters, doctors, timelineEvents } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { uploadPdfToCloudinary, deletePdfFromCloudinary, extractPublicIdFromUrl } from '@/lib/cloudinary';
import { processStoredLabReport, saveUploadedLabReport, storeHealthParameters } from '@/lib/labReportProcessing';
import type { TestResult } from '@/lib/labExtraction';

function refreshReports(reportId?: string) {
    for (const path of ['/dashboard', '/dashboard/health', '/labreports', '/massha']) revalidatePath(path);
    if (reportId) revalidatePath(`/labreports/${reportId}`);
}

export async function reprocessLabReport(reportId: string): Promise<{ success: boolean; message: string; count?: number }> {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return { success: false, message: 'Please sign in to reprocess a report' };
        const report = await db.query.labReports.findFirst({ where: eq(labReports.id, reportId) });
        const owner = report ? await db.query.patients.findFirst({ where: eq(patients.id, report.patientId) }) : null;
        if (!report || !owner) return { success: false, message: 'Report not found' };
        if (owner.userId !== session.user.id && !['admin', 'staff', 'doctor', 'lab'].includes(session.user.role)) {
            return { success: false, message: 'You cannot reprocess this report' };
        }
        const count = await processStoredLabReport(reportId);
        refreshReports(reportId);
        return { success: true, message: count ? `Extracted ${count} parameters` : 'Report processed. No measurable test results were found in this document.', count };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Reprocessing failed' };
    }
}

export async function extractAndStoreHealthParameters(patientId: string, labReportId: string, results: TestResult[], date: string) {
    return db.transaction(async tx => {
        await tx.delete(healthParameters).where(eq(healthParameters.labReportId, labReportId));
        return storeHealthParameters(tx, patientId, labReportId, results, date);
    });
}

export async function extractAndSaveLabReportByPatientId(data: {
    patientId: string; cloudinaryUrl: string; fileName: string; fileSize: number; labNameOverride?: string | null;
}) {
    try {
        const result = await saveUploadedLabReport(data);
        refreshReports(result.reportId);
        return result;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Report processing failed' };
    }
}

export async function processUploadedReport(cloudinaryUrl: string, userId: string, originalFileName: string, fileSize: number) {
    const patient = await db.query.patients.findFirst({ where: eq(patients.userId, userId) });
    if (!patient) return { success: false, error: 'Patient profile not found' };
    return extractAndSaveLabReportByPatientId({ patientId: patient.id, cloudinaryUrl, fileName: originalFileName, fileSize });
}

export async function uploadLabReport(formData: FormData, userId: string) {
    try {
        const file = formData.get('file');
        if (!(file instanceof File) || file.type !== 'application/pdf') return { success: false, error: 'Please select a PDF report' };
        const patient = await db.query.patients.findFirst({ where: eq(patients.userId, userId) });
        if (!patient) return { success: false, error: 'Patient profile not found' };
        const buffer = Buffer.from(await file.arrayBuffer());
        const cloudinaryUrl = await uploadPdfToCloudinary(buffer, file.name, patient.id);
        const result = await saveUploadedLabReport({ patientId: patient.id, cloudinaryUrl, fileName: file.name, fileSize: file.size }, buffer);
        refreshReports(result.reportId);
        return result;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
    }
}

export async function getLabReports(userId: string) {
    try {
        const patient = await db.query.patients.findFirst({
            where: eq(patients.userId, userId),
        });

        if (!patient) {
            return { success: false, error: 'Patient profile not found' };
        }

        const reports = await db.query.labReports.findMany({
            where: eq(labReports.patientId, patient.id),
            orderBy: (labReports, { desc }) => [desc(labReports.uploadedAt)],
        });

        return { success: true, reports };
    } catch (error) {
        console.error('Fetch error:', error);
        return { success: false, error: 'Failed to fetch lab reports' };
    }
}

export async function deleteLabReport(reportId: string) {
    try {
        // Get the report to find Cloudinary URL
        const [report] = await db.select({
            cloudinaryUrl: labReports.cloudinaryUrl
        }).from(labReports).where(eq(labReports.id, reportId));

        // Delete from database
        await db.delete(labReports).where(eq(labReports.id, reportId));

        // Delete from Cloudinary if URL exists
        if (report?.cloudinaryUrl) {
            const publicId = extractPublicIdFromUrl(report.cloudinaryUrl);
            if (publicId) {
                await deletePdfFromCloudinary(publicId);
            }
        }

        return { success: true, message: 'Report deleted successfully' };
    } catch (error) {
        console.error('Delete error:', error);
        return { success: false, error: 'Failed to delete report' };
    }
}

export async function getLabReport(reportId: string) {
    try {
        if (!reportId) {
            return { success: false, error: 'Report ID is required' };
        }

        const [report] = await db.select().from(labReports).where(eq(labReports.id, reportId)).limit(1);

        if (!report) {
            return { success: false, error: 'Report not found' };
        }

        return { success: true, report };
    } catch (error) {
        console.error('Fetch error:', error);
        return { success: false, error: 'Failed to fetch lab report' };
    }
}

export async function getReportPdf(reportId: string) {
    try {
        if (!reportId) {
            return { success: false, error: 'Report ID is required' };
        }

        const [report] = await db.select({
            cloudinaryUrl: labReports.cloudinaryUrl,
            fileData: labReports.fileData,
            fileName: labReports.fileName
        }).from(labReports).where(eq(labReports.id, reportId));

        if (!report) {
            return { success: false, error: 'Report not found' };
        }

        // Prefer Cloudinary URL (new method)
        if (report.cloudinaryUrl) {
            return {
                success: true,
                cloudinaryUrl: report.cloudinaryUrl,
                fileName: report.fileName
            };
        }

        // Fallback to legacy base64 storage
        if (report.fileData) {
            return {
                success: true,
                fileData: report.fileData,
                fileName: report.fileName
            };
        }

        return { success: false, error: 'Original file not found in database or cloud storage.' };
    } catch (error) {
        console.error('Download error:', error);
        return { success: false, error: 'Failed to retrieve file' };
    }
}

export async function analyzeTestResult(
    testName: string,
    value: string,
    unit: string,
    referenceRange: string | undefined
) {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            return {
                success: false,
                error: "AI service not configured (Missing API Key)"
            };
        }

        const prompt = `
        You are a medical knowledge assistant providing educational information.
        You are NOT a doctor and you are NOT providing a diagnosis.
        
        Analyze this lab test result for educational purposes:
        - Test: ${testName}
        - Result: ${value} ${unit}
        - Reference Range: ${referenceRange || "Not provided"}

        Provide a structured response in HTML format with three sections.
        
        <div class="space-y-4 text-sm text-slate-600">
            <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 class="font-bold text-blue-800 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    Status Analysis
                </h4>
                <p>Is this normal, high, or low? What does this mean in simple terms? (Educational only). Bold the status (e.g., <b>Normal</b>, <b>High</b>).</p>
            </div>

            <div class="bg-green-50/50 p-4 rounded-xl border border-green-100">
                <h4 class="font-bold text-green-800 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-utensils"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15v2a5 5 0 0 1-5 5v0a5 5 0 0 1-5-5V2"/></svg>
                    Dietary Approaches
                </h4>
                <ul class="list-disc list-inside space-y-1 ml-1">
                    <li>General foods that may help manage this level.</li>
                </ul>
            </div>

            <div class="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                <h4 class="font-bold text-purple-800 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-pulse"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>
                    Lifestyle Habits
                </h4>
                <ul class="list-disc list-inside space-y-1 ml-1">
                    <li>General lifestyle suggestions.</li>
                </ul>
            </div>
        </div>

        Rules:
        - Analyze ONLY this data. 
        - Educational tone only.
        - Return ONLY the HTML structure above with the content filled in. Do not wrap in markdown blocks.
        `;

        const mistralModels = [getMistralModel()];
        let text = "";

        for (const model of mistralModels) {
            try {
                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.3,
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0]?.message?.content) {
                        text = data.choices[0].message.content;
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Mistral model ${model} error:`, err);
            }
        }

        if (!text) {
            return { success: false, error: "AI service currently unavailable." };
        }

        // Cleanup markdown code blocks if Mistral sends them
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();

        return { success: true, analysis: text };

    } catch (error) {
        console.error("AI Analysis Error:", error);
        return { success: false, error: "Failed to analyze result." };
    }
}

export async function getLatestHealthParameters(userId: string) {
    try {
        const patient = await db.query.patients.findFirst({
            where: eq(patients.userId, userId),
        });

        if (!patient) {
            return { success: false, error: 'Patient profile not found' };
        }

        // Fetch all health parameters for this patient
        const allParameters = await db.select().from(healthParameters)
            .where(eq(healthParameters.patientId, patient.id))
            .orderBy(desc(healthParameters.testDate), desc(healthParameters.createdAt));

        // Group by parameter name and get the latest for each
        const latestParams: Record<string, any> = {};

        for (const param of allParameters) {
            const existing = latestParams[param.parameterName];
            if (!existing) {
                latestParams[param.parameterName] = param;
            }
        }

        return { success: true, parameters: latestParams };
    } catch (error) {
        console.error('Fetch error:', error);
        return { success: false, error: 'Failed to fetch health parameters' };
    }
}

export async function getHealthHistory(userId: string) {
    try {
        const patient = await db.query.patients.findFirst({
            where: eq(patients.userId, userId),
        });

        if (!patient) {
            return { success: false, error: 'Patient profile not found' };
        }

        // Fetch ALL health parameters for this patient, sorted by date
        const history = await db.select().from(healthParameters)
            .where(eq(healthParameters.patientId, patient.id))
            .orderBy(healthParameters.testDate);

        // Fetch analyses linked to lab reports
        const reports = await db.select({
            id: labReports.id,
            analysis: labReports.analysis
        }).from(labReports).where(eq(labReports.patientId, patient.id));

        const analyses: Record<string, string> = {};
        reports.forEach(r => {
            if (r.analysis) analyses[r.id] = r.analysis;
        });

        return { success: true, history, analyses };
    } catch (error) {
        console.error('Fetch history error:', error);
        return { success: false, error: 'Failed to fetch health history' };
    }
}

export async function generateLabAnalysis(labReportId: string) {
    try {
        console.log('[generateLabAnalysis] Starting analysis for report:', labReportId);

        // 1. Fetch Report
        // Using db.select to avoid relation crashes if schema is not updated
        const [report] = await db.select().from(labReports).where(eq(labReports.id, labReportId)).limit(1);

        if (!report) {
            console.error('[generateLabAnalysis] Report not found:', labReportId);
            return { success: false, error: "Report not found" };
        }

        console.log('[generateLabAnalysis] Report found, checking existing analysis');

        // Re-generate if old format (not HTML)
        if (report.analysis && report.analysis.trim().startsWith('<div')) {
            console.log('[generateLabAnalysis] Returning existing HTML analysis');
            return { success: true, analysis: report.analysis };
        }

        // 2. Fetch Parameters
        console.log('[generateLabAnalysis] Fetching health parameters for report');
        const currentParams = await db.select().from(healthParameters).where(eq(healthParameters.labReportId, labReportId));
        console.log('[generateLabAnalysis] Found', currentParams.length, 'parameters');
        if (!currentParams.length) return { success: false, error: 'Extract report parameters before generating an analysis.' };

        // 3. Find Previous Report
        const allReports = await db.select().from(labReports)
            .where(eq(labReports.patientId, report.patientId))
            .orderBy(labReports.reportDate);

        const idx = allReports.findIndex(r => r.id === labReportId);
        const prevReport = idx > 0 ? allReports[idx - 1] : null;

        let prevParams: any[] = [];
        if (prevReport) {
            prevParams = await db.select().from(healthParameters).where(eq(healthParameters.labReportId, prevReport.id));
            console.log('[generateLabAnalysis] Found', prevParams.length, 'previous parameters');
        }

        let analysis = "";

        // 4. Try Mistral AI
        try {
            const mistralKey = process.env.MISTRAL_API_KEY;
            console.log('[generateLabAnalysis] Mistral API Key present:', !!mistralKey);

            if (mistralKey) {
                const prompt = `
                    You are a medical assistant. Analyze these lab results and provide a summary report.
                    Current Results (${report.reportDate}): ${JSON.stringify(currentParams.map(p => ({ name: p.parameterName, value: p.value, unit: p.unit, status: p.status })))}
                    Previous Results (${prevReport?.reportDate || 'None'}): ${JSON.stringify(prevParams.map(p => ({ name: p.parameterName, value: p.value })))}
                    
                    Instructions:
                    Provide a STRUCTURED response in HTML format (no markdown code blocks) with three distinct sections:
                    1. **Status Overview** (Blue Box): Summarize the overall health status. Mention key High/Low parameters and improvements.
                    2. **Dietary Plan** (Green Box): Specific food recommendations based on the results.
                    3. **Lifestyle Guide** (Purple Box): Exercise and habit recommendations.

                    Use this exact HTML structure:
                    <div class="space-y-4 text-sm text-slate-600">
                        <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <h4 class="font-bold text-blue-800 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                Status Overview
                            </h4>
                            <p>...summary text...</p>
                        </div>
                        <div class="bg-green-50/50 p-4 rounded-xl border border-green-100">
                            <h4 class="font-bold text-green-800 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-utensils"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15v2a5 5 0 0 1-5 5v0a5 5 0 0 1-5-5V2"/></svg>
                                Dietary Plan
                            </h4>
                            <ul class="list-disc list-inside space-y-1 ml-1">
                                <li>...tip 1...</li>
                                <li>...tip 2...</li>
                            </ul>
                        </div>
                        <div class="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                            <h4 class="font-bold text-purple-800 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-pulse"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>
                                Lifestyle Guide
                            </h4>
                            <ul class="list-disc list-inside space-y-1 ml-1">
                                <li>...tip 1...</li>
                                <li>...tip 2...</li>
                            </ul>
                        </div>
                    </div>

                    Keep it concise, actionable, and encouraging. Return ONLY the HTML.
                `;

                console.log('[generateLabAnalysis] Calling Mistral API...');
                const mistralModels = [getMistralModel()];

                for (const model of mistralModels) {
                    try {
                        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralKey}` },
                            body: JSON.stringify({
                                model,
                                messages: [{ role: "user", content: prompt }],
                                temperature: 0.2
                            })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            let content = data.choices?.[0]?.message?.content || "";
                            content = content.replace(/```html/g, '').replace(/```/g, '').trim();
                            if (content.startsWith('<div')) {
                                analysis = content;
                                console.log(`[generateLabAnalysis] Successfully generated AI analysis using ${model}`);
                                break;
                            }
                        }
                    } catch (err) {
                        console.warn(`Mistral model ${model} error:`, err);
                    }
                }

                if (!analysis) {
                    console.warn('[generateLabAnalysis] AI generation did not produce valid HTML, using fallback');
                }
            } else {
                console.error('[generateLabAnalysis] Mistral API key not found in environment');
            }
        } catch (aiError) {
            console.error('[generateLabAnalysis] AI Generation exception:', aiError);
        }

        // 5. Fallback if AI failed or returned empty
        if (!analysis) return { success: false, error: 'Mistral analysis is unavailable. Please retry after checking the API rate limit.' };

        // 6. Save Analysis
        console.log('[generateLabAnalysis] Saving analysis to database');
        await db.update(labReports).set({ analysis }).where(eq(labReports.id, labReportId));
        // The database write has already completed. Cache invalidation is best-effort so
        // a framework cache context issue never makes a completed analysis appear failed.
        try {
            revalidatePath('/dashboard/health');
        } catch (revalidationError) {
            console.warn('[generateLabAnalysis] Could not refresh health history cache:', revalidationError);
        }

        console.log('[generateLabAnalysis] Analysis generation complete');
        return { success: true, analysis };

    } catch (e) {
        console.error("[generateLabAnalysis] Critical Error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            error: `Analysis generation failed: ${errorMessage}`,
            analysis: `<div class="p-4 bg-red-50 text-red-600 rounded-xl">Unable to generate analysis. Error: ${errorMessage}</div>`
        };
    }
}

/**
 * Process a lab report uploaded by a DOCTOR on behalf of a patient.
 * The cloudinaryUrl has already been uploaded client-side. This saves to DB under the patient's records.
 */
export async function processReportUploadedByDoctor(
    cloudinaryUrl: string,
    patientId: string,
    originalFileName: string,
    fileSize: number,
    hospitalName?: string,
    doctorNote?: string
): Promise<{ success: boolean; reportId?: string; labName?: string | null; warning?: string; error?: string; message?: string }> {
    try {
        // Verify patient exists
        const patient = await db.query.patients.findFirst({
            where: eq(patients.id, patientId),
        });

        if (!patient) {
            return { success: false, error: 'Patient not found' };
        }

        const result = await extractAndSaveLabReportByPatientId({
            patientId, cloudinaryUrl, fileName: originalFileName, fileSize,
        });
        if (!result.success) return result;

        revalidatePath('/dashboard');
        revalidatePath(`/doctor/patient/${patientId}`);
        revalidatePath('/timeline');

        // If doctor added a note for this report, save it as a patient timeline event
        if (doctorNote && doctorNote.trim()) {
            try {
                const sess = await getServerSession(authOptions);
                const doctorRow = sess?.user?.id
                    ? await db.select().from(doctors).where(eq(doctors.userId, sess.user.id)).limit(1).then(r => r[0])
                    : null;

                await db.insert(timelineEvents).values({
                    userId: patient.userId,
                    title: `Lab Report Note — ${originalFileName}`,
                    description: doctorNote.trim(),
                    eventDate: new Date().toISOString().split('T')[0],
                    eventType: 'test',
                    status: 'completed',
                    doctorId: doctorRow?.id || null,
                    createdBy: 'doctor',
                } as any);
            } catch (noteErr) {
                console.warn('Failed to save lab note:', noteErr);
            }
        }

        return {
            success: true,
            reportId: result.reportId,
            warning: result.warning,
            message: 'Lab report uploaded to patient records successfully',
        };
    } catch (error) {
        console.error('Doctor upload error:', error);
        return { success: false, error: 'Failed to process report: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
