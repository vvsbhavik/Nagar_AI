import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  computeAllWardHealthScores,
  computeLiveHotspotsAndInsights,
  findNearbyPotentialDuplicates,
  getAllEscalationRecords,
  getAllWardsWithAuthority,
  getComplaintDetail,
  getComplaintsList,
  getDuplicateGroupById,
  linkComplaintToDuplicateCluster,
} from './src/server/analytics.ts';
import {
  createSession,
  getProfileById,
  optionalAuth,
  requireAuth,
  requireRole,
  revokeSession,
  type AuthRequest,
} from './src/server/auth.ts';
import {
  db,
  hashPassword,
  initDatabase,
  UPLOAD_ROOT,
  verifyPassword,
} from './src/server/db.ts';
import {
  analyzeCivicComplaint,
  answerCivicAssistant,
  compareResolutionEvidence,
  transcribeCivicVoice,
} from './src/server/gemini.ts';
import {
  DEMO_LANDMARKS,
  identifyWardFromBoundaries,
} from './src/server/geo.ts';
import {
  COMPLAINT_CATEGORIES,
  SEVERITIES,
  type ComplaintCategory,
  type ComplaintStatus,
  type Severity,
} from './src/shared/types.ts';

initDatabase();

const app = express();
app.use(express.json({ limit: '25mb' }));

// Security headers suitable for iframe preview
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const ALLOWED_MEDIA_MIME: Record<string, { ext: string; mediaType: 'image' | 'audio' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', mediaType: 'image' },
  'image/jpg': { ext: 'jpg', mediaType: 'image' },
  'image/png': { ext: 'png', mediaType: 'image' },
  'image/webp': { ext: 'webp', mediaType: 'image' },
  'audio/webm': { ext: 'webm', mediaType: 'audio' },
  'audio/mp3': { ext: 'mp3', mediaType: 'audio' },
  'audio/mpeg': { ext: 'mp3', mediaType: 'audio' },
  'audio/wav': { ext: 'wav', mediaType: 'audio' },
  'audio/ogg': { ext: 'ogg', mediaType: 'audio' },
  'audio/mp4': { ext: 'm4a', mediaType: 'audio' },
  'video/mp4': { ext: 'mp4', mediaType: 'video' },
  'video/webm': { ext: 'webm', mediaType: 'video' },
};

function saveBase64Media(base64Input: string, mimeType: string): { url: string; mediaType: 'image' | 'audio' | 'video' } {
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  const meta = ALLOWED_MEDIA_MIME[cleanMime];
  if (!meta) {
    throw new Error(`Unsupported media type: ${cleanMime}`);
  }
  const stripped = base64Input.includes(',') ? base64Input.split(',')[1] : base64Input;
  const buffer = Buffer.from(stripped, 'base64');
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error('Uploaded file exceeds 12MB limit.');
  }
  const filename = `${crypto.randomUUID()}.${meta.ext}`;
  const fullPath = path.resolve(UPLOAD_ROOT, filename);
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error('Invalid upload target path.');
  }
  fs.writeFileSync(fullPath, buffer);
  return { url: `/api/media/${filename}`, mediaType: meta.mediaType };
}

function readLocalMediaAsBase64(mediaUrl: string | null): { base64: string; mimeType: string } | null {
  if (!mediaUrl) return null;
  let fullPath: string | null = null;
  if (mediaUrl.startsWith('/api/media/')) {
    const filename = mediaUrl.slice('/api/media/'.length);
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(filename)) return null;
    const resolved = path.resolve(UPLOAD_ROOT, filename);
    if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) return null;
    fullPath = resolved;
  } else if (mediaUrl.startsWith('/src/assets/images/')) {
    const filename = mediaUrl.slice('/src/assets/images/'.length);
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(filename)) return null;
    const assetsBase = path.resolve(process.cwd(), 'src', 'assets', 'images');
    const resolved = path.resolve(assetsBase, filename);
    if (!resolved.startsWith(assetsBase + path.sep)) return null;
    fullPath = resolved;
  }

  if (!fullPath || !fs.existsSync(fullPath)) return null;
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return {
    base64: fs.readFileSync(fullPath).toString('base64'),
    mimeType,
  };
}

function createNotification(userId: string, complaintId: string | null, title: string, body: string, notifType: string) {
  db.prepare(
    `
    INSERT INTO notifications (id, user_id, complaint_id, title, body, notif_type, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `
  ).run(`notif-${crypto.randomUUID().slice(0, 8)}`, userId, complaintId, title, body, notifType, new Date().toISOString());
}

function nextTrackingCode(): string {
  const row = db
    .prepare("SELECT tracking_code FROM complaints WHERE tracking_code LIKE 'NGR-%' ORDER BY CAST(SUBSTR(tracking_code, 5) AS INTEGER) DESC LIMIT 1")
    .get() as { tracking_code?: string } | undefined;
  const lastNum = row?.tracking_code ? parseInt(row.tracking_code.slice(4), 10) : 1014;
  return `NGR-${(Number.isFinite(lastNum) ? lastNum : 1014) + 1}`;
}

// Serve uploaded media safely
app.get('/api/media/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|webm|mp3|wav|ogg|m4a|mp4)$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid media identifier.' });
  }
  const fullPath = path.resolve(UPLOAD_ROOT, filename);
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Media not found.' });
  }
  res.sendFile(fullPath);
});

// ==================== AUTH ROUTES ====================

