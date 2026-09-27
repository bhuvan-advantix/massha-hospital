'use server';

import { db } from '@/db';
import { labReports, patients, healthParameters, doctors, timelineEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LlamaParse } from "llama-parse";
import { revalidatePath } from 'next/cache';
import { uploadPdfToCloudinary, deletePdfFromCloudinary, extractPublicIdFromUrl } from '@/lib/cloudinary';
import { v2 as cloudinary } from 'cloudinary';

// Ensure Cloudinary is configured
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface TestResult {
    category: string;
    tests: {
        name: string;
        value: string;
        unit: string;
        referenceRange?: string;
        status?: 'normal' | 'high' | 'low';
    }[];
}

async function extractLabDataWithAI(buffer: Buffer): Promise<{
    reportDate: string | null;
    labName: string | null;
    patientName: string | null;
    doctorName: string | null;
    metadata: {
        sample?: any;
        location?: any;
        [key: string]: any;
    };
    testResults: TestResult[];
}> {
    const llamaKey = process.env.LLAMA_PARSE_API_KEY;
    const mistralKey = process.env.MISTRAL_API_KEY;

    if (!llamaKey || !mistralKey) {
        throw new Error("Missing API Keys for LlamaParse or Mistral AI");
    }

    console.log("Starting LlamaParse extraction...");

    try {
        // 1. LlamaParse Extraction
        const parser = new LlamaParse({ apiKey: llamaKey });

        // Convert Buffer to File for LlamaParse (Vercel-compatible)
        // Using File constructor instead of Blob for better serverless compatibility
        const uint8Array = new Uint8Array(buffer);
        const file = new File([uint8Array], 'report.pdf', { type: 'application/pdf' });

        const result = await parser.parseFile(file);
        const rawMarkdown = result.markdown;

        console.log("LlamaParse complete. Length:", rawMarkdown.length);
        console.log("Sending to Mistral AI for structuring...");

        // 2. Mistral AI Structuring
        const prompt = `
            You are an expert medical data extractor. Your task is to extract structured lab report data from the provided text.
            
            Input Text:
            """
            ${rawMarkdown.substring(0, 30000)} 
            """
            
            Instructions:
            1. **Patient & Report Basics**: Identify Patient Name, Doctor Name, Lab Name, Reported Date.
            2. **Metadata extraction**: Extract ALL available "header" information such as:
               - Sample Information (Collection Date, Sample Type, SRF ID, etc.)
               - Location/Client Information (Center name, Ref By, specific address or codes)
               - Patient Information (Name, Age, Gender, IDs). IMPORTANT: Include "Name" inside this metadata group even if extracted elsewhere.
               - Any other relevant metadata boxes found in the report header/footer.
               Return these as dynamic key-value pairs in a "metadata" object. Do NOT hardcode keys.
            3. **Test Results**: Extract ALL diagnostic test results.
            4. **Dual Values (Percentages & Absolute)**: 
               - For tests like "Neutrophils", "Lymphocytes", etc., that often have BOTH a percentage (%) and an absolute count (e.g., /cmm or /uL), YOU MUST CAPTURE BOTH.
               - Format the value as: "Percentage% (Absolute Unit)". Example: "73% (7716 /cmm)".
               - If two separate columns exist effectively for the same test row, combine them or list them clearly.
            5. **Test Details**:
               - Test Name (e.g., "Hemoglobin")
               - Result Value (Keep exact formatting, handle symbols like < or >)
               - Unit (Extract if available)
               - Reference Range (Extract if available)
               - Status: Analyze result vs range -> 'high', 'low', 'normal'.
            6. **Categorization**: Group tests logically (e.g., "Complete Blood Count", "Lipid Profile").
            
            Return ONLY valid JSON with this structure:
            {
              "patientName": string | null,
              "doctorName": string | null,
              "labName": string | null,
              "reportDate": string | null,
              "metadata": {
                "sample": { "Collected On": "...", "Sample Type": "...", ... },
                "location": { "Center": "...", ... },
                ...any other groups
              },
              "testResults": [
                { 
                  "category": "Category Name", 
                  "tests": [ 
                    { "name": "Test Name", "value": "Value", "unit": "Unit", "referenceRange": "Range", "status": "normal" | "high" | "low" } 
                  ] 
                }
              ]
            }
        `;

        const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];
        let content = "";

        for (const model of mistralModels) {
            try {
                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${mistralKey}`
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.1,
                        response_format: { type: "json_object" }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0]?.message?.content) {
                        content = data.choices[0].message.content;
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Mistral model ${model} error:`, err);
            }
        }

        if (!content) {
            throw new Error("Mistral API failed across all models");
        }

        console.log("Mistral AI response received.");

        let parsedData;
        try {
            // Robust JSON extraction: Handle markdown code blocks or plain text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : content;
            parsedData = JSON.parse(jsonString);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            // Fallback structure to prevent crash
            parsedData = {
                testResults: [],
                metadata: {},
                patientName: null,
                doctorName: null,
                labName: null,
                reportDate: null
            };
        }

        // Strong Verification of Structure
        if (!parsedData.testResults || !Array.isArray(parsedData.testResults)) {
            parsedData.testResults = [];
        }
        if (!parsedData.metadata || typeof parsedData.metadata !== 'object') {
            parsedData.metadata = {};
        }

        return {
            ...parsedData,
            rawMarkdown: rawMarkdown || ""
        };

    } catch (error) {
        console.error("AI Extraction Error:", error);
        throw error;
    }
}

