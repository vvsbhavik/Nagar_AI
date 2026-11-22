import crypto from 'crypto';
import { db } from './db.ts';
import {
  computeTextSimilarity,
  computeWardHealthScore,
  haversineMeters,
} from './geo.ts';
import type {
  AiAssessment,
  CivicInsight,
  ComplaintCategory,
  ComplaintDetail,
  ComplaintStatus,
  ComplaintSummary,
  DuplicateGroup,
  EscalationRecord,
  Severity,
  Ward,
  WardHealthScore,
} from '../shared/types.ts';

const CLOSED_STATUSES = new Set<string>(['Resolved', 'Citizen Verified']);

export function getAllWardsWithAuthority(): Ward[] {
  const rows = db
    .prepare(
      `
      SELECT
        w.*,
        a.id AS auth_id,
        a.title AS auth_title,
        a.contact_label_demo AS auth_contact,
        a.is_demo_official AS auth_is_demo,
        p.full_name AS auth_name
      FROM wards w
      LEFT JOIN ward_authority_mapping wam ON wam.ward_id = w.id AND wam.is_primary = 1
      LEFT JOIN authorities a ON a.id = wam.authority_id
      LEFT JOIN profiles p ON p.id = a.profile_id
      ORDER BY w.code ASC
    `
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    zone: String(r.zone),
    populationDemo: Number(r.population_demo),
    areaSqkm: Number(r.area_sqkm),
    centerLat: Number(r.center_lat),
    centerLng: Number(r.center_lng),
    boundaryGeojson: JSON.parse(String(r.boundary_geojson)),
    isDemoBoundary: Boolean(r.is_demo_boundary),
    primaryAuthority: r.auth_id
      ? {
          id: String(r.auth_id),
          name: String(r.auth_name || r.auth_title),
          title: String(r.auth_title),
          contactLabelDemo: String(r.auth_contact),
          isDemoOfficial: Boolean(r.auth_is_demo),
        }
      : null,
  }));
}

function hydrateComplaintSummary(row: Record<string, unknown>, anonymize = false): ComplaintSummary {
  const status = String(row.status) as ComplaintStatus;
  const slaDeadline = row.sla_deadline ? String(row.sla_deadline) : null;
  const nowMs = Date.now();
  const isClosed = CLOSED_STATUSES.has(status);
  let isOverdue = false;
  let overdueMinutes = 0;

  if (!isClosed && slaDeadline) {
    const diffMs = nowMs - new Date(slaDeadline).getTime();
    if (diffMs > 0) {
      isOverdue = true;
      overdueMinutes = Math.round(diffMs / 60000);
    }
  }

  const rawLat = Number(row.latitude);
  const rawLng = Number(row.longitude);

  return {
    id: String(row.id),
    trackingCode: String(row.tracking_code),
    citizenId: anonymize ? 'anonymized' : String(row.citizen_id),
    citizenName: anonymize ? undefined : row.citizen_name ? String(row.citizen_name) : undefined,
    title: String(row.title),
    description: String(row.description),
    category: String(row.category) as ComplaintCategory,
    severity: String(row.severity) as Severity,
    status,
    latitude: anonymize ? Math.round(rawLat * 1000) / 1000 : rawLat,
    longitude: anonymize ? Math.round(rawLng * 1000) / 1000 : rawLng,
    addressLabel: String(row.address_label),
    wardId: row.ward_id ? String(row.ward_id) : null,
    wardCode: row.ward_code ? String(row.ward_code) : null,
    wardName: row.ward_name ? String(row.ward_name) : null,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: row.department_name ? String(row.department_name) : null,
    assignedAuthorityId: row.assigned_authority_id ? String(row.assigned_authority_id) : null,
    assignedAuthorityName: row.authority_name ? String(row.authority_name) : null,
    assignedAuthorityTitle: row.authority_title ? String(row.authority_title) : null,
    assignedOfficerId: row.assigned_officer_id ? String(row.assigned_officer_id) : null,
    assignedOfficerName: row.officer_name ? String(row.officer_name) : null,
    voiceTranscript: anonymize ? null : row.voice_transcript ? String(row.voice_transcript) : null,
    voiceLanguage: row.voice_language ? String(row.voice_language) : null,
    duplicateGroupId: row.duplicate_group_id ? String(row.duplicate_group_id) : null,
    relatedCount: row.related_count ? Number(row.related_count) : 1,
    slaDeadline,
    isOverdue,
    overdueMinutes,
    escalatedAt: row.escalated_at ? String(row.escalated_at) : null,
    primaryImageUrl: row.primary_image_url ? String(row.primary_image_url) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
  };
}