app.get('/api/auth/demo-accounts', (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT p.id, p.email, p.full_name, p.role, p.ward_id, p.department_id, p.avatar_initials,
             w.name AS ward_name, d.name AS department_name
      FROM profiles p
      LEFT JOIN wards w ON w.id = p.ward_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.id IN ('user-citizen-1', 'user-ward-14', 'user-admin-1', 'user-officer-roads')
      ORDER BY CASE p.role
        WHEN 'citizen' THEN 1
        WHEN 'ward_rep' THEN 2
        WHEN 'municipal_admin' THEN 3
        WHEN 'field_officer' THEN 4
      END
    `
    )
    .all();
  res.json({ accounts: rows });
});

app.post('/api/auth/demo-login', (req, res) => {
  const schema = z.object({
    role: z.enum(['citizen', 'ward_rep', 'municipal_admin', 'field_officer']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid demo role requested.' });
  }

  const idByRole: Record<string, string> = {
    citizen: 'user-citizen-1',
    ward_rep: 'user-ward-14',
    municipal_admin: 'user-admin-1',
    field_officer: 'user-officer-roads',
  };

  const user = getProfileById(idByRole[parsed.data.role]);
  if (!user) {
    return res.status(404).json({ error: 'Demo account unavailable.' });
  }
  const token = createSession(user.id);
  res.json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please provide a valid email and password.' });
  }

  const row = db
    .prepare('SELECT id, password_hash FROM profiles WHERE lower(email) = lower(?)')
    .get(parsed.data.email.trim()) as { id: string; password_hash: string } | undefined;

  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const user = getProfileById(row.id);
  if (!user) return res.status(404).json({ error: 'Profile not found.' });
  const token = createSession(user.id);
  res.json({ token, user });
});

app.post('/api/auth/register', (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8).max(72),
    wardId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please fill out name, valid email, and password (8+ chars).' });
  }

  const existing = db
    .prepare('SELECT id FROM profiles WHERE lower(email) = lower(?)')
    .get(parsed.data.email.trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  const initials = parsed.data.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'CZ';

  db.prepare(
    `
    INSERT INTO profiles (id, email, full_name, password_hash, role, ward_id, department_id, phone_masked, avatar_initials, is_demo, created_at)
    VALUES (?, ?, ?, ?, 'citizen', ?, NULL, NULL, ?, 0, ?)
  `
  ).run(
    id,
    parsed.data.email.trim().toLowerCase(),
    parsed.data.fullName.trim(),
    hashPassword(parsed.data.password),
    parsed.data.wardId || 'ward-14',
    initials,
    new Date().toISOString()
  );

  const user = getProfileById(id)!;
  const token = createSession(id);
  res.status(201).json({ token, user });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  const unread = db
    .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.user!.id) as { cnt: number };
  res.json({ user: req.user, unreadNotifications: unread.cnt });
});

app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res) => {
  if (req.token) revokeSession(req.token);
  res.json({ ok: true });
});

// ==================== META & LOCATION INTELLIGENCE ====================

app.get('/api/meta', (_req, res) => {
  const wards = getAllWardsWithAuthority();
  const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all() as Array<Record<string, unknown>>;
  const routingRules = db
    .prepare(
      `
      SELECT r.*, d.name AS department_name
      FROM department_routing_rules r
      JOIN departments d ON d.id = r.department_id
      ORDER BY r.category ASC
    `
    )
    .all() as Array<Record<string, unknown>>;
  const slaConfigs = db
    .prepare(
      `
      SELECT * FROM sla_configurations
      ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `
    )
    .all() as Array<Record<string, unknown>>;
  const fieldOfficers = db
    .prepare(
      `
      SELECT p.id, p.full_name, p.ward_id, p.department_id, p.avatar_initials,
             w.name AS ward_name, d.name AS department_name
      FROM profiles p
      LEFT JOIN wards w ON w.id = p.ward_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.role = 'field_officer'
      ORDER BY p.full_name ASC
    `
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    wards,
    landmarks: DEMO_LANDMARKS,
    departments: departments.map((d) => ({
      id: String(d.id),
      code: String(d.code),
      name: String(d.name),
      description: String(d.description),
      slaEscalationEmailDemo: String(d.sla_escalation_email_demo),
      colorHex: String(d.color_hex),
    })),
    routingRules: routingRules.map((r) => ({
      id: String(r.id),
      category: String(r.category),
      departmentId: String(r.department_id),
      departmentName: String(r.department_name),
      defaultPriority: String(r.default_priority),
      autoAssignEnabled: Boolean(r.auto_assign_enabled),
      updatedAt: String(r.updated_at),
    })),
    slaConfigs: slaConfigs.map((s) => ({
      id: String(s.id),
      severity: String(s.severity),
      targetMinutes: Number(s.target_minutes),
      escalateToRole: String(s.escalate_to_role),
      isDemoTarget: Boolean(s.is_demo_target),
      updatedAt: String(s.updated_at),
    })),
    fieldOfficers: fieldOfficers.map((f) => ({
      id: String(f.id),
      fullName: String(f.full_name),
      wardId: f.ward_id ? String(f.ward_id) : null,
      wardName: f.ward_name ? String(f.ward_name) : null,
      departmentId: f.department_id ? String(f.department_id) : null,
      departmentName: f.department_name ? String(f.department_name) : null,
      avatarInitials: String(f.avatar_initials),
    })),
  });
});

app.post('/api/geo/identify', (req, res) => {
  const schema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    category: z.string().optional(),
    text: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
  }

  const wards = getAllWardsWithAuthority();
  const geoMatch = identifyWardFromBoundaries(parsed.data.lat, parsed.data.lng, wards);
  const nearbyDuplicates = findNearbyPotentialDuplicates({
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    category: parsed.data.category,
    text: parsed.data.text,
    radiusMeters: 400,
  });

  res.json({
    ward: geoMatch.ward,
    matchType: geoMatch.matchType,
    distanceMeters: geoMatch.distanceMeters,
    isDemoBoundary: geoMatch.ward?.isDemoBoundary ?? true,
    primaryAuthority: geoMatch.ward?.primaryAuthority ?? null,
    nearbyDuplicates,
  });
});

// ==================== PUBLIC TRANSPARENCY (NO LOGIN REQUIRED) ====================

app.get('/api/public/overview', (_req, res) => {
  const complaints = getComplaintsList({ anonymize: true });
  const wards = getAllWardsWithAuthority();
  const wardHealth = computeAllWardHealthScores();
  const insights = computeLiveHotspotsAndInsights();

  const closedSet = new Set(['Resolved', 'Citizen Verified']);
  const verified = complaints.filter((c) => c.status === 'Citizen Verified');
  const resolved = complaints.filter((c) => closedSet.has(c.status));
  const open = complaints.filter((c) => !closedSet.has(c.status));

  const categoryMap = new Map<string, number>();
  for (const c of complaints) {
    categoryMap.set(c.category, (categoryMap.get(c.category) || 0) + 1);
  }
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const avgResHours =
    resolved.filter((c) => c.resolvedAt).length > 0
      ? Math.round(
          (resolved
            .filter((c) => c.resolvedAt)
            .reduce(
              (sum, c) =>
                sum +
                Math.max(
                  0.5,
                  (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) /
                    (1000 * 60 * 60)
                ),
              0
            ) /
            resolved.filter((c) => c.resolvedAt).length) *
            10
        ) / 10
      : 0;

  const duplicateGroups = db
    .prepare('SELECT id FROM duplicate_groups WHERE report_count >= 2 ORDER BY report_count DESC')
    .all() as Array<{ id: string }>;

  res.json({
    stats: {
      totalReports: complaints.length,
      openIssues: open.length,
      resolvedIssues: resolved.length,
      verifiedResolutions: verified.length,
      resolutionRatePct: complaints.length > 0 ? Math.round((resolved.length / complaints.length) * 100) : 0,
      avgResolutionHours: avgResHours,
    },
    complaints,
    wards,
    wardHealth,
    categoryBreakdown,
    insights,
    clusters: duplicateGroups.map((g) => getDuplicateGroupById(g.id)).filter(Boolean),
    verifiedShowcase: complaints.filter((c) => c.status === 'Citizen Verified' || c.status === 'Awaiting Citizen Verification').slice(0, 6),
  });
});

app.get('/api/public/complaints/:id', (req, res) => {
  const detail = getComplaintDetail(req.params.id, true);
  if (!detail) return res.status(404).json({ error: 'Complaint not found.' });
  res.json({ complaint: detail });
});

// ==================== SERVER-SIDE GEMINI AI ROUTES ====================

app.post('/api/ai/transcribe', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    audioBase64: z.string().min(20),
    mimeType: z.string().min(5),
    languageHint: z.enum(['te-IN', 'en-IN', 'auto']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid base64 audio and mimeType are required.' });
  }

  try {
    const cleanB64 = parsed.data.audioBase64.includes(',')
      ? parsed.data.audioBase64.split(',')[1]
      : parsed.data.audioBase64;
    const result = await transcribeCivicVoice({
      audioBase64: cleanB64,
      mimeType: parsed.data.mimeType.split(';')[0],
      languageHint: parsed.data.languageHint,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Transcription failed.' });
  }
});

app.post('/api/ai/analyze', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    text: z.string().max(2500).optional(),
    voiceTranscript: z.string().max(2500).optional(),
    voiceLanguage: z.string().max(20).optional(),
    imageBase64: z.string().optional(),
    imageMimeType: z.string().optional(),
    demoImagePath: z.string().optional(),
    addressHint: z.string().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid analysis input payload.' });
  }

  const { text, voiceTranscript, voiceLanguage, addressHint, demoImagePath } = parsed.data;
  let imageBase64 = parsed.data.imageBase64;
  let imageMimeType = parsed.data.imageMimeType;

  if (!imageBase64 && demoImagePath) {
    const loaded = readLocalMediaAsBase64(demoImagePath);
    if (loaded) {
      imageBase64 = loaded.base64;
      imageMimeType = loaded.mimeType;
    }
  } else if (imageBase64 && imageBase64.includes(',')) {
    imageBase64 = imageBase64.split(',')[1];
  }

  if (!text?.trim() && !voiceTranscript?.trim() && !imageBase64) {
    return res.status(400).json({
      error: 'Please provide at least a photo, voice transcript, or written description for AI analysis.',
    });
  }

  try {
    const deptRows = db.prepare('SELECT id, name FROM departments').all() as Array<{ id: string; name: string }>;
    const assessment = await analyzeCivicComplaint({
      text,
      voiceTranscript,
      voiceLanguage,
      imageBase64,
      imageMimeType,
      addressHint,
      availableDepartments: deptRows.map((d) => d.name),
    });

    // Align with configured DB routing rule for the predicted category
    const rule = db
      .prepare(
        `
        SELECT r.department_id, d.name AS department_name
        FROM department_routing_rules r
        JOIN departments d ON d.id = r.department_id
        WHERE r.category = ?
      `
      )
      .get(assessment.categoryPredicted) as { department_id: string; department_name: string } | undefined;

    if (rule) {
      assessment.suggestedDepartment = rule.department_name;
      assessment.suggestedDepartmentId = rule.department_id;
    }

    res.json({ assessment });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'AI analysis failed.' });
  }
});

app.post('/api/ai/assistant', optionalAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    question: z.string().min(2).max(1000),
    complaintId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid question.' });
  }

  try {
    const user = req.user;
    const isPublic = !user;

    const focusedComplaint = parsed.data.complaintId
      ? getComplaintDetail(parsed.data.complaintId, isPublic)
      : null;

    const myComplaints =
      user && user.role === 'citizen'
        ? getComplaintsList({ citizenId: user.id }).slice(0, 8)
        : user && user.role === 'field_officer'
        ? getComplaintsList({ officerId: user.id }).slice(0, 8)
        : user && user.role === 'ward_rep' && user.wardId
        ? getComplaintsList({ wardId: user.wardId }).slice(0, 10)
        : getComplaintsList({ anonymize: isPublic }).slice(0, 10);

    const slaConfigs = db.prepare('SELECT severity, target_minutes, escalate_to_role, is_demo_target FROM sla_configurations').all();
    const insights = computeLiveHotspotsAndInsights().slice(0, 5);
    const wardHealth = computeAllWardHealthScores().map((w) => ({
      wardName: w.wardName,
      wardCode: w.wardCode,
      score: w.score,
      supportTier: w.supportTier,
      openComplaints: w.metrics.openComplaints,
      overdueCount: w.metrics.overdueCount,
    }));

    const databaseContext = {
      currentTimeIso: new Date().toISOString(),
      focusedComplaint: focusedComplaint
        ? {
            trackingCode: focusedComplaint.trackingCode,
            title: focusedComplaint.title,
            category: focusedComplaint.category,
            severity: focusedComplaint.severity,
            status: focusedComplaint.status,
            wardName: focusedComplaint.wardName,
            departmentName: focusedComplaint.departmentName,
            assignedAuthority: focusedComplaint.assignedAuthorityName,
            assignedOfficer: focusedComplaint.assignedOfficerName,
            isOverdue: focusedComplaint.isOverdue,
            overdueMinutes: focusedComplaint.overdueMinutes,
            slaDeadline: focusedComplaint.slaDeadline,
            relatedReportsCount: focusedComplaint.relatedCount,
            recentTimeline: focusedComplaint.statusHistory.slice(-6),
            latestUpdates: focusedComplaint.updates.slice(0, 4),
            escalations: focusedComplaint.escalations,
            resolutionEvidenceCount: focusedComplaint.resolutionEvidence.length,
          }
        : null,
      relevantComplaints: myComplaints.map((c) => ({
        trackingCode: c.trackingCode,
        title: c.title,
        category: c.category,
        severity: c.severity,
        status: c.status,
        wardName: c.wardName,
        departmentName: c.departmentName,
        assignedAuthority: c.assignedAuthorityName,
        assignedOfficer: c.assignedOfficerName,
        isOverdue: c.isOverdue,
        overdueMinutes: c.overdueMinutes,
        relatedReportsCount: c.relatedCount,
        updatedAt: c.updatedAt,
      })),
      demoSlaTargets: slaConfigs,
      activeHotspotsAndInsights: insights.map((i) => ({
        title: i.title,
        wardName: i.wardName,
        complaintCount: i.supportingData.complaintCount,
        trackingCodes: i.supportingData.trackingCodes,
      })),
      wardSummary: wardHealth,
    };

    const result = await answerCivicAssistant({
      question: parsed.data.question,
      userRole: user?.role || 'public_observer',
      userName: user?.fullName || 'Public Observer',
      databaseContext,
    });

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Assistant error.' });
  }
});

// ==================== COMPLAINTS CRUD & LIFECYCLE ====================

app.get('/api/complaints', optionalAuth, (req: AuthRequest, res) => {
  const q = req.query;
  const scope = typeof q.scope === 'string' ? q.scope : 'all';
  const anonymize = !req.user;

  const filters: Parameters<typeof getComplaintsList>[0] = {
    search: typeof q.search === 'string' ? q.search : undefined,
    status: typeof q.status === 'string' ? q.status : undefined,
    category: typeof q.category === 'string' ? q.category : undefined,
    severity: typeof q.severity === 'string' ? q.severity : undefined,
    wardId: typeof q.wardId === 'string' ? q.wardId : undefined,
    departmentId: typeof q.departmentId === 'string' ? q.departmentId : undefined,
    dateFrom: typeof q.dateFrom === 'string' ? q.dateFrom : undefined,
    dateTo: typeof q.dateTo === 'string' ? q.dateTo : undefined,
    overdueOnly: q.overdueOnly === 'true',
    anonymize,
  };

  if (scope === 'mine' && req.user) {
    filters.citizenId = req.user.id;
  } else if (scope === 'assigned' && req.user) {
    filters.officerId = req.user.id;
  } else if (scope === 'ward' && req.user?.wardId && !filters.wardId) {
    filters.wardId = req.user.wardId;
  }

  const complaints = getComplaintsList(filters);
  res.json({ complaints });
});

app.get('/api/complaints/:id', optionalAuth, (req: AuthRequest, res) => {
  const detail = getComplaintDetail(req.params.id, !req.user);
  if (!detail) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  res.json({ complaint: detail });
});

app.post('/api/complaints', requireAuth, (req: AuthRequest, res) => {
  const schema = z.object({
    title: z.string().min(5).max(180),
    description: z.string().min(10).max(2500),
    category: z.enum(COMPLAINT_CATEGORIES),
    severity: z.enum(SEVERITIES),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    addressLabel: z.string().min(3).max(300),
    departmentId: z.string().optional().nullable(),
    voiceTranscript: z.string().max(2500).optional().nullable(),
    voiceLanguage: z.string().max(20).optional().nullable(),
    mediaUploads: z
      .array(
        z.object({
          base64: z.string().optional(),
          mimeType: z.string(),
          existingUrl: z.string().optional(),
          caption: z.string().max(200).optional(),
        })
      )
      .max(4)
      .optional(),
    aiAssessment: z
      .object({
        modelName: z.string(),
        categoryPredicted: z.string(),
        titleSuggested: z.string(),
        descriptionSuggested: z.string(),
        severityPredicted: z.string(),
        deterministicSeverity: z.string(),
        finalSeverity: z.string(),
        deterministicRuleApplied: z.string().nullable().optional(),
        confidence: z.number(),
        riskFactors: z.array(z.string()),
        severityExplanation: z.string(),
        suggestedDepartment: z.string(),
        suggestedAction: z.string(),
        additionalInfoRequired: z.array(z.string()),
      })
      .optional()
      .nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please complete all required complaint fields cleanly.' });
  }

  const data = parsed.data;
  const user = req.user!;
  const nowIso = new Date().toISOString();
  const complaintId = `cmp-${crypto.randomUUID().slice(0, 8)}`;
  const trackingCode = nextTrackingCode();

  // 1. Deterministic geospatial ward mapping
  const wards = getAllWardsWithAuthority();
  const geoMatch = identifyWardFromBoundaries(data.latitude, data.longitude, wards);
  const wardId = geoMatch.ward?.id ?? null;
  const assignedAuthorityId = geoMatch.ward?.primaryAuthority?.id ?? null;

  // 2. Smart Department Routing from DB rules
  let departmentId = data.departmentId || null;
  if (!departmentId) {
    const rule = db
      .prepare('SELECT department_id FROM department_routing_rules WHERE category = ?')
      .get(data.category) as { department_id?: string } | undefined;
    departmentId = rule?.department_id ?? 'dept-roads';
  }

  // 3. Configurable Demo SLA Target
  const slaRow = db
    .prepare('SELECT target_minutes FROM sla_configurations WHERE severity = ?')
    .get(data.severity) as { target_minutes?: number } | undefined;
  const targetMinutes = slaRow?.target_minutes ?? 1440;
  const slaDeadline = new Date(Date.now() + targetMinutes * 60 * 1000).toISOString();

  // Save media files safely before transaction
  const savedMedia: Array<{ url: string; mediaType: 'image' | 'audio' | 'video'; mimeType: string; caption: string | null }> = [];
  try {
    for (const m of data.mediaUploads || []) {
      if (m.base64) {
        const stored = saveBase64Media(m.base64, m.mimeType);
        savedMedia.push({
          url: stored.url,
          mediaType: stored.mediaType,
          mimeType: m.mimeType.split(';')[0],
          caption: m.caption || null,
        });
      } else if (m.existingUrl && (m.existingUrl.startsWith('/src/assets/images/') || m.existingUrl.startsWith('/api/media/'))) {
        savedMedia.push({
          url: m.existingUrl,
          mediaType: m.mimeType.startsWith('audio/') ? 'audio' : m.mimeType.startsWith('video/') ? 'video' : 'image',
          mimeType: m.mimeType.split(';')[0],
          caption: m.caption || null,
        });
      }
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Media upload error.' });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO complaints (
        id, tracking_code, citizen_id, title, description, category, severity, status,
        latitude, longitude, address_label, ward_id, department_id, assigned_authority_id,
        assigned_officer_id, voice_transcript, voice_language, duplicate_group_id,
        sla_deadline, escalated_at, created_at, updated_at, resolved_at, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Authority Assigned', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, NULL, ?, ?, NULL, NULL)
    `
    ).run(
      complaintId,
      trackingCode,
      user.id,
      data.title.trim(),
      data.description.trim(),
      data.category,
      data.severity,
      data.latitude,
      data.longitude,
      data.addressLabel.trim(),
      wardId,
      departmentId,
      assignedAuthorityId,
      data.voiceTranscript || null,
      data.voiceLanguage || null,
      slaDeadline,
      nowIso,
      nowIso
    );

    const insMedia = db.prepare(
      `INSERT INTO complaint_media (id, complaint_id, media_type, url, mime_type, caption, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sm of savedMedia) {
      insMedia.run(
        `med-${crypto.randomUUID().slice(0, 8)}`,
        complaintId,
        sm.mediaType,
        sm.url,
        sm.mimeType,
        sm.caption,
        user.id,
        nowIso
      );
    }

    if (data.aiAssessment) {
      db.prepare(
        `
        INSERT INTO ai_assessments (
          id, complaint_id, model_name, category_predicted, title_suggested, description_suggested,
          severity_predicted, deterministic_severity, final_severity, deterministic_rule_applied,
          confidence, risk_factors_json, severity_explanation, suggested_department, suggested_action,
          additional_info_required_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        `ai-${crypto.randomUUID().slice(0, 8)}`,
        complaintId,
        data.aiAssessment.modelName,
        data.aiAssessment.categoryPredicted,
        data.aiAssessment.titleSuggested,
        data.aiAssessment.descriptionSuggested,
        data.aiAssessment.severityPredicted,
        data.aiAssessment.deterministicSeverity,
        data.aiAssessment.finalSeverity,
        data.aiAssessment.deterministicRuleApplied ?? null,
        data.aiAssessment.confidence,
        JSON.stringify(data.aiAssessment.riskFactors),
        data.aiAssessment.severityExplanation,
        data.aiAssessment.suggestedDepartment,
        data.aiAssessment.suggestedAction,
        JSON.stringify(data.aiAssessment.additionalInfoRequired),
        nowIso
      );
    }

    // Auditable lifecycle timeline steps
    const insHist = db.prepare(
      `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const t0 = new Date(Date.now() - 3000).toISOString();
    const t1 = new Date(Date.now() - 2000).toISOString();
    const t2 = new Date(Date.now() - 1000).toISOString();

    insHist.run(`h-${crypto.randomUUID().slice(0, 8)}`, complaintId, null, 'Submitted', user.id, user.fullName, user.role, data.voiceTranscript ? 'Submitted with citizen voice & evidence' : 'Submitted by citizen', t0);
    if (data.aiAssessment) {
      insHist.run(`h-${crypto.randomUUID().slice(0, 8)}`, complaintId, 'Submitted', 'AI Analysis', null, 'NagarAI Analysis Engine', 'system', `Classified as ${data.category} (${data.severity}, ${Math.round(data.aiAssessment.confidence * 100)}% confidence)`, t1);
    }
    insHist.run(
      `h-${crypto.randomUUID().slice(0, 8)}`,
      complaintId,
      data.aiAssessment ? 'AI Analysis' : 'Submitted',
      'Jurisdiction Identified',
      null,
      'NagarAI Geo Engine',
      'system',
      geoMatch.ward
        ? `Mapped to ${geoMatch.ward.code} ${geoMatch.ward.name} (${geoMatch.matchType === 'exact_polygon' ? 'demo polygon boundary match' : 'nearest demo ward'})`
        : 'Outside demo ward boundary',
      t2
    );

    const deptNameRow = db.prepare('SELECT name FROM departments WHERE id = ?').get(departmentId) as { name?: string } | undefined;
    insHist.run(
      `h-${crypto.randomUUID().slice(0, 8)}`,
      complaintId,
      'Jurisdiction Identified',
      'Authority Assigned',
      null,
      'NagarAI Routing Engine',
      'system',
      `Routed to ${deptNameRow?.name || 'Municipal Department'} & ${geoMatch.ward?.primaryAuthority?.title || 'Ward Desk'}`,
      nowIso
    );

    // Duplicate Detection & Clustering (preserving individual citizen complaint!)
    linkComplaintToDuplicateCluster({
      complaintId,
      category: data.category as ComplaintCategory,
      severity: data.severity as Severity,
      lat: data.latitude,
      lng: data.longitude,
      title: data.title,
      description: data.description,
      wardId,
      addressLabel: data.addressLabel,
      createdAt: nowIso,
    });

    // Notify Citizen & Configured Ward Rep
    createNotification(
      user.id,
      complaintId,
      `Complaint ${trackingCode} Routed`,
      `Your ${data.category.toLowerCase()} report in ${geoMatch.ward?.name || 'Municipal Zone'} has been routed to ${deptNameRow?.name || 'the responsible department'}.`,
      'submitted'
    );

    if (assignedAuthorityId) {
      const authProfile = db
        .prepare('SELECT profile_id FROM authorities WHERE id = ?')
        .get(assignedAuthorityId) as { profile_id?: string } | undefined;
      if (authProfile?.profile_id) {
        createNotification(
          authProfile.profile_id,
          complaintId,
          `New ${data.severity} Complaint: ${trackingCode}`,
          `${data.title} (${geoMatch.ward?.name || 'Ward'}) requires acknowledgment.`,
          'new_complaint'
        );
      }
    }
  });

  tx();
  const detail = getComplaintDetail(complaintId);
  res.status(201).json({ complaint: detail });
});

// Ward Rep / Municipal Admin Workflow Actions
app.post(
  '/api/complaints/:id/action',
  requireAuth,
  requireRole('ward_rep', 'municipal_admin'),
  (req: AuthRequest, res) => {
    const schema = z.object({
      action: z.enum(['acknowledge', 'forward', 'assign_officer', 'post_update', 'escalate']),
      note: z.string().max(1000).optional(),
      departmentId: z.string().optional(),
      officerId: z.string().optional(),
      delayReason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow action parameters.' });
    }

    const existing = getComplaintDetail(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user!;
    const nowIso = new Date().toISOString();
    const { action, note, departmentId, officerId, delayReason } = parsed.data;

    let nextStatus: ComplaintStatus = existing.status;

    const tx = db.transaction(() => {
      if (action === 'acknowledge') {
        nextStatus = 'Acknowledged';
        db.prepare('UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, nowIso, existing.id);
      } else if (action === 'forward') {
        nextStatus = 'Forwarded';
        db.prepare('UPDATE complaints SET status = ?, department_id = COALESCE(?, department_id), updated_at = ? WHERE id = ?').run(
          nextStatus,
          departmentId || null,
          nowIso,
          existing.id
        );
      } else if (action === 'assign_officer') {
        if (!officerId) throw new Error('Please choose a field officer to assign.');
        const officer = getProfileById(officerId);
        if (!officer || officer.role !== 'field_officer') {
          throw new Error('Selected officer profile is invalid.');
        }
        nextStatus = 'Work Assigned';
        db.prepare('UPDATE complaints SET status = ?, assigned_officer_id = ?, updated_at = ? WHERE id = ?').run(
          nextStatus,
          officerId,
          nowIso,
          existing.id
        );
        db.prepare(
          `INSERT INTO complaint_assignments (id, complaint_id, assigned_by, assigned_to, role_type, notes, created_at) VALUES (?, ?, ?, ?, 'field_officer', ?, ?)`
        ).run(`asgn-${crypto.randomUUID().slice(0, 8)}`, existing.id, user.id, officerId, note || 'Assigned for field remediation', nowIso);

        createNotification(
          officerId,
          existing.id,
          `New Field Assignment: ${existing.trackingCode}`,
          `${existing.title} at ${existing.addressLabel}`,
          'assignment'
        );
      } else if (action === 'escalate') {
        nextStatus = 'Escalated';
        db.prepare('UPDATE complaints SET status = ?, escalated_at = ?, updated_at = ? WHERE id = ?').run(
          nextStatus,
          nowIso,
          nowIso,
          existing.id
        );
        db.prepare(
          `INSERT INTO escalation_records (id, complaint_id, triggered_by, from_role, to_role, overdue_minutes, delay_reason, status, created_at) VALUES (?, ?, ?, ?, 'municipal_admin', ?, ?, 'Open', ?)`
        ).run(
          `esc-${crypto.randomUUID().slice(0, 8)}`,
          existing.id,
          user.fullName,
          user.role,
          existing.overdueMinutes,
          delayReason || note || 'Manual authority escalation for expedited resolution',
          nowIso
        );
      }

      if (action !== 'post_update') {
        db.prepare(
          `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `h-${crypto.randomUUID().slice(0, 8)}`,
          existing.id,
          existing.status,
          nextStatus,
          user.id,
          user.fullName,
          user.role,
          note || delayReason || `Status updated to ${nextStatus}`,
          nowIso
        );
      }

      if (note?.trim() || delayReason?.trim()) {
        db.prepare(
          `INSERT INTO complaint_updates (id, complaint_id, author_id, author_name, author_role, update_type, message, obstacle_flag, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`
        ).run(
          `upd-${crypto.randomUUID().slice(0, 8)}`,
          existing.id,
          user.id,
          user.fullName,
          user.role,
          action,
          (note || delayReason || '').trim(),
          nowIso
        );
      }

      createNotification(
        existing.citizenId,
        existing.id,
        `${existing.trackingCode}: ${action === 'post_update' ? 'Official Update' : nextStatus}`,
        note?.trim() || `Updated by ${user.fullName}`,
        'status_update'
      );
    });

    try {
      tx();
      res.json({ complaint: getComplaintDetail(existing.id) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Action failed.' });
    }
  }
);

