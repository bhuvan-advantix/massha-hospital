// Massha — Upload HAKEM.pdf Lab Report for Mr. Hakkim
// Uploads PDF to Cloudinary (new Massha account) + extracts data via LlamaParse + Mistral AI
// Run with: node scripts/upload-hakem-report.mjs

import { createClient } from "@libsql/client";
import { v2 as cloudinary } from "cloudinary";
import { LlamaParse } from "llama-parse";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Validate env vars ──────────────────────────────────────────────────────────
const required = [
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "LLAMA_PARSE_API_KEY", "MISTRAL_API_KEY",
];
for (const key of required) {
  if (!process.env[key]) { console.error(`❌ Missing env var: ${key}`); process.exit(1); }
}

// ── Configure connections (all from env) ──────────────────────────────────────
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PDF_PATH = path.resolve(__dirname, "../usecase/HAKEM.pdf");
const PATIENT_EMAIL = "hakkim@niraiva.health";

// ── Step 1: Read PDF ──────────────────────────────────────────────────────────
async function readPdf() {
  console.log(`📄 Reading PDF: ${PDF_PATH}`);
  const buffer = readFileSync(PDF_PATH);
  console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`);
  return buffer;
}

// ── Step 2: Upload to Cloudinary ──────────────────────────────────────────────
async function uploadToCloudinary(pdfPath, patientId) {
  console.log(`\n☁️  Uploading to Cloudinary (${process.env.CLOUDINARY_CLOUD_NAME})...`);
  const result = await cloudinary.uploader.upload(pdfPath, {
    resource_type: "raw",
    folder: `lab-reports/${patientId}`,
    public_id: `${Date.now()}-HAKEM-Lab-Report`,
    format: "pdf",
  });

  console.log(`   ✅ Uploaded: ${result.secure_url}`);
  return result.secure_url;
}

// ── Step 3: Extract data with LlamaParse + local markdown parser ───────────────
async function extractWithAI(buffer) {
  console.log("\n🤖 Extracting with LlamaParse...");
  const parser = new LlamaParse({ apiKey: process.env.LLAMA_PARSE_API_KEY });
  const uint8Array = new Uint8Array(buffer);
  const file = new File([uint8Array], "HAKEM.pdf", { type: "application/pdf" });
  const result = await parser.parseFile(file);
  const rawMarkdown = result.markdown;
  console.log(`   ✅ Parsed, length: ${rawMarkdown.length} chars`);

  console.log("\n📊 Parsing markdown tables locally...");

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function extractField(md, ...labels) {
    for (const label of labels) {
      const rx = new RegExp(`(?:${label})[:\\s]+([^\\n|,]+)`, "i");
      const m = md.match(rx);
      if (m) return m[1].trim();
    }
    return null;
  }

  function determineStatus(valueStr, refStr) {
    try {
      const numVal = parseFloat(valueStr.replace(/[<>≤≥]/g, ""));
      if (isNaN(numVal)) return null;
      const refRange = refStr?.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
      if (!refRange) return null;
      const low = parseFloat(refRange[1]);
      const high = parseFloat(refRange[2]);
      if (numVal < low) return "low";
      if (numVal > high) return "high";
      return "normal";
    } catch {
      return null;
    }
  }

  function parseMarkdownTables(md) {
    const lines = md.split("\n");
    const categories = [];
    let currentCategory = null;
    let headers = [];
    let colIdxName = -1, colIdxValue = -1, colIdxUnit = -1, colIdxRef = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Section header (# or ## or bold text not a table row)
      if (!line.startsWith("|") && line.length > 0 && !line.match(/^[-=]+$/)) {
        const heading = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
        if (heading.length > 2 && heading.length < 120 && !heading.includes(":") && !heading.match(/^\d/)) {
          currentCategory = { category: heading, tests: [] };
          categories.push(currentCategory);
          headers = [];
          colIdxName = -1; colIdxValue = -1; colIdxUnit = -1; colIdxRef = -1;
        }
        continue;
      }

      // Table header row
      if (line.startsWith("|") && lines[i + 1]?.trim().match(/^\|[-| ]+\|$/)) {
        headers = line.split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
        colIdxName = headers.findIndex(h => h.includes("test") || h.includes("analyte") || h.includes("parameter") || h.includes("investigation") || h === "name");
        colIdxValue = headers.findIndex(h => h.includes("result") || h.includes("value") || h.includes("observed"));
        colIdxUnit = headers.findIndex(h => h.includes("unit"));
        colIdxRef = headers.findIndex(h => h.includes("ref") || h.includes("range") || h.includes("normal"));
        i++; // skip separator row
        if (!currentCategory) {
          currentCategory = { category: "General", tests: [] };
          categories.push(currentCategory);
        }
        continue;
      }

      // Table data row
      if (line.startsWith("|") && colIdxName >= 0) {
        const cells = line.split("|").map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length);
        const name = cells[colIdxName] || "";
        const value = colIdxValue >= 0 ? (cells[colIdxValue] || "") : "";
        const unit = colIdxUnit >= 0 ? (cells[colIdxUnit] || "") : "";
        const refRange = colIdxRef >= 0 ? (cells[colIdxRef] || "") : "";

        if (name && value && !name.match(/^[-–=*]+$/) && name.length > 1) {
          const status = determineStatus(value, refRange);
          currentCategory?.tests.push({
            name: name.replace(/\*\*/g, ""),
            value: value.replace(/\*\*/g, ""),
            unit: unit.replace(/\*\*/g, ""),
            referenceRange: refRange.replace(/\*\*/g, "") || undefined,
            status: status ?? "normal",
          });
        }
      }
    }

    return categories.filter(c => c.tests.length > 0);
  }

  // Extract header fields
  const patientName = extractField(rawMarkdown, "Patient Name", "Patient", "Name");
  const doctorName = extractField(rawMarkdown, "Ref\\. By", "Referred By", "Doctor", "Dr\\.");
  const labName = extractField(rawMarkdown, "Lab Name", "Laboratory", "Diagnostic");
  const reportDate = extractField(rawMarkdown, "Report Date", "Reported On", "Date");

  // Parse all tables
  const testResults = parseMarkdownTables(rawMarkdown);
  console.log(`   ✅ Extracted — ${testResults.length} categories, ${testResults.reduce((s, c) => s + c.tests.length, 0)} tests`);

  // Build metadata from first 500 chars
  const metaLines = rawMarkdown.substring(0, 1000).split("\n")
    .filter(l => l.includes(":") && !l.startsWith("|"))
    .slice(0, 10);
  const sampleMeta = {};
  metaLines.forEach(l => {
    const [k, ...v] = l.split(":");
    if (k && v.length) sampleMeta[k.replace(/\*\*/g, "").trim()] = v.join(":").trim();
  });

  return {
    patientName: patientName || null,
    doctorName: doctorName || null,
    labName: labName || null,
    reportDate: reportDate || null,
    metadata: { sample: sampleMeta },
    testResults,
  };
}


// ── Step 4: Save all health parameters ────────────────────────────────────────
async function saveHealthParameters(patientId, reportId, testResults, testDate) {
  let count = 0;
  for (const category of testResults || []) {
    for (const test of category.tests || []) {
      if (!test.name || !test.value) continue;
      await db.execute({
        sql: `INSERT INTO health_parameters
              (id, patient_id, lab_report_id, parameter_name, value, unit, reference_range, status, test_date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(), patientId, reportId,
          test.name, String(test.value), test.unit || null,
          test.referenceRange || null, test.status || null,
          testDate, Math.floor(Date.now() / 1000),
        ],
      });
      count++;
    }
  }
  console.log(`   ✅ Saved ${count} health parameters`);
}

