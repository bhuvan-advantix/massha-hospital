'use server';

import { getMistralModel } from '@/lib/mistralModel';
import { db } from '@/db';
import { healthParameters } from '@/db/schema';
import { eq, and, lt } from 'drizzle-orm';

interface HealthParameter {
    id: string;
    patientId: string;
    labReportId: string | null;
    parameterName: string;
    value: string;
    unit: string | null;
    referenceRange: string | null;
    status: string | null;
    testDate: string | null;
}

export async function generateHealthParametersAnalysis(
    currentParameters: HealthParameter[],
    testDate: string,
    patientId: string
) {
    try {
        console.log('[generateHealthParametersAnalysis] Starting analysis');
        console.log('[generateHealthParametersAnalysis] Current parameters:', currentParameters.length);

        // Fetch previous parameters for comparison (optional)
        let previousParameters: HealthParameter[] = [];
        try {
            previousParameters = await db.select()
                .from(healthParameters)
                .where(
                    and(
                        eq(healthParameters.patientId, patientId),
                        lt(healthParameters.testDate, testDate)
                    )
                )
                .limit(10);
            console.log('[generateHealthParametersAnalysis] Found', previousParameters.length, 'previous parameters');
        } catch (error) {
            console.warn('[generateHealthParametersAnalysis] Could not fetch previous parameters:', error);
            // Continue without previous data
        }

        let analysis = "";

        // Try Mistral AI
        try {
            const mistralKey = process.env.MISTRAL_API_KEY;
            console.log('[generateHealthParametersAnalysis] Mistral API Key present:', !!mistralKey);

            if (mistralKey) {
                const currentData = currentParameters.map(p => ({
                    name: p.parameterName,
                    value: p.value,
                    unit: p.unit || '',
                    status: p.status || 'normal',
                    referenceRange: p.referenceRange || 'N/A'
                }));

                const previousData = previousParameters.slice(0, 4).map(p => ({
                    name: p.parameterName,
                    value: p.value,
                    date: p.testDate
                }));

                const prompt = `
                    You are a medical assistant. Analyze these health parameters and provide a summary report.
                    
                    Current Health Parameters (${testDate}):
                    ${JSON.stringify(currentData, null, 2)}
                    
                    ${previousData.length > 0 ? `Previous Parameters for comparison:\n${JSON.stringify(previousData, null, 2)}` : 'No previous data available.'}
                    
                    Instructions:
                    Provide a STRUCTURED response in HTML format (no markdown code blocks) with three distinct sections:
                    1. **Status Overview** (Blue Box): Summarize the overall health status. Mention key High/Low parameters and any trends.
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

                console.log('[generateHealthParametersAnalysis] Calling Mistral API...');
                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${mistralKey}`
                    },
                    body: JSON.stringify({
                        model: getMistralModel(),
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.2
                    })
                });

                console.log('[generateHealthParametersAnalysis] Mistral API response status:', response.status);

                if (response.ok) {
                    const data = await response.json();
                    let content = data.choices?.[0]?.message?.content || "";
                    content = content.replace(/```html/g, '').replace(/```/g, '').trim();
                    if (content.startsWith('<div')) {
                        analysis = content;
                        console.log('[generateHealthParametersAnalysis] Successfully generated AI analysis');
                    } else {
                        console.warn('[generateHealthParametersAnalysis] AI response did not start with <div, using fallback');
                    }
                } else {
                    const errorText = await response.text();
                    console.error('[generateHealthParametersAnalysis] Mistral API error:', response.status, errorText);
                }
            } else {
                console.error('[generateHealthParametersAnalysis] Mistral API key not found');
            }
        } catch (aiError) {
            console.error('[generateHealthParametersAnalysis] AI Generation exception:', aiError);
        }

        // Fallback if AI failed or returned empty
        if (!analysis) {
            console.log('[generateHealthParametersAnalysis] Using fallback analysis generation');
            const dietTips: string[] = [];
            const lifeTips: string[] = [];
            const statusSummary: string[] = [];

            currentParameters.forEach(param => {
                if (param.status?.toLowerCase().includes('high')) {
                    statusSummary.push(`${param.parameterName} is High (${param.value} ${param.unit}).`);
                    if (param.parameterName.includes('Glucose')) {
                        dietTips.push("Reduce refined sugars and carbohydrates.");
                        lifeTips.push("Walk for 15 mins after every meal.");
                    } else if (param.parameterName.includes('Cholesterol')) {
                        dietTips.push("Increase soluble fiber (oats, fruits).");
                        lifeTips.push("Aim for 30 mins of cardio daily.");
                    } else if (param.parameterName.includes('Pressure')) {
                        dietTips.push("Reduce sodium intake and avoid processed foods.");
                        lifeTips.push("Practice stress-reduction techniques like meditation.");
                    }
                } else if (param.status?.toLowerCase().includes('low')) {
                    statusSummary.push(`${param.parameterName} is Low (${param.value} ${param.unit}).`);
                    dietTips.push(`Ensure balanced intake to boost ${param.parameterName}.`);
                } else {
                    statusSummary.push(`${param.parameterName} is Normal (${param.value} ${param.unit}).`);
                }
            });

            if (statusSummary.length === 0) statusSummary.push("All tracked parameters are within normal range.");
            if (dietTips.length === 0) dietTips.push("Maintain a balanced diet rich in whole foods, vegetables, and lean proteins.");
            if (lifeTips.length === 0) lifeTips.push("Continue your regular exercise routine and maintain good sleep hygiene.");

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

        console.log('[generateHealthParametersAnalysis] Analysis generation complete');
        return { success: true, analysis };

    } catch (error) {
        console.error('[generateHealthParametersAnalysis] Critical Error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Analysis generation failed: ${errorMessage}`,
            analysis: `<div class="p-4 bg-red-50 text-red-600 rounded-xl">Unable to generate analysis. Error: ${errorMessage}</div>`
        };
    }
}