// Field Officer Progress Updates
app.post(
  '/api/complaints/:id/field-progress',
  requireAuth,
  requireRole('field_officer', 'municipal_admin'),
  (req: AuthRequest, res) => {
    const schema = z.object({
      status: z.enum(['Inspection Pending', 'In Progress', 'Work Assigned']),
      note: z.string().min(3).max(1000),
      obstacleFlag: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please provide a valid field status and inspection note.' });
    }

    const existing = getComplaintDetail(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user!;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare('UPDATE complaints SET status = ?, assigned_officer_id = COALESCE(assigned_officer_id, ?), updated_at = ? WHERE id = ?').run(
        parsed.data.status,
        user.id,
        nowIso,
        existing.id
      );

      db.prepare(
        `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `h-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        existing.status,
        parsed.data.status,
        user.id,
        user.fullName,
        user.role,
        parsed.data.note.trim(),
        nowIso
      );

      db.prepare(
        `INSERT INTO complaint_updates (id, complaint_id, author_id, author_name, author_role, update_type, message, obstacle_flag, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(
        `upd-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        user.id,
        user.fullName,
        user.role,
        parsed.data.obstacleFlag ? 'obstacle_reported' : 'field_progress',
        parsed.data.note.trim(),
        parsed.data.obstacleFlag ? 1 : 0,
        nowIso
      );

      createNotification(
        existing.citizenId,
        existing.id,
        `${existing.trackingCode} Field Update: ${parsed.data.status}`,
        parsed.data.note.trim(),
        'field_update'
      );
    });

    tx();
    res.json({ complaint: getComplaintDetail(existing.id) });
  }
);

