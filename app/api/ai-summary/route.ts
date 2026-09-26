import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'doctor') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { diagnoses, medications, patientName, age, gender, vitals, labTests, injections, patientNote, followUp, diagClinicalNotes } = await req.json();

        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "AI Service Unavailable" }, { status: 503 });
        }

        const prompt = `
        You are an expert medical AI assisting a doctor. Provide a comprehensive, easy-to-understand plain text summary of the patient's consultation.
        IMPORTANT RULES:
        1. Write a detailed paragraph (about 5 to 8 sentences). Ensure it is easy to read and understand.
        2. Explicitly mention the vitals clearly, highlighting any abnormal ones.
        3. Include the clinical diagnosis and observations.
        4. State the prescribed medications with their accurate durations and timings.
        5. Explicitly mention any lab tests ordered and injections given.
        6. Include the patient advice and the next follow-up plan.
        7. Do NOT include greetings or conclusions.
        8. NEVER use any markdown, bullet points, or lists. Write in a continuous paragraph format.

        Patient Details: ${patientName} (Age: ${age || "N/A"}, Gender: ${gender || "N/A"})
        Vitals Recorded: BP ${vitals?.bloodPressure || "N/A"}, Glucose ${vitals?.bloodGlucose || "N/A"}, Weight ${vitals?.weight || "N/A"}, Height ${vitals?.height || "N/A"}
        Clinical Diagnosis: ${diagnoses?.length > 0 ? diagnoses.join(", ") : "None stated"}
        Doctor Notes & Observations: ${(diagClinicalNotes?.trim() || "None")}
        Medications Prescribed: ${medications?.length > 0 ? medications.join(" | ") : "None prescribed"}
        Lab Tests Ordered: ${labTests?.length > 0 ? labTests.join(", ") : "None"}
        Injections: ${injections?.length > 0 ? injections.join(", ") : "None"}
        Patient Advice: ${patientNote?.trim() || "None"}
        Next Follow Up: ${followUp || "None scheduled"}
        `;

        const mistralModels = ["open-mistral-7b", "open-mistral-nemo", "mistral-tiny", "mistral-small-latest"];
        let summary = "";

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
                        temperature: 0.2,
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0]?.message?.content) {
                        summary = data.choices[0].message.content;
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Mistral model ${model} error:`, err);
            }
        }

        if (!summary) {
            throw new Error("Mistral API failed across all models");
        }

        // Force strip any remaining markdown symbols that Mistral might have leaked (but preserve hyphens and slashes for medical data)
        summary = summary.replace(/[*#_`]/g, '').trim();

        return NextResponse.json({ summary });

    } catch (error) {
        console.error("AI Summary Error:", error);
        return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }
}
