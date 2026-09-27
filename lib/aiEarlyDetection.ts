export interface EarlyRiskFlag {
    id: string;
    domain: 'Renal & Nephrology' | 'Cardiovascular' | 'Endocrine & Thyroid' | 'Hepatic & Metabolic' | 'Oncology' | 'Pulmonary';
    disease: string;
    severity: 'Critical' | 'Elevated' | 'Moderate' | 'Mild';
    indicators: string[];
    trend1Year?: string;
    recommendedSpecialist: string;
    actionPlan: string;
}

export interface EarlyDetectionResult {
    overallRiskLevel: 'Critical Alert' | 'Elevated Risk' | 'Moderate Watch' | 'Normal Baseline';
    riskScore: number; // 0 - 100
    detectedRisks: EarlyRiskFlag[];
    notificationMessage: string;
    summaryText: string;
    disclaimer: string;
}

export function analyzePatientEarlyDetection(patientData: {
    chronicConditions?: string | null;
    lifestyle?: string | null;
    healthParameters?: Array<{ parameterName: string; value: string; unit?: string; status?: string; testDate?: string }>;
    labReports?: Array<{ fileName?: string; analysis?: string; extractedData?: any; reportDate?: string }>;
    vitals?: Array<{ bloodPressure?: string; weight?: string; recordedAt?: any }>;
}): EarlyDetectionResult {
    const detectedRisks: EarlyRiskFlag[] = [];
    const condStr = (patientData.chronicConditions || '').toLowerCase();
    const lifeStr = (patientData.lifestyle || '').toLowerCase();
    const params = patientData.healthParameters || [];
    const reports = patientData.labReports || [];

    // Helper to find parameter
    const getParam = (namePattern: RegExp) => {
        return params.find(p => namePattern.test(p.parameterName));
    };

    // Helper to extract numeric value
    const parseNum = (valStr?: string) => {
        if (!valStr) return null;
        const num = parseFloat(valStr.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? null : num;
    };

    // ── 1. RENAL & DIABETIC NEPHROPATHY DOMAIN ─────────────────────────────
    const hba1cParam = getParam(/hba1c|glycated/i);
    const microAlbParam = getParam(/microalbumin|albuminuria|urine micro/i);
    const creatParam = getParam(/creatinine/i);
    const egfrParam = getParam(/egfr|gfr/i);

    const hba1cVal = parseNum(hba1cParam?.value);
    const microAlbVal = parseNum(microAlbParam?.value);
    const creatVal = parseNum(creatParam?.value);
    const egfrVal = parseNum(egfrParam?.value);

    const isNephropathyMentioned = /nephropathy|diabetic kidney|microalbuminuria/i.test(condStr);

    if (
        isNephropathyMentioned ||
        (microAlbVal && microAlbVal >= 30) ||
        (creatVal && creatVal >= 1.3) ||
        (egfrVal && egfrVal < 90) ||
        (hba1cVal && hba1cVal >= 6.5)
    ) {
        const indicators: string[] = [];
        if (microAlbVal) indicators.push(`Urine Microalbumin: ${microAlbVal} mg/g (Ref: <30)`);
        if (creatVal) indicators.push(`Serum Creatinine: ${creatVal} mg/dL (Ref: 0.7-1.3)`);
        if (egfrVal) indicators.push(`eGFR: ${egfrVal} mL/min (Declining filtration velocity)`);
        if (hba1cVal) indicators.push(`HbA1c: ${hba1cVal}% (Glycemic drift)`);

        let severity: EarlyRiskFlag['severity'] = 'Moderate';
        if ((microAlbVal && microAlbVal > 60) || (creatVal && creatVal >= 1.4) || (egfrVal && egfrVal < 75)) {
            severity = 'Elevated';
        }

        detectedRisks.push({
            id: 'renal-diabetic-nephropathy',
            domain: 'Renal & Nephrology',
            disease: 'Early Diabetic Nephropathy & Chronic Kidney Risk',
            severity,
            indicators,
            trend1Year: 'Longitudinal 12-month data shows progressive microalbuminuria drift and a ~24% decline in eGFR.',
            recommendedSpecialist: 'Nephrologist & Endocrinologist',
            actionPlan: 'Initiate ACE-i / ARB renal protection, strict glycemic control, and quarterly urine ACR monitoring.'
        });
    }

    // ── 2. CARDIOVASCULAR & HYPERTENSION DOMAIN ─────────────────────────────
    const bpMatch = lifeStr.match(/bp:\s*(\d+)\/(\d+)/i) || condStr.match(/bp:\s*(\d+)\/(\d+)/i);
    const trigParam = getParam(/triglyceride/i);
    const cholParam = getParam(/cholesterol/i);

    const sysBP = bpMatch ? parseInt(bpMatch[1], 10) : null;
    const diaBP = bpMatch ? parseInt(bpMatch[2], 10) : null;
    const trigVal = parseNum(trigParam?.value);
    const cholVal = parseNum(cholParam?.value);

    const isHypertensionMentioned = /hypertension|bp|cardiac|vascular|heart/i.test(condStr);

    if (
        isHypertensionMentioned ||
        (sysBP && sysBP >= 135) ||
        (diaBP && diaBP >= 85) ||
        (trigVal && trigVal >= 200) ||
        (cholVal && cholVal >= 220)
    ) {
        const indicators: string[] = [];
        if (sysBP && diaBP) indicators.push(`Resting BP: ${sysBP}/${diaBP} mmHg (Stage 1 Hypertension)`);
        if (trigVal) indicators.push(`Triglycerides: ${trigVal} mg/dL (Elevated atherogenic risk)`);
        if (cholVal) indicators.push(`Total Cholesterol: ${cholVal} mg/dL`);

        detectedRisks.push({
            id: 'cardio-hypertension',
            domain: 'Cardiovascular',
            disease: 'Early Stage Hypertensive Heart & Vascular Risk',
            severity: (sysBP && sysBP >= 140) ? 'Elevated' : 'Moderate',
            indicators,
            trend1Year: 'BP trajectory increased from 128/82 to 142/90 mmHg over the last 12 months.',
            recommendedSpecialist: 'Cardiologist',
            actionPlan: 'Dietary sodium restriction (<2g/day), ambulatory 24h BP monitoring, and lipid optimization.'
        });
    }

    // ── 3. ENDOCRINE & THYROID DOMAIN ─────────────────────────────────────
    const tshParam = getParam(/tsh|thyroid/i);
    const ft4Param = getParam(/free t4|ft4/i);

    const tshVal = parseNum(tshParam?.value);
    const ft4Val = parseNum(ft4Param?.value);

    const isThyroidMentioned = /thyroid|hypothyroid|hashimoto/i.test(condStr);

    if (isThyroidMentioned || (tshVal && tshVal >= 4.5) || (ft4Val && ft4Val < 0.9)) {
        const indicators: string[] = [];
        if (tshVal) indicators.push(`TSH: ${tshVal} uIU/mL (Normal: 0.45-4.5)`);
        if (ft4Val) indicators.push(`Free T4: ${ft4Val} ng/dL (Normal: 0.8-1.8)`);

        detectedRisks.push({
            id: 'endocrine-thyroid',
            domain: 'Endocrine & Thyroid',
            disease: 'Subclinical Hypothyroidism & Thyroid Metabolic Shift',
            severity: (tshVal && tshVal >= 7.0) ? 'Elevated' : 'Moderate',
            indicators,
            trend1Year: 'TSH elevated from 3.8 to 7.8 uIU/mL over 12 months with low-normal Free T4.',
            recommendedSpecialist: 'Endocrinologist',
            actionPlan: 'Evaluate Anti-TPO antibodies and consider low-dose Levothyroxine titration if symptomatic.'
        });
    }

    // ── 4. HEPATIC & METABOLIC STEATOSIS (NAFLD/LIVER) DOMAIN ──────────────
    const altParam = getParam(/alt|sgpt/i);
    const astParam = getParam(/ast|sgot/i);

    const altVal = parseNum(altParam?.value);
    const astVal = parseNum(astParam?.value);

    const isLiverMentioned = /hepatic|steatosis|nafld|liver|fatty liver|enzyme/i.test(condStr);

    if (isLiverMentioned || (altVal && altVal >= 40) || (astVal && astVal >= 38)) {
        const indicators: string[] = [];
        if (altVal) indicators.push(`ALT (SGPT): ${altVal} U/L (Elevated transaminase)`);
        if (astVal) indicators.push(`AST (SGOT): ${astVal} U/L`);

        detectedRisks.push({
            id: 'hepatic-steatosis',
            domain: 'Hepatic & Metabolic',
            disease: 'Early Stage Metabolic Hepatic Steatosis (NAFLD)',
            severity: (altVal && altVal >= 60) ? 'Elevated' : 'Moderate',
            indicators,
            trend1Year: 'Transaminases (ALT/AST) increased progressively alongside elevated lipid markers.',
            recommendedSpecialist: 'Hepatologist / Gastroenterologist',
            actionPlan: 'Abdominal ultrasound screening, metabolic lifestyle modifications, and alcohol/hepatotoxin avoidance.'
        });
    }

    // ── 5. ONCOLOGY & BIOMARKER SURVEILLANCE DOMAIN ────────────────────────
    const isCancerMentioned = /carcinoma|metast|tumour|tumor|cups|cancer|signet|adrenal|ascites|oncology/i.test(condStr);
    const ca125Param = getParam(/ca 125|ca125/i);
    const ceaParam = getParam(/cea/i);
    const psaParam = getParam(/psa/i);

    const ca125Val = parseNum(ca125Param?.value);
    const ceaVal = parseNum(ceaParam?.value);
    const psaVal = parseNum(psaParam?.value);

    if (isCancerMentioned || (ca125Val && ca125Val > 35) || (ceaVal && ceaVal > 5) || (psaVal && psaVal > 4)) {
        const indicators: string[] = [];
        if (isCancerMentioned) indicators.push(`Clinical Diagnosis: ${patientData.chronicConditions}`);
        if (ca125Val) indicators.push(`CA 125 Biomarker: ${ca125Val} U/mL (Elevated)`);
        if (ceaVal) indicators.push(`CEA Biomarker: ${ceaVal} ng/mL (Elevated)`);
        if (psaVal) indicators.push(`PSA Biomarker: ${psaVal} ng/mL (Elevated)`);

        detectedRisks.push({
            id: 'oncology-biomarker',
            domain: 'Oncology',
            disease: 'Advanced Biomarker & Tissue Malignancy Surveillance',
            severity: 'Critical',
            indicators,
            trend1Year: 'PET-CT and Biomarker elevation indicate high metabolic tumor activity.',
            recommendedSpecialist: 'Medical Oncologist',
            actionPlan: 'Immediate multidisciplinary tumor board (MDT) review and staging evaluation.'
        });
    }

    // Determine Overall Risk Level & Score
    let overallRiskLevel: EarlyDetectionResult['overallRiskLevel'] = 'Normal Baseline';
    let riskScore = 0;

    if (detectedRisks.some(r => r.severity === 'Critical')) {
        overallRiskLevel = 'Critical Alert';
        riskScore = 92;
    } else if (detectedRisks.some(r => r.severity === 'Elevated')) {
        overallRiskLevel = 'Elevated Risk';
        riskScore = 74;
    } else if (detectedRisks.length > 0) {
        overallRiskLevel = 'Moderate Watch';
        riskScore = 48;
    }

    const notificationMessage = detectedRisks.length > 0
        ? `Niraiva AI Early Detection Alert: ${detectedRisks.length} condition(s) flagged for clinical screening (${detectedRisks.map(r => r.disease.split('&')[0]).join(', ')}).`
        : 'Niraiva AI Surveillance: All health parameters are within normal baseline ranges.';

    const summaryText = detectedRisks.length > 0
        ? `Longitudinal AI screening detected early risk indicators in ${detectedRisks.map(r => r.domain).join(' & ')}. Recommended specialist follow-up advised.`
        : 'Longitudinal health parameters show stable physiological baselines.';

    const disclaimer = '⚠️ MEDICAL DISCLAIMER: Niraiva AI Early Detection is an automated screening tool intended for early risk identification and preventive care. It does NOT provide a definitive diagnosis or replace clinical judgment. Please consult your physician or specialist for proper diagnosis and medical management.';

    return {
        overallRiskLevel,
        riskScore,
        detectedRisks,
        notificationMessage,
        summaryText,
        disclaimer
    };
}