// Resolution Evidence Upload + Live Gemini Before/After Comparison
app.post(
  '/api/complaints/:id/resolution-evidence',
  requireAuth,
  requireRole('field_officer', 'ward_rep', 'municipal_admin'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      afterImageBase64: z.string().optional(),
      afterMimeType: z.string().optional(),
      demoAfterImagePath: z.string().optional(),
      notes: z.string().min(4).max(1000),
      runAiComparison: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please attach resolution photo and completion notes.' });
    }

    const existing = getComplaintDetail(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user!;
    let afterUrl: string;
    let afterForAi: { base64: string; mimeType: string } | null = null;

    try {
      if (parsed.data.afterImageBase64 && parsed.data.afterMimeType) {
        const stored = saveBase64Media(parsed.data.afterImageBase64, parsed.data.afterMimeType);
        afterUrl = stored.url;
        afterForAi = {
          base64: parsed.data.afterImageBase64.includes(',')
            ? parsed.data.afterImageBase64.split(',')[1]
            : parsed.data.afterImageBase64,
          mimeType: parsed.data.afterMimeType.split(';')[0],
        };
      } else if (
        parsed.data.demoAfterImagePath &&
        parsed.data.demoAfterImagePath.startsWith('/src/assets/images/')
      ) {
        afterUrl = parsed.data.demoAfterImagePath;
        afterForAi = readLocalMediaAsBase64(parsed.data.demoAfterImagePath);
      } else {
        return res.status(400).json({ error: 'Please upload an after-repair photo.' });
      }
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid photo upload.' });
    }

    let aiComparison: Awaited<ReturnType<typeof compareResolutionEvidence>> | null = null;
    let aiWarning: string | null = null;

    if (parsed.data.runAiComparison !== false && afterForAi) {
      try {
        const beforeMedia = readLocalMediaAsBase64(existing.primaryImageUrl);
        aiComparison = await compareResolutionEvidence({
          beforeImageBase64: beforeMedia?.base64 || null,
          beforeMimeType: beforeMedia?.mimeType || null,
          afterImageBase64: afterForAi.base64,
          afterMimeType: afterForAi.mimeType,
          complaintTitle: existing.title,
          complaintCategory: existing.category,
          fieldNotes: parsed.data.notes,
        });
      } catch (err) {
        aiWarning = err instanceof Error ? err.message : 'AI evidence comparison unavailable.';
      }
    }

    const nowIso = new Date().toISOString();
    const t1 = new Date(Date.now() - 1000).toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO resolution_evidence (
          id, complaint_id, submitted_by, before_media_url, after_media_url, notes,
          ai_relevance_score, ai_visible_changes, ai_resolution_assessment,
          ai_mismatch_warnings_json, ai_confidence, ai_explanation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        `ev-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        user.id,
        existing.primaryImageUrl,
        afterUrl,
        parsed.data.notes.trim(),
        aiComparison?.relevanceScore ?? null,
        aiComparison?.visibleChanges ?? null,
        aiComparison?.resolutionAssessment ?? null,
        JSON.stringify(aiComparison?.mismatchWarnings ?? []),
        aiComparison?.confidence ?? null,
        aiComparison?.explanation ?? null,
        nowIso
      );

      db.prepare(
        `UPDATE complaints SET status = 'Awaiting Citizen Verification', resolved_at = ?, updated_at = ? WHERE id = ?`
      ).run(nowIso, nowIso, existing.id);

      db.prepare(
        `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, 'Resolution Evidence Submitted', ?, ?, ?, ?, ?)`
      ).run(
        `h-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        existing.status,
        user.id,
        user.fullName,
        user.role,
        parsed.data.notes.trim(),
        t1
      );

      db.prepare(
        `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, 'Resolution Evidence Submitted', 'Awaiting Citizen Verification', NULL, 'NagarAI Accountability Engine', 'system', ?, ?)`
      ).run(
        `h-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        aiComparison
          ? `AI Advisory: ${aiComparison.resolutionAssessment} (${Math.round(aiComparison.confidence * 100)}% confidence). Citizen verification required.`
          : 'Resolution photo recorded; awaiting citizen verification.',
        nowIso
      );

      db.prepare(
        `INSERT INTO complaint_updates (id, complaint_id, author_id, author_name, author_role, update_type, message, obstacle_flag, is_public, created_at) VALUES (?, ?, ?, ?, ?, 'resolution', ?, 0, 1, ?)`
      ).run(
        `upd-${crypto.randomUUID().slice(0, 8)}`,
        existing.id,
        user.id,
        user.fullName,
        user.role,
        parsed.data.notes.trim(),
        nowIso
      );

      createNotification(
        existing.citizenId,
        existing.id,
        `Verify Repair Evidence: ${existing.trackingCode}`,
        `${user.fullName} uploaded completion evidence. Please confirm whether the issue is resolved.`,
        'verification_needed'
      );
    });

    tx();
    res.json({ complaint: getComplaintDetail(existing.id), aiWarning });
  }
);

// Citizen Verification (Verify / Partial / Reject & Reopen)
app.post('/api/complaints/:id/verify', requireAuth, (req: AuthRequest, res) => {
  const schema = z.object({
    verdict: z.enum(['resolved', 'partially_resolved', 'not_resolved']),
    comment: z.string().max(1000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid verification verdict.' });
  }

  const existing = getComplaintDetail(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

  const user = req.user!;
  if (user.role === 'citizen' && existing.citizenId !== user.id) {
    return res.status(403).json({ error: 'Only the reporting citizen can verify this complaint.' });
  }

  const nowIso = new Date().toISOString();
  const nextStatus: ComplaintStatus =
    parsed.data.verdict === 'resolved' ? 'Citizen Verified' : 'Reopened';

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO citizen_feedback (id, complaint_id, citizen_id, verdict, comment, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `fb-${crypto.randomUUID().slice(0, 8)}`,
      existing.id,
      user.id,
      parsed.data.verdict,
      parsed.data.comment?.trim() || null,
      parsed.data.rating ?? null,
      nowIso
    );

    db.prepare(
      `
      UPDATE complaints
      SET status = ?,
          verified_at = CASE WHEN ? = 'Citizen Verified' THEN ? ELSE NULL END,
          resolved_at = CASE WHEN ? = 'Reopened' THEN NULL ELSE resolved_at END,
          updated_at = ?
      WHERE id = ?
    `
    ).run(nextStatus, nextStatus, nowIso, nextStatus, nowIso, existing.id);

    db.prepare(
      `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `h-${crypto.randomUUID().slice(0, 8)}`,
      existing.id,
      existing.status,
      nextStatus,
      user.id,
      user.fullName,
      user.role,
      parsed.data.comment?.trim() ||
        (parsed.data.verdict === 'resolved'
          ? 'Citizen confirmed repair resolution.'
          : `Citizen marked ${parsed.data.verdict.replace('_', ' ')} and reopened complaint.`),
      nowIso
    );

    if (existing.assignedOfficerId) {
      createNotification(
        existing.assignedOfficerId,
        existing.id,
        `${existing.trackingCode}: ${nextStatus}`,
        parsed.data.comment?.trim() || `Citizen submitted verification: ${parsed.data.verdict}.`,
        'citizen_verification'
      );
    }
  });

  tx();
  res.json({ complaint: getComplaintDetail(existing.id) });
});

