// Massha Hospital Sandbox Seeder
// Run with: node scripts/seed-massha-sandbox.mjs
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config(); // Reads from .env — no hardcoded credentials

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const PASSWORD = process.env.MASSHA_SEED_PASSWORD || "NiraivaMassha@2026";

const usersToSeed = [
  {
    email: "ananya.rao@niraiva.health",
    name: "Dr. Ananya Rao",
    role: "doctor",
    customId: "MASSHA-DOC-001",
    isOnboarded: 1,
  },
  {
    email: "kavitha.sivakumar@niraiva.health",
    name: "Mrs. Kavitha Sivakumar",
    role: "patient",
    customId: "MASSHA-PAT-001",
    isOnboarded: 1,
  },
  {
    email: "hakkim@niraiva.health",
    name: "Mr. Hakkim",
    role: "patient",
    customId: "MASSHA-PAT-002",
    isOnboarded: 1,
  },
];

async function upsertUser(user, hashedPassword) {
  const existing = await client.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [user.email],
  });

  if (existing.rows.length > 0) {
    await client.execute({
      sql: "UPDATE users SET name = ?, password = ?, role = ?, is_onboarded = ?, custom_id = ? WHERE email = ?",
      args: [user.name, hashedPassword, user.role, user.isOnboarded, user.customId, user.email],
    });
    console.log(`✅ Updated: ${user.email}`);
    return existing.rows[0].id;
  } else {
    const id = randomUUID();
    await client.execute({
      sql: `INSERT INTO users (id, name, email, password, role, is_onboarded, custom_id, is_banned)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      args: [id, user.name, user.email, hashedPassword, user.role, user.isOnboarded, user.customId],
    });
    console.log(`✅ Created: ${user.email} (${user.role})`);
    return id;
  }
}

async function ensureDoctorProfile(userId) {
  const existing = await client.execute({
    sql: "SELECT id FROM doctors WHERE user_id = ?",
    args: [userId],
  });

  if (existing.rows.length > 0) {
    console.log(`✅ Doctor profile already exists for Dr. Ananya Rao`);
    return existing.rows[0].id;
  }

  const doctorId = randomUUID();
  await client.execute({
    sql: `INSERT INTO doctors (id, user_id, specialization, license_number, approval_status)
          VALUES (?, ?, ?, ?, ?)`,
    args: [doctorId, userId, "Oncology", "MASSHA-LIC-001", "approved"],
  });
  console.log(`✅ Created doctor profile for Dr. Ananya Rao`);
  return doctorId;
}

async function ensurePatientProfile(userId, name) {
  const existing = await client.execute({
    sql: "SELECT id FROM patients WHERE user_id = ?",
    args: [userId],
  });

  if (existing.rows.length > 0) {
    console.log(`✅ Patient profile already exists for: ${name}`);
    return existing.rows[0].id;
  }

  const patientId = randomUUID();
  await client.execute({
    sql: `INSERT INTO patients (id, user_id) VALUES (?, ?)`,
    args: [patientId, userId],
  });
  console.log(`✅ Created patient profile for: ${name}`);
  return patientId;
}

async function ensureDoctorPatientRelation(doctorId, patientId, patientName) {
  const existing = await client.execute({
    sql: "SELECT id FROM doctor_patient_relations WHERE doctor_id = ? AND patient_id = ?",
    args: [doctorId, patientId],
  });

  if (existing.rows.length > 0) {
    console.log(`✅ Relation already exists: Dr. Ananya ↔ ${patientName}`);
    return;
  }

  const relationId = randomUUID();
  await client.execute({
    sql: `INSERT INTO doctor_patient_relations (id, doctor_id, patient_id) VALUES (?, ?, ?)`,
    args: [relationId, doctorId, patientId],
  });
  console.log(`✅ Linked: Dr. Ananya Rao ↔ ${patientName}`);
}

async function seed() {
  console.log("🏥 Massha Hospital Sandbox — Seeding accounts...\n");
  console.log(`📡 Database: ${process.env.TURSO_DATABASE_URL}\n`);

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const userIds = {};

  // Step 1: Upsert all users
  for (const user of usersToSeed) {
    userIds[user.email] = await upsertUser(user, hashedPassword);
  }

  // Step 2: Create doctor profile for Dr. Ananya
  const doctorId = await ensureDoctorProfile(userIds["ananya.rao@niraiva.health"]);

  // Step 3: Create patient profiles
  const kavithaPatientId = await ensurePatientProfile(
    userIds["kavitha.sivakumar@niraiva.health"],
    "Mrs. Kavitha Sivakumar"
  );
  const hakkimPatientId = await ensurePatientProfile(
    userIds["hakkim@niraiva.health"],
    "Mr. Hakkim"
  );

  // Step 4: Link both patients to Dr. Ananya (so they appear in her dashboard)
  await ensureDoctorPatientRelation(doctorId, kavithaPatientId, "Mrs. Kavitha Sivakumar");
  await ensureDoctorPatientRelation(doctorId, hakkimPatientId, "Mr. Hakkim");

  console.log("\n🎉 Massha sandbox seeding complete!\n");
  console.log("Login Credentials:");
  console.log("─────────────────────────────────────────");
  console.log("  Doctor  : ananya.rao@niraiva.health");
  console.log("  Patient : kavitha.sivakumar@niraiva.health");
  console.log("  Patient : hakkim@niraiva.health");
  console.log("  Password: NiraivaDemo@2026");
  console.log("─────────────────────────────────────────");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
