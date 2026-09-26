// Massha Sandbox — Diagnostic Text Cleanup Script
// Dynamically replaces old patient IDs and old clinic references in diagnostic records
// Reads all IDs from DB — no hardcoded values
// Run with: node scripts/fix-massha-diagnostic-text.mjs

import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "OLD_TURSO_DATABASE_URL", "OLD_TURSO_AUTH_TOKEN"];
for (const key of required) {
  if (!process.env[key]) { console.error(`❌ Missing env var: ${key}`); process.exit(1); }
}

const oldDb = createClient({ url: process.env.OLD_TURSO_DATABASE_URL, authToken: process.env.OLD_TURSO_AUTH_TOKEN });
const newDb = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Emails to process
const PATIENT_EMAILS = [
  "kavitha.sivakumar@niraiva.health",
  "hakkim@niraiva.health",
];

async function fixDiagnosticText() {
  console.log("🔧 Massha — Diagnostic Text Cleanup\n");

  // Build a map: oldCustomId → newCustomId for each patient
  const idReplacements = []; // { oldId, newId, email }

  for (const email of PATIENT_EMAILS) {
    const oldUser = await oldDb.execute({ sql: "SELECT custom_id FROM users WHERE email = ?", args: [email] });
    const newUser = await newDb.execute({ sql: "SELECT custom_id FROM users WHERE email = ?", args: [email] });

    const oldCustomId = oldUser.rows[0]?.custom_id;
    const newCustomId = newUser.rows[0]?.custom_id;

    if (oldCustomId && newCustomId && oldCustomId !== newCustomId) {
      idReplacements.push({ oldId: oldCustomId, newId: newCustomId, email });
      console.log(`📋 ${email}: ${oldCustomId} → ${newCustomId}`);
    } else {
      console.log(`⏭  ${email}: IDs match or not found (${oldCustomId} / ${newCustomId})`);
    }
  }

  // Also get the doctor name dynamically from new DB
  const drRes = await newDb.execute({ sql: "SELECT name FROM users WHERE email = ?", args: ["ananya.rao@niraiva.health"] });
  const doctorName = drRes.rows[0]?.name || "Dr. Ananya Rao";

  console.log(`\n🏥 Doctor: ${doctorName}`);
  console.log(`🔁 ID Replacements to apply: ${idReplacements.length}`);

  // Fetch all diagnostic records for migrated patients from new DB
  const patientsRes = await newDb.execute({
    sql: `SELECT p.id as patient_id, u.email, u.name as patient_name
          FROM patients p
          JOIN users u ON p.user_id = u.id
          WHERE u.email IN (${PATIENT_EMAILS.map(() => "?").join(",")})`,
    args: PATIENT_EMAILS,
  });

  for (const patientRow of patientsRes.rows) {
    console.log(`\n📄 Processing diagnostics for: ${patientRow.patient_name} (${patientRow.email})`);

    const diagRes = await newDb.execute({
      sql: "SELECT id, condition_name, clinical_notes, treatment_plan FROM patient_diagnostics WHERE patient_id = ?",
      args: [patientRow.patient_id],
    });

    if (diagRes.rows.length === 0) {
      console.log(`   ⏭  No diagnostics found`);
      continue;
    }

    for (const diag of diagRes.rows) {
      let clinicalNotes = diag.clinical_notes || "";
      let treatmentPlan = diag.treatment_plan || "";
      let changed = false;

      // Replace all old patient IDs with new ones dynamically
      for (const { oldId, newId } of idReplacements) {
        if (clinicalNotes.includes(oldId)) {
          clinicalNotes = clinicalNotes.split(oldId).join(newId);
          changed = true;
        }
        if (treatmentPlan.includes(oldId)) {
          treatmentPlan = treatmentPlan.split(oldId).join(newId);
          changed = true;
        }
      }

      if (changed) {
        await newDb.execute({
          sql: "UPDATE patient_diagnostics SET clinical_notes = ?, treatment_plan = ? WHERE id = ?",
          args: [clinicalNotes || null, treatmentPlan || null, diag.id],
        });
        console.log(`   ✅ Updated: ${diag.condition_name}`);
      } else {
        console.log(`   ⏭  No changes needed: ${diag.condition_name}`);
      }
    }
  }

  // Also fix nodes JSON field — replace old IDs inside node labels if any
  console.log("\n🔁 Checking nodes JSON for old ID references...");
  for (const patientRow of patientsRes.rows) {
    const diagRes = await newDb.execute({
      sql: "SELECT id, condition_name, nodes FROM patient_diagnostics WHERE patient_id = ?",
      args: [patientRow.patient_id],
    });
    for (const diag of diagRes.rows) {
      let nodesStr = typeof diag.nodes === "string" ? diag.nodes : JSON.stringify(diag.nodes ?? []);
      let changed = false;
      for (const { oldId, newId } of idReplacements) {
        if (nodesStr.includes(oldId)) {
          nodesStr = nodesStr.split(oldId).join(newId);
          changed = true;
        }
      }
      if (changed) {
        await newDb.execute({
          sql: "UPDATE patient_diagnostics SET nodes = ? WHERE id = ?",
          args: [nodesStr, diag.id],
        });
        console.log(`   ✅ Fixed nodes for: ${diag.condition_name}`);
      }
    }
  }

  console.log("\n🎉 Cleanup complete! All diagnostic text updated with correct Massha IDs.");
  process.exit(0);
}

fixDiagnosticText().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
