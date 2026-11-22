import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEMO_WARDS } from './geo.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const DB_PATH = path.resolve(DATA_DIR, 'nagarai.db');
export const UPLOAD_ROOT = UPLOADS_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wards (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      zone TEXT NOT NULL,
      population_demo INTEGER NOT NULL,
      area_sqkm REAL NOT NULL,
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      boundary_geojson TEXT NOT NULL,
      is_demo_boundary INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sla_escalation_email_demo TEXT NOT NULL,
      color_hex TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('citizen', 'ward_rep', 'municipal_admin', 'field_officer')),
      ward_id TEXT REFERENCES wards(id),
      department_id TEXT REFERENCES departments(id),
      phone_masked TEXT,
      avatar_initials TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authorities (
      id TEXT PRIMARY KEY,
      profile_id TEXT REFERENCES profiles(id),
      title TEXT NOT NULL,
      department_id TEXT REFERENCES departments(id),
      contact_label_demo TEXT NOT NULL,
      is_demo_official INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ward_authority_mapping (
      id TEXT PRIMARY KEY,
      ward_id TEXT NOT NULL REFERENCES wards(id),
      authority_id TEXT NOT NULL REFERENCES authorities(id),
      role_scope TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS department_routing_rules (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL UNIQUE,
      department_id TEXT NOT NULL REFERENCES departments(id),
      default_priority TEXT NOT NULL CHECK (default_priority IN ('Critical', 'High', 'Medium', 'Low')),
      auto_assign_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sla_configurations (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL UNIQUE CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
      target_minutes INTEGER NOT NULL,
      escalate_to_role TEXT NOT NULL,
      is_demo_target INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_groups (
      id TEXT PRIMARY KEY,
      canonical_complaint_id TEXT,
      category TEXT NOT NULL,
      ward_id TEXT REFERENCES wards(id),
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      address_label TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      report_count INTEGER NOT NULL DEFAULT 1,
      first_reported_at TEXT NOT NULL,
      last_reported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      tracking_code TEXT NOT NULL UNIQUE,
      citizen_id TEXT NOT NULL REFERENCES profiles(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
      status TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address_label TEXT NOT NULL,
      ward_id TEXT REFERENCES wards(id),
      department_id TEXT REFERENCES departments(id),
      assigned_authority_id TEXT REFERENCES authorities(id),
      assigned_officer_id TEXT REFERENCES profiles(id),
      voice_transcript TEXT,
      voice_language TEXT,
      duplicate_group_id TEXT REFERENCES duplicate_groups(id),
      sla_deadline TEXT,
      escalated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS complaint_media (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio', 'video')),
      url TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      caption TEXT,
      uploaded_by TEXT REFERENCES profiles(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_assessments (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
      model_name TEXT NOT NULL,
      category_predicted TEXT NOT NULL,
      title_suggested TEXT NOT NULL,
      description_suggested TEXT NOT NULL,
      severity_predicted TEXT NOT NULL,
      deterministic_severity TEXT NOT NULL,
      final_severity TEXT NOT NULL,
      deterministic_rule_applied TEXT,
      confidence REAL NOT NULL,
      risk_factors_json TEXT NOT NULL,
      severity_explanation TEXT NOT NULL,
      suggested_department TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      additional_info_required_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_assignments (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      assigned_by TEXT REFERENCES profiles(id),
      assigned_to TEXT NOT NULL REFERENCES profiles(id),
      role_type TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_updates (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      author_id TEXT REFERENCES profiles(id),
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      update_type TEXT NOT NULL,
      message TEXT NOT NULL,
      obstacle_flag INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_status_history (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_id TEXT REFERENCES profiles(id),
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      similarity_score REAL NOT NULL,
      match_reasons_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, complaint_id)
    );

    CREATE TABLE IF NOT EXISTS resolution_evidence (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      submitted_by TEXT REFERENCES profiles(id),
      before_media_url TEXT,
      after_media_url TEXT NOT NULL,
      notes TEXT,
      ai_relevance_score REAL,
      ai_visible_changes TEXT,
      ai_resolution_assessment TEXT,
      ai_mismatch_warnings_json TEXT,
      ai_confidence REAL,
      ai_explanation TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escalation_records (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      triggered_by TEXT NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      overdue_minutes INTEGER NOT NULL,
      delay_reason TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS civic_insights (
      id TEXT PRIMARY KEY,
      insight_type TEXT NOT NULL,
      ward_id TEXT REFERENCES wards(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      supporting_data_json TEXT NOT NULL,
      is_recurring_infra INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      complaint_id TEXT REFERENCES complaints(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      notif_type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS citizen_feedback (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      citizen_id TEXT NOT NULL REFERENCES profiles(id),
      verdict TEXT NOT NULL CHECK (verdict IN ('resolved', 'partially_resolved', 'not_resolved')),
      comment TEXT,
      rating INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_ward ON complaints(ward_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_dept ON complaints(department_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_severity ON complaints(severity);
    CREATE INDEX IF NOT EXISTS idx_complaints_citizen ON complaints(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_officer ON complaints(assigned_officer_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_status_history_complaint ON complaint_status_history(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);

  const wardCount = db.prepare('SELECT COUNT(*) as count FROM wards').get() as { count: number };
  if (wardCount.count === 0) {
    seedDemoData();
  }
}

function isoOffset(minutesDelta: number): string {
  return new Date(Date.now() + minutesDelta * 60 * 1000).toISOString();
}

function seedDemoData() {
  const demoPassHash = hashPassword('NagarAI@Demo2026');

  const tx = db.transaction(() => {
    // 1. Seed 6 Demo Wards
    const insertWard = db.prepare(`
      INSERT INTO wards (id, code, name, zone, population_demo, area_sqkm, center_lat, center_lng, boundary_geojson, is_demo_boundary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const w of DEMO_WARDS) {
      insertWard.run(
        w.id,
        w.code,
        w.name,
        w.zone,
        w.populationDemo,
        w.areaSqkm,
        w.centerLat,
        w.centerLng,
        JSON.stringify(w.boundaryGeojson)
      );
    }

    // 2. Seed Departments
    const departments = [
      ['dept-roads', 'RDS', 'Roads & Engineering', 'Potholes, asphalt resurfacing, footpaths, and arterial road structural maintenance.', 'roads-demo@nagarai.demo', '#0F7B55'],
      ['dept-sanitation', 'SAN', 'Sanitation & Solid Waste', 'Municipal garbage collection, bin clearance, street sweeping, and waste transfer.', 'sanitation-demo@nagarai.demo', '#D97706'],
      ['dept-drainage', 'DRN', 'Stormwater & Drainage', 'Stormwater drains, desilting, open manhole covers, and monsoon flood mitigation.', 'drainage-demo@nagarai.demo', '#2563EB'],
      ['dept-water', 'WTR', 'Water Supply Board', 'Potable water pipelines, leak arrest, valve repairs, and pressure restoration.', 'water-demo@nagarai.demo', '#0284C7'],
      ['dept-electrical', 'ELC', 'Electrical & Streetlights', 'LED streetlamps, feeder pillars, dark corridor lighting, and pole safety.', 'electrical-demo@nagarai.demo', '#7C3AED'],
      ['dept-environment', 'ENV', 'Environment & Public Health', 'Air/noise pollution, illegal dumping remediation, and public sanitation health.', 'environment-demo@nagarai.demo', '#059669'],
    ];
    const insertDept = db.prepare(`
      INSERT INTO departments (id, code, name, description, sla_escalation_email_demo, color_hex)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const d of departments) {
      insertDept.run(...d);
    }

    // 3. Seed Profiles (Clearly labeled Demo Accounts)
    const profiles = [
      ['user-citizen-1', 'ananya.citizen@nagarai.demo', 'Ananya Rao (Demo Citizen)', demoPassHash, 'citizen', 'ward-14', null, '+91-98***-***14', 'AR', 1],
      ['user-citizen-2', 'kiran.citizen@nagarai.demo', 'Kiran Kumar (Demo Citizen)', demoPassHash, 'citizen', 'ward-14', null, '+91-97***-***22', 'KK', 1],
      ['user-citizen-3', 'meera.citizen@nagarai.demo', 'Meera Reddy (Demo Citizen)', demoPassHash, 'citizen', 'ward-22', null, '+91-90***-***88', 'MR', 1],
      ['user-ward-14', 'ward14.rep@nagarai.demo', 'Rajeshwari Devi (Demo Ward 14 Rep)', demoPassHash, 'ward_rep', 'ward-14', null, 'Ward Office 14 (Demo)', 'RD', 1],
      ['user-ward-22', 'ward22.rep@nagarai.demo', 'Prakash Varma (Demo Ward 22 Rep)', demoPassHash, 'ward_rep', 'ward-22', null, 'Ward Office 22 (Demo)', 'PV', 1],
      ['user-admin-1', 'admin@nagarai.demo', 'Vikramaditya Nair (Demo Municipal Admin)', demoPassHash, 'municipal_admin', null, null, 'Command Center (Demo)', 'VN', 1],
      ['user-officer-roads', 'field.roads@nagarai.demo', 'Suresh Babu (Demo Roads Field Officer)', demoPassHash, 'field_officer', 'ward-14', 'dept-roads', 'Field Unit R-04 (Demo)', 'SB', 1],
      ['user-officer-sanitation', 'field.sanitation@nagarai.demo', 'Lakshmi Narayana (Demo Sanitation Officer)', demoPassHash, 'field_officer', 'ward-22', 'dept-sanitation', 'Field Unit S-09 (Demo)', 'LN', 1],
      ['user-officer-drainage', 'field.drainage@nagarai.demo', 'Ramesh Goud (Demo Drainage Officer)', demoPassHash, 'field_officer', 'ward-09', 'dept-drainage', 'Field Unit D-02 (Demo)', 'RG', 1],
      ['user-officer-water', 'field.water@nagarai.demo', 'Farhan Ahmed (Demo Water Field Officer)', demoPassHash, 'field_officer', 'ward-18', 'dept-water', 'Field Unit W-07 (Demo)', 'FA', 1],
    ];
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, email, full_name, password_hash, role, ward_id, department_id, phone_masked, avatar_initials, is_demo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of profiles) {
      insertProfile.run(...p, isoOffset(-43200));
    }

    // 4. Seed Demo Authorities & Ward-Authority Mapping
    const authorities = [
      ['auth-w14', 'user-ward-14', 'Ward 14 Civic Coordinator (Demo)', 'dept-roads', 'ward14-office@nagarai.demo'],
      ['auth-w22', 'user-ward-22', 'Ward 22 Civic Coordinator (Demo)', 'dept-sanitation', 'ward22-office@nagarai.demo'],
      ['auth-central', 'user-admin-1', 'Central Municipal Command Desk (Demo)', 'dept-drainage', 'command-desk@nagarai.demo'],
    ];
    const insertAuth = db.prepare(`
      INSERT INTO authorities (id, profile_id, title, department_id, contact_label_demo, is_demo_official)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    for (const a of authorities) {
      insertAuth.run(...a);
    }

    const wardMappings = [
      ['wam-14', 'ward-14', 'auth-w14', 'Primary Ward Office', 1],
      ['wam-18', 'ward-18', 'auth-w14', 'Cluster Zone Coordinator', 1],
      ['wam-22', 'ward-22', 'auth-w22', 'Primary Ward Office', 1],
      ['wam-27', 'ward-27', 'auth-w22', 'IT Corridor Coordinator', 1],
      ['wam-09', 'ward-09', 'auth-central', 'North-Central Desk', 1],
      ['wam-04', 'ward-04', 'auth-central', 'North Zone Desk', 1],
    ];
    const insertWam = db.prepare(`
      INSERT INTO ward_authority_mapping (id, ward_id, authority_id, role_scope, is_primary)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const wm of wardMappings) {
      insertWam.run(...wm);
    }

    // 5. Seed Configurable Department Routing Rules
    const routingRules: Array<[string, string, string, string]> = [
      ['rule-road', 'Road damage', 'dept-roads', 'High'],
      ['rule-pothole', 'Potholes', 'dept-roads', 'High'],
      ['rule-footpath', 'Footpath damage', 'dept-roads', 'Medium'],
      ['rule-garbage', 'Garbage', 'dept-sanitation', 'Medium'],
      ['rule-drainage', 'Drainage', 'dept-drainage', 'High'],
      ['rule-flooding', 'Flooding', 'dept-drainage', 'Critical'],
      ['rule-manhole', 'Open manholes', 'dept-drainage', 'Critical'],
      ['rule-water', 'Water leakage', 'dept-water', 'High'],
      ['rule-streetlight', 'Streetlight failure', 'dept-electrical', 'Medium'],
      ['rule-pollution', 'Pollution', 'dept-environment', 'Medium'],
      ['rule-other', 'Other', 'dept-environment', 'Low'],
    ];
    const insertRule = db.prepare(`
      INSERT INTO department_routing_rules (id, category, department_id, default_priority, auto_assign_enabled, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    for (const r of routingRules) {
      insertRule.run(...r, isoOffset(-10000));
    }

    // 6. Seed Demo SLA Configurations (Clearly labeled demo-only targets)
    const slaRows: Array<[string, string, number, string]> = [
      ['sla-critical', 'Critical', 15, 'municipal_admin'],
      ['sla-high', 'High', 240, 'ward_rep'],
      ['sla-medium', 'Medium', 1440, 'ward_rep'],
      ['sla-low', 'Low', 4320, 'ward_rep'],
    ];
    const insertSla = db.prepare(`
      INSERT INTO sla_configurations (id, severity, target_minutes, escalate_to_role, is_demo_target, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    for (const s of slaRows) {
      insertSla.run(...s, isoOffset(-10000));
    }

    // 7. Seed Duplicate Groups (Real clusters backing duplicate detection & hotspots)
    const insertDupGroup = db.prepare(`
      INSERT INTO duplicate_groups (id, canonical_complaint_id, category, ward_id, center_lat, center_lng, address_label, priority, status, report_count, first_reported_at, last_reported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDupGroup.run(
      'grp-pothole-w14',
      'cmp-1001',
      'Potholes',
      'ward-14',
      17.4127,
      78.4369,
      'Road No. 12, Banjara Hills (Near Virinchi Junction)',
      'Critical',
      'Active Cluster',
      3,
      isoOffset(-129600), // ~90 days ago (multi-month recurring!)
      isoOffset(-45)
    );

    insertDupGroup.run(
      'grp-garbage-w22',
      'cmp-1004',
      'Garbage',
      'ward-22',
      17.4512,
      78.3782,
      'Ayyappa Society Main Road, Madhapur',
      'High',
      'Hotspot Monitored',
      3,
      isoOffset(-4320),
      isoOffset(-180)
    );

    insertDupGroup.run(
      'grp-drainage-w09',
      'cmp-1007',
      'Drainage',
      'ward-09',
      17.4438,
      78.4664,
      'Prakash Nagar Flyover Service Road, Begumpet',
      'High',
      'Recurring Cluster',
      2,
      isoOffset(-86400),
      isoOffset(-360)
    );

    // 8. Seed 14 Realistic Demo Complaints across all 6 wards, departments, and workflow stages
    const IMG_POTHOLE_BEFORE = '/src/assets/images/civic_pothole_before_1795354764751.jpg';
    const IMG_POTHOLE_AFTER = '/src/assets/images/civic_pothole_after_1795354768452.jpg';
    const IMG_GARBAGE = '/src/assets/images/civic_garbage_dump_1795354764626.jpg';
    const IMG_DRAINAGE = '/src/assets/images/civic_drainage_overflow_1795354766130.jpg';
    const IMG_WATER = '/src/assets/images/civic_water_leak_1795354775408.jpg';

    const insertComplaint = db.prepare(`
      INSERT INTO complaints (
        id, tracking_code, citizen_id, title, description, category, severity, status,
        latitude, longitude, address_label, ward_id, department_id, assigned_authority_id,
        assigned_officer_id, voice_transcript, voice_language, duplicate_group_id,
        sla_deadline, escalated_at, created_at, updated_at, resolved_at, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMedia = db.prepare(`
      INSERT INTO complaint_media (id, complaint_id, media_type, url, mime_type, caption, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAi = db.prepare(`
      INSERT INTO ai_assessments (
        id, complaint_id, model_name, category_predicted, title_suggested, description_suggested,
        severity_predicted, deterministic_severity, final_severity, deterministic_rule_applied,
        confidence, risk_factors_json, severity_explanation, suggested_department, suggested_action,
        additional_info_required_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertUpdate = db.prepare(`
      INSERT INTO complaint_updates (id, complaint_id, author_id, author_name, author_role, update_type, message, obstacle_flag, is_public, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDupMember = db.prepare(`
      INSERT INTO duplicate_group_members (id, group_id, complaint_id, similarity_score, match_reasons_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // CMP-1001: Active Overdue Critical Pothole in Ward 14 (Banjara Hills Road No. 12)
    insertComplaint.run(
      'cmp-1001', 'NGR-1001', 'user-citizen-1',
      'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane',
      'Large water-filled pothole near Virinchi Junction causing two-wheelers to swerve into oncoming traffic. Rainwater hides the true depth (~18cm).',
      'Potholes', 'Critical', 'Escalated',
      17.4126, 78.4368, 'Road No. 12, Banjara Hills (Near Virinchi Junction)',
      'ward-14', 'dept-roads', 'auth-w14', 'user-officer-roads',
      'బంజారా హిల్స్ రోడ్ నంబర్ 12 లో పెద్ద గుంత ఉంది, వర్షం నీరు నిండిపోయి బైక్‌లు జారిపోతున్నాయి.', 'te-IN',
      'grp-pothole-w14', isoOffset(-30), isoOffset(-12), isoOffset(-45), isoOffset(-12), null, null
    );
    insertMedia.run('med-1001', 'cmp-1001', 'image', IMG_POTHOLE_BEFORE, 'image/jpeg', 'Citizen street photograph at Road No. 12', 'user-citizen-1', isoOffset(-45));
    insertAi.run(
      'ai-1001', 'cmp-1001', 'gemini-4-hydrogen', 'Potholes',
      'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane',
      'Large water-filled asphalt crater visible in active traffic lane with loose aggregate edges.',
      'Critical', 'Critical', 'Critical',
      'Safety Rule R-02 & Traffic Safety Rule R-04: Waterlogged deep arterial pothole with two-wheeler skidding risk.',
      0.94,
      JSON.stringify(['Concealed depth due to standing rainwater', 'Active two-wheeler & bus commuter corridor', 'Fractured surrounding bitumen indicating sub-base failure']),
      'Severe roadway surface collapse in a high-density transit lane; high likelihood of two-wheeler accidents.',
      'Roads & Engineering',
      'Immediate safety barricading, dewatering, sub-base compaction, and hot-mix asphalt patching.',
      JSON.stringify(['Confirm whether underground utility line runs directly underneath crater']),
      isoOffset(-45)
    );
    insertHistory.run('h-1001-1', 'cmp-1001', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Submitted with photo + Telugu voice note', isoOffset(-45));
    insertHistory.run('h-1001-2', 'cmp-1001', 'Submitted', 'AI Analysis', null, 'NagarAI Analysis Engine', 'system', 'Classified as Potholes (Critical, 94% confidence)', isoOffset(-45));
    insertHistory.run('h-1001-3', 'cmp-1001', 'AI Analysis', 'Jurisdiction Identified', null, 'NagarAI Geo Engine', 'system', 'Matched Ward 14 — Banjara Hills via polygon boundary', isoOffset(-44));
    insertHistory.run('h-1001-4', 'cmp-1001', 'Jurisdiction Identified', 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', 'Routed to Roads & Engineering (Ward 14 Civic Coordinator)', isoOffset(-44));
    insertHistory.run('h-1001-5', 'cmp-1001', 'Authority Assigned', 'Escalated', null, 'NagarAI SLA Monitor', 'system', 'Demo 15-min Critical SLA breached; escalated to Municipal Command Desk', isoOffset(-12));
    insertDupMember.run('dm-1', 'grp-pothole-w14', 'cmp-1001', 0.96, JSON.stringify(['Within 65m of cluster center', 'Same category: Potholes', 'High lexical overlap']), isoOffset(-45));

    // CMP-1002: Awaiting Citizen Verification (Before + After Pothole Repair with Gemini Evidence Comparison!)
    insertComplaint.run(
      'cmp-1002', 'NGR-1002', 'user-citizen-1',
      'Collapsed bitumen patch near Care Hospital stretch, Road No. 1',
      'Severe broken road surface outside hospital entrance slowing ambulances and daily commuters.',
      'Road damage', 'High', 'Awaiting Citizen Verification',
      17.4178, 78.4472, 'Road No. 1, Banjara Hills (Care Hospital Stretch)',
      'ward-14', 'dept-roads', 'auth-w14', 'user-officer-roads',
      null, null, null,
      isoOffset(90), null, isoOffset(-1440), isoOffset(-25), isoOffset(-25), null
    );
    insertMedia.run('med-1002', 'cmp-1002', 'image', IMG_POTHOLE_BEFORE, 'image/jpeg', 'Original road damage reported by citizen', 'user-citizen-1', isoOffset(-1440));
    insertAi.run(
      'ai-1002', 'cmp-1002', 'gemini-4-hydrogen', 'Road damage',
      'Collapsed bitumen patch near Care Hospital stretch, Road No. 1',
      'Damaged asphalt surface impeding emergency hospital corridor access.',
      'High', 'Critical', 'Critical',
      'Safety Rule R-02: Adjacent to hospital corridor.',
      0.91,
      JSON.stringify(['Hospital ambulance corridor obstruction', 'Loose gravel scatter']),
      'Road damage adjacent to medical facility elevates response urgency.',
      'Roads & Engineering',
      'Mill damaged patch and relay compacted bituminous macadam.',
      JSON.stringify([]),
      isoOffset(-1440)
    );
    insertHistory.run('h-1002-1', 'cmp-1002', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Reported with photographic evidence', isoOffset(-1440));
    insertHistory.run('h-1002-2', 'cmp-1002', 'Submitted', 'Acknowledged', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Verified location and prioritized for ambulance corridor', isoOffset(-1320));
    insertHistory.run('h-1002-3', 'cmp-1002', 'Acknowledged', 'Work Assigned', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Assigned to Roads Field Unit R-04', isoOffset(-1260));
    insertHistory.run('h-1002-4', 'cmp-1002', 'Work Assigned', 'In Progress', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'Hot-mix asphalt crew mobilized and milling completed', isoOffset(-360));
    insertHistory.run('h-1002-5', 'cmp-1002', 'In Progress', 'Resolution Evidence Submitted', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'Uploaded post-resurfacing photograph & compaction check', isoOffset(-30));
    insertHistory.run('h-1002-6', 'cmp-1002', 'Resolution Evidence Submitted', 'Awaiting Citizen Verification', null, 'NagarAI Accountability Engine', 'system', 'AI advisory check completed; awaiting citizen sign-off', isoOffset(-25));
    insertUpdate.run('upd-1002-1', 'cmp-1002', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'resolution', 'Resurfaced 12 sq.m stretch with hot-mix bitumen and repainted lane shoulder.', 0, 1, isoOffset(-30));

    db.prepare(`
      INSERT INTO resolution_evidence (
        id, complaint_id, submitted_by, before_media_url, after_media_url, notes,
        ai_relevance_score, ai_visible_changes, ai_resolution_assessment,
        ai_mismatch_warnings_json, ai_confidence, ai_explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ev-1002', 'cmp-1002', 'user-officer-roads',
      IMG_POTHOLE_BEFORE, IMG_POTHOLE_AFTER,
      'Completed sub-base compaction, hot-mix asphalt laydown, and white shoulder striping.',
      0.93,
      'Deep waterlogged crater is replaced by a freshly laid, level dark asphalt patch with restored white edge marking.',
      'Likely Resolved',
      JSON.stringify(['Camera perspective angle differs slightly between before/after photos; citizen on-site confirmation recommended.']),
      0.89,
      'Advisory assessment: The post-repair photo shows continuous compacted asphalt over the previously damaged lane segment. Final closure requires citizen verification.',
      isoOffset(-25)
    );

    // CMP-1003: Historical Pothole #2 at Road No. 12 (2 months ago - drives Recurring Infrastructure Intelligence!)
    insertComplaint.run(
      'cmp-1003', 'NGR-1003', 'user-citizen-2',
      'Recurring pothole resurfacing breakdown on Banjara Hills Road No. 12',
      'Previous cold-mix patch washed out again after light rain near Virinchi Junction.',
      'Potholes', 'High', 'Citizen Verified',
      17.4129, 78.4371, 'Road No. 12, Banjara Hills (50m east of Virinchi Junction)',
      'ward-14', 'dept-roads', 'auth-w14', 'user-officer-roads',
      null, null, 'grp-pothole-w14',
      isoOffset(-64000), null, isoOffset(-64800), isoOffset(-63000), isoOffset(-63500), isoOffset(-63000)
    );
    insertMedia.run('med-1003', 'cmp-1003', 'image', IMG_POTHOLE_BEFORE, 'image/jpeg', 'Previous patch breakdown (historical)', 'user-citizen-2', isoOffset(-64800));
    insertDupMember.run('dm-2', 'grp-pothole-w14', 'cmp-1003', 0.88, JSON.stringify(['Within 48m of cluster center', 'Same category: Potholes', 'Recurring location']), isoOffset(-64800));

    // CMP-1012: Historical Pothole #3 at Road No. 12 (3 months ago - confirms multi-month recurring wear!)
    insertComplaint.run(
      'cmp-1012', 'NGR-1012', 'user-citizen-2',
      'Asphalt depression & pothole formation on Road No. 12 bus stop',
      'Repeated water stagnation eroding tarmac at the exact same junction.',
      'Potholes', 'High', 'Resolved',
      17.4124, 78.4366, 'Road No. 12, Banjara Hills (Opposite Virinchi Bus Bay)',
      'ward-14', 'dept-roads', 'auth-w14', 'user-officer-roads',
      null, null, 'grp-pothole-w14',
      isoOffset(-129000), null, isoOffset(-129600), isoOffset(-128000), isoOffset(-128200), null
    );
    insertDupMember.run('dm-3', 'grp-pothole-w14', 'cmp-1012', 0.85, JSON.stringify(['Within 40m of cluster center', 'Same category: Potholes', 'Multi-month recurrence']), isoOffset(-129600));

    // CMP-1004, 1005, 1006: Sanitation Hotspot Cluster in Ward 22 (Madhapur)
    insertComplaint.run(
      'cmp-1004', 'NGR-1004', 'user-citizen-3',
      'Overflowing municipal waste bin blocking Ayyappa Society main lane',
      'Commercial and residential garbage bags overflowing onto roadway for 3 days, creating foul odor and stray animal hazard.',
      'Garbage', 'High', 'Work Assigned',
      17.4512, 78.3782, 'Ayyappa Society Main Road, Madhapur',
      'ward-22', 'dept-sanitation', 'auth-w22', 'user-officer-sanitation',
      null, null, 'grp-garbage-w22',
      isoOffset(-60), null, isoOffset(-1800), isoOffset(-120), null, null
    );
    insertMedia.run('med-1004', 'cmp-1004', 'image', IMG_GARBAGE, 'image/jpeg', 'Overflowing street bin at Ayyappa Society', 'user-citizen-3', isoOffset(-1800));
    insertHistory.run('h-1004-1', 'cmp-1004', null, 'Submitted', 'user-citizen-3', 'Meera Reddy (Demo Citizen)', 'citizen', 'Reported overflowing bin', isoOffset(-1800));
    insertHistory.run('h-1004-2', 'cmp-1004', 'Submitted', 'Acknowledged', 'user-ward-22', 'Prakash Varma (Demo Ward 22 Rep)', 'ward_rep', 'Acknowledged hotspot', isoOffset(-900));
    insertHistory.run('h-1004-3', 'cmp-1004', 'Acknowledged', 'Work Assigned', 'user-ward-22', 'Prakash Varma (Demo Ward 22 Rep)', 'ward_rep', 'Dispatched compactor crew S-09', isoOffset(-120));
    insertDupMember.run('dm-4', 'grp-garbage-w22', 'cmp-1004', 0.95, JSON.stringify(['Cluster primary report', 'Sanitation hotspot zone']), isoOffset(-1800));

    insertComplaint.run(
      'cmp-1005', 'NGR-1005', 'user-citizen-3',
      'Uncollected wet waste pile near Ayyappa Society 100ft corner',
      'Garbage spilling into pedestrian path 90m from overflowing community bin.',
      'Garbage', 'Medium', 'Acknowledged',
      17.4518, 78.3788, 'Ayyappa Society 100ft Road Corner, Madhapur',
      'ward-22', 'dept-sanitation', 'auth-w22', null,
      null, null, 'grp-garbage-w22',
      isoOffset(420), null, isoOffset(-1020), isoOffset(-300), null, null
    );
    insertDupMember.run('dm-5', 'grp-garbage-w22', 'cmp-1005', 0.87, JSON.stringify(['Within 95m of NGR-1004', 'Same category: Garbage']), isoOffset(-1020));

    insertComplaint.run(
      'cmp-1006', 'NGR-1006', 'user-citizen-2',
      'Missed garbage van pickup on Ayyappa Society Lane 2',
      'Third consecutive day without morning collection; bins full across residential block.',
      'Garbage', 'Medium', 'Authority Assigned',
      17.4506, 78.3775, 'Ayyappa Society Lane 2, Madhapur',
      'ward-22', 'dept-sanitation', 'auth-w22', null,
      null, null, 'grp-garbage-w22',
      isoOffset(900), null, isoOffset(-180), isoOffset(-180), null, null
    );
    insertDupMember.run('dm-6', 'grp-garbage-w22', 'cmp-1006', 0.83, JSON.stringify(['Within 110m of NGR-1004', 'Same category: Garbage']), isoOffset(-180));

    // CMP-1007 & CMP-1008: Recurring Drainage Blockage in Ward 09 (Begumpet)
    insertComplaint.run(
      'cmp-1007', 'NGR-1007', 'user-citizen-1',
      'Clogged stormwater drain causing foul waterlogging on Prakash Nagar service road',
      'Roadside catch pit completely choked with silt and leaf debris; stagnant water encroaching onto footpath.',
      'Drainage', 'High', 'In Progress',
      17.4438, 78.4664, 'Prakash Nagar Flyover Service Road, Begumpet',
      'ward-09', 'dept-drainage', 'auth-central', 'user-officer-drainage',
      null, null, 'grp-drainage-w09',
      isoOffset(-90), null, isoOffset(-600), isoOffset(-60), null, null
    );
    insertMedia.run('med-1007', 'cmp-1007', 'image', IMG_DRAINAGE, 'image/jpeg', 'Blocked catch pit grate at Prakash Nagar', 'user-citizen-1', isoOffset(-600));
    insertHistory.run('h-1007-1', 'cmp-1007', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Submitted with photo', isoOffset(-600));
    insertHistory.run('h-1007-2', 'cmp-1007', 'Submitted', 'Work Assigned', 'user-admin-1', 'Vikramaditya Nair (Demo Municipal Admin)', 'municipal_admin', 'Assigned to Drainage Unit D-02', isoOffset(-360));
    insertHistory.run('h-1007-3', 'cmp-1007', 'Work Assigned', 'In Progress', 'user-officer-drainage', 'Ramesh Goud (Demo Drainage Officer)', 'field_officer', 'Jetting machine on-site clearing downstream silt trap', isoOffset(-60));
    insertDupMember.run('dm-7', 'grp-drainage-w09', 'cmp-1007', 0.94, JSON.stringify(['Same drain line', 'Recurring drainage blockage']), isoOffset(-600));

    insertComplaint.run(
      'cmp-1008', 'NGR-1008', 'user-citizen-2',
      'Repeated drain silt backup at Prakash Nagar bus shelter',
      'Second blockage in 60 days along the same stormwater line.',
      'Drainage', 'High', 'Citizen Verified',
      17.4441, 78.4668, 'Prakash Nagar Bus Shelter, Begumpet',
      'ward-09', 'dept-drainage', 'auth-central', 'user-officer-drainage',
      null, null, 'grp-drainage-w09',
      isoOffset(-85000), null, isoOffset(-86400), isoOffset(-84000), isoOffset(-84800), isoOffset(-84000)
    );
    insertDupMember.run('dm-8', 'grp-drainage-w09', 'cmp-1008', 0.89, JSON.stringify(['Within 55m of NGR-1007', 'Same category: Drainage']), isoOffset(-86400));

    // CMP-1009: Water Leakage in Ward 18 (Jubilee Hills)
    insertComplaint.run(
      'cmp-1009', 'NGR-1009', 'user-citizen-1',
      'Pressurized municipal water main leak wasting clean water at Road No. 36',
      'Clean drinking water bubbling through cracked curb seam continuously since morning.',
      'Water leakage', 'High', 'Inspection Pending',
      17.4318, 78.4045, 'Road No. 36, Jubilee Hills (Metro Pillar 1620)',
      'ward-18', 'dept-water', 'auth-w14', 'user-officer-water',
      null, null, null,
      isoOffset(110), null, isoOffset(-130), isoOffset(-40), null, null
    );
    insertMedia.run('med-1009', 'cmp-1009', 'image', IMG_WATER, 'image/jpeg', 'Pressurized pipe leak at Road No. 36', 'user-citizen-1', isoOffset(-130));
    insertHistory.run('h-1009-1', 'cmp-1009', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Reported water pipe burst', isoOffset(-130));
    insertHistory.run('h-1009-2', 'cmp-1009', 'Submitted', 'Forwarded', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Forwarded to Water Supply Board', isoOffset(-80));
    insertHistory.run('h-1009-3', 'cmp-1009', 'Forwarded', 'Inspection Pending', 'user-officer-water', 'Farhan Ahmed (Demo Water Field Officer)', 'field_officer', 'Valve shutoff inspection scheduled', isoOffset(-40));

    // CMP-1010: Critical Open Manhole in Ward 27 (Gachibowli) — Overdue & Escalated
    insertComplaint.run(
      'cmp-1010', 'NGR-1010', 'user-citizen-3',
      'Missing cast-iron manhole cover on pedestrian shoulder near DLF Gate 2',
      'Completely open 2-foot stormwater manhole right next to office commuter walkway with poor evening visibility.',
      'Open manholes', 'Critical', 'Escalated',
      17.4476, 78.3522, 'DLF Cyber City Gate 2, Gachibowli',
      'ward-27', 'dept-drainage', 'auth-w22', 'user-officer-drainage',
      null, null, null,
      isoOffset(-45), isoOffset(-30), isoOffset(-60), isoOffset(-30), null, null
    );
    insertHistory.run('h-1010-1', 'cmp-1010', null, 'Submitted', 'user-citizen-3', 'Meera Reddy (Demo Citizen)', 'citizen', 'Urgent open manhole report', isoOffset(-60));
    insertHistory.run('h-1010-2', 'cmp-1010', 'Submitted', 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', 'Auto-flagged Critical via Safety Rule R-01', isoOffset(-59));
    insertHistory.run('h-1010-3', 'cmp-1010', 'Authority Assigned', 'Escalated', null, 'NagarAI SLA Monitor', 'system', 'Demo 15-min Critical SLA exceeded; escalated to Municipal Admin', isoOffset(-30));

    // CMP-1011: Streetlight Failure in Ward 04 (Secunderabad)
    insertComplaint.run(
      'cmp-1011', 'NGR-1011', 'user-citizen-2',
      'Five consecutive LED streetlights non-functional along Paradise service lane',
      'Complete darkness along pedestrian stretch from 6:30 PM onwards creating commuter safety risk.',
      'Streetlight failure', 'Medium', 'Acknowledged',
      17.4412, 78.4898, 'Paradise Circle Arterial Road, Secunderabad',
      'ward-04', 'dept-electrical', 'auth-central', null,
      null, null, null,
      isoOffset(840), null, isoOffset(-600), isoOffset(-240), null, null
    );

    // CMP-1013: Citizen Verified Footpath repair in Ward 18 (Jubilee Hills)
    insertComplaint.run(
      'cmp-1013', 'NGR-1013', 'user-citizen-1',
      'Broken tactile paver tiles along Film Nagar pedestrian footpath',
      'Dislodged concrete slabs posing tripping hazard for elderly walkers.',
      'Footpath damage', 'Medium', 'Citizen Verified',
      17.4184, 78.4085, 'Film Nagar Crossroad, Jubilee Hills',
      'ward-18', 'dept-roads', 'auth-w14', 'user-officer-roads',
      null, null, null,
      isoOffset(-4200), null, isoOffset(-5760), isoOffset(-3600), isoOffset(-4000), isoOffset(-3600)
    );
    insertMedia.run('med-1013', 'cmp-1013', 'image', IMG_POTHOLE_AFTER, 'image/jpeg', 'Restored pedestrian paving', 'user-officer-roads', isoOffset(-4000));

    // CMP-1014: Citizen Verified Streetlight repair in Ward 04 (Secunderabad)
    insertComplaint.run(
      'cmp-1014', 'NGR-1014', 'user-citizen-2',
      'Faulty feeder switchboard causing blackout near Clock Tower Market',
      'Entire market lane lighting out for 2 nights.',
      'Streetlight failure', 'High', 'Citizen Verified',
      17.4426, 78.5018, 'Clock Tower Market Road, Secunderabad',
      'ward-04', 'dept-electrical', 'auth-central', null,
      null, null, null,
      isoOffset(-2880), null, isoOffset(-3400), isoOffset(-2500), isoOffset(-2950), isoOffset(-2500)
    );

    // 9. Seed Real Escalation Records for overdue critical issues
    const insertEsc = db.prepare(`
      INSERT INTO escalation_records (id, complaint_id, triggered_by, from_role, to_role, overdue_minutes, delay_reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEsc.run('esc-1', 'cmp-1001', 'SLA Monitor (Demo 15m Rule)', 'ward_rep', 'municipal_admin', 30, 'Pending hot-mix batch plant confirmation for arterial repair', 'Open', isoOffset(-12));
    insertEsc.run('esc-2', 'cmp-1010', 'SLA Monitor (Demo 15m Rule)', 'ward_rep', 'municipal_admin', 45, 'Replacement heavy-duty FRC cover dispatched from central depot', 'Open', isoOffset(-30));

    // 10. Seed Citizen Feedback for verified resolutions
    const insertFb = db.prepare(`
      INSERT INTO citizen_feedback (id, complaint_id, citizen_id, verdict, comment, rating, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertFb.run('fb-1', 'cmp-1003', 'user-citizen-2', 'resolved', 'Patched quickly, though underlying drainage needs permanent check.', 4, isoOffset(-63000));
    insertFb.run('fb-2', 'cmp-1008', 'user-citizen-2', 'resolved', 'Drain cleared and water receded within hours.', 5, isoOffset(-84000));
    insertFb.run('fb-3', 'cmp-1013', 'user-citizen-1', 'resolved', 'Footpath pavers neatly leveled and safe to walk.', 5, isoOffset(-3600));
    insertFb.run('fb-4', 'cmp-1014', 'user-citizen-2', 'resolved', 'Feeder repaired and all market LEDs working.', 5, isoOffset(-2500));

    // 11. Seed Initial Notifications for Citizen, Ward Rep, Field Officer, Admin
    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, complaint_id, title, body, notif_type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    insertNotif.run('n-1', 'user-citizen-1', 'cmp-1002', 'Resolution Evidence Ready for Your Verification', 'Roads Field Unit uploaded before/after repair proof for NGR-1002 (Care Hospital Stretch). Please inspect and verify.', 'verification_needed', isoOffset(-25));
    insertNotif.run('n-2', 'user-citizen-1', 'cmp-1001', 'SLA Escalation Triggered on NGR-1001', 'Critical pothole complaint on Road No. 12 exceeded the demo 15-min target and was escalated to Municipal Command Desk.', 'escalation', isoOffset(-12));
    insertNotif.run('n-3', 'user-ward-14', 'cmp-1001', 'Critical Escalation in Ward 14', 'NGR-1001 (Banjara Hills Road No. 12) is part of a 3-report recurring pothole cluster and has breached demo SLA.', 'escalation', isoOffset(-12));
    insertNotif.run('n-4', 'user-officer-roads', 'cmp-1001', 'Priority Field Dispatch: NGR-1001', 'Assigned to inspect waterlogged pothole at Road No. 12, Banjara Hills.', 'assignment', isoOffset(-40));
    insertNotif.run('n-5', 'user-admin-1', 'cmp-1010', 'Critical Safety Escalation: Open Manhole', 'NGR-1010 in Ward 27 (Gachibowli) exceeded demo 15-min SLA target.', 'escalation', isoOffset(-30));
  });

  tx();
}