// ── Step 5: Save lab report to DB ─────────────────────────────────────────────
async function saveLabReport(patientId, cloudinaryUrl, extraction) {
  const reportId = randomUUID();
  const fileName = "HAKKIM - Massha Lab Report.pdf";
  const reportDate = extraction.reportDate || new Date().toISOString().split("T")[0];

  await db.execute({
    sql: `INSERT INTO lab_reports
          (id, patient_id, file_name, report_date, lab_name, patient_name, doctor_name,
           extracted_data, raw_text, file_size, page_count, cloudinary_url, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      reportId, patientId, fileName, reportDate,
      extraction.labName || null,
      extraction.patientName || null,
      extraction.doctorName || null,
      JSON.stringify({ results: extraction.testResults || [], metadata: extraction.metadata || {} }),
      "AI Extracted",
      0, 1,
      cloudinaryUrl,
      Math.floor(Date.now() / 1000),
    ],
  });

  console.log(`   ✅ Lab report saved: ${reportId}`);
  return { reportId, reportDate };
}

// ── Step 6: Add timeline event ────────────────────────────────────────────────
async function addTimelineEvent(userId, patientId, extraction, reportId, reportDate) {
  const labName = extraction.labName || "Lab";
  const title = `${labName} — Lab Report (HAKEM.pdf)`;
  const eventId = randomUUID();

  // Check if already exists
  const existing = await db.execute({
    sql: "SELECT id FROM timeline_events WHERE user_id = ? AND title = ?",
    args: [userId, title],
  });

  if (existing.rows.length > 0) {
    console.log(`   ⏭  Timeline event already exists`);
    return;
  }

  await db.execute({
    sql: `INSERT INTO timeline_events
          (id, user_id, title, description, event_date, event_type, status, report_id, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      eventId, userId,
      title,
      `Lab report processed and uploaded to Massha Health platform.`,
      reportDate,
      "test",
      "completed",
      reportId,
      "system",
      Math.floor(Date.now() / 1000),
    ],
  });
  console.log(`   ✅ Timeline event created: ${title}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🏥 Massha — Uploading HAKEM.pdf for Mr. Hakkim\n");
  console.log(`📡 Database : ${process.env.TURSO_DATABASE_URL}`);
  console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME}\n`);

  // Lookup Hakkim's user and patient IDs dynamically
  const userRes = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [PATIENT_EMAIL],
  });
  if (!userRes.rows[0]) { console.error(`❌ User not found: ${PATIENT_EMAIL}`); process.exit(1); }
  const userId = userRes.rows[0].id;

  const patientRes = await db.execute({
    sql: "SELECT id FROM patients WHERE user_id = ?",
    args: [userId],
  });
  if (!patientRes.rows[0]) { console.error(`❌ Patient profile not found for: ${PATIENT_EMAIL}`); process.exit(1); }
  const patientId = patientRes.rows[0].id;

  console.log(`✅ Found: ${PATIENT_EMAIL} → patientId: ${patientId}\n`);

  // Check for duplicate
  const existingReport = await db.execute({
    sql: "SELECT id FROM lab_reports WHERE patient_id = ? AND file_name LIKE ?",
    args: [patientId, "%HAKEM%"],
  });
  if (existingReport.rows.length > 0) {
    console.log("⏭  HAKEM.pdf already uploaded for this patient. Exiting.");
    process.exit(0);
  }

  // Run pipeline
  const buffer = await readPdf();
  const cloudinaryUrl = await uploadToCloudinary(PDF_PATH, patientId);
  const extraction = await extractWithAI(buffer);

  console.log("\n💾 Saving to database...");
  const { reportId, reportDate } = await saveLabReport(patientId, cloudinaryUrl, extraction);
  await saveHealthParameters(patientId, reportId, extraction.testResults, reportDate);
  await addTimelineEvent(userId, patientId, extraction, reportId, reportDate);

  console.log("\n🎉 HAKEM.pdf successfully processed and saved to Massha sandbox!");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  console.error(err);
  process.exit(1);
});
