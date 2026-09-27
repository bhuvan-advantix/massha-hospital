export interface EarlyRiskFlag {
    id: string;
    domain: string;
    disease: string;
    severity: 'Critical' | 'Elevated' | 'Moderate' | 'Mild';
    indicators: string[];
    trend1Year?: string;
    recommendedSpecialist: string;
    actionPlan: string;
}
export interface EarlyDetectionResult {
    overallRiskLevel: 'Critical Alert' | 'Elevated Risk' | 'Moderate Watch' | 'No flagged results' | 'Insufficient data';
    riskScore: number | null;
    detectedRisks: EarlyRiskFlag[];
    notificationMessage: string;
    summaryText: string;
    disclaimer: string;
}
type Parameter = { parameterName: string; value: string; unit?: string; status?: string; testDate?: string };

// Summarize actual extracted flags. No fabricated risk probabilities or historical measurements.
export function analyzePatientEarlyDetection(patientData: {
    chronicConditions?: string | null;
    lifestyle?: string | null;
    healthParameters?: Parameter[];
    labReports?: Array<{ fileName?: string; analysis?: string; extractedData?: unknown; reportDate?: string }>;
    vitals?: Array<{ bloodPressure?: string; weight?: string; recordedAt?: unknown }>;
}): EarlyDetectionResult {
    const measurements: Parameter[] = [...(patientData.healthParameters || [])];
    for (const report of patientData.labReports || []) {
        const raw = report.extractedData as { results?: unknown[] } | undefined;
        const groups = Array.isArray(raw) ? raw : raw?.results || [];
        for (const group of groups) {
            const item = group as { tests?: Array<Record<string, unknown>> };
            const tests = Array.isArray(item?.tests) ? item.tests : [group as Record<string, unknown>];
            for (const test of tests) {
                if (!test || test.value == null) continue;
                const name = String(test.name || test.parameterName || test.testName || '').trim();
                if (name) measurements.push({ parameterName: name, value: String(test.value), unit: String(test.unit || ''),
                    status: String(test.status || ''), testDate: report.reportDate });
            }
        }
    }
    const latest = new Map<string, Parameter>();
    const keyFor = (p: Parameter) => `${p.parameterName.toLowerCase().trim()}|${(p.unit || '').toLowerCase()}`;
    const time = (p: Parameter) => Date.parse(p.testDate || '') || 0;
    for (const p of measurements) {
        const key = keyFor(p);
        if (!latest.has(key) || time(p) > time(latest.get(key)!)) latest.set(key, p);
    }
    const detectedRisks: EarlyRiskFlag[] = [];
    const latestReport = [...(patientData.labReports || [])].sort((a, b) => (Date.parse(b.reportDate || '') || 0) - (Date.parse(a.reportDate || '') || 0))[0];
    const clinicalFlags = (latestReport?.extractedData as { metadata?: { clinicalFlags?: unknown } } | undefined)?.metadata?.clinicalFlags;
    if (Array.isArray(clinicalFlags)) {
        for (const [index, flag] of clinicalFlags.entries()) {
            if (typeof flag?.finding !== 'string' || typeof flag?.evidence !== 'string' || !flag.finding || !flag.evidence) continue;
            detectedRisks.push({ id: `finding-${index}`, domain: 'Report findings', disease: flag.finding, severity: 'Moderate',
                indicators: [flag.evidence], recommendedSpecialist: 'Treating clinician',
                actionPlan: 'Review this documented finding and the original report with your clinician.' });
        }
    }
    for (const [key, p] of latest) {
        if (!/^(high|low|abnormal|critical|elevated)$/i.test(p.status || '')) continue;
        const prior = measurements.filter(x => keyFor(x) === key && time(x) > 0 && time(x) < time(p)).sort((a, b) => time(b) - time(a))[0];
        detectedRisks.push({
            id: key, domain: 'Report findings', disease: `${p.parameterName}: ${p.status}`,
            severity: p.status?.toLowerCase() === 'critical' ? 'Critical' : 'Moderate',
            indicators: [`${p.parameterName}: ${p.value} ${p.unit || ''}${p.testDate ? ` (${p.testDate})` : ''}`],
            ...(prior ? { trend1Year: `${prior.testDate}: ${prior.value} ${prior.unit || ''} → ${p.testDate}: ${p.value} ${p.unit || ''}` } : {}),
            recommendedSpecialist: 'Treating clinician',
            actionPlan: 'Review this flagged result alongside the original report and clinical history with your clinician.',
        });
    }
    const hasClassifiedResults = [...latest.values()].some(p => /^(normal|high|low|abnormal|critical|elevated)$/i.test(p.status || ''));
    const incomplete = (patientData.labReports || []).some(report => {
        const raw = report.extractedData as { extractionStatus?: string; results?: unknown[] } | undefined;
        return !raw || ['pending', 'failed'].includes(raw.extractionStatus || '') ||
            (!Array.isArray(raw) && !raw.extractionStatus && !raw.results?.length);
    });
    const overallRiskLevel = detectedRisks.some(r => r.severity === 'Critical') ? 'Critical Alert'
        : detectedRisks.length ? 'Moderate Watch' : !hasClassifiedResults || incomplete ? 'Insufficient data' : 'No flagged results';
    const summaryText = detectedRisks.length
        ? `${detectedRisks.length} result(s) flagged in the latest available measurements.${incomplete ? ' Some reports still need extraction.' : ''}`
        : !hasClassifiedResults || incomplete
            ? 'There is not enough interpreted report data to assess risk. Upload a report or retry extraction on an existing report.'
            : 'No high or low flags were found in the available interpreted results. This does not rule out disease.';
    return { overallRiskLevel, riskScore: null, detectedRisks, notificationMessage: summaryText, summaryText,
        disclaimer: 'AI-extracted report screening supports clinical review and does not provide a diagnosis. Consult your clinician.' };
}
