// Massha Hospital — Data Migration Script
// Copies all data for 3 sandbox accounts from OLD Niraiva DB → NEW Massha DB
// Run with: node scripts/migrate-massha-sandbox.mjs
// No hardcoded values — all credentials read from .env

import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config();

// ── Validate env vars ──────────────────────────────────────────────────────────
const required = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "OLD_TURSO_DATABASE_URL",
  "OLD_TURSO_AUTH_TOKEN",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
}

// ── DB Connections ─────────────────────────────────────────────────────────────
const oldDb = createClient({
  url: process.env.OLD_TURSO_DATABASE_URL,
  authToken: process.env.OLD_TURSO_AUTH_TOKEN,
});

const newDb = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ── Accounts to migrate ────────────────────────────────────────────────────────
const ACCOUNTS = [
  { email: "ananya.rao@niraiva.health", role: "doctor" },
  { email: "kavitha.sivakumar@niraiva.health", role: "patient" },
  { email: "hakkim@niraiva.health", role: "patient" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
async function fetchOne(db, sql, args = []) {
  const res = await db.execute({ sql, args });
  return res.rows[0] || null;
}

async function fetchAll(db, sql, args = []) {
  const res = await db.execute({ sql, args });
  return res.rows;
}

// Sanitize values before passing to libsql — converts undefined → null, objects → JSON string
function safe(val) {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "object") return JSON.stringify(val);
  return val;
}

// Sanitize an entire args array
function safeArgs(args) {
  return args.map(safe);
}

async function insertIfNotExists(db, table, checkSql, checkArgs, insertSql, insertArgs, label) {
  const existing = await fetchOne(db, checkSql, checkArgs);
  if (existing) {
    console.log(`   ⏭  Already exists: ${label}`);
    return existing.id;
  }
  await db.execute({ sql: insertSql, args: safeArgs(insertArgs) });
  console.log(`   ✅ Migrated: ${label}`);
  return insertArgs[0]; // first arg is always the new ID
}

// ── Migration per table ────────────────────────────────────────────────────────

async function migrateMedications(oldPatientId, newPatientId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM medications WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  💊 Medications: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "medications",
      "SELECT id FROM medications WHERE patient_id = ? AND name = ? AND start_date = ?",
      [newPatientId, r.name, r.start_date],
      `INSERT INTO medications (id, patient_id, name, dosage, purpose, start_date, frequency, duration_days, status, added_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, r.name, r.dosage, r.purpose, r.start_date, r.frequency, r.duration_days, r.status, r.added_by, r.created_at],
      `Medication: ${r.name}`
    );
  }
}

async function migrateLabReports(oldPatientId, newPatientId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM lab_reports WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  🧪 Lab Reports: ${rows.length} found`);
  const idMap = {}; // old report ID → new report ID
  for (const r of rows) {
    const newId = randomUUID();
    const created = await insertIfNotExists(
      newDb,
      "lab_reports",
      "SELECT id FROM lab_reports WHERE patient_id = ? AND file_name = ? AND report_date = ?",
      [newPatientId, r.file_name, r.report_date],
      `INSERT INTO lab_reports (id, patient_id, file_name, report_date, lab_name, patient_name, doctor_name, extracted_data, raw_text, analysis, file_size, page_count, cloudinary_url, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, r.file_name, r.report_date, r.lab_name, r.patient_name, r.doctor_name,
       typeof r.extracted_data === "string" ? r.extracted_data : JSON.stringify(r.extracted_data),
       r.raw_text, r.analysis, r.file_size, r.page_count, r.cloudinary_url, r.uploaded_at],
      `Lab Report: ${r.file_name}`
    );
    idMap[r.id] = created || newId;
  }
  return idMap;
}

async function migrateHealthParameters(oldPatientId, newPatientId, reportIdMap) {
  const rows = await fetchAll(oldDb, "SELECT * FROM health_parameters WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  📊 Health Parameters: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    const newReportId = reportIdMap[r.lab_report_id] || null;
    await insertIfNotExists(
      newDb,
      "health_parameters",
      "SELECT id FROM health_parameters WHERE patient_id = ? AND parameter_name = ? AND test_date = ?",
      [newPatientId, r.parameter_name, r.test_date],
      `INSERT INTO health_parameters (id, patient_id, lab_report_id, parameter_name, value, unit, reference_range, status, test_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, newReportId, r.parameter_name, r.value, r.unit, r.reference_range, r.status, r.test_date, r.created_at],
      `Param: ${r.parameter_name} (${r.test_date})`
    );
  }
}

