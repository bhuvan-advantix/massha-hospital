type LabTest = {
    name?: string;
    value?: string;
    unit?: string;
    referenceRange?: string;
    status?: string;
};

type LabCategory = {
    category?: string;
    tests?: LabTest[];
};

type OncologyMetadata = {
    diagnosis?: string;
    stage?: string;
    tnm?: string;
    diagnosisDate?: string;
    carePhase?: string;
    treatmentIntent?: string;
    currentPlan?: string;
    nextMilestone?: string;
    owner?: string;
    dataWindow?: string;
    patientSummary?: string;
    clinicianSummary?: string;
    screeningStatus?: string;
    trendStatus?: string;
    closedLoopStatus?: string;
    keyFinding?: string;
    pathology?: string;
    imaging?: string;
};

type ReportLike = {
    reportDate?: unknown;
    extractedData?: unknown;
};

type HealthParamLike = {
    parameterName?: unknown;
    value?: unknown;
    unit?: unknown;
    status?: unknown;
    testDate?: unknown;
};

type TimelineEventLike = {
    title?: unknown;
    description?: unknown;
    eventDate?: unknown;
};

type DiagnosticLike = {
    conditionName?: unknown;
    conditionStatus?: unknown;
    clinicalNotes?: unknown;
    treatmentPlan?: unknown;
    createdAt?: unknown;
};

export type OncologyBrief = {
    hasOncologyData: boolean;
    diagnosis: string;
    stage: string;
    tnm: string;
    diagnosisDate: string;
    carePhase: string;
    treatmentIntent: string;
    currentPlan: string;
    nextMilestone: string;
    owner: string;
    dataWindow: string;
    patientSummary: string;
    clinicianSummary: string;
    evidence: string[];
    lanes: Array<{ label: string; status: string }>;
    markers: Array<{ name: string; value: string; unit?: string; status?: string; date?: string | null }>;
};

const ONCOLOGY_TERMS = [
    'cancer',
    'carcinoma',
    'adenocarcinoma',
    'oncology',
    'tumor',
    'tumour',
    'malignancy',
    'neoplasm',
];

const MARKER_TERMS = [
    'psa',
    'ca-125',
    'ca 125',
    'cea',
    'afp',
    'ca 19-9',
    'ca19-9',
    'ca 15-3',
    'he4',
    'ldh',
    'crp',
    'esr',
    'ferritin',
    'hemoglobin',
    'wbc',
    'platelet',
    'alkaline phosphatase',
    'albumin',
];

function safeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

// Extracts a short readable summary from a long treatment plan document
function summarizePlan(plan: string): string {
    if (!plan) return '';
    let text = plan.trim();
    // 1. Truncate at first real newline
    const nlIdx = text.indexOf('\n');
    if (nlIdx > 0 && nlIdx < 200) text = text.slice(0, nlIdx).trim();
    // 2. Truncate at first 'SECTION' keyword (section body starts here)
    const secIdx = text.indexOf('SECTION');
    if (secIdx > 0 && secIdx < 300) text = text.slice(0, secIdx).trim();
    // 3. Truncate at first pipe separator (e.g. "Date Initiated: ... | Clinician: ...")
    const pipeIdx = text.indexOf('|');
    if (pipeIdx > 0 && pipeIdx < 300) text = text.slice(0, pipeIdx).trim();
    // 4. Absolute cap at 130 characters
    if (text.length > 130) text = text.slice(0, 127).trim() + '...';
    return text;
}

function isOncologyText(value: unknown) {
    const text = safeString(value).toLowerCase();
    return ONCOLOGY_TERMS.some(term => text.includes(term));
}

