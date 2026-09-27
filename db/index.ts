import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const rawUrl = process.env.TURSO_DATABASE_URL || "";
const dbUrl = rawUrl.startsWith("libsql://")
    ? rawUrl.replace(/^libsql:\/\//, "https://")
    : rawUrl;

const client = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

let extractionCacheSchemaEnsured = false;

export async function ensureExtractionCacheSchema() {
    if (extractionCacheSchemaEnsured) return;

    await client.execute(`
        CREATE TABLE IF NOT EXISTS pending_report_extractions (
            content_hash TEXT PRIMARY KEY NOT NULL,
            extraction TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER
        )
    `);
    await client.execute(
        "CREATE INDEX IF NOT EXISTS pending_report_extractions_expires_at_idx ON pending_report_extractions(expires_at)"
    );
    extractionCacheSchemaEnsured = true;
}


let labReportsSchemaEnsured = false;

export async function ensureLabReportsSchema() {
    if (labReportsSchemaEnsured) return;

    const tableInfo = await client.execute("PRAGMA table_info('lab_reports')");
    const existingColumns = new Set(
        tableInfo.rows.map((row) => String((row as Record<string, unknown>).name))
    );

    // Keep runtime DB aligned with current Drizzle schema for lab_reports.
    const expectedColumns: Array<{ name: string; type: string }> = [
        { name: "id", type: "TEXT" },
        { name: "patient_id", type: "TEXT" },
        { name: "file_name", type: "TEXT" },
        { name: "report_date", type: "TEXT" },
        { name: "lab_name", type: "TEXT" },
        { name: "patient_name", type: "TEXT" },
        { name: "doctor_name", type: "TEXT" },
        { name: "extracted_data", type: "TEXT" },
        { name: "raw_text", type: "TEXT" },
        { name: "analysis", type: "TEXT" },
        { name: "cloudinary_url", type: "TEXT" },
        { name: "file_size", type: "INTEGER" },
        { name: "page_count", type: "INTEGER" },
        { name: "file_data", type: "TEXT" },
        { name: "uploaded_at", type: "INTEGER" },
    ];

    if (existingColumns.size === 0) {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS lab_reports (
                id TEXT PRIMARY KEY NOT NULL,
                patient_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                report_date TEXT,
                lab_name TEXT,
                patient_name TEXT,
                doctor_name TEXT,
                extracted_data TEXT NOT NULL,
                raw_text TEXT,
                analysis TEXT,
                cloudinary_url TEXT,
                file_size INTEGER,
                page_count INTEGER,
                file_data TEXT,
                uploaded_at INTEGER
            )
        `);
    } else {
        for (const column of expectedColumns) {
            if (!existingColumns.has(column.name)) {
                await client.execute(
                    `ALTER TABLE lab_reports ADD COLUMN ${column.name} ${column.type}`
                );
            }
        }
    }

    labReportsSchemaEnsured = true;
}

// ── Medications schema guard ──────────────────────────────────────────────────
let medicationsSchemaEnsured = false;

export async function ensureMedicationsSchema() {
    if (medicationsSchemaEnsured) return;

    const tableInfo = await client.execute("PRAGMA table_info('medications')");
    const existingColumns = new Set(
        tableInfo.rows.map((row) => String((row as Record<string, unknown>).name))
    );

    if (!existingColumns.has('duration_days')) {
        await client.execute(
            `ALTER TABLE medications ADD COLUMN duration_days INTEGER`
        );
    }

    medicationsSchemaEnsured = true;
}

// ── Prescriptions schema guard ─────────────────────────────────────────────────
let prescriptionsSchemaEnsured = false;

export async function ensurePrescriptionsSchema() {
    if (prescriptionsSchemaEnsured) return;

    const tableInfo = await client.execute("PRAGMA table_info('prescriptions')");
    const existingColumns = new Set(
        tableInfo.rows.map((row) => String((row as Record<string, unknown>).name))
    );

    if (existingColumns.size === 0) {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id TEXT PRIMARY KEY NOT NULL,
                patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
                consultation_data TEXT NOT NULL,
                cloudinary_url TEXT NOT NULL,
                prescribed_at INTEGER
            )
        `);
    }

    prescriptionsSchemaEnsured = true;
}

// ── Check-In schema guard ───────────────────────────────────────────────────────
let checkinsSchemaEnsured = false;

export async function ensureCheckinsSchema() {
    if (checkinsSchemaEnsured) return;

    // Pre-check-ins table
    const preInfo = await client.execute("PRAGMA table_info('pre_checkins')");
    if (preInfo.rows.length === 0) {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS pre_checkins (
                id TEXT PRIMARY KEY NOT NULL,
                appointment_id TEXT NOT NULL,
                patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                token_expires_at INTEGER NOT NULL,
                is_submitted INTEGER DEFAULT 0,
                submitted_at INTEGER,
                answers TEXT,
                created_at INTEGER
            )
        `);
    }

    // Post-check-ins table
    const postInfo = await client.execute("PRAGMA table_info('post_checkins')");
    if (postInfo.rows.length === 0) {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS post_checkins (
                id TEXT PRIMARY KEY NOT NULL,
                appointment_id TEXT NOT NULL,
                patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                token_expires_at INTEGER NOT NULL,
                is_submitted INTEGER DEFAULT 0,
                submitted_at INTEGER,
                answers TEXT,
                email_sent_at INTEGER,
                created_at INTEGER
            )
        `);
    }

    checkinsSchemaEnsured = true;
}

// ── Diabetes Records schema guard ───────────────────────────────────────────
let diabetesSchemaEnsured = false;

export async function ensureDiabetesSchema() {
    if (diabetesSchemaEnsured) return;

    const tableInfo = await client.execute("PRAGMA table_info('diabetes_records')");
    if (tableInfo.rows.length === 0) {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS diabetes_records (
                id TEXT PRIMARY KEY NOT NULL,
                patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
                hba1c TEXT NOT NULL,
                fasting_glucose TEXT,
                post_prandial_glucose TEXT,
                insulin_dosage TEXT,
                glycemic_variability TEXT,
                retinopathy_status TEXT DEFAULT 'Clear',
                nephropathy_status TEXT DEFAULT 'Normal',
                neuropathy_status TEXT DEFAULT 'None',
                notes TEXT,
                test_date TEXT NOT NULL,
                recorded_at INTEGER
            )
        `);
    }

    diabetesSchemaEnsured = true;
}