async function migrateConditions(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM patient_conditions WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  🩺 Conditions: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "patient_conditions",
      "SELECT id FROM patient_conditions WHERE patient_id = ? AND condition_name = ?",
      [newPatientId, r.condition_name],
      `INSERT INTO patient_conditions (id, patient_id, condition_name, diagnosed_date, status, added_by, doctor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, r.condition_name, r.diagnosed_date, r.status, r.added_by, newDoctorId, r.created_at],
      `Condition: ${r.condition_name}`
    );
  }
}

async function migrateAllergies(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM patient_allergies WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  ⚠️  Allergies: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "patient_allergies",
      "SELECT id FROM patient_allergies WHERE patient_id = ? AND allergen = ?",
      [newPatientId, r.allergen],
      `INSERT INTO patient_allergies (id, patient_id, allergen, severity, reaction, status, added_by, doctor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, r.allergen, r.severity, r.reaction, r.status, r.added_by, newDoctorId, r.created_at],
      `Allergy: ${r.allergen}`
    );
  }
}

async function migrateDiagnostics(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM patient_diagnostics WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  🧠 Diagnostics: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "patient_diagnostics",
      "SELECT id FROM patient_diagnostics WHERE patient_id = ? AND condition_name = ?",
      [newPatientId, r.condition_name],
      `INSERT INTO patient_diagnostics (id, patient_id, doctor_id, condition_name, condition_status, nodes, clinical_notes, treatment_plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, newDoctorId, r.condition_name, r.condition_status,
       typeof r.nodes === "string" ? r.nodes : JSON.stringify(r.nodes ?? []),
       r.clinical_notes, r.treatment_plan, r.created_at, r.updated_at],
      `Diagnostic: ${r.condition_name}`
    );
  }
}

async function migrateTimeline(oldUserId, newUserId, newDoctorId, reportIdMap) {
  const rows = await fetchAll(oldDb, "SELECT * FROM timeline_events WHERE user_id = ?", [oldUserId]);
  console.log(`\n  📅 Timeline Events: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    const newReportId = r.report_id ? (reportIdMap[r.report_id] || null) : null;
    await insertIfNotExists(
      newDb,
      "timeline_events",
      "SELECT id FROM timeline_events WHERE user_id = ? AND title = ? AND event_date = ?",
      [newUserId, r.title, r.event_date],
      `INSERT INTO timeline_events (id, user_id, title, description, event_date, event_type, status, report_id, doctor_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newUserId, r.title, r.description, r.event_date, r.event_type, r.status, newReportId, newDoctorId, r.created_by, r.created_at],
      `Event: ${r.title} (${r.event_date})`
    );
  }
}

async function migrateVitals(oldPatientId, newPatientId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM patient_vitals WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  💓 Vitals: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "patient_vitals",
      "SELECT id FROM patient_vitals WHERE patient_id = ? AND recorded_at = ?",
      [newPatientId, r.recorded_at],
      `INSERT INTO patient_vitals (id, patient_id, blood_pressure, temperature, weight, height, pulse_rate, spo2, recorded_by, notes, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, r.blood_pressure, r.temperature, r.weight, r.height, r.pulse_rate, r.spo2, r.recorded_by, r.notes, r.recorded_at],
      `Vitals @ ${r.recorded_at}`
    );
  }
}