function parseDate(value: unknown) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
        const date = new Date(value > 9999999999 ? value : value * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const text = safeString(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown) {
    const date = parseDate(value);
    if (!date) return safeString(value) || 'Not recorded';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function markerDate(value: unknown) {
    const date = parseDate(value);
    if (date) return date.toISOString();
    return safeString(value) || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getReportPayload(report: ReportLike) {
    const data = report?.extractedData;
    if (!data) return { results: [] as LabCategory[], metadata: {} as Record<string, unknown> };
    if (Array.isArray(data)) return { results: data as LabCategory[], metadata: {} as Record<string, unknown> };
    if (!isRecord(data)) return { results: [] as LabCategory[], metadata: {} as Record<string, unknown> };
    return {
        results: Array.isArray(data.results) ? data.results as LabCategory[] : [],
        metadata: isRecord(data.metadata) ? data.metadata : {},
    };
}

function isOncologyMetadata(value: unknown): value is OncologyMetadata {
    return isRecord(value);
}

function collectOncologyMetadata(reports: ReportLike[]) {
    return reports
        .map(report => getReportPayload(report).metadata?.oncology)
        .filter(isOncologyMetadata);
}

function collectLatestMarkers(healthParams: HealthParamLike[], reports: ReportLike[]) {
    const fromHealthParams = (healthParams || [])
        .filter(param => {
            const name = safeString(param?.parameterName).toLowerCase();
            return MARKER_TERMS.some(term => name.includes(term));
        })
        .map(param => ({
            name: safeString(param.parameterName),
            value: safeString(param.value),
            unit: safeString(param.unit),
            status: safeString(param.status),
            date: markerDate(param.testDate),
        }));

    const fromReports = (reports || []).flatMap(report => {
        const { results } = getReportPayload(report);
        return results.flatMap(category => (category.tests || []).map(test => ({
            name: safeString(test.name),
            value: safeString(test.value),
            unit: safeString(test.unit),
            status: safeString(test.status),
            date: markerDate(report.reportDate),
        })));
    }).filter(test => {
        const name = test.name.toLowerCase();
        return MARKER_TERMS.some(term => name.includes(term));
    });

    const PRIMARY_TUMOR_MARKERS = ['cea', 'ca 15-3', 'ca-15-3', 'psa', 'free psa', 'ca-125', 'ca 125', 'ca 19-9', 'afp', 'he4'];

    const map = new Map<string, OncologyBrief['markers'][number]>();
    [...fromHealthParams, ...fromReports]
        .filter(marker => marker.name && marker.value)
        .forEach(marker => map.set(marker.name.toLowerCase(), marker));

    const sortedMarkers = Array.from(map.values()).sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aIsTumor = PRIMARY_TUMOR_MARKERS.some(t => aName.includes(t));
        const bIsTumor = PRIMARY_TUMOR_MARKERS.some(t => bName.includes(t));
        if (aIsTumor && !bIsTumor) return -1;
        if (!aIsTumor && bIsTumor) return 1;
        const at = parseDate(a.date)?.getTime() ?? 0;
        const bt = parseDate(b.date)?.getTime() ?? 0;
        return bt - at;
    });

    return sortedMarkers.slice(0, 6);
}

function getDataWindow(timeline: TimelineEventLike[], reports: ReportLike[]) {
    const dates = [
        ...(timeline || []).map(event => event.eventDate),
        ...(reports || []).map(report => report.reportDate),
    ].map(parseDate).filter(Boolean) as Date[];

    if (dates.length === 0) return 'Not recorded';
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    return `${formatDate(sorted[0].toISOString())} - ${formatDate(sorted[sorted.length - 1].toISOString())}`;
}

export function buildOncologyBrief(input: {
    patient?: { reports?: ReportLike[] };
    reports?: ReportLike[];
    healthParams?: HealthParamLike[];
    timeline?: TimelineEventLike[];
    diagnostics?: DiagnosticLike[];
    conditions?: DiagnosticLike[];
}): OncologyBrief {
    const reports = input.reports || input.patient?.reports || [];
    const healthParams = input.healthParams || [];
    const timeline = input.timeline || [];
    const diagnostics = input.diagnostics || input.conditions || [];
    const metadata = collectOncologyMetadata(reports);
    const primaryMeta = metadata[0] || {};
    const oncologyDiagnostic = diagnostics.find(item => isOncologyText(item?.conditionName));
    const oncologyTimeline = timeline.filter((event) =>
        isOncologyText(event?.title) || isOncologyText(event?.description)
    );
    const hasOncologyData = Boolean(metadata.length || oncologyDiagnostic || oncologyTimeline.length);

    const evidence = [
        safeString(primaryMeta.screeningStatus),
        safeString(primaryMeta.keyFinding),
        safeString(primaryMeta.pathology),
        safeString(primaryMeta.imaging),
        safeString(primaryMeta.closedLoopStatus),
    ].filter(Boolean).slice(0, 5);

    const lanes = [
        { label: 'Screening gap', status: safeString(primaryMeta.screeningStatus) || 'Reviewed' },
        { label: 'Clinical trend', status: safeString(primaryMeta.trendStatus) || 'Trend reviewed' },
        { label: 'Marker follow-up', status: safeString(primaryMeta.closedLoopStatus) || 'Disposition documented' },
    ];

    return {
        hasOncologyData,
        diagnosis: safeString(primaryMeta.diagnosis) || safeString(oncologyDiagnostic?.conditionName) || 'Oncology diagnosis recorded',
        stage: safeString(primaryMeta.stage) || 'Stage not recorded',
        tnm: safeString(primaryMeta.tnm) || 'TNM not recorded',
        diagnosisDate: formatDate(primaryMeta.diagnosisDate || oncologyDiagnostic?.createdAt),
        carePhase: safeString(primaryMeta.carePhase) || safeString(oncologyDiagnostic?.conditionStatus) || 'Active follow-up',
        treatmentIntent: safeString(primaryMeta.treatmentIntent) || 'Clinician documented plan',
        currentPlan: safeString(primaryMeta.currentPlan) || summarizePlan(safeString(oncologyDiagnostic?.treatmentPlan)) || 'Care plan documented by clinician',
        nextMilestone: safeString(primaryMeta.nextMilestone) || 'Next review scheduled',
        owner: safeString(primaryMeta.owner) || 'Oncology care team',
        dataWindow: safeString(primaryMeta.dataWindow) || getDataWindow(timeline, reports),
        patientSummary: safeString(primaryMeta.patientSummary) || 'Your care team is tracking your diagnosis, treatment plan, appointments, and follow-up results in one place.',
        clinicianSummary: safeString(primaryMeta.clinicianSummary) || safeString(oncologyDiagnostic?.clinicalNotes) || 'Longitudinal oncology record available for clinician review.',
        evidence,
        lanes,
        markers: collectLatestMarkers(healthParams, reports),
    };
}
