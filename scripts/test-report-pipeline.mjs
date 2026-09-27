// Isolated integration tests: temporary SQLite database and simulated provider responses.
// Run: node scripts/test-report-pipeline.mjs. Never loads .env or writes patient data.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
import { createClient } from '@libsql/client';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

const folder = await mkdtemp(path.join(tmpdir(), 'niraiva-pipeline-'));
Object.assign(process.env, {
    TURSO_DATABASE_URL: `file:${folder}/test.db`, TURSO_AUTH_TOKEN: '',
    CLOUDINARY_CLOUD_NAME: 'pipeline-test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test',
    LLAMA_PARSE_API_KEY: 'test', MISTRAL_API_KEY: 'test', MISTRAL_MODEL: '',
});
const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const { db } = await jiti.import('../db/index.ts');
const schema = await jiti.import('../db/schema.ts');
const { saveUploadedLabReport, processStoredLabReport } = await jiti.import('../lib/labReportProcessing.ts');
const { normalizeReportDate, normalizeTestResults, extractLabDataWithAI } = await jiti.import('../lib/labExtraction.ts');
const { cloudinaryAsset, fetchCloudinaryBuffer } = await jiti.import('../lib/cloudinary.ts');
const { analyzePatientEarlyDetection } = await jiti.import('../lib/aiEarlyDetection.ts');
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const realFetch = globalThis.fetch;
let mode = 'success';
let downloads = 0;
let parseCalls = 0;
let chatCalls = 0;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const fixture = () => ({
    reportDate: '09-04-2025', patientName: 'Synthetic test patient', labName: 'Test lab', metadata: {},
    testResults: [{ category: 'Testing', tests: [
        { name: 'Novel marker', value: 0, unit: 'units', status: 'normal' },
        { name: 'Another marker', value: '17', unit: 'units', referenceRange: '2-10', status: 'high' },
    ] }],
});
globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes('cloudinary.com')) {
        downloads++;
        const parsed = new URL(url);
        if (parsed.hostname === 'api.cloudinary.com') {
            if (mode === 'download-fallback') throw new Error('Synthetic network failure');
            assert.equal(parsed.searchParams.get('public_id'), 'lab-reports/example.pdf');
        }
        return new Response('%PDF-synthetic');
    }
    if (url.includes('llamaindex.ai')) {
        if (mode === 'parser-failure') return json({}, 503);
        if (url.endsWith('/upload')) { parseCalls++; return json({ id: 'job' }); }
        if (url.endsWith('/result/markdown')) return json({ markdown: 'Synthetic lab text Page 6', job_metadata: { job_pages: 6 } });
        return json({ status: 'SUCCESS' });
    }
    if (url.endsWith('/chat/completions')) {
        chatCalls++;
        if (mode === 'failure') return json({}, 401);
        if (mode === 'rate-limit') return json({}, 429);
        assert.equal(JSON.parse(options.body).model, 'open-mistral-7b');
        assert.ok(JSON.parse(options.body).messages[1].content.includes('Page 6'));
        const data = fixture();
        if (mode === 'empty') data.testResults = [];
        return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
    }
    throw new Error(`Unexpected external request: ${url}`);
};
try {
    for (const table of [schema.users, schema.patients, schema.labReports, schema.healthParameters]) {
        const config = getTableConfig(table);
        await client.execute(`CREATE TABLE "${config.name}" (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}`).join(',')})`);
    }
    for (const id of ['patient-a', 'patient-b']) {
        await db.insert(schema.users).values({ id: `user-${id}`, name: 'Synthetic patient', email: `${id}@example.invalid` });
        await db.insert(schema.patients).values({ id, userId: `user-${id}` });
    }
    const data = patientId => ({ patientId, cloudinaryUrl: 'https://res.cloudinary.com/pipeline-test/raw/upload/v1/lab-reports/example.pdf', fileName: 'example.pdf', fileSize: 0 });
    assert.equal(cloudinaryAsset(data('patient-a').cloudinaryUrl).publicId, 'lab-reports/example.pdf');
    assert.equal(cloudinaryAsset('https://res.cloudinary.com/pipeline-test/image/upload/v1/lab-reports/example.pdf').publicId, 'lab-reports/example');
    assert.throws(() => cloudinaryAsset('https://example.com/private.pdf'));
    assert.equal(normalizeReportDate('09-04-2025'), '2025-04-09');
    assert.equal(normalizeReportDate('2025-02-30'), null);
    assert.equal(normalizeTestResults([{ name: 'Zero', value: 0 }])[0].tests[0].value, '0');
    const a = await saveUploadedLabReport(data('patient-a'));
    const b = await saveUploadedLabReport(data('patient-b'), Buffer.from('%PDF-synthetic'));
    assert.equal(a.success, true); assert.equal(b.success, true); assert.equal(downloads, 1);
    let reports = await db.query.labReports.findMany();
    assert.ok(reports.every(r => r.pageCount === 6 && r.rawText === 'Synthetic lab text Page 6' && r.reportDate === '2025-04-09'));
    let params = await db.query.healthParameters.findMany();
    assert.equal(params.length, 4); assert.equal(params.filter(p => p.patientId === 'patient-b').length, 2);
    await processStoredLabReport(a.reportId, Buffer.from('%PDF-synthetic'));
    assert.equal((await db.query.healthParameters.findMany()).length, 4, 'reprocessing is idempotent');
    mode = 'failure';
    await assert.rejects(processStoredLabReport(a.reportId, Buffer.from('%PDF-failure')));
    assert.equal((await db.query.healthParameters.findMany()).length, 4, 'failed retry preserves measurements');
    const failed = await saveUploadedLabReport(data('patient-a'), Buffer.from('%PDF-failure'));
    assert.ok(failed.warning);
    reports = await db.query.labReports.findMany();
    assert.equal(reports.find(r => r.id === failed.reportId).extractedData.extractionStatus, 'failed');
    assert.equal(reports.find(r => r.id === failed.reportId).rawText, 'Synthetic lab text Page 6');
    mode = 'parser-failure';
    const beforeParserFailure = chatCalls;
    const parserFailed = await saveUploadedLabReport(data('patient-b'), Buffer.from('%PDF-parser-failure'));
    assert.ok(parserFailed.warning); assert.equal(chatCalls, beforeParserFailure, 'parser failure does not call another AI provider');
    mode = 'rate-limit';
    const beforeLimit = chatCalls;
    const limited = await saveUploadedLabReport(data('patient-b'), Buffer.from('%PDF-rate-limit'));
    assert.ok(limited.warning); assert.equal(chatCalls, beforeLimit + 1, 'no repeated requests after 429');
    mode = 'success';
    const beforeRepairParse = parseCalls, beforeRepairDownload = downloads;
    await processStoredLabReport(limited.reportId);
    assert.equal(parseCalls, beforeRepairParse, 'retry reuses saved LlamaParse text');
    assert.equal(downloads, beforeRepairDownload, 'retry does not redownload the file');
    const beforeConcurrent = chatCalls;
    await Promise.all([extractLabDataWithAI(Buffer.from('%PDF-concurrent')), extractLabDataWithAI(Buffer.from('%PDF-concurrent'))]);
    assert.equal(chatCalls, beforeConcurrent + 1, 'concurrent extraction shares one request');
    const beforeAutofill = chatCalls;
    await extractLabDataWithAI(Buffer.from('%PDF-autofill'), 'autofill.pdf');
    await saveUploadedLabReport({ ...data('patient-b'), fileName: 'autofill.pdf' }, Buffer.from('%PDF-autofill'));
    assert.equal(chatCalls, beforeAutofill + 1, 'registration upload reuses autofill extraction');
    // A persistence failure must roll back both report replacement and parameter deletion.
    await client.execute(`CREATE TRIGGER fail_parameters BEFORE INSERT ON health_parameters BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    await assert.rejects(processStoredLabReport(a.reportId, Buffer.from('%PDF-synthetic')));
    assert.equal((await db.query.healthParameters.findMany()).filter(p => p.labReportId === a.reportId).length, 2);
    await client.execute('DROP TRIGGER fail_parameters');
    mode = 'empty';
    const beforeEmpty = chatCalls;
    const empty = await saveUploadedLabReport(data('patient-a'), Buffer.from('%PDF-empty'));
    assert.equal(chatCalls, beforeEmpty + 1, 'no second OCR pass for a narrative report');
    reports = await db.query.labReports.findMany();
    assert.equal(reports.find(r => r.id === empty.reportId).extractedData.extractionStatus, 'no_measurements');
    mode = 'download-fallback';
    assert.equal((await fetchCloudinaryBuffer(data('patient-a').cloudinaryUrl)).toString(), '%PDF-synthetic');
    assert.equal(analyzePatientEarlyDetection({}).overallRiskLevel, 'Insufficient data');
    const summary = analyzePatientEarlyDetection({ healthParameters: [
        { parameterName: 'X', value: '17', status: 'high', testDate: '2025-01-01' },
        { parameterName: 'X', value: '5', status: 'normal', testDate: '2025-02-01' },
    ] });
    assert.equal(summary.detectedRisks.length, 0); assert.equal(summary.riskScore, null);
    const abnormal = analyzePatientEarlyDetection({ healthParameters: [{ parameterName: 'Any new marker', value: '1', status: 'low' }] });
    assert.equal(abnormal.detectedRisks.length, 1); assert.equal(abnormal.detectedRisks[0].trend1Year, undefined);
    console.log('PASS: upload paths, patient isolation, Cloudinary IDs, zero values, dates, all pages, request reuse, no automatic retries, atomic persistence, repair, and evidence-based screening');
} finally {
    globalThis.fetch = realFetch;
    client.close();
    await rm(folder, { recursive: true, force: true });
}