async function migrateLabOrders(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM lab_orders WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  🔬 Lab Orders: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "lab_orders",
      "SELECT id FROM lab_orders WHERE patient_id = ? AND name = ? AND ordered_date = ?",
      [newPatientId, r.name, r.ordered_date],
      `INSERT INTO lab_orders (id, patient_id, doctor_id, doctor_name, name, type, notes, is_paid, paid_at, paid_by, ordered_at, ordered_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, newDoctorId, r.doctor_name, r.name, r.type, r.notes, r.is_paid, r.paid_at, r.paid_by, r.ordered_at, r.ordered_date],
      `Lab Order: ${r.name}`
    );
  }
}

async function migratePrescriptions(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM prescriptions WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  📋 Prescriptions: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "prescriptions",
      "SELECT id FROM prescriptions WHERE patient_id = ? AND prescribed_at = ?",
      [newPatientId, r.prescribed_at],
      `INSERT INTO prescriptions (id, patient_id, doctor_id, consultation_data, cloudinary_url, prescribed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, newDoctorId,
       typeof r.consultation_data === "string" ? r.consultation_data : JSON.stringify(r.consultation_data),
       r.cloudinary_url, r.prescribed_at],
      `Prescription @ ${r.prescribed_at}`
    );
  }
}

async function migratePrivateNotes(oldDoctorId, newDoctorId, oldPatientId, newPatientId) {
  const rows = await fetchAll(
    oldDb,
    "SELECT * FROM doctor_private_notes WHERE doctor_id = ? AND patient_id = ?",
    [oldDoctorId, oldPatientId]
  );
  console.log(`\n  📝 Private Notes: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "doctor_private_notes",
      "SELECT id FROM doctor_private_notes WHERE doctor_id = ? AND patient_id = ? AND created_at = ?",
      [newDoctorId, newPatientId, r.created_at],
      `INSERT INTO doctor_private_notes (id, doctor_id, patient_id, note_content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId, newDoctorId, newPatientId, r.note_content, r.created_at, r.updated_at],
      `Note @ ${r.created_at}`
    );
  }
}

