'use server';

import { db } from '@/db';
import { labReports, patients, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getPatientContext(userId: string) {

    try {
        // Fetch patient and user data using explicit join
        const result = await db.select({
            patient: patients,
            user: users
        })
            .from(patients)
            .innerJoin(users, eq(patients.userId, users.id))
            .where(eq(patients.userId, userId))
            .limit(1);

        if (result.length === 0) return { context: "No patient profile found." };

        const { patient, user } = result[0];

        // Fetch reports using standard select
        const reports = await db.select()
            .from(labReports)
            .where(eq(labReports.patientId, patient.id))
            .orderBy(desc(labReports.uploadedAt))
            .limit(3);

        const context = `
        PATIENT PROFILE:
        - Name: ${user.name || "Unknown"}
        - Age: ${patient.age}
        - Gender: ${patient.gender}
        - Blood Group: ${patient.bloodGroup}
        - Chronic Conditions: ${patient.chronicConditions}
        - Allergies: ${patient.allergies}

        RECENT LAB REPORTS:
        ${reports.map(r => {
            let dataSummary = "No specific data extracted.";
            if (Array.isArray(r.extractedData)) {
                dataSummary = r.extractedData.map((item: any) =>
                    `  * ${item.testName || item.name || 'Test'}: ${item.value || '?'} ${item.unit || ''} (${item.status || 'Normal'})`
                ).join('\n');
            } else if (typeof r.extractedData === 'object' && r.extractedData !== null) {
                dataSummary = JSON.stringify(r.extractedData);
            }

            return `- REPORT: ${r.fileName} (${r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString() : "Date unknown"})\n${dataSummary}`;
        }).join('\n\n')}
        `;

        return { context };
    } catch (error) {
        console.error("Context Error:", error);
        return { context: "Error accessing patient data." };
    }
}

export async function chatWithHealthBot(message: string, context: string) {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) return { error: "AI Service Unavailable" };

        const systemPrompt = `
        You are a warm, professional, and PRIVATE Health Assistant named "Massha Health Bot".
        You are chatting with a specific patient.

        PATIENT CONTEXT:
        ${context}

        CRITICAL RULES:
        1. **NO MEDICATIONS**: You are Strictly FORBIDDEN from prescribing medicines, pills, injections, or dosages.
        2. **HOME REMEDIES ONLY**: If asked for treatment, ONLY suggest natural foods, lifestyle changes, exercises, and simple home remedies.
        3. **SAFETY FIRST**: If a symptom sounds severe (chest pain, fainting, high fever), strictly advise seeing a doctor immediately.
        4. **PERSONALIZE**: Use the patient's profile (age, conditions) to tailor advice (e.g., "Since you have diabetes, avoid...").
        5. **FORMATTING**: 
           - Do NOT use markdown (no **, no #).
           - Do NOT sign off with "Best, Massha Health Bot".
           - Use HTML tags for formatting: <b>for bold</b>, <br> for line breaks, and <ul><li> for lists.
           - Make it visually clean and easy to read.

        User Question: "${message}"
        `;

        // List of Mistral models to try in order of priority/quota availability
        const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];

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
                        messages: [
                            { role: "system", content: "You are a helpful medical assistant. You DO NOT prescribe medication." },
                            { role: "user", content: systemPrompt }
                        ],
                        temperature: 0.3,
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0]?.message?.content) {
                        return { reply: data.choices[0].message.content };
                    }
                } else {
                    console.warn(`Mistral model ${model} returned status ${response.status}, trying next model...`);
                }
            } catch (err) {
                console.warn(`Mistral model ${model} error:`, err);
            }
        }

        return { error: "Mistral AI service unavailable. Please try again." };

    } catch (error) {
        console.error("Bot Error:", error);
        return { error: "I'm having trouble thinking right now. Please try again." };
    }
}