// ==================== INTELLIGENCE, ESCALATIONS & ADMIN CONFIG ====================

app.get('/api/intelligence/summary', optionalAuth, (_req, res) => {
  const complaints = getComplaintsList();
  const closedSet = new Set(['Resolved', 'Citizen Verified']);
  const open = complaints.filter((c) => !closedSet.has(c.status));
  const resolved = complaints.filter((c) => closedSet.has(c.status));
  const critical = open.filter((c) => c.severity === 'Critical');
  const overdue = open.filter((c) => c.isOverdue);

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const resolvedThisMonth = resolved.filter(
    (c) => c.resolvedAt && new Date(c.resolvedAt).getTime() >= monthAgo
  ).length;

  const avgResolutionHours =
    resolved.filter((c) => c.resolvedAt).length > 0
      ? Math.round(
          (resolved
            .filter((c) => c.resolvedAt)
            .reduce(
              (sum, c) =>
                sum +
                Math.max(
                  0.5,
                  (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) /
                    (1000 * 60 * 60)
                ),
              0
            ) /
            resolved.filter((c) => c.resolvedAt).length) *
            10
        ) / 10
      : 0;

  // Department workload
  const deptRows = db.prepare('SELECT id, name, color_hex FROM departments').all() as Array<{
    id: string;
    name: string;
    color_hex: string;
  }>;
  const departmentWorkload = deptRows.map((d) => {
    const dc = complaints.filter((c) => c.departmentId === d.id);
    return {
      departmentId: d.id,
      departmentName: d.name,
      colorHex: d.color_hex,
      total: dc.length,
      open: dc.filter((c) => !closedSet.has(c.status)).length,
      resolved: dc.filter((c) => closedSet.has(c.status)).length,
      overdue: dc.filter((c) => c.isOverdue).length,
    };
  });

  // Ward distribution
  const wards = getAllWardsWithAuthority();
  const wardDistribution = wards.map((w) => {
    const wc = complaints.filter((c) => c.wardId === w.id);
    return {
      wardId: w.id,
      wardCode: w.code,
      wardName: w.name,
      total: wc.length,
      open: wc.filter((c) => !closedSet.has(c.status)).length,
      critical: wc.filter((c) => !closedSet.has(c.status) && c.severity === 'Critical').length,
      resolved: wc.filter((c) => closedSet.has(c.status)).length,
    };
  });

  // Real trend grouped by month from actual DB rows
  const monthBuckets = new Map<string, { month: string; reported: number; resolved: number }>();
  for (const c of complaints) {
    const d = new Date(c.createdAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const entry = monthBuckets.get(key) || { month: label, reported: 0, resolved: 0 };
    entry.reported += 1;
    if (closedSet.has(c.status)) entry.resolved += 1;
    monthBuckets.set(key, entry);
  }
  const trends = Array.from(monthBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);

  const dupIds = db
    .prepare('SELECT id FROM duplicate_groups WHERE report_count >= 2 ORDER BY report_count DESC')
    .all() as Array<{ id: string }>;

  res.json({
    kpis: {
      totalComplaints: complaints.length,
      openComplaints: open.length,
      criticalComplaints: critical.length,
      overdueComplaints: overdue.length,
      resolvedThisMonth,
      avgResolutionHours,
      resolutionRatePct:
        complaints.length > 0 ? Math.round((resolved.length / complaints.length) * 100) : 0,
    },
    departmentWorkload,
    wardDistribution,
    trends,
    wardHealth: computeAllWardHealthScores(),
    insights: computeLiveHotspotsAndInsights(),
    duplicateGroups: dupIds.map((g) => getDuplicateGroupById(g.id)).filter(Boolean),
    escalations: getAllEscalationRecords(),
  });
});

app.post(
  '/api/escalations/sweep',
  requireAuth,
  requireRole('ward_rep', 'municipal_admin'),
  (req: AuthRequest, res) => {
    const overdueOpen = getComplaintsList({ overdueOnly: true });
    const nowIso = new Date().toISOString();
    let createdCount = 0;

    const tx = db.transaction(() => {
      for (const c of overdueOpen) {
        if (c.status === 'Escalated') continue;
        const sla = db
          .prepare('SELECT escalate_to_role, target_minutes FROM sla_configurations WHERE severity = ?')
          .get(c.severity) as { escalate_to_role?: string; target_minutes?: number } | undefined;

        db.prepare('UPDATE complaints SET status = \'Escalated\', escalated_at = ?, updated_at = ? WHERE id = ?').run(
          nowIso,
          nowIso,
          c.id
        );
        db.prepare(
          `INSERT INTO escalation_records (id, complaint_id, triggered_by, from_role, to_role, overdue_minutes, delay_reason, status, created_at) VALUES (?, ?, ?, 'ward_rep', ?, ?, ?, 'Open', ?)`
        ).run(
          `esc-${crypto.randomUUID().slice(0, 8)}`,
          c.id,
          `SLA Sweep (${req.user!.fullName})`,
          sla?.escalate_to_role || 'municipal_admin',
          c.overdueMinutes,
          `Exceeded configured demo ${sla?.target_minutes ?? 60}m SLA target by ${c.overdueMinutes} min`,
          nowIso
        );
        db.prepare(
          `INSERT INTO complaint_status_history (id, complaint_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at) VALUES (?, ?, ?, 'Escalated', ?, ?, ?, ?, ?)`
        ).run(
          `h-${crypto.randomUUID().slice(0, 8)}`,
          c.id,
          c.status,
          req.user!.id,
          req.user!.fullName,
          req.user!.role,
          `Auto-escalated after exceeding SLA deadline by ${c.overdueMinutes} min`,
          nowIso
        );
        createdCount++;
      }
    });

    tx();
    res.json({ escalatedCount: createdCount, escalations: getAllEscalationRecords() });
  }
);

app.put(
  '/api/admin/routing-rules/:id',
  requireAuth,
  requireRole('municipal_admin'),
  (req: AuthRequest, res) => {
    const schema = z.object({
      departmentId: z.string().min(2),
      defaultPriority: z.enum(SEVERITIES),
      autoAssignEnabled: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid routing rule payload.' });

    const result = db
      .prepare(
        `UPDATE department_routing_rules SET department_id = ?, default_priority = ?, auto_assign_enabled = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        parsed.data.departmentId,
        parsed.data.defaultPriority,
        parsed.data.autoAssignEnabled ? 1 : 0,
        new Date().toISOString(),
        req.params.id
      );

    if (result.changes === 0) return res.status(404).json({ error: 'Routing rule not found.' });
    res.json({ ok: true });
  }
);

app.put(
  '/api/admin/sla-configs/:id',
  requireAuth,
  requireRole('municipal_admin'),
  (req: AuthRequest, res) => {
    const schema = z.object({
      targetMinutes: z.number().int().min(5).max(43200),
      escalateToRole: z.enum(['ward_rep', 'municipal_admin']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid SLA configuration payload.' });

    const result = db
      .prepare(
        `UPDATE sla_configurations SET target_minutes = ?, escalate_to_role = ?, updated_at = ? WHERE id = ?`
      )
      .run(parsed.data.targetMinutes, parsed.data.escalateToRole, new Date().toISOString(), req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'SLA config not found.' });
    res.json({ ok: true });
  }
);

// ==================== NOTIFICATIONS ====================

app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.user!.id) as Array<Record<string, unknown>>;
  res.json({
    notifications: rows.map((n) => ({
      id: String(n.id),
      userId: String(n.user_id),
      complaintId: n.complaint_id ? String(n.complaint_id) : null,
      title: String(n.title),
      body: String(n.body),
      notifType: String(n.notif_type),
      isRead: Boolean(n.is_read),
      createdAt: String(n.created_at),
    })),
  });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// ==================== VITE / STATIC ASSET SERVER ====================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NagarAI full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