async function migrateDiabetesRecords(oldPatientId, newPatientId, newDoctorId) {
  const rows = await fetchAll(oldDb, "SELECT * FROM diabetes_records WHERE patient_id = ?", [oldPatientId]);
  console.log(`\n  🩸 Diabetes Records: ${rows.length} found`);
  for (const r of rows) {
    const newId = randomUUID();
    await insertIfNotExists(
      newDb,
      "diabetes_records",
      "SELECT id FROM diabetes_records WHERE patient_id = ? AND test_date = ?",
      [newPatientId, r.test_date],
      `INSERT INTO diabetes_records (id, patient_id, doctor_id, hba1c, fasting_glucose, post_prandial_glucose, insulin_dosage, glycemic_variability, retinopathy_status, nephropathy_status, neuropathy_status, notes, test_date, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, newPatientId, newDoctorId, r.hba1c, r.fasting_glucose, r.post_prandial_glucose,
       r.insulin_dosage, r.glycemic_variability, r.retinopathy_status, r.nephropathy_status,
       r.neuropathy_status, r.notes, r.test_date, r.recorded_at],
      `Diabetes Record: ${r.test_date}`
    );
  }
}

// ── Main Migration ─────────────────────────────────────────────────────────────
async function migrate() {
  console.log("🏥 Massha Hospital — Data Migration");
  console.log(`📡 Source: ${process.env.OLD_TURSO_DATABASE_URL}`);
  console.log(`📡 Target: ${process.env.TURSO_DATABASE_URL}\n`);

  // Step 1: Resolve old & new IDs for doctor
  const oldDoctorUser = await fetchOne(oldDb, "SELECT id FROM users WHERE email = ?", ["ananya.rao@niraiva.health"]);
  const newDoctorUser = await fetchOne(newDb, "SELECT id FROM users WHERE email = ?", ["ananya.rao@niraiva.health"]);

  if (!oldDoctorUser) { console.log("⚠️  Dr. Ananya not found in old DB — skipping doctor-specific links"); }
  if (!newDoctorUser) { console.error("❌ Dr. Ananya not found in new DB — run seed script first"); process.exit(1); }

  let oldDoctorId = null;
  let newDoctorId = null;

  if (oldDoctorUser) {
    const oldDoc = await fetchOne(oldDb, "SELECT id FROM doctors WHERE user_id = ?", [oldDoctorUser.id]);
    oldDoctorId = oldDoc?.id || null;
  }
  const newDoc = await fetchOne(newDb, "SELECT id FROM doctors WHERE user_id = ?", [newDoctorUser.id]);
  newDoctorId = newDoc?.id || null;

  // Step 2: Migrate each patient
  for (const account of ACCOUNTS.filter(a => a.role === "patient")) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`👤 Migrating patient: ${account.email}`);
    console.log("─".repeat(60));

    const oldUser = await fetchOne(oldDb, "SELECT id FROM users WHERE email = ?", [account.email]);
    const newUser = await fetchOne(newDb, "SELECT id FROM users WHERE email = ?", [account.email]);

    if (!oldUser) {
      console.log(`⚠️  ${account.email} not found in old DB — skipping`);
      continue;
    }
    if (!newUser) {
      console.log(`❌ ${account.email} not found in new DB — run seed script first`);
      continue;
    }

    const oldPatientRow = await fetchOne(oldDb, "SELECT id FROM patients WHERE user_id = ?", [oldUser.id]);
    const newPatientRow = await fetchOne(newDb, "SELECT id FROM patients WHERE user_id = ?", [newUser.id]);

    if (!oldPatientRow) {
      console.log(`⚠️  No patient profile in old DB for ${account.email} — skipping`);
      continue;
    }
    if (!newPatientRow) {
      console.log(`❌ No patient profile in new DB for ${account.email} — run seed script first`);
      continue;
    }

    const oldPatientId = oldPatientRow.id;
    const newPatientId = newPatientRow.id;

    // Copy patient profile fields (dob, gender, phone, etc.)
    await newDb.execute({
      sql: `UPDATE patients SET
              dob = ?, age = ?, gender = ?, phone_number = ?, address = ?,
              city = ?, marital_status = ?, emergency_contact_name = ?,
              emergency_contact_phone = ?, guardian_name = ?, guardian_relation = ?,
              blood_group = ?, height = ?, weight = ?, allergies = ?,
              current_medications = ?, past_surgeries = ?, chronic_conditions = ?,
              lifestyle = ?, medical_history = ?
            WHERE id = ?`,
      args: safeArgs([
        oldPatientRow.dob, oldPatientRow.age, oldPatientRow.gender, oldPatientRow.phone_number,
        oldPatientRow.address, oldPatientRow.city, oldPatientRow.marital_status,
        oldPatientRow.emergency_contact_name, oldPatientRow.emergency_contact_phone,
        oldPatientRow.guardian_name, oldPatientRow.guardian_relation, oldPatientRow.blood_group,
        oldPatientRow.height, oldPatientRow.weight, oldPatientRow.allergies,
        oldPatientRow.current_medications, oldPatientRow.past_surgeries,
        oldPatientRow.chronic_conditions, oldPatientRow.lifestyle, oldPatientRow.medical_history,
        newPatientId,
      ]),
    });
    console.log(`  ✅ Patient profile fields synced`);

    // Run all data migrations
    await migrateMedications(oldPatientId, newPatientId);
    const reportIdMap = await migrateLabReports(oldPatientId, newPatientId);
    await migrateHealthParameters(oldPatientId, newPatientId, reportIdMap);
    await migrateConditions(oldPatientId, newPatientId, newDoctorId);
    await migrateAllergies(oldPatientId, newPatientId, newDoctorId);
    await migrateDiagnostics(oldPatientId, newPatientId, newDoctorId);
    await migrateTimeline(oldUser.id, newUser.id, newDoctorId, reportIdMap);
    await migrateVitals(oldPatientId, newPatientId);
    await migrateLabOrders(oldPatientId, newPatientId, newDoctorId);
    await migratePrescriptions(oldPatientId, newPatientId, newDoctorId);
    await migrateDiabetesRecords(oldPatientId, newPatientId, newDoctorId);

    if (oldDoctorId && newDoctorId) {
      await migratePrivateNotes(oldDoctorId, newDoctorId, oldPatientId, newPatientId);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("🎉 Migration complete! All data copied to Massha sandbox.");
  console.log("─".repeat(60));
  process.exit(0);
}

migrate().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  console.error(err);
  process.exit(1);
});
