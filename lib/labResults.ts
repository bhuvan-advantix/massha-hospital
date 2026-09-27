export interface TestResult {
    category: string;
    tests: { name: string; value: string; unit: string; referenceRange?: string; status?: 'normal' | 'high' | 'low' }[];
}
const asText = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

// Accept both legacy flat results and grouped results from the extraction service.
export function normalizeTestResults(input: unknown): TestResult[] {
    const data = input as { results?: unknown; testResults?: unknown } | null;
    const groups = Array.isArray(input) ? input : data?.results ?? data?.testResults;
    if (!Array.isArray(groups)) return [];
    return groups.flatMap(group => {
        if (!group || typeof group !== 'object') return [];
        const tests = (Array.isArray(group.tests) ? group.tests : [group]).flatMap((test: Record<string, unknown>) => {
            if (!test || typeof test !== 'object') return [];
            const name = asText(test.name ?? test.parameterName ?? test.testName);
            const value = asText(test.value);
            if (!name || !value || value === '--') return [];
            const status = asText(test.status).toLowerCase();
            return [{ name, value, unit: asText(test.unit), referenceRange: asText(test.referenceRange),
                ...(['normal', 'high', 'low'].includes(status) ? { status: status as 'normal' | 'high' | 'low' } : {}) }];
        });
        return tests.length ? [{ category: asText(group.category) || 'Report Results', tests }] : [];
    });
}

export function normalizeReportDate(value: unknown): string | null {
    const text = asText(value);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    const candidate = iso ? iso[0] : local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : '';
    const date = new Date(candidate);
    return candidate && !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

