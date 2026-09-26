// Massha — Account Update Script
// 1. Updates all 3 account passwords to NiraivaMassha@2026
// 2. Replaces "Niraiva" clinic branding → "Massha" in diagnostic + timeline text
// Run with: node scripts/update-massha-accounts.mjs

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config();

const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
for (const key of required) {
  if (!process.env[key]) { console.error(`❌ Missing env var: ${key}`); process.exit(1); }
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const NEW_PASSWORD = process.env.MASSHA_SEED_PASSWORD || "NiraivaMassha@2026";

// Branding replacements — old → new (no hardcoded IDs, only clinic/brand names)
const BRAND_REPLACEMENTS = [
  { from: "Niraiva OnCoTrack Clinic", to: "Massha OnCoTrack Clinic" },
  { from: "Niraiva OnCoTrack", to: "Massha OnCoTrack" },
  { from: "Niraiva Health", to: "Massha Health" },
];

const ACCOUNTS = [
  "ananya.rao@niraiva.health",
  "kavitha.sivakumar@niraiva.health",
  "hakkim@niraiva.health",
];

function applyBrandReplacements(text) {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const { from, to } of BRAND_REPLACEMENTS) {
    result = result.split(from).join(to);
  }
  return result;
}

async function updatePasswords() {
  console.log("🔑 Updating passwords to NiraivaMassha@2026...\n");
  const hashed = await bcrypt.hash(NEW_PASSWORD, 10);

  for (const email of ACCOUNTS) {
    const res = await db.execute({
      sql: "UPDATE users SET password = ? WHERE email = ?",
      args: [hashed, email],
    });
    console.log(`  ✅ Password updated: ${email}`);
  }
}

async function fixBranding() {
  console.log("\n🏥 Fixing clinic branding in diagnostic records...\n");

  // Get all patient IDs for our accounts
  const patients = await db.execute({
    sql: `SELECT p.id as patient_id, u.email, u.id as user_id
          FROM patients p
          JOIN users u ON p.user_id = u.id
          WHERE u.email IN (${ACCOUNTS.map(() => "?").join(",")})`,
    args: ACCOUNTS,
  });

  for (const row of patients.rows) {
    console.log(`  👤 ${row.email}`);

    // Fix patient_diagnostics
    const diags = await db.execute({
      sql: "SELECT id, clinical_notes, treatment_plan, nodes FROM patient_diagnostics WHERE patient_id = ?",
      args: [row.patient_id],
    });

    for (const d of diags.rows) {
      const newNotes = applyBrandReplacements(d.clinical_notes);
      const newPlan = applyBrandReplacements(d.treatment_plan);
      const nodesStr = typeof d.nodes === "string" ? d.nodes : JSON.stringify(d.nodes ?? []);
      const newNodes = applyBrandReplacements(nodesStr);

      const changed =
        newNotes !== d.clinical_notes ||
        newPlan !== d.treatment_plan ||
        newNodes !== nodesStr;

      if (changed) {
        await db.execute({
          sql: "UPDATE patient_diagnostics SET clinical_notes = ?, treatment_plan = ?, nodes = ? WHERE id = ?",
          args: [newNotes || null, newPlan || null, newNodes, d.id],
        });
        console.log(`    ✅ Fixed diagnostic branding`);
      } else {
        console.log(`    ⏭  No branding changes in diagnostics`);
      }
    }

    // Fix timeline_events (title + description)
    const events = await db.execute({
      sql: "SELECT id, title, description FROM timeline_events WHERE user_id = ?",
      args: [row.user_id],
    });

    let eventFixed = 0;
    for (const e of events.rows) {
      const newTitle = applyBrandReplacements(e.title);
      const newDesc = applyBrandReplacements(e.description);
      if (newTitle !== e.title || newDesc !== e.description) {
        await db.execute({
          sql: "UPDATE timeline_events SET title = ?, description = ? WHERE id = ?",
          args: [newTitle, newDesc || null, e.id],
        });
        eventFixed++;
      }
    }
    if (eventFixed > 0) {
      console.log(`    ✅ Fixed ${eventFixed} timeline event(s) branding`);
    } else {
      console.log(`    ⏭  No branding changes in timeline events`);
    }

    // Fix patient_conditions
    const conditions = await db.execute({
      sql: "SELECT id, condition_name FROM patient_conditions WHERE patient_id = ?",
      args: [row.patient_id],
    });

    for (const c of conditions.rows) {
      const newName = applyBrandReplacements(c.condition_name);
      if (newName !== c.condition_name) {
        await db.execute({
          sql: "UPDATE patient_conditions SET condition_name = ? WHERE id = ?",
          args: [newName, c.id],
        });
        console.log(`    ✅ Fixed condition branding: ${c.condition_name}`);
      }
    }
  }
}

async function run() {
  console.log("🏥 Massha — Account & Branding Update\n");
  console.log(`📡 Database: ${process.env.TURSO_DATABASE_URL}\n`);

  await updatePasswords();
  await fixBranding();

  console.log("\n🎉 Done!\n");
  console.log("Updated credentials:");
  console.log("─────────────────────────────────────────");
  for (const email of ACCOUNTS) {
    console.log(`  ${email}`);
  }
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log("─────────────────────────────────────────");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
