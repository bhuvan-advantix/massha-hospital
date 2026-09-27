import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AdapterAccount } from 'next-auth/adapters';
import { v4 as uuidv4 } from 'uuid';

export const users = sqliteTable('users', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    name: text('name'),
    email: text('email').notNull().unique(),
    emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
    image: text('image'),
    password: text('password'), // For email/password authentication
    role: text('role').notNull().default('pending'), // 'patient' | 'doctor' | 'admin' | 'pending'
    isOnboarded: integer('is_onboarded', { mode: 'boolean' }).default(false),
    customId: text('custom_id').unique(), // #Nrivaa001
    isBanned: integer('is_banned', { mode: 'boolean' }).default(false), // Admin can ban any user
});

export const accounts = sqliteTable('accounts', {
    userId: text('userId')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
}, (account) => ({
    compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
    }),
}));

export const sessions = sqliteTable('sessions', {
    sessionToken: text('sessionToken').primaryKey(),
    userId: text('userId')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable('verificationToken', {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
}, (vt) => ({
    compoundKey: primaryKey({
        columns: [vt.identifier, vt.token],
    }),
}));

// Role Specific Tables

export const patients = sqliteTable('patients', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    // Personal Details
    dateOfBirth: text('dob'),
    age: integer('age'),
    gender: text('gender'),
    phoneNumber: text('phone_number'),
    address: text('address'),
    city: text('city'),
    maritalStatus: text('marital_status'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    guardianName: text('guardian_name'),
    guardianRelation: text('guardian_relation'),

    // Medical Details
    bloodGroup: text('blood_group'),
    height: text('height'), // text to allow decimals if needed or simple storage
    weight: text('weight'),
    allergies: text('allergies'),
    currentMedications: text('current_medications'),
    pastSurgeries: text('past_surgeries'),
    chronicConditions: text('chronic_conditions'),
    lifestyle: text('lifestyle'),
    medicalHistory: text('medical_history'), // Keep legacy if needed

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const doctors = sqliteTable('doctors', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    // Personal Details
    dateOfBirth: text('dob'),
    age: integer('age'),
    gender: text('gender'),
    phoneNumber: text('phone_number'),
    address: text('address'),
    city: text('city'),
    maritalStatus: text('marital_status'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    guardianName: text('guardian_name'),
    guardianRelation: text('guardian_relation'),

    // Professional Details
    specialization: text('specialization').notNull(),
    clinicName: text('clinic_name'),
    licenseNumber: text('license_number').notNull(),
    experienceYears: integer('experience_years'),
    degree: text('degree'),
    hospitalTiming: text('hospital_timing'),
    workingDays: text('working_days'),
    bio: text('bio'),

    // Admin Approval
    approvalStatus: text('approval_status').default('approved'), // 'pending' | 'approved' | 'rejected'

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const medications = sqliteTable('medications', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dosage: text('dosage'), // e.g. "500mg"
    purpose: text('purpose'), // Reason for taking
    startDate: text('start_date'), // YYYY-MM-DD
    frequency: text('frequency'), // e.g., "Daily", "Twice a day"
    durationDays: integer('duration_days'), // Number of days to take the medication (null = indefinite)
    status: text('status').default('Active'), // Active, Discontinued
    addedBy: text('added_by').default('Self'), // "Self" or "Dr. Name"
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Lab Reports Table
export const labReports = sqliteTable('lab_reports', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),

    // Report Metadata
    fileName: text('file_name').notNull(),
    reportDate: text('report_date'), // Extracted from PDF
    labName: text('lab_name'), // Extracted from PDF
    patientName: text('patient_name'), // Extracted from PDF
    doctorName: text('doctor_name'), // Extracted from PDF

    // Extracted Data (stored as JSON)
    extractedData: text('extracted_data', { mode: 'json' }).notNull(), // Array of test results
    rawText: text('raw_text'), // Full extracted text for reference
    analysis: text('analysis'), // AI generated analysis of the report

    // File Info
    fileSize: integer('file_size'), // in bytes
    pageCount: integer('page_count'),
    fileData: text('file_data'), // Base64 encoded file content (legacy - being phased out)
    cloudinaryUrl: text('cloudinary_url'), // Cloudinary URL for PDF storage

    // Timestamps
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Short-lived, server-only extraction cache used while a staff member registers
// a patient from an uploaded document. It avoids parsing the same bytes twice.
export const pendingReportExtractions = sqliteTable('pending_report_extractions', {
    contentHash: text('content_hash').primaryKey(),
    extraction: text('extraction', { mode: 'json' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Archive Table for Deleted Accounts
export const deletedAccounts = sqliteTable('deleted_accounts', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    originalUserId: text('original_user_id'), // Keep reference but no foreign key constraint as user will be deleted
    name: text('name'),
    email: text('email'),
    role: text('role'),
    customId: text('custom_id'),
    reason: text('reason'), // Optional reason for deletion
    deletedAt: integer('deleted_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),

    // Backup of key profile data (JSON stringified for simplicity or specific columns)
    profileSnapshot: text('profile_snapshot', { mode: 'json' }), // Stores the entire patient/doctor record as JSON
});

// Health Parameters Table - Stores key health metrics from lab reports
export const healthParameters = sqliteTable('health_parameters', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    labReportId: text('lab_report_id').references(() => labReports.id, { onDelete: 'cascade' }),

    // Parameter Details
    parameterName: text('parameter_name').notNull(), // e.g., "Blood Glucose", "Blood Pressure", "HbA1c", "Total Cholesterol"
    value: text('value').notNull(), // The actual value
    unit: text('unit'), // e.g., "mg/dL", "mmHg", "%"
    referenceRange: text('reference_range'), // e.g., "70-100"
    status: text('status'), // 'normal' | 'high' | 'low'

    // Test Date (from the lab report)
    testDate: text('test_date'), // Date when the test was conducted

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Support Tickets Table
export const supportTickets = sqliteTable('support_tickets', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    ticketNumber: text('ticket_number').notNull().unique(), // e.g., "TKT12345"

    // User Information
    userName: text('user_name').notNull(),
    userEmail: text('user_email').notNull(),

    // Issue Details
    selectedPage: text('selected_page').notNull(), // Which page has the issue
    message: text('message').notNull(), // User's detailed message

    // Status and Tracking
    status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'resolved' | 'closed'
    priority: text('priority').default('medium'), // 'low' | 'medium' | 'high' | 'urgent'

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),

    // Optional: Link to user if they're logged in
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
});

// Timeline Events Table
// Timeline Events Table
export const timelineEvents = sqliteTable('timeline_events', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'), // Optional details
    eventDate: text('event_date').notNull(), // YYYY-MM-DD or ISO string
    eventType: text('event_type').notNull(), // 'appointment' | 'test' | 'medication' | 'general' | 'surgery'
    status: text('status').default('pending'), // 'pending' | 'completed' | 'cancelled'

    // Optional Links
    reportId: text('report_id').references(() => labReports.id, { onDelete: 'set null' }), // Link to a lab report
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }), // Link to a doctor

    createdBy: text('created_by').default('patient'), // 'patient' | 'doctor' | 'system'

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Doctor-Patient Relationship (Clinic Management)
export const doctorPatientRelations = sqliteTable('doctor_patient_relations', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    doctorId: text('doctor_id').notNull().references(() => doctors.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
    uniqueRelation: uniqueIndex('doctor_patient_unique').on(t.doctorId, t.patientId),
}));

// Private Doctor Notes (Not visible to patients)
export const doctorPrivateNotes = sqliteTable('doctor_private_notes', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    doctorId: text('doctor_id').notNull().references(() => doctors.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    noteContent: text('note_content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Structured Allergies (To support Stop/Resume/Hide)
export const patientAllergies = sqliteTable('patient_allergies', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    allergen: text('allergen').notNull(),
    severity: text('severity'), // 'Mild', 'Moderate', 'Severe'
    reaction: text('reaction'),
    status: text('status').default('active'), // 'active', 'stopped', 'hidden'
    addedBy: text('added_by').default('patient'), // 'patient' or 'doctor_id'
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }), // If added by doctor
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Structured Chronic Conditions (To support Stop/Resume/Hide)
export const patientConditions = sqliteTable('patient_conditions', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    conditionName: text('condition_name').notNull(),
    diagnosedDate: text('diagnosed_date'),
    status: text('status').default('active'), // 'active', 'stopped', 'hidden'
    addedBy: text('added_by').default('patient'),
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Patient Diagnostics — Doctor-created condition pathway & mind map
export const patientDiagnostics = sqliteTable('patient_diagnostics', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),

    // Condition this pathway is for
    conditionName: text('condition_name').notNull(),

    // Doctor's assessment
    conditionStatus: text('condition_status').default('stable'), // 'improving' | 'stable' | 'worsening'

    // JSON array of DiagnosticNode objects (the mind-map)
    nodes: text('nodes', { mode: 'json' }).$type<any[]>().notNull().default([]),

    // Free-text sections
    clinicalNotes: text('clinical_notes'),
    treatmentPlan: text('treatment_plan'),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Lab Diagnostics Accounts (Separate login system, created by Admin)
export const labAccounts = sqliteTable('lab_accounts', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    labName: text('lab_name').notNull(),       // e.g., "Arathi Scans"
    email: text('email').notNull().unique(),   // Login email
    password: text('password').notNull(),      // Hashed password
    city: text('city'),
    phone: text('phone'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Staff Accounts (Front Desk / Nurse) — Separate login system, created by Admin
export const staffAccounts = sqliteTable('staff_accounts', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    staffName: text('staff_name').notNull(),   // Full name of the staff member
    email: text('email').notNull().unique(),   // Login email
    password: text('password').notNull(),      // Hashed password
    role: text('role').notNull().default('staff'), // 'staff' (covers both front desk & nurse duties)
    hospitalName: text('hospital_name'),       // Which clinic/hospital they belong to
    phone: text('phone'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Patient vitals recorded by staff (BP, temp, weight, height, pulse, SpO2)
export const patientVitals = sqliteTable('patient_vitals', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    bloodPressure: text('blood_pressure'),     // e.g., "120/80"
    temperature: text('temperature'),          // e.g., "98.6°F"
    weight: text('weight'),                    // e.g., "65 kg"
    height: text('height'),                    // e.g., "170 cm"
    pulseRate: text('pulse_rate'),             // e.g., "72 bpm"
    spO2: text('spo2'),                        // e.g., "98%"
    recordedBy: text('recorded_by'),           // Staff name
    notes: text('notes'),                      // Any additional notes
    recordedAt: integer('recorded_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Lab Orders — Doctor-ordered tests/injections (STAFF + LAB only, never shown to patient)
export const labOrders = sqliteTable('lab_orders', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),
    doctorName: text('doctor_name'),            // Display name of ordering doctor

    name: text('name').notNull(),               // e.g., "CBC", "Dexamethasone 4mg IV"
    type: text('type').notNull().default('lab'), // 'lab' | 'injection'
    notes: text('notes'),                       // Optional notes from doctor

    // Payment tracking
    isPaid: integer('is_paid', { mode: 'boolean' }).default(false),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    paidBy: text('paid_by'),                    // Staff name or Lab name that marked as paid

    orderedAt: integer('ordered_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    orderedDate: text('ordered_date'),          // YYYY-MM-DD for easy filtering
});

// Prescriptions Table — Generated when doctor clicks "Save & Print"
export const prescriptions = sqliteTable('prescriptions', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),

    // Serialized consultation snapshot (JSON) — fully dynamic, never hardcoded
    consultationData: text('consultation_data', { mode: 'json' }).$type<any>().notNull(),

    // Cloudinary URL for the generated PDF
    cloudinaryUrl: text('cloudinary_url').notNull(),

    prescribedAt: integer('prescribed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Pre-Check-In Table — sent to patient 24 hrs before appointment (staff-booked or doctor follow-up only)
export const preCheckins = sqliteTable('pre_checkins', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    appointmentId: text('appointment_id').notNull(), // timelineEvents.id
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    patientUserId: text('patient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    // Secure token sent in email link — one-time use
    token: text('token').notNull().unique(),
    tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }).notNull(),

    // Submission status
    isSubmitted: integer('is_submitted', { mode: 'boolean' }).default(false),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }),

    // Form answers (JSON)
    answers: text('answers', { mode: 'json' }).$type<Record<string, any>>(),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Post-Check-In Table — sent to patient 2-3 days after completed appointment
export const postCheckins = sqliteTable('post_checkins', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    appointmentId: text('appointment_id').notNull(), // timelineEvents.id
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    patientUserId: text('patient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    // Secure token sent in email link — one-time use
    token: text('token').notNull().unique(),
    tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }).notNull(),

    // Submission status
    isSubmitted: integer('is_submitted', { mode: 'boolean' }).default(false),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }),

    // Form answers (JSON)
    answers: text('answers', { mode: 'json' }).$type<Record<string, any>>(),

    // Email sent tracking
    emailSentAt: integer('email_sent_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Diabetes Records Table — Dynamic database storage for Diabetes metrics
export const diabetesRecords = sqliteTable('diabetes_records', {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),
    hba1c: text('hba1c').notNull(), // e.g. "6.8"
    fastingGlucose: text('fasting_glucose'), // e.g. "115" mg/dL
    postPrandialGlucose: text('post_prandial_glucose'), // e.g. "160" mg/dL
    insulinDosage: text('insulin_dosage'), // e.g. "18 Units Basal"
    glycemicVariability: text('glycemic_variability'), // e.g. "Moderate"
    retinopathyStatus: text('retinopathy_status').default('Clear'), // 'Clear' | 'Mild' | 'Severe'
    nephropathyStatus: text('nephropathy_status').default('Normal'), // 'Normal' | 'Microalbuminuria' | 'Stage 2'
    neuropathyStatus: text('neuropathy_status').default('None'), // 'None' | 'Mild' | 'Symptomatic'
    notes: text('notes'),
    testDate: text('test_date').notNull(), // YYYY-MM-DD
    recordedAt: integer('recorded_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