// Helper function to extract and store key health parameters
export async function extractAndStoreHealthParameters(
    patientId: string,
    labReportId: string,
    testResults: TestResult[],
    testDate: string
) {
    // Key parameters we want to track
    const keyParameters = [
        { names: ['Blood Glucose', 'Glucose', 'Fasting Blood Sugar', 'FBS', 'Random Blood Sugar', 'RBS'], standardName: 'Blood Glucose' },
        { names: ['Blood Pressure', 'BP', 'Systolic', 'Diastolic'], standardName: 'Blood Pressure' },
        { names: ['HbA1c', 'Hemoglobin A1c', 'Glycated Hemoglobin', 'A1C'], standardName: 'HbA1c' },
        { names: ['Total Cholesterol', 'Cholesterol', 'Serum Cholesterol'], standardName: 'Total Cholesterol' },
    ];

    try {
        for (const keyParam of keyParameters) {
            let parameterFound = false; // Flag to track if we've already stored this parameter

            // Search through all test results for this parameter
            for (const category of testResults) {
                if (parameterFound) break; // Skip remaining categories if already found

                for (const test of category.tests) {
                    // Check if test name matches any of the key parameter names
                    const isMatch = keyParam.names.some(name =>
                        test.name.toLowerCase().includes(name.toLowerCase())
                    );

                    if (isMatch) {
                        // Store this parameter
                        await db.insert(healthParameters).values({
                            patientId,
                            labReportId,
                            parameterName: keyParam.standardName,
                            value: test.value,
                            unit: test.unit || '',
                            referenceRange: test.referenceRange || '',
                            status: test.status || null,
                            testDate: testDate,
                        });

                        parameterFound = true; // Mark as found
                        break; // Break out of tests loop
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error storing health parameters:', error);
        // Don't throw - we don't want to fail the entire upload if parameter extraction fails
    }
}

// ─── Shared AI Extraction Helper (used by admin, lab, and patient upload paths) ───
/**
 * Downloads a PDF from Cloudinary, runs LlamaParse + Mistral AI extraction,
 * saves the structured result to the DB, and returns success/failure.
 * Accepts `patientId` directly so it can be called from any upload path.
 */
export async function extractAndSaveLabReportByPatientId(data: {
    patientId: string;
    cloudinaryUrl: string;
    fileName: string;
    fileSize: number;
    labNameOverride?: string | null; // e.g. lab's own name passed from Lab Dashboard
}): Promise<{ success: boolean; reportId?: string; error?: string }> {
    const { patientId, cloudinaryUrl, fileName, fileSize, labNameOverride } = data;

    console.log('[extractAndSaveLabReportByPatientId] Starting for patientId:', patientId);

    // 1. Verify patient exists
    const patient = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
    if (!patient) {
        return { success: false, error: 'Patient not found' };
    }

    // 2. Download PDF from Cloudinary
    let buffer: Buffer;
    try {
        console.log('[extractAndSaveLabReportByPatientId] Downloading from Cloudinary:', cloudinaryUrl);
        const response = await fetch(cloudinaryUrl);
        if (!response.ok) {
            throw new Error(`Cloudinary fetch failed with status ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        console.log('[extractAndSaveLabReportByPatientId] Downloaded, bytes:', buffer.length);
    } catch (fetchErr: any) {
        console.error('[extractAndSaveLabReportByPatientId] Download error:', fetchErr);
        return { success: false, error: `Failed to download PDF: ${fetchErr.message}` };
    }

    // 3. Run LlamaParse + Mistral AI extraction
    let extractionResult: {
        reportDate: string | null;
        labName: string | null;
        patientName: string | null;
        doctorName: string | null;
        metadata: { [key: string]: any };
        testResults: TestResult[];
    };
    try {
        extractionResult = await extractLabDataWithAI(buffer);
        console.log('[extractAndSaveLabReportByPatientId] AI extraction complete, tests found:', extractionResult.testResults?.length ?? 0);
    } catch (aiErr: any) {
        console.warn('[extractAndSaveLabReportByPatientId] AI extraction failed, saving with empty data:', aiErr.message);
        // Fallback: save record with no extracted data rather than blocking the upload entirely
        extractionResult = {
            reportDate: null,
            labName: null,
            patientName: null,
            doctorName: null,
            testResults: [],
            metadata: {},
        };
    }

    const { reportDate, labName: extractedLabName, patientName, doctorName, testResults, metadata } = extractionResult;
    const finalLabName = labNameOverride ?? extractedLabName ?? null;
    const finalReportDate = reportDate || new Date().toISOString().split('T')[0];

    // 4. Save to database
    try {
        const [report] = await db.insert(labReports).values({
            patientId: patient.id,
            fileName,
            reportDate: finalReportDate,
            labName: finalLabName,
            patientName,
            doctorName,
            extractedData: { results: testResults, metadata } as any,
            rawText: 'AI Extracted',
            fileSize,
            pageCount: 1,
            cloudinaryUrl,
        }).returning();

        // 5. Store key health parameters if found
        if (testResults && testResults.length > 0) {
            await extractAndStoreHealthParameters(patient.id, report.id, testResults, finalReportDate);
        }

        console.log('[extractAndSaveLabReportByPatientId] Saved report id:', report.id);
        return { success: true, reportId: report.id };
    } catch (dbErr: any) {
        console.error('[extractAndSaveLabReportByPatientId] DB error:', dbErr);
        return { success: false, error: 'Failed to save report to database' };
    }
}

// --- NEW: Process Report Uploaded Client-Side (Bypasses Vercel Size Limit) ---
export async function processUploadedReport(cloudinaryUrl: string, userId: string, originalFileName: string, fileSize: number) {
    console.log('Processing pre-uploaded report:', cloudinaryUrl);

    try {
        // Extract public_id from the URL to generate an authenticated download link
        const publicId = extractPublicIdFromUrl(cloudinaryUrl);

        if (!publicId) {
            throw new Error('Could not extract public ID from Cloudinary URL');
        }

        // Determine resource type from URL
        const resourceType = cloudinaryUrl.includes('/raw/') ? 'raw' : 'image';

        // For raw files, add back the extension that was stripped by extractPublicIdFromUrl
        let finalPublicId = publicId;

        if (resourceType === 'raw' && !publicId.endsWith('.pdf')) {
            finalPublicId = publicId + '.pdf';
        }

        console.log('Fetching file content via Cloudinary API for:', finalPublicId, 'resource_type:', resourceType);

        // Use Cloudinary's uploader.explicit to get the file and then download it
        // This is the ONLY method that works with strict Cloudinary accounts
        let buffer: Buffer;
        try {
            // First, try to get the resource to verify it exists
            const resource = await cloudinary.api.resource(finalPublicId, {
                resource_type: resourceType,
                type: 'upload'
            });

            console.log('Resource verified. Bytes:', resource.bytes);

            // For strict accounts, we need to use the original cloudinaryUrl 
            // but with an access_mode transformation or download the file differently
            // Let's try using cloudinary.uploader.upload_stream or download via Admin API

            // Actually, let's use a different approach: use the original URL from upload
            // which should still be accessible immediately after upload
            console.log('Attempting direct download from original URL:', cloudinaryUrl);

            const response = await fetch(cloudinaryUrl);

            if (!response.ok) {
                // If original URL fails, this account requires unsigned uploads or different config
                throw new Error(`Cannot access uploaded file. Cloudinary account has strict access controls. Status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            console.log('Successfully downloaded file, size:', buffer.length);

        } catch (apiError: any) {
            console.error('Cloudinary API Error:', apiError);
            throw new Error(`Failed to fetch resource from Cloudinary: ${apiError.message}`);
        }

        // 2. Get patient record
        const patient = await db.query.patients.findFirst({
            where: eq(patients.userId, userId),
        });

        if (!patient) {
            return { success: false, error: 'Patient profile not found' };
        }

        // 3. Run AI Extraction
        let extractionResult;
        try {
            extractionResult = await extractLabDataWithAI(buffer);
        } catch (aiError: any) {
            console.error('AI Processing Failed:', aiError);
            return { success: false, error: `AI Processing Failed: ${aiError.message}` };
        }

        const { reportDate, labName, patientName, doctorName, testResults, metadata } = extractionResult;

        // 4. Save to database
        try {
            const [report] = await db.insert(labReports).values({
                patientId: patient.id,
                fileName: originalFileName,
                reportDate: reportDate || new Date().toISOString(),
                labName,
                patientName,
                doctorName,
                extractedData: { results: testResults, metadata } as any,
                rawText: "AI Extracted",
                fileSize: fileSize,
                pageCount: 1,
                cloudinaryUrl, // Already uploaded
            }).returning();

            // 5. Extract Health Parameters
            await extractAndStoreHealthParameters(patient.id, report.id, testResults, reportDate || new Date().toISOString());

            return {
                success: true,
                reportId: report.id,
                message: 'Lab report processed successfully',
            };
        } catch (dbError) {
            console.error('Database insertion failed:', dbError);
            // Clean up Cloudinary file if database insertion fails
            const publicId = extractPublicIdFromUrl(cloudinaryUrl);
            if (publicId) await deletePdfFromCloudinary(publicId);
            return { success: false, error: 'Failed to save report to database' };
        }
    } catch (error) {
        console.error('Unexpected error in processUploadedReport:', error);
        return { success: false, error: 'Processing error: ' + (error instanceof Error ? error.message : String(error)) };
    }
}

export async function uploadLabReport(formData: FormData, userId: string) {
    console.log('Starting uploadLabReport for user:', userId);
    // ... rest of function ...

    try {
        const file = formData.get('file') as File;

        if (!file) {
            console.error('No file provided in formData');
            return { success: false, error: 'No file provided' };
        }

        console.log('File received:', file.name, 'Size:', file.size, 'Type:', file.type);

        // Validate file type
        if (file.type !== 'application/pdf') {
            return { success: false, error: 'Only PDF files are supported' };
        }

        // Get patient record
        const patient = await db.query.patients.findFirst({
            where: eq(patients.userId, userId),
        });

        if (!patient) {
            return { success: false, error: 'Patient profile not found' };
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // --- NEW AI EXTRACTION FLOW ---
        let extractionResult;
        try {
            extractionResult = await extractLabDataWithAI(buffer);
        } catch (aiError: any) {
            console.error('AI Processing Failed:', aiError);
            return { success: false, error: `AI Processing Failed: ${aiError.message}` };
        }

        const { reportDate, labName, patientName, doctorName, testResults, metadata } = extractionResult;

        // Upload PDF to Cloudinary
        let cloudinaryUrl: string;
        try {
            cloudinaryUrl = await uploadPdfToCloudinary(buffer, file.name, patient.id);
            console.log('PDF uploaded to Cloudinary:', cloudinaryUrl);
        } catch (cloudinaryError: any) {
            console.error('Cloudinary upload failed:', cloudinaryError);
            return { success: false, error: `Cloud storage upload failed: ${cloudinaryError.message}` };
        }

        // Save to database
        try {
            const [report] = await db.insert(labReports).values({
                patientId: patient.id,
                fileName: file.name,
                reportDate: reportDate || new Date().toISOString(), // Fallback
                labName,
                patientName,
                doctorName,
                extractedData: { results: testResults, metadata } as any, // Store structured data with metadata
                rawText: "AI Extracted", // We don't need raw markdown in DB unless for debugging
                fileSize: file.size,
                pageCount: 1, // LlamaParse extraction handles pagination but returns unified text
                cloudinaryUrl, // Store Cloudinary URL instead of base64
            }).returning();

            // --- Extract and Store Key Health Parameters ---
            await extractAndStoreHealthParameters(patient.id, report.id, testResults, reportDate || new Date().toISOString());

            return {
                success: true,
                reportId: report.id,
                message: 'Lab report uploaded and processed successfully with AI',
            };
        } catch (dbError) {
            console.error('Database insertion failed:', dbError);
            // Clean up Cloudinary file if database insertion fails
            if (cloudinaryUrl) {
                const publicId = extractPublicIdFromUrl(cloudinaryUrl);
                if (publicId) await deletePdfFromCloudinary(publicId);
            }
            return { success: false, error: 'Failed to save report to database' };
        }
    } catch (error) {
        console.error('Unexpected error in uploadLabReport:', error);
        return { success: false, error: 'An unexpected error occurred during processing: ' + (error instanceof Error ? error.message : String(error)) };
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

        const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];
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
            .orderBy(healthParameters.testDate);

        // Group by parameter name and get the latest for each
        const latestParams: Record<string, any> = {};

        for (const param of allParameters) {
            const existing = latestParams[param.parameterName];
            if (!existing || new Date(param.testDate || 0) > new Date(existing.testDate || 0)) {
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
                const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];

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
        if (!analysis) {
            console.log('[generateLabAnalysis] Using fallback analysis generation');
            const dietTips: string[] = [];
            const lifeTips: string[] = [];
            const statusSummary: string[] = [];

            currentParams.forEach(curr => {
                if (curr.status?.toLowerCase().includes('high')) {
                    statusSummary.push(`${curr.parameterName} is High.`);
                    if (curr.parameterName.includes('Glucose')) {
                        dietTips.push("Reduce refined sugars and carbohydrates.");
                        lifeTips.push("Walk for 15 mins after every meal.");
                    } else if (curr.parameterName.includes('Cholesterol')) {
                        dietTips.push("Increase soluble fiber (oats, fruits).");
                        lifeTips.push("Aim for 30 mins of cardio daily.");
                    }
                } else if (curr.status?.toLowerCase().includes('low')) {
                    statusSummary.push(`${curr.parameterName} is Low.`);
                    dietTips.push(`Ensure balanced intake to boost ${curr.parameterName}.`);
                }
            });

            if (statusSummary.length === 0) statusSummary.push("All tracked parameters are within normal range.");
            if (dietTips.length === 0) dietTips.push("Maintain a balanced diet rich in whole foods.");
            if (lifeTips.length === 0) lifeTips.push("Continue your regular exercise routine.");

            analysis = `
                <div class="space-y-4 text-sm text-slate-600">
                    <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <h4 class="font-bold text-blue-800 mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            Status Overview
                        </h4>
                        <p>${statusSummary.join(' ')} Keep monitoring regularly.</p>
                    </div>
                    <div class="bg-green-50/50 p-4 rounded-xl border border-green-100">
                        <h4 class="font-bold text-green-800 mb-2 flex items-center gap-2">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-utensils"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15v2a5 5 0 0 1-5 5v0a5 5 0 0 1-5-5V2"/></svg>
                            Dietary Plan
                        </h4>
                        <ul class="list-disc list-inside space-y-1 ml-1">
                            ${Array.from(new Set(dietTips)).map(t => `<li>${t}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                        <h4 class="font-bold text-purple-800 mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-pulse"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>
                            Lifestyle Guide
                        </h4>
                        <ul class="list-disc list-inside space-y-1 ml-1">
                             ${Array.from(new Set(lifeTips)).map(t => `<li>${t}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
        }

        // 6. Save Analysis
        console.log('[generateLabAnalysis] Saving analysis to database');
        await db.update(labReports).set({ analysis }).where(eq(labReports.id, labReportId));
        revalidatePath('/dashboard/health');

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
) {
    try {
        // Verify patient exists
        const patient = await db.query.patients.findFirst({
            where: eq(patients.id, patientId),
        });

        if (!patient) {
            return { success: false, error: 'Patient not found' };
        }

        // Extract public_id and fetch file from Cloudinary
        const publicId = extractPublicIdFromUrl(cloudinaryUrl);
        if (!publicId) {
            return { success: false, error: 'Could not extract public ID from Cloudinary URL' };
        }

        let buffer: Buffer;
        try {
            const response = await fetch(cloudinaryUrl);
            if (!response.ok) {
                throw new Error(`Cannot access uploaded file. Status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } catch (fetchError: any) {
            return { success: false, error: `Failed to fetch uploaded file: ${fetchError.message}` };
        }

        // Run AI extraction on the PDF
        let extractionResult;
        try {
            extractionResult = await extractLabDataWithAI(buffer);
        } catch (aiError: any) {
            // If AI fails, still save the report with basic info
            console.warn('AI extraction failed, saving basic record:', aiError.message);
            extractionResult = {
                reportDate: new Date().toISOString(),
                labName: hospitalName || null,
                patientName: null,
                doctorName: null,
                testResults: [],
                metadata: {}
            };
        }

        const {
            reportDate,
            labName: extractedLabName,
            patientName,
            doctorName,
            testResults,
            metadata
        } = extractionResult;

        // Doctor's clinic name ALWAYS takes priority — use AI-extracted name only as fallback
        const finalLabName = hospitalName || extractedLabName || null;
        const finalReportDate = reportDate || new Date().toISOString();

        // Save to database under patient's records
        const [report] = await db.insert(labReports).values({
            patientId: patient.id,
            fileName: originalFileName,
            reportDate: finalReportDate,
            labName: finalLabName,
            patientName,
            doctorName,
            extractedData: { results: testResults, metadata } as any,
            rawText: 'AI Extracted - Doctor Upload',
            fileSize: fileSize,
            pageCount: 1,
            cloudinaryUrl,
        }).returning();

        // Extract health parameters if any were found
        if (testResults && testResults.length > 0) {
            await extractAndStoreHealthParameters(patient.id, report.id, testResults, finalReportDate);
        }

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
            reportId: report.id,
            labName: finalLabName,
            reportDate: finalReportDate,
            message: 'Lab report uploaded to patient records successfully',
        };
    } catch (error) {
        console.error('Doctor upload error:', error);
        return { success: false, error: 'Failed to process report: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