export interface ComplaintFilterParams {
  search?: string;
  status?: string;
  category?: string;
  severity?: string;
  wardId?: string;
  departmentId?: string;
  citizenId?: string;
  officerId?: string;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  anonymize?: boolean;
}

export function getComplaintsList(filters: ComplaintFilterParams = {}): ComplaintSummary[] {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];

  if (filters.search && filters.search.trim()) {
    where.push('(c.title LIKE ? OR c.description LIKE ? OR c.tracking_code LIKE ? OR c.address_label LIKE ?)');
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
  }
  if (filters.status && filters.status !== 'all') {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.category && filters.category !== 'all') {
    where.push('c.category = ?');
    params.push(filters.category);
  }
  if (filters.severity && filters.severity !== 'all') {
    where.push('c.severity = ?');
    params.push(filters.severity);
  }
  if (filters.wardId && filters.wardId !== 'all') {
    where.push('c.ward_id = ?');
    params.push(filters.wardId);
  }
  if (filters.departmentId && filters.departmentId !== 'all') {
    where.push('c.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters.citizenId) {
    where.push('c.citizen_id = ?');
    params.push(filters.citizenId);
  }
  if (filters.officerId) {
    where.push('c.assigned_officer_id = ?');
    params.push(filters.officerId);
  }
  if (filters.dateFrom) {
    where.push('c.created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('c.created_at <= ?');
    params.push(`${filters.dateTo}T23:59:59.999Z`);
  }

  const sql = `
    SELECT
      c.*,
      cit.full_name AS citizen_name,
      w.code AS ward_code,
      w.name AS ward_name,
      d.name AS department_name,
      a.title AS authority_title,
      ap.full_name AS authority_name,
      offp.full_name AS officer_name,
      dg.report_count AS related_count,
      (
        SELECT cm.url FROM complaint_media cm
        WHERE cm.complaint_id = c.id AND cm.media_type = 'image'
        ORDER BY cm.created_at ASC LIMIT 1
      ) AS primary_image_url
    FROM complaints c
    LEFT JOIN profiles cit ON cit.id = c.citizen_id
    LEFT JOIN wards w ON w.id = c.ward_id
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN authorities a ON a.id = c.assigned_authority_id
    LEFT JOIN profiles ap ON ap.id = a.profile_id
    LEFT JOIN profiles offp ON offp.id = c.assigned_officer_id
    LEFT JOIN duplicate_groups dg ON dg.id = c.duplicate_group_id
    WHERE ${where.join(' AND ')}
    ORDER BY c.created_at DESC
  `;

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const hydrated = rows.map((r) => hydrateComplaintSummary(r, Boolean(filters.anonymize)));
  return filters.overdueOnly ? hydrated.filter((c) => c.isOverdue) : hydrated;
}

export function getDuplicateGroupById(groupId: string): DuplicateGroup | null {
  const g = db
    .prepare(
      `
      SELECT dg.*, w.name AS ward_name
      FROM duplicate_groups dg
      LEFT JOIN wards w ON w.id = dg.ward_id
      WHERE dg.id = ?
    `
    )
    .get(groupId) as Record<string, unknown> | undefined;
  if (!g) return null;

  const members = db
    .prepare(
      `
      SELECT
        dgm.complaint_id, dgm.similarity_score, dgm.match_reasons_json, dgm.created_at,
        c.tracking_code, c.title, c.status, c.severity
      FROM duplicate_group_members dgm
      JOIN complaints c ON c.id = dgm.complaint_id
      WHERE dgm.group_id = ?
      ORDER BY dgm.created_at DESC
    `
    )
    .all(groupId) as Array<Record<string, unknown>>;

  return {
    id: String(g.id),
    canonicalComplaintId: String(g.canonical_complaint_id),
    category: String(g.category) as ComplaintCategory,
    wardId: g.ward_id ? String(g.ward_id) : null,
    wardName: g.ward_name ? String(g.ward_name) : null,
    centerLat: Number(g.center_lat),
    centerLng: Number(g.center_lng),
    addressLabel: String(g.address_label),
    priority: String(g.priority) as Severity,
    status: String(g.status),
    reportCount: Number(g.report_count),
    firstReportedAt: String(g.first_reported_at),
    lastReportedAt: String(g.last_reported_at),
    members: members.map((m) => ({
      complaintId: String(m.complaint_id),
      trackingCode: String(m.tracking_code),
      title: String(m.title),
      status: String(m.status) as ComplaintStatus,
      severity: String(m.severity) as Severity,
      similarityScore: Number(m.similarity_score),
      matchReasons: JSON.parse(String(m.match_reasons_json || '[]')),
      createdAt: String(m.created_at),
    })),
  };
}

export function getComplaintDetail(id: string, anonymize = false): ComplaintDetail | null {
  const row = db
    .prepare(
      `
      SELECT
        c.*,
        cit.full_name AS citizen_name,
        w.code AS ward_code,
        w.name AS ward_name,
        d.name AS department_name,
        a.title AS authority_title,
        ap.full_name AS authority_name,
        offp.full_name AS officer_name,
        dg.report_count AS related_count,
        (
          SELECT cm.url FROM complaint_media cm
          WHERE cm.complaint_id = c.id AND cm.media_type = 'image'
          ORDER BY cm.created_at ASC LIMIT 1
        ) AS primary_image_url
      FROM complaints c
      LEFT JOIN profiles cit ON cit.id = c.citizen_id
      LEFT JOIN wards w ON w.id = c.ward_id
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN authorities a ON a.id = c.assigned_authority_id
      LEFT JOIN profiles ap ON ap.id = a.profile_id
      LEFT JOIN profiles offp ON offp.id = c.assigned_officer_id
      LEFT JOIN duplicate_groups dg ON dg.id = c.duplicate_group_id
      WHERE c.id = ? OR c.tracking_code = ?
    `
    )
    .get(id, id) as Record<string, unknown> | undefined;

  if (!row) return null;
  const summary = hydrateComplaintSummary(row, anonymize);

  const mediaRows = db
    .prepare('SELECT * FROM complaint_media WHERE complaint_id = ? ORDER BY created_at ASC')
    .all(summary.id) as Array<Record<string, unknown>>;

  const aiRow = db
    .prepare('SELECT * FROM ai_assessments WHERE complaint_id = ?')
    .get(summary.id) as Record<string, unknown> | undefined;

  const historyRows = db
    .prepare('SELECT * FROM complaint_status_history WHERE complaint_id = ? ORDER BY created_at ASC')
    .all(summary.id) as Array<Record<string, unknown>>;

  const updateRows = db
    .prepare('SELECT * FROM complaint_updates WHERE complaint_id = ? ORDER BY created_at DESC')
    .all(summary.id) as Array<Record<string, unknown>>;

  const evidenceRows = db
    .prepare(
      `
      SELECT re.*, p.full_name AS submitted_by_name
      FROM resolution_evidence re
      LEFT JOIN profiles p ON p.id = re.submitted_by
      WHERE re.complaint_id = ?
      ORDER BY re.created_at DESC
    `
    )
    .all(summary.id) as Array<Record<string, unknown>>;

  const escRows = db
    .prepare('SELECT * FROM escalation_records WHERE complaint_id = ? ORDER BY created_at DESC')
    .all(summary.id) as Array<Record<string, unknown>>;

  const fbRows = db
    .prepare('SELECT * FROM citizen_feedback WHERE complaint_id = ? ORDER BY created_at DESC')
    .all(summary.id) as Array<Record<string, unknown>>;

  const aiAssessment: AiAssessment | null = aiRow
    ? {
        id: String(aiRow.id),
        complaintId: String(aiRow.complaint_id),
        modelName: String(aiRow.model_name),
        categoryPredicted: String(aiRow.category_predicted) as ComplaintCategory,
        titleSuggested: String(aiRow.title_suggested),
        descriptionSuggested: String(aiRow.description_suggested),
        severityPredicted: String(aiRow.severity_predicted) as Severity,
        deterministicSeverity: String(aiRow.deterministic_severity) as Severity,
        finalSeverity: String(aiRow.final_severity) as Severity,
        deterministicRuleApplied: aiRow.deterministic_rule_applied
          ? String(aiRow.deterministic_rule_applied)
          : null,
        confidence: Number(aiRow.confidence),
        riskFactors: JSON.parse(String(aiRow.risk_factors_json || '[]')),
        severityExplanation: String(aiRow.severity_explanation),
        suggestedDepartment: String(aiRow.suggested_department),
        suggestedAction: String(aiRow.suggested_action),
        additionalInfoRequired: JSON.parse(String(aiRow.additional_info_required_json || '[]')),
        createdAt: String(aiRow.created_at),
      }
    : null;

  return {
    ...summary,
    media: mediaRows.map((m) => ({
      id: String(m.id),
      complaintId: String(m.complaint_id),
      mediaType: String(m.media_type) as 'image' | 'audio' | 'video',
      url: String(m.url),
      mimeType: String(m.mime_type),
      caption: m.caption ? String(m.caption) : null,
      uploadedBy: anonymize ? null : m.uploaded_by ? String(m.uploaded_by) : null,
      createdAt: String(m.created_at),
    })),
    aiAssessment,
    statusHistory: historyRows.map((h) => ({
      id: String(h.id),
      complaintId: String(h.complaint_id),
      fromStatus: h.from_status ? String(h.from_status) : null,
      toStatus: String(h.to_status) as ComplaintStatus,
      actorId: anonymize ? null : h.actor_id ? String(h.actor_id) : null,
      actorName: anonymize && h.actor_role === 'citizen' ? 'Citizen Reporter' : String(h.actor_name),
      actorRole: String(h.actor_role),
      note: h.note ? String(h.note) : null,
      createdAt: String(h.created_at),
    })),
    updates: updateRows.map((u) => ({
      id: String(u.id),
      complaintId: String(u.complaint_id),
      authorId: anonymize ? null : u.author_id ? String(u.author_id) : null,
      authorName: anonymize && u.author_role === 'citizen' ? 'Citizen Reporter' : String(u.author_name),
      authorRole: String(u.author_role),
      updateType: String(u.update_type),
      message: String(u.message),
      obstacleFlag: Boolean(u.obstacle_flag),
      isPublic: Boolean(u.is_public),
      createdAt: String(u.created_at),
    })),
    resolutionEvidence: evidenceRows.map((ev) => ({
      id: String(ev.id),
      complaintId: String(ev.complaint_id),
      submittedBy: ev.submitted_by ? String(ev.submitted_by) : null,
      submittedByName: ev.submitted_by_name ? String(ev.submitted_by_name) : 'Field Unit',
      beforeMediaUrl: ev.before_media_url ? String(ev.before_media_url) : null,
      afterMediaUrl: String(ev.after_media_url),
      notes: ev.notes ? String(ev.notes) : null,
      aiRelevanceScore: ev.ai_relevance_score != null ? Number(ev.ai_relevance_score) : null,
      aiVisibleChanges: ev.ai_visible_changes ? String(ev.ai_visible_changes) : null,
      aiResolutionAssessment: ev.ai_resolution_assessment
        ? String(ev.ai_resolution_assessment)
        : null,
      aiMismatchWarnings: JSON.parse(String(ev.ai_mismatch_warnings_json || '[]')),
      aiConfidence: ev.ai_confidence != null ? Number(ev.ai_confidence) : null,
      aiExplanation: ev.ai_explanation ? String(ev.ai_explanation) : null,
      createdAt: String(ev.created_at),
    })),
    escalations: escRows.map((e) => ({
      id: String(e.id),
      complaintId: String(e.complaint_id),
      triggeredBy: String(e.triggered_by),
      fromRole: String(e.from_role),
      toRole: String(e.to_role),
      overdueMinutes: Number(e.overdue_minutes),
      delayReason: e.delay_reason ? String(e.delay_reason) : null,
      status: String(e.status),
      createdAt: String(e.created_at),
    })),
    citizenFeedback: fbRows.map((f) => ({
      id: String(f.id),
      complaintId: String(f.complaint_id),
      citizenId: anonymize ? 'anonymized' : String(f.citizen_id),
      verdict: String(f.verdict) as 'resolved' | 'partially_resolved' | 'not_resolved',
      comment: f.comment ? String(f.comment) : null,
      rating: f.rating != null ? Number(f.rating) : null,
      createdAt: String(f.created_at),
    })),
    duplicateGroup: summary.duplicateGroupId ? getDuplicateGroupById(summary.duplicateGroupId) : null,
  };
}

export function findNearbyPotentialDuplicates(params: {
  lat: number;
  lng: number;
  category?: string;
  text?: string;
  radiusMeters?: number;
}) {
  const radius = params.radiusMeters ?? 400;
  const rows = db
    .prepare('SELECT id, tracking_code, title, description, category, status, latitude, longitude, duplicate_group_id, created_at FROM complaints ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;

  const matches: Array<{
    complaintId: string;
    trackingCode: string;
    title: string;
    category: ComplaintCategory;
    status: ComplaintStatus;
    distanceMeters: number;
    similarityScore: number;
    duplicateGroupId: string | null;
    createdAt: string;
  }> = [];

  for (const r of rows) {
    const dist = haversineMeters(params.lat, params.lng, Number(r.latitude), Number(r.longitude));
    if (dist > radius) continue;

    const sameCategory =
      !params.category ||
      r.category === params.category ||
      ((params.category === 'Potholes' || params.category === 'Road damage') &&
        (r.category === 'Potholes' || r.category === 'Road damage'));

    if (!sameCategory && dist > 150) continue;

    const textSim = params.text
      ? computeTextSimilarity(params.text, `${r.title} ${r.description}`)
      : 0.35;
    const distScore = Math.max(0, 1 - dist / radius);
    const catScore = sameCategory ? 0.45 : 0.1;
    const score = Math.min(0.99, Math.round((distScore * 0.4 + catScore + textSim * 0.25) * 100) / 100);

    if (score >= 0.45) {
      matches.push({
        complaintId: String(r.id),
        trackingCode: String(r.tracking_code),
        title: String(r.title),
        category: String(r.category) as ComplaintCategory,
        status: String(r.status) as ComplaintStatus,
        distanceMeters: dist,
        similarityScore: score,
        duplicateGroupId: r.duplicate_group_id ? String(r.duplicate_group_id) : null,
        createdAt: String(r.created_at),
      });
    }
  }

  return matches.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 6);
}

export function linkComplaintToDuplicateCluster(params: {
  complaintId: string;
  category: ComplaintCategory;
  severity: Severity;
  lat: number;
  lng: number;
  title: string;
  description: string;
  wardId: string | null;
  addressLabel: string;
  createdAt: string;
}): string | null {
  const candidates = findNearbyPotentialDuplicates({
    lat: params.lat,
    lng: params.lng,
    category: params.category,
    text: `${params.title} ${params.description}`,
    radiusMeters: 350,
  }).filter((c) => c.complaintId !== params.complaintId);

  if (candidates.length === 0) return null;

  const top = candidates[0];
  let groupId = top.duplicateGroupId;

  if (!groupId) {
    groupId = `grp-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      `
      INSERT INTO duplicate_groups (
        id, canonical_complaint_id, category, ward_id, center_lat, center_lng,
        address_label, priority, status, report_count, first_reported_at, last_reported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active Cluster', 2, ?, ?)
    `
    ).run(
      groupId,
      top.complaintId,
      params.category,
      params.wardId,
      params.lat,
      params.lng,
      params.addressLabel,
      params.severity,
      top.createdAt,
      params.createdAt
    );

    db.prepare('UPDATE complaints SET duplicate_group_id = ? WHERE id = ?').run(
      groupId,
      top.complaintId
    );
    db.prepare(
      `
      INSERT OR IGNORE INTO duplicate_group_members (id, group_id, complaint_id, similarity_score, match_reasons_json, created_at)
      VALUES (?, ?, ?, 1.0, ?, ?)
    `
    ).run(
      `dm-${crypto.randomUUID().slice(0, 8)}`,
      groupId,
      top.complaintId,
      JSON.stringify(['Primary cluster anchor report']),
      top.createdAt
    );
  } else {
    db.prepare(
      `
      UPDATE duplicate_groups
      SET report_count = report_count + 1,
          last_reported_at = ?,
          priority = CASE WHEN ? = 'Critical' THEN 'Critical' ELSE priority END
      WHERE id = ?
    `
    ).run(params.createdAt, params.severity, groupId);
  }

  db.prepare('UPDATE complaints SET duplicate_group_id = ? WHERE id = ?').run(
    groupId,
    params.complaintId
  );

  db.prepare(
    `
    INSERT OR IGNORE INTO duplicate_group_members (id, group_id, complaint_id, similarity_score, match_reasons_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    `dm-${crypto.randomUUID().slice(0, 8)}`,
    groupId,
    params.complaintId,
    top.similarityScore,
    JSON.stringify([
      `Within ${top.distanceMeters}m of ${top.trackingCode}`,
      `Category alignment: ${params.category}`,
      `Similarity score ${Math.round(top.similarityScore * 100)}%`,
    ]),
    params.createdAt
  );

  return groupId;
}

export function computeLiveHotspotsAndInsights(): CivicInsight[] {
  const complaints = getComplaintsList();
  const insights: CivicInsight[] = [];

  // 1. Recurring Infrastructure Intelligence from multi-month duplicate clusters
  const groups = db
    .prepare(
      `
      SELECT dg.*, w.name AS ward_name
      FROM duplicate_groups dg
      LEFT JOIN wards w ON w.id = dg.ward_id
      WHERE dg.report_count >= 2
      ORDER BY dg.report_count DESC
    `
    )
    .all() as Array<Record<string, unknown>>;

  for (const g of groups) {
    const firstMs = new Date(String(g.first_reported_at)).getTime();
    const lastMs = new Date(String(g.last_reported_at)).getTime();
    const spanDays = Math.max(1, Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24)));
    const memberRows = db
      .prepare(
        `
        SELECT c.tracking_code, c.status, c.sla_deadline
        FROM duplicate_group_members dgm
        JOIN complaints c ON c.id = dgm.complaint_id
        WHERE dgm.group_id = ?
      `
      )
      .all(String(g.id)) as Array<Record<string, unknown>>;
    const trackingCodes = memberRows.map((m) => String(m.tracking_code));
    const category = String(g.category);
    const wardName = g.ward_name ? String(g.ward_name) : 'Unassigned Ward';

    if (spanDays >= 30 && (category === 'Potholes' || category === 'Road damage' || category === 'Drainage')) {
      const months = Math.max(1, Math.round(spanDays / 30));
      insights.push({
        id: `ins-rec-${g.id}`,
        insightType: category === 'Drainage' ? 'recurring_drainage' : 'recurring_infrastructure',
        wardId: g.ward_id ? String(g.ward_id) : null,
        wardName,
        category,
        title: `Recurring ${category} Failure: ${g.address_label}`,
        summary: `${trackingCodes.length} verified citizen complaints recorded at this exact location over ${months} month(s) (${trackingCodes.join(', ')}), indicating repeated temporary repairs failing under load or runoff.`,
        recommendation:
          category === 'Drainage'
            ? 'Schedule structural desilting & downstream pipe gradient inspection instead of routine grate clearing.'
            : 'Commission full sub-base & drainage engineering audit before resurfacing instead of repeating cold-mix patch repairs.',
        isRecurringInfra: true,
        supportingData: {
          complaintCount: trackingCodes.length,
          trackingCodes,
          monthSpan: months,
          centerLat: Number(g.center_lat),
          centerLng: Number(g.center_lng),
          addressHint: String(g.address_label),
        },
        createdAt: String(g.last_reported_at),
      });
    } else if (category === 'Garbage') {
      insights.push({
        id: `ins-san-${g.id}`,
        insightType: 'sanitation_hotspot',
        wardId: g.ward_id ? String(g.ward_id) : null,
        wardName,
        category,
        title: `Sanitation Hotspot Cluster: ${g.address_label}`,
        summary: `${trackingCodes.length} clustered garbage & missed-pickup reports concentrated within 150m in ${wardName} (${trackingCodes.join(', ')}).`,
        recommendation: 'Add a secondary morning compactor sweep and evaluate bin capacity at Ayyappa Society transfer point.',
        isRecurringInfra: false,
        supportingData: {
          complaintCount: trackingCodes.length,
          trackingCodes,
          centerLat: Number(g.center_lat),
          centerLng: Number(g.center_lng),
          addressHint: String(g.address_label),
        },
        createdAt: String(g.last_reported_at),
      });
    } else {
      insights.push({
        id: `ins-clu-${g.id}`,
        insightType: 'road_cluster',
        wardId: g.ward_id ? String(g.ward_id) : null,
        wardName,
        category,
        title: `${category} Concentration in ${wardName}`,
        summary: `${trackingCodes.length} related reports linked near ${g.address_label} (${trackingCodes.join(', ')}).`,
        recommendation: 'Consolidate into a single multi-point work order for field efficiency.',
        isRecurringInfra: false,
        supportingData: {
          complaintCount: trackingCodes.length,
          trackingCodes,
          centerLat: Number(g.center_lat),
          centerLng: Number(g.center_lng),
          addressHint: String(g.address_label),
        },
        createdAt: String(g.last_reported_at),
      });
    }
  }

  // 2. Overdue Critical / High SLA Cluster Insight (computed directly from active overdue complaints)
  const overdueComplaints = complaints.filter((c) => c.isOverdue);
  if (overdueComplaints.length > 0) {
    insights.push({
      id: 'ins-overdue-city',
      insightType: 'overdue_cluster',
      wardId: overdueComplaints[0].wardId,
      wardName: 'Citywide SLA Watch',
      category: 'SLA Accountability',
      title: `${overdueComplaints.length} Active Complaint(s) Past Demo SLA Target`,
      summary: `Live SLA monitoring identifies ${overdueComplaints.length} open issue(s) currently past target response deadlines: ${overdueComplaints
        .slice(0, 5)
        .map((c) => `${c.trackingCode} (${c.severity}, +${c.overdueMinutes}m)`)
        .join(', ')}.`,
      recommendation: 'Prioritize rapid dispatch for escalated Critical hazards and record transparent delay reasons.',
      isRecurringInfra: false,
      supportingData: {
        complaintCount: overdueComplaints.length,
        overdueCount: overdueComplaints.length,
        trackingCodes: overdueComplaints.map((c) => c.trackingCode),
      },
      createdAt: new Date().toISOString(),
    });
  }

  return insights;
}

export function computeAllWardHealthScores(): WardHealthScore[] {
  const wards = getAllWardsWithAuthority();
  const complaints = getComplaintsList();
  const feedbackRows = db
    .prepare(
      `
      SELECT cf.verdict, c.ward_id
      FROM citizen_feedback cf
      JOIN complaints c ON c.id = cf.complaint_id
    `
    )
    .all() as Array<{ verdict: string; ward_id: string | null }>;

  const dupRows = db
    .prepare('SELECT ward_id, COUNT(*) as cnt FROM duplicate_groups WHERE report_count >= 2 GROUP BY ward_id')
    .all() as Array<{ ward_id: string | null; cnt: number }>;
  const dupMap = new Map(dupRows.map((d) => [d.ward_id, d.cnt]));

  return wards.map((ward) => {
    const wc = complaints.filter((c) => c.wardId === ward.id);
    const open = wc.filter((c) => !CLOSED_STATUSES.has(c.status));
    const resolved = wc.filter((c) => CLOSED_STATUSES.has(c.status));
    const critical = open.filter((c) => c.severity === 'Critical');
    const overdue = open.filter((c) => c.isOverdue);

    const resolutionHoursArr = resolved
      .filter((c) => c.resolvedAt)
      .map((c) => {
        const diff = new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime();
        return Math.max(0.5, diff / (1000 * 60 * 60));
      });
    const avgResolutionHours =
      resolutionHoursArr.length > 0
        ? resolutionHoursArr.reduce((a, b) => a + b, 0) / resolutionHoursArr.length
        : 0;

    const wf = feedbackRows.filter((f) => f.ward_id === ward.id);
    const posFb = wf.filter((f) => f.verdict === 'resolved').length;

    return computeWardHealthScore({
      ward,
      totalComplaints: wc.length,
      openComplaints: open.length,
      criticalCount: critical.length,
      overdueCount: overdue.length,
      recurringClusterCount: dupMap.get(ward.id) ?? 0,
      resolvedCount: resolved.length,
      avgResolutionHours,
      positiveFeedbackCount: posFb,
      totalFeedbackCount: wf.length,
    });
  });
}

export function getAllEscalationRecords(): EscalationRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        er.*,
        c.tracking_code,
        c.title AS complaint_title,
        c.severity,
        w.name AS ward_name
      FROM escalation_records er
      JOIN complaints c ON c.id = er.complaint_id
      LEFT JOIN wards w ON w.id = c.ward_id
      ORDER BY er.created_at DESC
    `
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    complaintId: String(r.complaint_id),
    trackingCode: String(r.tracking_code),
    complaintTitle: String(r.complaint_title),
    wardName: r.ward_name ? String(r.ward_name) : 'Unassigned',
    severity: String(r.severity) as Severity,
    triggeredBy: String(r.triggered_by),
    fromRole: String(r.from_role),
    toRole: String(r.to_role),
    overdueMinutes: Number(r.overdue_minutes),
    delayReason: r.delay_reason ? String(r.delay_reason) : null,
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
}
