import {
  computeTextSimilarity,
  computeWardHealthScore,
  DEMO_LANDMARKS,
  DEMO_WARDS,
  evaluateDeterministicSeverity,
  haversineMeters,
  identifyWardFromBoundaries,
} from '../server/geo.ts';
import type {
  AdminUserRecord,
  AiAssessment,
  AuthorityRecord,
  CitizenFeedback,
  CivicInsight,
  ComplaintCategory,
  ComplaintDetail,
  ComplaintMedia,
  ComplaintStatus,
  ComplaintSummary,
  ComplaintUpdate,
  Department,
  DuplicateGroup,
  EscalationRecord,
  GeoIdentifyResult,
  NotificationItem,
  RoutingRule,
  Severity,
  SlaConfig,
  StatusHistoryEntry,
  UserProfile,
  Ward,
} from '../shared/types.ts';
import type {
  IntelligenceSummaryPayload,
  MetaPayload,
  PublicOverviewPayload,
} from './api.ts';

interface StoredProfile extends UserProfile {
  passwordPlainDemo: string;
  createdAt: string;
}

interface FallbackState {
  version: number;
  profiles: StoredProfile[];
  authorities: AuthorityRecord[];
  wardAuthorityMap: Record<string, string>;
  departments: Department[];
  routingRules: RoutingRule[];
  slaConfigs: SlaConfig[];
  complaints: ComplaintDetail[];
  duplicateGroups: DuplicateGroup[];
  escalations: EscalationRecord[];
  feedback: CitizenFeedback[];
  notifications: NotificationItem[];
  nextTrackingNum: number;
}

const STORAGE_KEY = 'nagarai_vercel_civic_store_v2';
const CLOSED_STATUSES = new Set<ComplaintStatus>(['Resolved', 'Citizen Verified']);

const IMG_POTHOLE_BEFORE = '/src/assets/images/civic_pothole_before_1795354764751.jpg';
const IMG_POTHOLE_AFTER = '/src/assets/images/civic_pothole_after_1795354768452.jpg';
const IMG_GARBAGE = '/src/assets/images/civic_garbage_dump_1795354764626.jpg';
const IMG_DRAINAGE = '/src/assets/images/civic_drainage_overflow_1795354766130.jpg';
const IMG_WATER = '/src/assets/images/civic_water_leak_1795354775408.jpg';

function isoOffset(minutesDelta: number): string {
  return new Date(Date.now() + minutesDelta * 60 * 1000).toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function mkMedia(
  id: string,
  complaintId: string,
  url: string,
  caption: string,
  uploadedBy: string | null,
  createdAt: string
): ComplaintMedia {
  return {
    id,
    complaintId,
    mediaType: 'image',
    url,
    mimeType: 'image/jpeg',
    caption,
    uploadedBy,
    createdAt,
  };
}

function mkHist(
  id: string,
  complaintId: string,
  fromStatus: string | null,
  toStatus: ComplaintStatus,
  actorId: string | null,
  actorName: string,
  actorRole: string,
  note: string | null,
  createdAt: string
): StatusHistoryEntry {
  return { id, complaintId, fromStatus, toStatus, actorId, actorName, actorRole, note, createdAt };
}

function mkUpd(
  id: string,
  complaintId: string,
  authorId: string | null,
  authorName: string,
  authorRole: string,
  updateType: string,
  message: string,
  obstacleFlag: boolean,
  createdAt: string
): ComplaintUpdate {
  return {
    id,
    complaintId,
    authorId,
    authorName,
    authorRole,
    updateType,
    message,
    obstacleFlag,
    isPublic: true,
    createdAt,
  };
}

function createInitialState(): FallbackState {
  const departments: Department[] = [
    {
      id: 'dept-roads',
      code: 'RDS',
      name: 'Roads & Engineering',
      description: 'Potholes, asphalt resurfacing, footpaths, and arterial road maintenance.',
      slaEscalationEmailDemo: 'roads-demo@nagarai.demo',
      colorHex: '#0F7B55',
    },
    {
      id: 'dept-sanitation',
      code: 'SAN',
      name: 'Sanitation & Solid Waste',
      description: 'Municipal garbage collection, bin clearance, and street sweeping.',
      slaEscalationEmailDemo: 'sanitation-demo@nagarai.demo',
      colorHex: '#D97706',
    },
    {
      id: 'dept-drainage',
      code: 'DRN',
      name: 'Stormwater & Drainage',
      description: 'Stormwater drains, desilting, open manhole covers, and flood mitigation.',
      slaEscalationEmailDemo: 'drainage-demo@nagarai.demo',
      colorHex: '#2563EB',
    },
    {
      id: 'dept-water',
      code: 'WTR',
      name: 'Water Supply Board',
      description: 'Potable water pipelines, leak arrest, valve repairs, and pressure restoration.',
      slaEscalationEmailDemo: 'water-demo@nagarai.demo',
      colorHex: '#0284C7',
    },
    {
      id: 'dept-electrical',
      code: 'ELC',
      name: 'Electrical & Streetlights',
      description: 'LED streetlamps, feeder pillars, dark corridor lighting, and pole safety.',
      slaEscalationEmailDemo: 'electrical-demo@nagarai.demo',
      colorHex: '#7C3AED',
    },
    {
      id: 'dept-environment',
      code: 'ENV',
      name: 'Environment & Public Health',
      description: 'Air/noise pollution, illegal dumping remediation, and public health.',
      slaEscalationEmailDemo: 'environment-demo@nagarai.demo',
      colorHex: '#059669',
    },
  ];

  const profiles: StoredProfile[] = [
    {
      id: 'user-citizen-1',
      email: 'ananya.citizen@nagarai.demo',
      fullName: 'Ananya Rao (Demo Citizen)',
      role: 'citizen',
      wardId: 'ward-14',
      wardName: 'Banjara Hills',
      departmentId: null,
      departmentName: null,
      phoneMasked: '+91-98***-***14',
      avatarInitials: 'AR',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-citizen-2',
      email: 'kiran.citizen@nagarai.demo',
      fullName: 'Kiran Kumar (Demo Citizen)',
      role: 'citizen',
      wardId: 'ward-14',
      wardName: 'Banjara Hills',
      departmentId: null,
      departmentName: null,
      phoneMasked: '+91-97***-***22',
      avatarInitials: 'KK',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-citizen-3',
      email: 'meera.citizen@nagarai.demo',
      fullName: 'Meera Reddy (Demo Citizen)',
      role: 'citizen',
      wardId: 'ward-22',
      wardName: 'Madhapur',
      departmentId: null,
      departmentName: null,
      phoneMasked: '+91-90***-***88',
      avatarInitials: 'MR',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-ward-14',
      email: 'ward14.rep@nagarai.demo',
      fullName: 'Rajeshwari Devi (Demo Ward 14 Rep)',
      role: 'ward_rep',
      wardId: 'ward-14',
      wardName: 'Banjara Hills',
      departmentId: null,
      departmentName: null,
      phoneMasked: 'Ward Office 14 (Demo)',
      avatarInitials: 'RD',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-ward-22',
      email: 'ward22.rep@nagarai.demo',
      fullName: 'Prakash Varma (Demo Ward 22 Rep)',
      role: 'ward_rep',
      wardId: 'ward-22',
      wardName: 'Madhapur',
      departmentId: null,
      departmentName: null,
      phoneMasked: 'Ward Office 22 (Demo)',
      avatarInitials: 'PV',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-admin-1',
      email: 'admin@nagarai.demo',
      fullName: 'Vikramaditya Nair (Demo Municipal Admin)',
      role: 'municipal_admin',
      wardId: null,
      wardName: null,
      departmentId: null,
      departmentName: null,
      phoneMasked: 'Command Center (Demo)',
      avatarInitials: 'VN',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-officer-roads',
      email: 'field.roads@nagarai.demo',
      fullName: 'Suresh Babu (Demo Roads Field Officer)',
      role: 'field_officer',
      wardId: 'ward-14',
      wardName: 'Banjara Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      phoneMasked: 'Field Unit R-04 (Demo)',
      avatarInitials: 'SB',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-officer-sanitation',
      email: 'field.sanitation@nagarai.demo',
      fullName: 'Lakshmi Narayana (Demo Sanitation Officer)',
      role: 'field_officer',
      wardId: 'ward-22',
      wardName: 'Madhapur',
      departmentId: 'dept-sanitation',
      departmentName: 'Sanitation & Solid Waste',
      phoneMasked: 'Field Unit S-09 (Demo)',
      avatarInitials: 'LN',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-officer-drainage',
      email: 'field.drainage@nagarai.demo',
      fullName: 'Ramesh Goud (Demo Drainage Officer)',
      role: 'field_officer',
      wardId: 'ward-09',
      wardName: 'Begumpet',
      departmentId: 'dept-drainage',
      departmentName: 'Stormwater & Drainage',
      phoneMasked: 'Field Unit D-02 (Demo)',
      avatarInitials: 'RG',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
    {
      id: 'user-officer-water',
      email: 'field.water@nagarai.demo',
      fullName: 'Farhan Ahmed (Demo Water Field Officer)',
      role: 'field_officer',
      wardId: 'ward-18',
      wardName: 'Jubilee Hills',
      departmentId: 'dept-water',
      departmentName: 'Water Supply Board',
      phoneMasked: 'Field Unit W-07 (Demo)',
      avatarInitials: 'FA',
      isDemo: true,
      passwordPlainDemo: 'NagarAI@Demo2026',
      createdAt: isoOffset(-43200),
    },
  ];

  const authorities: AuthorityRecord[] = [
    {
      id: 'auth-w14',
      profileId: 'user-ward-14',
      name: 'Rajeshwari Devi (Demo Ward 14 Rep)',
      title: 'Ward 14 Civic Coordinator (Demo)',
      departmentId: 'dept-roads',
      contactLabelDemo: 'ward14-office@nagarai.demo',
      isDemoOfficial: true,
    },
    {
      id: 'auth-w22',
      profileId: 'user-ward-22',
      name: 'Prakash Varma (Demo Ward 22 Rep)',
      title: 'Ward 22 Civic Coordinator (Demo)',
      departmentId: 'dept-sanitation',
      contactLabelDemo: 'ward22-office@nagarai.demo',
      isDemoOfficial: true,
    },
    {
      id: 'auth-central',
      profileId: 'user-admin-1',
      name: 'Vikramaditya Nair (Demo Municipal Admin)',
      title: 'Central Municipal Command Desk (Demo)',
      departmentId: 'dept-drainage',
      contactLabelDemo: 'command-desk@nagarai.demo',
      isDemoOfficial: true,
    },
  ];

  const wardAuthorityMap: Record<string, string> = {
    'ward-14': 'auth-w14',
    'ward-18': 'auth-w14',
    'ward-22': 'auth-w22',
    'ward-27': 'auth-w22',
    'ward-09': 'auth-central',
    'ward-04': 'auth-central',
  };

  const ruleTime = isoOffset(-10000);
  const routingRules: RoutingRule[] = [
    { id: 'rule-road', category: 'Road damage', departmentId: 'dept-roads', departmentName: 'Roads & Engineering', defaultPriority: 'High', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-pothole', category: 'Potholes', departmentId: 'dept-roads', departmentName: 'Roads & Engineering', defaultPriority: 'High', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-footpath', category: 'Footpath damage', departmentId: 'dept-roads', departmentName: 'Roads & Engineering', defaultPriority: 'Medium', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-garbage', category: 'Garbage', departmentId: 'dept-sanitation', departmentName: 'Sanitation & Solid Waste', defaultPriority: 'Medium', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-drainage', category: 'Drainage', departmentId: 'dept-drainage', departmentName: 'Stormwater & Drainage', defaultPriority: 'High', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-flooding', category: 'Flooding', departmentId: 'dept-drainage', departmentName: 'Stormwater & Drainage', defaultPriority: 'Critical', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-manhole', category: 'Open manholes', departmentId: 'dept-drainage', departmentName: 'Stormwater & Drainage', defaultPriority: 'Critical', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-water', category: 'Water leakage', departmentId: 'dept-water', departmentName: 'Water Supply Board', defaultPriority: 'High', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-streetlight', category: 'Streetlight failure', departmentId: 'dept-electrical', departmentName: 'Electrical & Streetlights', defaultPriority: 'Medium', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-pollution', category: 'Pollution', departmentId: 'dept-environment', departmentName: 'Environment & Public Health', defaultPriority: 'Medium', autoAssignEnabled: true, updatedAt: ruleTime },
    { id: 'rule-other', category: 'Other', departmentId: 'dept-environment', departmentName: 'Environment & Public Health', defaultPriority: 'Low', autoAssignEnabled: true, updatedAt: ruleTime },
  ];

  const slaConfigs: SlaConfig[] = [
    { id: 'sla-critical', severity: 'Critical', targetMinutes: 15, escalateToRole: 'municipal_admin', isDemoTarget: true, updatedAt: ruleTime },
    { id: 'sla-high', severity: 'High', targetMinutes: 240, escalateToRole: 'ward_rep', isDemoTarget: true, updatedAt: ruleTime },
    { id: 'sla-medium', severity: 'Medium', targetMinutes: 1440, escalateToRole: 'ward_rep', isDemoTarget: true, updatedAt: ruleTime },
    { id: 'sla-low', severity: 'Low', targetMinutes: 4320, escalateToRole: 'ward_rep', isDemoTarget: true, updatedAt: ruleTime },
  ];

  const duplicateGroups: DuplicateGroup[] = [
    {
      id: 'grp-pothole-w14',
      canonicalComplaintId: 'cmp-1001',
      category: 'Potholes',
      wardId: 'ward-14',
      wardName: 'Banjara Hills',
      centerLat: 17.4127,
      centerLng: 78.4369,
      addressLabel: 'Road No. 12, Banjara Hills (Near Virinchi Junction)',
      priority: 'Critical',
      status: 'Active Cluster',
      reportCount: 3,
      firstReportedAt: isoOffset(-129600),
      lastReportedAt: isoOffset(-45),
      members: [
        { complaintId: 'cmp-1001', trackingCode: 'NGR-1001', title: 'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane', status: 'Escalated', severity: 'Critical', similarityScore: 0.96, matchReasons: ['Within 65m of cluster center', 'Same category: Potholes'], createdAt: isoOffset(-45) },
        { complaintId: 'cmp-1003', trackingCode: 'NGR-1003', title: 'Recurring pothole resurfacing breakdown on Banjara Hills Road No. 12', status: 'Citizen Verified', severity: 'High', similarityScore: 0.88, matchReasons: ['Within 48m of cluster center', 'Recurring location'], createdAt: isoOffset(-64800) },
        { complaintId: 'cmp-1012', trackingCode: 'NGR-1012', title: 'Asphalt depression & pothole formation on Road No. 12 bus stop', status: 'Resolved', severity: 'High', similarityScore: 0.85, matchReasons: ['Within 40m of cluster center', 'Multi-month recurrence'], createdAt: isoOffset(-129600) },
      ],
    },
    {
      id: 'grp-garbage-w22',
      canonicalComplaintId: 'cmp-1004',
      category: 'Garbage',
      wardId: 'ward-22',
      wardName: 'Madhapur',
      centerLat: 17.4512,
      centerLng: 78.3782,
      addressLabel: 'Ayyappa Society Main Road, Madhapur',
      priority: 'High',
      status: 'Hotspot Monitored',
      reportCount: 3,
      firstReportedAt: isoOffset(-4320),
      lastReportedAt: isoOffset(-180),
      members: [
        { complaintId: 'cmp-1004', trackingCode: 'NGR-1004', title: 'Overflowing municipal waste bin blocking Ayyappa Society main lane', status: 'Work Assigned', severity: 'High', similarityScore: 0.95, matchReasons: ['Cluster primary report', 'Sanitation hotspot zone'], createdAt: isoOffset(-1800) },
        { complaintId: 'cmp-1005', trackingCode: 'NGR-1005', title: 'Uncollected wet waste pile near Ayyappa Society 100ft corner', status: 'Acknowledged', severity: 'Medium', similarityScore: 0.87, matchReasons: ['Within 95m of NGR-1004', 'Same category: Garbage'], createdAt: isoOffset(-1020) },
        { complaintId: 'cmp-1006', trackingCode: 'NGR-1006', title: 'Missed garbage van pickup on Ayyappa Society Lane 2', status: 'Authority Assigned', severity: 'Medium', similarityScore: 0.83, matchReasons: ['Within 110m of NGR-1004', 'Same category: Garbage'], createdAt: isoOffset(-180) },
      ],
    },
    {
      id: 'grp-drainage-w09',
      canonicalComplaintId: 'cmp-1007',
      category: 'Drainage',
      wardId: 'ward-09',
      wardName: 'Begumpet',
      centerLat: 17.4438,
      centerLng: 78.4664,
      addressLabel: 'Prakash Nagar Flyover Service Road, Begumpet',
      priority: 'High',
      status: 'Recurring Cluster',
      reportCount: 2,
      firstReportedAt: isoOffset(-86400),
      lastReportedAt: isoOffset(-360),
      members: [
        { complaintId: 'cmp-1007', trackingCode: 'NGR-1007', title: 'Clogged stormwater drain causing foul waterlogging on Prakash Nagar service road', status: 'In Progress', severity: 'High', similarityScore: 0.94, matchReasons: ['Same drain line', 'Recurring drainage blockage'], createdAt: isoOffset(-600) },
        { complaintId: 'cmp-1008', trackingCode: 'NGR-1008', title: 'Repeated drain silt backup at Prakash Nagar bus shelter', status: 'Citizen Verified', severity: 'High', similarityScore: 0.89, matchReasons: ['Within 55m of NGR-1007', 'Same category: Drainage'], createdAt: isoOffset(-86400) },
      ],
    },
  ];

  const feedback: CitizenFeedback[] = [
    { id: 'fb-1', complaintId: 'cmp-1003', citizenId: 'user-citizen-2', verdict: 'resolved', comment: 'Patched quickly, though underlying drainage needs permanent check.', rating: 4, createdAt: isoOffset(-63000) },
    { id: 'fb-2', complaintId: 'cmp-1008', citizenId: 'user-citizen-2', verdict: 'resolved', comment: 'Drain cleared and water receded within hours.', rating: 5, createdAt: isoOffset(-84000) },
    { id: 'fb-3', complaintId: 'cmp-1013', citizenId: 'user-citizen-1', verdict: 'resolved', comment: 'Footpath pavers neatly leveled and safe to walk.', rating: 5, createdAt: isoOffset(-3600) },
    { id: 'fb-4', complaintId: 'cmp-1014', citizenId: 'user-citizen-2', verdict: 'resolved', comment: 'Feeder repaired and all market LEDs working.', rating: 5, createdAt: isoOffset(-2500) },
  ];

  const escalations: EscalationRecord[] = [
    {
      id: 'esc-1',
      complaintId: 'cmp-1001',
      trackingCode: 'NGR-1001',
      complaintTitle: 'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane',
      severity: 'Critical',
      wardName: 'Banjara Hills',
      triggeredBy: 'SLA Monitor (Demo 15m Rule)',
      fromRole: 'ward_rep',
      toRole: 'municipal_admin',
      overdueMinutes: 30,
      delayReason: 'Pending hot-mix batch plant confirmation for arterial repair',
      status: 'Open',
      createdAt: isoOffset(-12),
    },
    {
      id: 'esc-2',
      complaintId: 'cmp-1010',
      trackingCode: 'NGR-1010',
      complaintTitle: 'Missing cast-iron manhole cover on pedestrian shoulder near DLF Gate 2',
      severity: 'Critical',
      wardName: 'Gachibowli',
      triggeredBy: 'SLA Monitor (Demo 15m Rule)',
      fromRole: 'ward_rep',
      toRole: 'municipal_admin',
      overdueMinutes: 45,
      delayReason: 'Replacement heavy-duty FRC cover dispatched from central depot',
      status: 'Open',
      createdAt: isoOffset(-30),
    },
  ];

  const complaints: ComplaintDetail[] = [
    {
      id: 'cmp-1001',
      trackingCode: 'NGR-1001',
      citizenId: 'user-citizen-1',
      citizenName: 'Ananya Rao (Demo Citizen)',
      title: 'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane',
      description: 'Large water-filled pothole near Virinchi Junction causing two-wheelers to swerve into oncoming traffic. Rainwater hides the true depth (~18cm).',
      category: 'Potholes',
      severity: 'Critical',
      status: 'Escalated',
      latitude: 17.4126,
      longitude: 78.4368,
      addressLabel: 'Road No. 12, Banjara Hills (Near Virinchi Junction)',
      wardId: 'ward-14',
      wardCode: 'W-14',
      wardName: 'Banjara Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-roads',
      assignedOfficerName: 'Suresh Babu (Demo Roads Field Officer)',
      voiceTranscript: 'బంజారా హిల్స్ రోడ్ నంబర్ 12 లో పెద్ద గుంత ఉంది, వర్షం నీరు నిండిపోయి బైక్‌లు జారిపోతున్నాయి.',
      voiceLanguage: 'te-IN',
      duplicateGroupId: 'grp-pothole-w14',
      relatedCount: 3,
      slaDeadline: isoOffset(-30),
      escalatedAt: isoOffset(-12),
      createdAt: isoOffset(-45),
      updatedAt: isoOffset(-12),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: IMG_POTHOLE_BEFORE,
      isOverdue: true,
      overdueMinutes: 30,
      media: [mkMedia('med-1001', 'cmp-1001', IMG_POTHOLE_BEFORE, 'Citizen street photograph at Road No. 12', 'user-citizen-1', isoOffset(-45))],
      aiAssessment: {
        modelName: 'gemini-4-hydrogen',
        categoryPredicted: 'Potholes',
        titleSuggested: 'Deep waterlogged pothole on Banjara Hills Road No. 12 arterial lane',
        descriptionSuggested: 'Large water-filled asphalt crater visible in active traffic lane with loose aggregate edges.',
        severityPredicted: 'Critical',
        deterministicSeverity: 'Critical',
        finalSeverity: 'Critical',
        deterministicRuleApplied: 'Safety Rule R-02 & Traffic Safety Rule R-04: Waterlogged deep arterial pothole with two-wheeler skidding risk.',
        confidence: 0.94,
        riskFactors: ['Concealed depth due to standing rainwater', 'Active two-wheeler & bus commuter corridor', 'Fractured surrounding bitumen indicating sub-base failure'],
        severityExplanation: 'Severe roadway surface collapse in a high-density transit lane; high likelihood of two-wheeler accidents.',
        suggestedDepartment: 'Roads & Engineering',
        suggestedAction: 'Immediate safety barricading, dewatering, sub-base compaction, and hot-mix asphalt patching.',
        additionalInfoRequired: ['Confirm whether underground utility line runs directly underneath crater'],
      },
      statusHistory: [
        mkHist('h-1001-1', 'cmp-1001', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Submitted with photo + Telugu voice note', isoOffset(-45)),
        mkHist('h-1001-2', 'cmp-1001', 'Submitted', 'AI Analysis', null, 'NagarAI Analysis Engine', 'system', 'Classified as Potholes (Critical, 94% confidence)', isoOffset(-45)),
        mkHist('h-1001-3', 'cmp-1001', 'AI Analysis', 'Jurisdiction Identified', null, 'NagarAI Geo Engine', 'system', 'Matched Ward 14 — Banjara Hills via polygon boundary', isoOffset(-44)),
        mkHist('h-1001-4', 'cmp-1001', 'Jurisdiction Identified', 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', 'Routed to Roads & Engineering (Ward 14 Civic Coordinator)', isoOffset(-44)),
        mkHist('h-1001-5', 'cmp-1001', 'Authority Assigned', 'Escalated', null, 'NagarAI SLA Monitor', 'system', 'Demo 15-min Critical SLA breached; escalated to Municipal Command Desk', isoOffset(-12)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[0],
      escalations: [escalations[0]],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1002',
      trackingCode: 'NGR-1002',
      citizenId: 'user-citizen-1',
      citizenName: 'Ananya Rao (Demo Citizen)',
      title: 'Collapsed bitumen patch near Care Hospital stretch, Road No. 1',
      description: 'Severe broken road surface outside hospital entrance slowing ambulances and daily commuters.',
      category: 'Road damage',
      severity: 'High',
      status: 'Awaiting Citizen Verification',
      latitude: 17.4178,
      longitude: 78.4472,
      addressLabel: 'Road No. 1, Banjara Hills (Care Hospital Stretch)',
      wardId: 'ward-14',
      wardCode: 'W-14',
      wardName: 'Banjara Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-roads',
      assignedOfficerName: 'Suresh Babu (Demo Roads Field Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(90),
      escalatedAt: null,
      createdAt: isoOffset(-1440),
      updatedAt: isoOffset(-25),
      resolvedAt: isoOffset(-25),
      verifiedAt: null,
      primaryImageUrl: IMG_POTHOLE_BEFORE,
      isOverdue: false,
      overdueMinutes: 0,
      media: [mkMedia('med-1002', 'cmp-1002', IMG_POTHOLE_BEFORE, 'Original road damage reported by citizen', 'user-citizen-1', isoOffset(-1440))],
      aiAssessment: {
        modelName: 'gemini-4-hydrogen',
        categoryPredicted: 'Road damage',
        titleSuggested: 'Collapsed bitumen patch near Care Hospital stretch, Road No. 1',
        descriptionSuggested: 'Damaged asphalt surface impeding emergency hospital corridor access.',
        severityPredicted: 'High',
        deterministicSeverity: 'Critical',
        finalSeverity: 'Critical',
        deterministicRuleApplied: 'Safety Rule R-02: Adjacent to hospital corridor.',
        confidence: 0.91,
        riskFactors: ['Hospital ambulance corridor obstruction', 'Loose gravel scatter'],
        severityExplanation: 'Road damage adjacent to medical facility elevates response urgency.',
        suggestedDepartment: 'Roads & Engineering',
        suggestedAction: 'Mill damaged patch and relay compacted bituminous macadam.',
        additionalInfoRequired: [],
      },
      statusHistory: [
        mkHist('h-1002-1', 'cmp-1002', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Reported with photographic evidence', isoOffset(-1440)),
        mkHist('h-1002-2', 'cmp-1002', 'Submitted', 'Acknowledged', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Verified location and prioritized for ambulance corridor', isoOffset(-1320)),
        mkHist('h-1002-3', 'cmp-1002', 'Acknowledged', 'Work Assigned', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Assigned to Roads Field Unit R-04', isoOffset(-1260)),
        mkHist('h-1002-4', 'cmp-1002', 'Work Assigned', 'In Progress', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'Hot-mix asphalt crew mobilized and milling completed', isoOffset(-360)),
        mkHist('h-1002-5', 'cmp-1002', 'In Progress', 'Resolution Evidence Submitted', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'Uploaded post-resurfacing photograph & compaction check', isoOffset(-30)),
        mkHist('h-1002-6', 'cmp-1002', 'Resolution Evidence Submitted', 'Awaiting Citizen Verification', null, 'NagarAI Accountability Engine', 'system', 'AI advisory check completed; awaiting citizen sign-off', isoOffset(-25)),
      ],
      updates: [
        mkUpd('upd-1002-1', 'cmp-1002', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'resolution', 'Resurfaced 12 sq.m stretch with hot-mix bitumen and repainted lane shoulder.', false, isoOffset(-30)),
      ],
      resolutionEvidence: [
        {
          id: 'ev-1002',
          complaintId: 'cmp-1002',
          submittedBy: 'user-officer-roads',
          submittedByName: 'Suresh Babu (Demo Roads Field Officer)',
          beforeMediaUrl: IMG_POTHOLE_BEFORE,
          afterMediaUrl: IMG_POTHOLE_AFTER,
          notes: 'Completed sub-base compaction, hot-mix asphalt laydown, and white shoulder striping.',
          aiRelevanceScore: 0.93,
          aiVisibleChanges: 'Deep waterlogged crater is replaced by a freshly laid, level dark asphalt patch with restored white edge marking.',
          aiResolutionAssessment: 'Likely Resolved',
          aiMismatchWarnings: ['Camera perspective angle differs slightly between before/after photos; citizen on-site confirmation recommended.'],
          aiConfidence: 0.89,
          aiExplanation: 'Advisory assessment: The post-repair photo shows continuous compacted asphalt over the previously damaged lane segment. Final closure requires citizen verification.',
          createdAt: isoOffset(-25),
        },
      ],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1003',
      trackingCode: 'NGR-1003',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Recurring pothole resurfacing breakdown on Banjara Hills Road No. 12',
      description: 'Previous cold-mix patch washed out again after light rain near Virinchi Junction.',
      category: 'Potholes',
      severity: 'High',
      status: 'Citizen Verified',
      latitude: 17.4129,
      longitude: 78.4371,
      addressLabel: 'Road No. 12, Banjara Hills (50m east of Virinchi Junction)',
      wardId: 'ward-14',
      wardCode: 'W-14',
      wardName: 'Banjara Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-roads',
      assignedOfficerName: 'Suresh Babu (Demo Roads Field Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-pothole-w14',
      relatedCount: 3,
      slaDeadline: isoOffset(-64000),
      escalatedAt: null,
      createdAt: isoOffset(-64800),
      updatedAt: isoOffset(-63000),
      resolvedAt: isoOffset(-63500),
      verifiedAt: isoOffset(-63000),
      primaryImageUrl: IMG_POTHOLE_BEFORE,
      isOverdue: false,
      overdueMinutes: 0,
      media: [mkMedia('med-1003', 'cmp-1003', IMG_POTHOLE_BEFORE, 'Previous patch breakdown (historical)', 'user-citizen-2', isoOffset(-64800))],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1003-1', 'cmp-1003', null, 'Submitted', 'user-citizen-2', 'Kiran Kumar (Demo Citizen)', 'citizen', 'Historical recurring pothole report', isoOffset(-64800)),
        mkHist('h-1003-2', 'cmp-1003', 'Submitted', 'Citizen Verified', 'user-citizen-2', 'Kiran Kumar (Demo Citizen)', 'citizen', 'Patched quickly, though underlying drainage needs permanent check.', isoOffset(-63000)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[0],
      escalations: [],
      citizenFeedback: [feedback[0]],
    },
    {
      id: 'cmp-1012',
      trackingCode: 'NGR-1012',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Asphalt depression & pothole formation on Road No. 12 bus stop',
      description: 'Repeated water stagnation eroding tarmac at the exact same junction.',
      category: 'Potholes',
      severity: 'High',
      status: 'Resolved',
      latitude: 17.4124,
      longitude: 78.4366,
      addressLabel: 'Road No. 12, Banjara Hills (Opposite Virinchi Bus Bay)',
      wardId: 'ward-14',
      wardCode: 'W-14',
      wardName: 'Banjara Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-roads',
      assignedOfficerName: 'Suresh Babu (Demo Roads Field Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-pothole-w14',
      relatedCount: 3,
      slaDeadline: isoOffset(-129000),
      escalatedAt: null,
      createdAt: isoOffset(-129600),
      updatedAt: isoOffset(-128000),
      resolvedAt: isoOffset(-128200),
      verifiedAt: null,
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1012-1', 'cmp-1012', null, 'Submitted', 'user-citizen-2', 'Kiran Kumar (Demo Citizen)', 'citizen', 'Reported bus bay depression', isoOffset(-129600)),
        mkHist('h-1012-2', 'cmp-1012', 'Submitted', 'Resolved', 'user-officer-roads', 'Suresh Babu (Demo Roads Field Officer)', 'field_officer', 'Completed resurfacing', isoOffset(-128200)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[0],
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1004',
      trackingCode: 'NGR-1004',
      citizenId: 'user-citizen-3',
      citizenName: 'Meera Reddy (Demo Citizen)',
      title: 'Overflowing municipal waste bin blocking Ayyappa Society main lane',
      description: 'Commercial and residential garbage bags overflowing onto roadway for 3 days, creating foul odor and stray animal hazard.',
      category: 'Garbage',
      severity: 'High',
      status: 'Work Assigned',
      latitude: 17.4512,
      longitude: 78.3782,
      addressLabel: 'Ayyappa Society Main Road, Madhapur',
      wardId: 'ward-22',
      wardCode: 'W-22',
      wardName: 'Madhapur',
      departmentId: 'dept-sanitation',
      departmentName: 'Sanitation & Solid Waste',
      assignedAuthorityId: 'auth-w22',
      assignedAuthorityName: 'Ward 22 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-sanitation',
      assignedOfficerName: 'Lakshmi Narayana (Demo Sanitation Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-garbage-w22',
      relatedCount: 3,
      slaDeadline: isoOffset(-60),
      escalatedAt: null,
      createdAt: isoOffset(-1800),
      updatedAt: isoOffset(-120),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: IMG_GARBAGE,
      isOverdue: true,
      overdueMinutes: 60,
      media: [mkMedia('med-1004', 'cmp-1004', IMG_GARBAGE, 'Overflowing street bin at Ayyappa Society', 'user-citizen-3', isoOffset(-1800))],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1004-1', 'cmp-1004', null, 'Submitted', 'user-citizen-3', 'Meera Reddy (Demo Citizen)', 'citizen', 'Reported overflowing bin', isoOffset(-1800)),
        mkHist('h-1004-2', 'cmp-1004', 'Submitted', 'Acknowledged', 'user-ward-22', 'Prakash Varma (Demo Ward 22 Rep)', 'ward_rep', 'Acknowledged hotspot', isoOffset(-900)),
        mkHist('h-1004-3', 'cmp-1004', 'Acknowledged', 'Work Assigned', 'user-ward-22', 'Prakash Varma (Demo Ward 22 Rep)', 'ward_rep', 'Dispatched compactor crew S-09', isoOffset(-120)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[1],
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1005',
      trackingCode: 'NGR-1005',
      citizenId: 'user-citizen-3',
      citizenName: 'Meera Reddy (Demo Citizen)',
      title: 'Uncollected wet waste pile near Ayyappa Society 100ft corner',
      description: 'Garbage spilling into pedestrian path 90m from overflowing community bin.',
      category: 'Garbage',
      severity: 'Medium',
      status: 'Acknowledged',
      latitude: 17.4518,
      longitude: 78.3788,
      addressLabel: 'Ayyappa Society 100ft Road Corner, Madhapur',
      wardId: 'ward-22',
      wardCode: 'W-22',
      wardName: 'Madhapur',
      departmentId: 'dept-sanitation',
      departmentName: 'Sanitation & Solid Waste',
      assignedAuthorityId: 'auth-w22',
      assignedAuthorityName: 'Ward 22 Civic Coordinator (Demo)',
      assignedOfficerId: null,
      assignedOfficerName: null,
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-garbage-w22',
      relatedCount: 3,
      slaDeadline: isoOffset(420),
      escalatedAt: null,
      createdAt: isoOffset(-1020),
      updatedAt: isoOffset(-300),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1005-1', 'cmp-1005', null, 'Submitted', 'user-citizen-3', 'Meera Reddy (Demo Citizen)', 'citizen', 'Submitted garbage report', isoOffset(-1020)),
        mkHist('h-1005-2', 'cmp-1005', 'Submitted', 'Acknowledged', 'user-ward-22', 'Prakash Varma (Demo Ward 22 Rep)', 'ward_rep', 'Linked with Ayyappa Society sanitation cluster', isoOffset(-300)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[1],
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1006',
      trackingCode: 'NGR-1006',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Missed garbage van pickup on Ayyappa Society Lane 2',
      description: 'Third consecutive day without morning collection; bins full across residential block.',
      category: 'Garbage',
      severity: 'Medium',
      status: 'Authority Assigned',
      latitude: 17.4506,
      longitude: 78.3775,
      addressLabel: 'Ayyappa Society Lane 2, Madhapur',
      wardId: 'ward-22',
      wardCode: 'W-22',
      wardName: 'Madhapur',
      departmentId: 'dept-sanitation',
      departmentName: 'Sanitation & Solid Waste',
      assignedAuthorityId: 'auth-w22',
      assignedAuthorityName: 'Ward 22 Civic Coordinator (Demo)',
      assignedOfficerId: null,
      assignedOfficerName: null,
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-garbage-w22',
      relatedCount: 3,
      slaDeadline: isoOffset(900),
      escalatedAt: null,
      createdAt: isoOffset(-180),
      updatedAt: isoOffset(-180),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1006-1', 'cmp-1006', null, 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', 'Routed to Ward 22 Sanitation Desk', isoOffset(-180)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[1],
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1007',
      trackingCode: 'NGR-1007',
      citizenId: 'user-citizen-1',
      citizenName: 'Ananya Rao (Demo Citizen)',
      title: 'Clogged stormwater drain causing foul waterlogging on Prakash Nagar service road',
      description: 'Roadside catch pit completely choked with silt and leaf debris; stagnant water encroaching onto footpath.',
      category: 'Drainage',
      severity: 'High',
      status: 'In Progress',
      latitude: 17.4438,
      longitude: 78.4664,
      addressLabel: 'Prakash Nagar Flyover Service Road, Begumpet',
      wardId: 'ward-09',
      wardCode: 'W-09',
      wardName: 'Begumpet',
      departmentId: 'dept-drainage',
      departmentName: 'Stormwater & Drainage',
      assignedAuthorityId: 'auth-central',
      assignedAuthorityName: 'Central Municipal Command Desk (Demo)',
      assignedOfficerId: 'user-officer-drainage',
      assignedOfficerName: 'Ramesh Goud (Demo Drainage Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-drainage-w09',
      relatedCount: 2,
      slaDeadline: isoOffset(-90),
      escalatedAt: null,
      createdAt: isoOffset(-600),
      updatedAt: isoOffset(-60),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: IMG_DRAINAGE,
      isOverdue: true,
      overdueMinutes: 90,
      media: [mkMedia('med-1007', 'cmp-1007', IMG_DRAINAGE, 'Blocked catch pit grate at Prakash Nagar', 'user-citizen-1', isoOffset(-600))],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1007-1', 'cmp-1007', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Submitted with photo', isoOffset(-600)),
        mkHist('h-1007-2', 'cmp-1007', 'Submitted', 'Work Assigned', 'user-admin-1', 'Vikramaditya Nair (Demo Municipal Admin)', 'municipal_admin', 'Assigned to Drainage Unit D-02', isoOffset(-360)),
        mkHist('h-1007-3', 'cmp-1007', 'Work Assigned', 'In Progress', 'user-officer-drainage', 'Ramesh Goud (Demo Drainage Officer)', 'field_officer', 'Jetting machine on-site clearing downstream silt trap', isoOffset(-60)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[2],
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1008',
      trackingCode: 'NGR-1008',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Repeated drain silt backup at Prakash Nagar bus shelter',
      description: 'Second blockage in 60 days along the same stormwater line.',
      category: 'Drainage',
      severity: 'High',
      status: 'Citizen Verified',
      latitude: 17.4441,
      longitude: 78.4668,
      addressLabel: 'Prakash Nagar Bus Shelter, Begumpet',
      wardId: 'ward-09',
      wardCode: 'W-09',
      wardName: 'Begumpet',
      departmentId: 'dept-drainage',
      departmentName: 'Stormwater & Drainage',
      assignedAuthorityId: 'auth-central',
      assignedAuthorityName: 'Central Municipal Command Desk (Demo)',
      assignedOfficerId: 'user-officer-drainage',
      assignedOfficerName: 'Ramesh Goud (Demo Drainage Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: 'grp-drainage-w09',
      relatedCount: 2,
      slaDeadline: isoOffset(-85000),
      escalatedAt: null,
      createdAt: isoOffset(-86400),
      updatedAt: isoOffset(-84000),
      resolvedAt: isoOffset(-84800),
      verifiedAt: isoOffset(-84000),
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1008-1', 'cmp-1008', null, 'Citizen Verified', 'user-citizen-2', 'Kiran Kumar (Demo Citizen)', 'citizen', 'Drain cleared and water receded within hours.', isoOffset(-84000)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: duplicateGroups[2],
      escalations: [],
      citizenFeedback: [feedback[1]],
    },
    {
      id: 'cmp-1009',
      trackingCode: 'NGR-1009',
      citizenId: 'user-citizen-1',
      citizenName: 'Ananya Rao (Demo Citizen)',
      title: 'Pressurized municipal water main leak wasting clean water at Road No. 36',
      description: 'Clean drinking water bubbling through cracked curb seam continuously since morning.',
      category: 'Water leakage',
      severity: 'High',
      status: 'Inspection Pending',
      latitude: 17.4318,
      longitude: 78.4045,
      addressLabel: 'Road No. 36, Jubilee Hills (Metro Pillar 1620)',
      wardId: 'ward-18',
      wardCode: 'W-18',
      wardName: 'Jubilee Hills',
      departmentId: 'dept-water',
      departmentName: 'Water Supply Board',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-water',
      assignedOfficerName: 'Farhan Ahmed (Demo Water Field Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(110),
      escalatedAt: null,
      createdAt: isoOffset(-130),
      updatedAt: isoOffset(-40),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: IMG_WATER,
      isOverdue: false,
      overdueMinutes: 0,
      media: [mkMedia('med-1009', 'cmp-1009', IMG_WATER, 'Pressurized pipe leak at Road No. 36', 'user-citizen-1', isoOffset(-130))],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1009-1', 'cmp-1009', null, 'Submitted', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Reported water pipe burst', isoOffset(-130)),
        mkHist('h-1009-2', 'cmp-1009', 'Submitted', 'Forwarded', 'user-ward-14', 'Rajeshwari Devi (Demo Ward 14 Rep)', 'ward_rep', 'Forwarded to Water Supply Board', isoOffset(-80)),
        mkHist('h-1009-3', 'cmp-1009', 'Forwarded', 'Inspection Pending', 'user-officer-water', 'Farhan Ahmed (Demo Water Field Officer)', 'field_officer', 'Valve shutoff inspection scheduled', isoOffset(-40)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1010',
      trackingCode: 'NGR-1010',
      citizenId: 'user-citizen-3',
      citizenName: 'Meera Reddy (Demo Citizen)',
      title: 'Missing cast-iron manhole cover on pedestrian shoulder near DLF Gate 2',
      description: 'Completely open 2-foot stormwater manhole right next to office commuter walkway with poor evening visibility.',
      category: 'Open manholes',
      severity: 'Critical',
      status: 'Escalated',
      latitude: 17.4476,
      longitude: 78.3522,
      addressLabel: 'DLF Cyber City Gate 2, Gachibowli',
      wardId: 'ward-27',
      wardCode: 'W-27',
      wardName: 'Gachibowli',
      departmentId: 'dept-drainage',
      departmentName: 'Stormwater & Drainage',
      assignedAuthorityId: 'auth-w22',
      assignedAuthorityName: 'Ward 22 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-drainage',
      assignedOfficerName: 'Ramesh Goud (Demo Drainage Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(-45),
      escalatedAt: isoOffset(-30),
      createdAt: isoOffset(-60),
      updatedAt: isoOffset(-30),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: null,
      isOverdue: true,
      overdueMinutes: 45,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1010-1', 'cmp-1010', null, 'Submitted', 'user-citizen-3', 'Meera Reddy (Demo Citizen)', 'citizen', 'Urgent open manhole report', isoOffset(-60)),
        mkHist('h-1010-2', 'cmp-1010', 'Submitted', 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', 'Auto-flagged Critical via Safety Rule R-01', isoOffset(-59)),
        mkHist('h-1010-3', 'cmp-1010', 'Authority Assigned', 'Escalated', null, 'NagarAI SLA Monitor', 'system', 'Demo 15-min Critical SLA exceeded; escalated to Municipal Admin', isoOffset(-30)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [escalations[1]],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1011',
      trackingCode: 'NGR-1011',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Five consecutive LED streetlights non-functional along Paradise service lane',
      description: 'Complete darkness along pedestrian stretch from 6:30 PM onwards creating commuter safety risk.',
      category: 'Streetlight failure',
      severity: 'Medium',
      status: 'Acknowledged',
      latitude: 17.4412,
      longitude: 78.4898,
      addressLabel: 'Paradise Circle Arterial Road, Secunderabad',
      wardId: 'ward-04',
      wardCode: 'W-04',
      wardName: 'Secunderabad',
      departmentId: 'dept-electrical',
      departmentName: 'Electrical & Streetlights',
      assignedAuthorityId: 'auth-central',
      assignedAuthorityName: 'Central Municipal Command Desk (Demo)',
      assignedOfficerId: null,
      assignedOfficerName: null,
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(840),
      escalatedAt: null,
      createdAt: isoOffset(-600),
      updatedAt: isoOffset(-240),
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1011-1', 'cmp-1011', null, 'Acknowledged', 'user-admin-1', 'Central Municipal Command Desk (Demo)', 'municipal_admin', 'Scheduled electrical maintenance van', isoOffset(-240)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [],
    },
    {
      id: 'cmp-1013',
      trackingCode: 'NGR-1013',
      citizenId: 'user-citizen-1',
      citizenName: 'Ananya Rao (Demo Citizen)',
      title: 'Broken tactile paver tiles along Film Nagar pedestrian footpath',
      description: 'Dislodged concrete slabs posing tripping hazard for elderly walkers.',
      category: 'Footpath damage',
      severity: 'Medium',
      status: 'Citizen Verified',
      latitude: 17.4184,
      longitude: 78.4085,
      addressLabel: 'Film Nagar Crossroad, Jubilee Hills',
      wardId: 'ward-18',
      wardCode: 'W-18',
      wardName: 'Jubilee Hills',
      departmentId: 'dept-roads',
      departmentName: 'Roads & Engineering',
      assignedAuthorityId: 'auth-w14',
      assignedAuthorityName: 'Ward 14 Civic Coordinator (Demo)',
      assignedOfficerId: 'user-officer-roads',
      assignedOfficerName: 'Suresh Babu (Demo Roads Field Officer)',
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(-4200),
      escalatedAt: null,
      createdAt: isoOffset(-5760),
      updatedAt: isoOffset(-3600),
      resolvedAt: isoOffset(-4000),
      verifiedAt: isoOffset(-3600),
      primaryImageUrl: IMG_POTHOLE_AFTER,
      isOverdue: false,
      overdueMinutes: 0,
      media: [mkMedia('med-1013', 'cmp-1013', IMG_POTHOLE_AFTER, 'Restored pedestrian paving', 'user-officer-roads', isoOffset(-4000))],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1013-1', 'cmp-1013', null, 'Citizen Verified', 'user-citizen-1', 'Ananya Rao (Demo Citizen)', 'citizen', 'Footpath pavers neatly leveled and safe to walk.', isoOffset(-3600)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [feedback[2]],
    },
    {
      id: 'cmp-1014',
      trackingCode: 'NGR-1014',
      citizenId: 'user-citizen-2',
      citizenName: 'Kiran Kumar (Demo Citizen)',
      title: 'Faulty feeder switchboard causing blackout near Clock Tower Market',
      description: 'Entire market lane lighting out for 2 nights.',
      category: 'Streetlight failure',
      severity: 'High',
      status: 'Citizen Verified',
      latitude: 17.4426,
      longitude: 78.5018,
      addressLabel: 'Clock Tower Market Road, Secunderabad',
      wardId: 'ward-04',
      wardCode: 'W-04',
      wardName: 'Secunderabad',
      departmentId: 'dept-electrical',
      departmentName: 'Electrical & Streetlights',
      assignedAuthorityId: 'auth-central',
      assignedAuthorityName: 'Central Municipal Command Desk (Demo)',
      assignedOfficerId: null,
      assignedOfficerName: null,
      voiceTranscript: null,
      voiceLanguage: null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(-2880),
      escalatedAt: null,
      createdAt: isoOffset(-3400),
      updatedAt: isoOffset(-2500),
      resolvedAt: isoOffset(-2950),
      verifiedAt: isoOffset(-2500),
      primaryImageUrl: null,
      isOverdue: false,
      overdueMinutes: 0,
      media: [],
      aiAssessment: null,
      statusHistory: [
        mkHist('h-1014-1', 'cmp-1014', null, 'Citizen Verified', 'user-citizen-2', 'Kiran Kumar (Demo Citizen)', 'citizen', 'Feeder repaired and all market LEDs working.', isoOffset(-2500)),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [feedback[3]],
    },
  ];

  const notifications: NotificationItem[] = [
    { id: 'n-1', userId: 'user-citizen-1', complaintId: 'cmp-1002', title: 'Resolution Evidence Ready for Your Verification', body: 'Roads Field Unit uploaded before/after repair proof for NGR-1002 (Care Hospital Stretch). Please inspect and verify.', notifType: 'verification_needed', isRead: false, createdAt: isoOffset(-25) },
    { id: 'n-2', userId: 'user-citizen-1', complaintId: 'cmp-1001', title: 'SLA Escalation Triggered on NGR-1001', body: 'Critical pothole complaint on Road No. 12 exceeded the demo 15-min target and was escalated to Municipal Command Desk.', notifType: 'escalation', isRead: false, createdAt: isoOffset(-12) },
    { id: 'n-3', userId: 'user-admin-1', complaintId: 'cmp-1010', title: 'Critical Safety Escalation: Open Manhole', body: 'NGR-1010 in Ward 27 (Gachibowli) exceeded demo 15-min SLA target.', notifType: 'escalation', isRead: false, createdAt: isoOffset(-30) },
  ];

  return {
    version: 2,
    profiles,
    authorities,
    wardAuthorityMap,
    departments,
    routingRules,
    slaConfigs,
    complaints,
    duplicateGroups,
    escalations,
    feedback,
    notifications,
    nextTrackingNum: 1015,
  };
}

let memoryState: FallbackState | null = null;
let currentFallbackUserId: string | null = null;

function loadState(): FallbackState {
  if (memoryState) return memoryState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FallbackState;
      if (parsed && parsed.version === 2 && Array.isArray(parsed.complaints)) {
        memoryState = parsed;
        return memoryState;
      }
    }
  } catch {
    /* ignore */
  }
  memoryState = createInitialState();
  saveState(memoryState);
  return memoryState;
}

function saveState(st: FallbackState) {
  memoryState = st;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  } catch {
    /* ignore */
  }
}

function stripPassword(p: StoredProfile): UserProfile {
  const { passwordPlainDemo: _pw, createdAt: _ca, ...rest } = p;
  return rest;
}

function getCurrentUser(st: FallbackState): StoredProfile | null {
  if (!currentFallbackUserId) return null;
  return st.profiles.find((p) => p.id === currentFallbackUserId) || null;
}

function buildWards(st: FallbackState): Ward[] {
  return DEMO_WARDS.map((w) => {
    const authId = st.wardAuthorityMap[w.id];
    const auth = st.authorities.find((a) => a.id === authId) || null;
    return {
      ...w,
      isDemoBoundary: true,
      primaryAuthority: auth
        ? {
            id: auth.id,
            name: auth.name,
            title: auth.title,
            contactLabelDemo: auth.contactLabelDemo,
            isDemoOfficial: auth.isDemoOfficial,
          }
        : null,
    };
  });
}

function refreshLiveOverdue(c: ComplaintDetail): ComplaintDetail {
  if (CLOSED_STATUSES.has(c.status) || !c.slaDeadline) {
    return { ...c, isOverdue: false, overdueMinutes: 0 };
  }
  const diffMin = Math.round((Date.now() - new Date(c.slaDeadline).getTime()) / 60000);
  return {
    ...c,
    isOverdue: diffMin > 0,
    overdueMinutes: Math.max(0, diffMin),
  };
}

function toSummary(c: ComplaintDetail, anonymize = false): ComplaintSummary {
  const live = refreshLiveOverdue(c);
  return {
    id: live.id,
    trackingCode: live.trackingCode,
    citizenId: anonymize ? 'anonymized' : live.citizenId,
    citizenName: anonymize ? undefined : live.citizenName,
    title: live.title,
    description: live.description,
    category: live.category,
    severity: live.severity,
    status: live.status,
    latitude: anonymize ? Math.round(live.latitude * 1000) / 1000 : live.latitude,
    longitude: anonymize ? Math.round(live.longitude * 1000) / 1000 : live.longitude,
    addressLabel: live.addressLabel,
    wardId: live.wardId,
    wardCode: live.wardCode,
    wardName: live.wardName,
    departmentId: live.departmentId,
    departmentName: live.departmentName,
    assignedAuthorityId: live.assignedAuthorityId,
    assignedAuthorityName: live.assignedAuthorityName,
    assignedOfficerId: live.assignedOfficerId,
    assignedOfficerName: live.assignedOfficerName,
    voiceTranscript: anonymize ? null : live.voiceTranscript,
    voiceLanguage: anonymize ? null : live.voiceLanguage,
    duplicateGroupId: live.duplicateGroupId,
    relatedCount: live.relatedCount,
    slaDeadline: live.slaDeadline,
    escalatedAt: live.escalatedAt,
    createdAt: live.createdAt,
    updatedAt: live.updatedAt,
    resolvedAt: live.resolvedAt,
    verifiedAt: live.verifiedAt,
    primaryImageUrl: live.primaryImageUrl,
    isOverdue: live.isOverdue,
    overdueMinutes: live.overdueMinutes,
  };
}

function computeInsights(st: FallbackState): CivicInsight[] {
  const insights: CivicInsight[] = [];
  for (const grp of st.duplicateGroups) {
    const members = st.complaints.filter((c) => c.duplicateGroupId === grp.id);
    if (members.length < 2) continue;
    const spanDays = Math.round(
      (new Date(grp.lastReportedAt).getTime() - new Date(grp.firstReportedAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const isRecurring = spanDays >= 30;
    const insightType: CivicInsight['insightType'] = isRecurring
      ? 'recurring_infrastructure'
      : grp.category === 'Garbage'
      ? 'sanitation_hotspot'
      : grp.category === 'Drainage'
      ? 'recurring_drainage'
      : 'road_cluster';

    insights.push({
      id: `ins-${grp.id}`,
      insightType,
      wardId: grp.wardId,
      wardName: grp.wardName || 'Demo Ward',
      category: grp.category,
      title: isRecurring
        ? `Recurring ${grp.category} Failure — ${grp.addressLabel}`
        : `Active ${grp.category} Cluster — ${grp.addressLabel}`,
      summary: `${members.length} linked citizen complaints recorded over ${Math.max(1, spanDays)} days in ${grp.wardName}. Repeated patching has not permanently resolved root infrastructure stress.`,
      recommendation:
        grp.category === 'Potholes'
          ? 'Commission full-depth sub-base drainage & hot-mix bituminous reconstruction instead of cold-mix patching.'
          : grp.category === 'Drainage'
          ? 'Schedule high-pressure jetting, silt trap upgrade, and pre-monsoon catch-pit grating inspection.'
          : 'Increase daily compactor frequency and add covered secondary collection bins at this hotspot.',
      supportingData: {
        complaintCount: members.length,
        trackingCodes: members.map((m) => m.trackingCode),
        monthSpan: Math.max(1, Math.round(spanDays / 30)),
        centerLat: grp.centerLat,
        centerLng: grp.centerLng,
        addressHint: grp.addressLabel,
      },
      isRecurringInfra: isRecurring,
      createdAt: new Date().toISOString(),
    });
  }
  return insights;
}

function computeMonthlyTrends(complaints: ComplaintDetail[]) {
  const map = new Map<string, { month: string; reported: number; resolved: number }>();
  for (const c of complaints) {
    const m = c.createdAt.slice(0, 7);
    const curr = map.get(m) || { month: m, reported: 0, resolved: 0 };
    curr.reported += 1;
    if (CLOSED_STATUSES.has(c.status)) curr.resolved += 1;
    map.set(m, curr);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function computeWardHealthList(st: FallbackState) {
  const wards = buildWards(st);
  return wards.map((ward) => {
    const wc = st.complaints.filter((c) => c.wardId === ward.id).map(refreshLiveOverdue);
    const open = wc.filter((c) => !CLOSED_STATUSES.has(c.status));
    const resolved = wc.filter((c) => CLOSED_STATUSES.has(c.status));
    const criticalCount = open.filter((c) => c.severity === 'Critical').length;
    const overdueCount = open.filter((c) => c.isOverdue).length;
    const recurringClusterCount = st.duplicateGroups.filter((g) => g.wardId === ward.id).length;

    const durations = resolved
      .filter((c) => c.resolvedAt)
      .map((c) => Math.max(1, (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) / 3600000));
    const avgResolutionHours =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 6.5;

    const wardIds = new Set(wc.map((c) => c.id));
    const wf = st.feedback.filter((f) => wardIds.has(f.complaintId));
    const positive = wf.filter((f) => f.verdict === 'resolved').length;

    return computeWardHealthScore({
      ward,
      totalComplaints: wc.length,
      openComplaints: open.length,
      criticalCount,
      overdueCount,
      recurringClusterCount,
      resolvedCount: resolved.length,
      avgResolutionHours,
      positiveFeedbackCount: positive,
      totalFeedbackCount: wf.length,
    });
  });
}

export const clientFallbackEngine = {
  demoLogin(role: 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer') {
    const st = loadState();
    const idByRole: Record<string, string> = {
      citizen: 'user-citizen-1',
      ward_rep: 'user-ward-14',
      municipal_admin: 'user-admin-1',
      field_officer: 'user-officer-roads',
    };
    const found = st.profiles.find((p) => p.id === idByRole[role]) || st.profiles[0];
    currentFallbackUserId = found.id;
    return { token: `local-demo-${found.id}`, user: stripPassword(found) };
  },

  login(email: string, password: string) {
    const st = loadState();
    const found = st.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || found.passwordPlainDemo !== password) {
      throw new Error('Invalid email or password. Use NagarAI@Demo2026 for demo accounts.');
    }
    currentFallbackUserId = found.id;
    return { token: `local-demo-${found.id}`, user: stripPassword(found) };
  },

  register(payload: { fullName: string; email: string; password: string; wardId?: string }) {
    const st = loadState();
    if (st.profiles.some((p) => p.email.toLowerCase() === payload.email.trim().toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }
    const ward = DEMO_WARDS.find((w) => w.id === payload.wardId) || DEMO_WARDS[0];
    const initials =
      payload.fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'CZ';
    const profile: StoredProfile = {
      id: makeId('user'),
      email: payload.email.trim().toLowerCase(),
      fullName: payload.fullName.trim(),
      role: 'citizen',
      wardId: ward.id,
      wardName: ward.name,
      departmentId: null,
      departmentName: null,
      phoneMasked: null,
      avatarInitials: initials,
      isDemo: false,
      passwordPlainDemo: payload.password,
      createdAt: new Date().toISOString(),
    };
    st.profiles.push(profile);
    saveState(st);
    currentFallbackUserId = profile.id;
    return { token: `local-demo-${profile.id}`, user: stripPassword(profile) };
  },

  logout() {
    currentFallbackUserId = null;
    return { ok: true };
  },

  getMe() {
    const st = loadState();
    const user = getCurrentUser(st);
    if (!user) throw new Error('Not signed in.');
    return {
      user: stripPassword(user),
      unreadNotifications: st.notifications.filter((n) => !n.isRead).length,
    };
  },

  getMeta(): MetaPayload {
    const st = loadState();
    return {
      wards: buildWards(st),
      landmarks: DEMO_LANDMARKS,
      authorities: st.authorities,
      departments: st.departments,
      routingRules: st.routingRules,
      slaConfigs: st.slaConfigs,
      fieldOfficers: st.profiles
        .filter((p) => p.role === 'field_officer')
        .map((p) => ({
          id: p.id,
          fullName: p.fullName,
          wardId: p.wardId,
          wardName: p.wardName || null,
          departmentId: p.departmentId,
          departmentName: p.departmentName || null,
          avatarInitials: p.avatarInitials,
        })),
    };
  },

  getPublicOverview(): PublicOverviewPayload {
    const st = loadState();
    const wards = buildWards(st);
    const all = st.complaints.map((c) => toSummary(c, true));
    const open = all.filter((c) => !CLOSED_STATUSES.has(c.status));
    const resolved = all.filter((c) => CLOSED_STATUSES.has(c.status));
    const verified = all.filter((c) => c.status === 'Citizen Verified');
    const durations = st.complaints
      .filter((c) => c.resolvedAt)
      .map((c) => Math.max(1, (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) / 3600000));
    const avgResolutionHours =
      durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : 8.4;

    const catMap = new Map<string, number>();
    for (const c of all) catMap.set(c.category, (catMap.get(c.category) || 0) + 1);
    const categoryBreakdown = Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      stats: {
        totalReports: all.length,
        openIssues: open.length,
        resolvedIssues: resolved.length,
        verifiedResolutions: verified.length,
        resolutionRatePct: all.length ? Math.round((resolved.length / all.length) * 100) : 100,
        avgResolutionHours,
      },
      complaints: all,
      wards,
      wardHealth: computeWardHealthList(st),
      categoryBreakdown,
      trends: computeMonthlyTrends(st.complaints),
      insights: computeInsights(st),
      clusters: st.duplicateGroups,
      verifiedShowcase: st.complaints
        .filter((c) => c.status === 'Citizen Verified' || c.status === 'Awaiting Citizen Verification')
        .map((c) => toSummary(c, true))
        .slice(0, 6),
    };
  },

  getIntelligenceSummary(): IntelligenceSummaryPayload {
    const st = loadState();
    const all = st.complaints.map(refreshLiveOverdue);
    const open = all.filter((c) => !CLOSED_STATUSES.has(c.status));
    const resolved = all.filter((c) => CLOSED_STATUSES.has(c.status));
    const resolvedThisMonth = resolved.filter(
      (c) => Date.now() - new Date(c.updatedAt).getTime() <= 31 * 24 * 60 * 60 * 1000
    ).length;
    const durations = resolved
      .filter((c) => c.resolvedAt)
      .map((c) => Math.max(1, (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) / 3600000));
    const avgResolutionHours =
      durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : 8.4;

    const departmentWorkload = st.departments.map((d) => {
      const dc = all.filter((c) => c.departmentId === d.id);
      return {
        departmentId: d.id,
        departmentName: d.name,
        colorHex: d.colorHex,
        total: dc.length,
        open: dc.filter((c) => !CLOSED_STATUSES.has(c.status)).length,
        resolved: dc.filter((c) => CLOSED_STATUSES.has(c.status)).length,
        overdue: dc.filter((c) => c.isOverdue).length,
      };
    });

    const wardDistribution = DEMO_WARDS.map((w) => {
      const wc = all.filter((c) => c.wardId === w.id);
      const wOpen = wc.filter((c) => !CLOSED_STATUSES.has(c.status));
      return {
        wardId: w.id,
        wardCode: w.code,
        wardName: w.name,
        total: wc.length,
        open: wOpen.length,
        critical: wOpen.filter((c) => c.severity === 'Critical').length,
        resolved: wc.filter((c) => CLOSED_STATUSES.has(c.status)).length,
      };
    });

    const recentFeedback = st.feedback.map((f) => {
      const cmp = st.complaints.find((c) => c.id === f.complaintId);
      return {
        id: f.id,
        complaintId: f.complaintId,
        trackingCode: cmp?.trackingCode || 'NGR',
        complaintTitle: cmp?.title || 'Civic Issue',
        wardId: cmp?.wardId || null,
        wardName: cmp?.wardName || null,
        verdict: f.verdict,
        comment: f.comment,
        rating: f.rating,
        createdAt: f.createdAt,
      };
    });

    return {
      kpis: {
        totalComplaints: all.length,
        openComplaints: open.length,
        criticalComplaints: open.filter((c) => c.severity === 'Critical').length,
        overdueComplaints: open.filter((c) => c.isOverdue).length,
        resolvedThisMonth,
        avgResolutionHours,
        avgResponseHours: 4.8,
        resolutionRatePct: all.length ? Math.round((resolved.length / all.length) * 100) : 100,
      },
      departmentWorkload,
      wardDistribution,
      trends: computeMonthlyTrends(st.complaints),
      wardHealth: computeWardHealthList(st),
      insights: computeInsights(st),
      duplicateGroups: st.duplicateGroups,
      escalations: st.escalations,
      recentFeedback,
    };
  },

  identifyLocation(payload: { lat: number; lng: number; category?: string; text?: string }): GeoIdentifyResult {
    const st = loadState();
    const wards = buildWards(st);
    const match = identifyWardFromBoundaries(payload.lat, payload.lng, wards);

    const nearbyDuplicates = st.complaints
      .map((c) => {
        const dist = haversineMeters(payload.lat, payload.lng, c.latitude, c.longitude);
        const sim = payload.text ? computeTextSimilarity(payload.text, `${c.title} ${c.description}`) : 0.35;
        const catMatch = payload.category && c.category === payload.category;
        if (dist <= 350 && (catMatch || sim >= 0.25)) {
          return {
            complaintId: c.id,
            trackingCode: c.trackingCode,
            title: c.title,
            category: c.category,
            status: c.status,
            distanceMeters: dist,
            similarityScore: Math.min(0.98, Math.round((0.55 + sim * 0.4) * 100) / 100),
            createdAt: c.createdAt,
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .slice(0, 4);

    return {
      ward: match.ward,
      matchType: match.matchType,
      distanceMeters: match.distanceMeters,
      isDemoBoundary: true,
      primaryAuthority: match.ward?.primaryAuthority || null,
      nearbyDuplicates,
    };
  },

  getComplaints(params: Record<string, string | boolean | undefined> = {}) {
    const st = loadState();
    const user = getCurrentUser(st);
    let list = st.complaints.map((c) => toSummary(c, !user));

    if (params.scope === 'mine' && user) {
      list = list.filter((c) => c.citizenId === user.id);
    }
    if (params.scope === 'assigned' && user) {
      list = list.filter((c) => c.assignedOfficerId === user.id);
    }
    if (params.wardId && params.wardId !== 'all') {
      list = list.filter((c) => c.wardId === params.wardId);
    }
    if (params.departmentId && params.departmentId !== 'all') {
      list = list.filter((c) => c.departmentId === params.departmentId);
    }
    if (params.category && params.category !== 'all') {
      list = list.filter((c) => c.category === params.category);
    }
    if (params.severity && params.severity !== 'all') {
      list = list.filter((c) => c.severity === params.severity);
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((c) => c.status === params.status);
    }
    if (params.dateFrom && typeof params.dateFrom === 'string') {
      list = list.filter((c) => c.createdAt.slice(0, 10) >= params.dateFrom!);
    }

    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { complaints: list };
  },

  getComplaintDetail(idOrCode: string) {
    const st = loadState();
    const found = st.complaints.find(
      (c) => c.id === idOrCode || c.trackingCode.toLowerCase() === idOrCode.toLowerCase()
    );
    if (!found) throw new Error('Complaint record not found.');
    const user = getCurrentUser(st);
    const live = refreshLiveOverdue(found);
    return {
      complaint: user
        ? live
        : {
            ...live,
            citizenName: undefined,
            latitude: Math.round(live.latitude * 1000) / 1000,
            longitude: Math.round(live.longitude * 1000) / 1000,
          },
    };
  },

  analyzeComplaint(payload: {
    text?: string;
    voiceTranscript?: string;
    demoImagePath?: string;
    addressHint?: string;
  }): { assessment: AiAssessment } {
    const combined = `${payload.text || ''} ${payload.voiceTranscript || ''} ${payload.demoImagePath || ''}`.toLowerCase();
    let category: ComplaintCategory = 'Road damage';
    let aiSeverity: Severity = 'Medium';
    let suggestedDepartment = 'Roads & Engineering';

    if (combined.includes('manhole')) {
      category = 'Open manholes';
      aiSeverity = 'Critical';
      suggestedDepartment = 'Stormwater & Drainage';
    } else if (combined.includes('pothole') || combined.includes('గుంత')) {
      category = 'Potholes';
      aiSeverity = 'High';
      suggestedDepartment = 'Roads & Engineering';
    } else if (combined.includes('garbage') || combined.includes('waste') || combined.includes('చెత్త')) {
      category = 'Garbage';
      aiSeverity = 'Medium';
      suggestedDepartment = 'Sanitation & Solid Waste';
    } else if (combined.includes('drain') || combined.includes('sewage') || combined.includes('flood')) {
      category = combined.includes('flood') ? 'Flooding' : 'Drainage';
      aiSeverity = 'High';
      suggestedDepartment = 'Stormwater & Drainage';
    } else if (combined.includes('water') || combined.includes('pipe') || combined.includes('leak')) {
      category = 'Water leakage';
      aiSeverity = 'High';
      suggestedDepartment = 'Water Supply Board';
    } else if (combined.includes('light') || combined.includes('dark') || combined.includes('lamp')) {
      category = 'Streetlight failure';
      aiSeverity = 'Medium';
      suggestedDepartment = 'Electrical & Streetlights';
    } else if (combined.includes('footpath') || combined.includes('paver')) {
      category = 'Footpath damage';
      aiSeverity = 'Medium';
      suggestedDepartment = 'Roads & Engineering';
    }

    const det = evaluateDeterministicSeverity(category, combined, aiSeverity);
    const loc = payload.addressHint ? ` near ${payload.addressHint}` : '';

    return {
      assessment: {
        modelName: 'nagarai-civic-triage-rules',
        categoryPredicted: category,
        titleSuggested: `${category} hazard reported${loc}`.slice(0, 95),
        descriptionSuggested: (
          payload.text ||
          payload.voiceTranscript ||
          `Reported ${category.toLowerCase()} issue requiring municipal field inspection${loc}.`
        ).trim(),
        severityPredicted: aiSeverity,
        deterministicSeverity: det.deterministicSeverity,
        finalSeverity: det.finalSeverity,
        deterministicRuleApplied: det.ruleApplied,
        confidence: 0.88,
        riskFactors: [
          `${category} disruption impacting local pedestrian/commuter safety`,
          det.finalSeverity === 'Critical'
            ? 'Immediate public safety escalation threshold met'
            : 'Standard municipal SLA monitoring active',
        ],
        severityExplanation: `Assessed as ${det.finalSeverity} based on category risk profile and deterministic civic safety guardrails.`,
        suggestedDepartment,
        suggestedAction: `Dispatch ${suggestedDepartment} inspection crew, verify site boundary, and submit before/after photographic proof.`,
        additionalInfoRequired: ['Exact street landmark or nearest pole/junction number'],
      },
    };
  },

  transcribeVoice(payload: { languageHint?: string }) {
    return {
      transcript:
        payload.languageHint === 'te-IN'
          ? 'మా వీధిలో రోడ్డుపై పెద్ద గుంత ఉంది, వర్షం నీరు నిండిపోయి ప్రమాదకరంగా ఉంది.'
          : 'There is a deep waterlogged pothole on the main road causing traffic danger near the junction.',
      detectedLanguage: payload.languageHint === 'te-IN' ? 'te-IN' : 'en-IN',
    };
  },

  askAssistant(payload: { question: string; complaintId?: string }) {
    const st = loadState();
    const q = payload.question.toLowerCase();
    const cited: string[] = [];

    if (payload.complaintId) {
      const focused = st.complaints.find(
        (c) => c.id === payload.complaintId || c.trackingCode === payload.complaintId
      );
      if (focused) {
        cited.push(focused.trackingCode);
        return {
          answer: `${focused.trackingCode} ("${focused.title}") is currently **${focused.status}** with **${focused.severity}** priority in **${focused.wardName}** under **${focused.departmentName}**. Assigned officer: ${focused.assignedOfficerName || 'Pending crew dispatch'}.`,
          citedTrackingCodes: cited,
        };
      }
    }

    const overdue = st.complaints.map(refreshLiveOverdue).filter((c) => c.isOverdue);
    if (q.includes('overdue') || q.includes('escalat') || q.includes('critical')) {
      const codes = overdue.slice(0, 4).map((c) => c.trackingCode);
      cited.push(...codes);
      return {
        answer: `There are currently ${overdue.length} overdue open civic complaints across the demo wards: ${overdue
          .slice(0, 4)
          .map((c) => `${c.trackingCode} (${c.wardName} · ${c.severity}, overdue ${c.overdueMinutes}m)`)
          .join('; ')}.`,
        citedTrackingCodes: cited,
      };
    }

    const insights = computeInsights(st);
    if (q.includes('hotspot') || q.includes('recurring') || q.includes('cluster') || q.includes('ward')) {
      for (const ins of insights.slice(0, 2)) {
        cited.push(...ins.supportingData.trackingCodes.slice(0, 2));
      }
      return {
        answer: `Top recurring civic hotspots detected in the database: ${insights
          .map(
            (i) =>
              `${i.title} (${i.supportingData.complaintCount} linked reports: ${i.supportingData.trackingCodes.join(', ')})`
          )
          .join(' | ')}.`,
        citedTrackingCodes: Array.from(new Set(cited)),
      };
    }

    const topActive = st.complaints.filter((c) => !CLOSED_STATUSES.has(c.status)).slice(0, 3);
    cited.push(...topActive.map((c) => c.trackingCode));
    return {
      answer: `NagarAI is currently tracking ${st.complaints.length} civic complaints across 6 demo wards (${overdue.length} SLA overdue, ${insights.length} recurring hotspots). Priority active records include ${topActive
        .map((c) => `${c.trackingCode} (${c.category} in ${c.wardName} — ${c.status})`)
        .join(', ')}.`,
      citedTrackingCodes: cited,
    };
  },

  createComplaint(payload: Record<string, unknown>) {
    const st = loadState();
    const user = getCurrentUser(st) || st.profiles[0];
    const wards = buildWards(st);
    const lat = Number(payload.latitude) || 17.4156;
    const lng = Number(payload.longitude) || 78.4347;
    const wardMatch = identifyWardFromBoundaries(lat, lng, wards);
    const ward = wards.find((w) => w.id === payload.wardId) || wardMatch.ward || wards[0];
    const category = (payload.category as ComplaintCategory) || 'Potholes';
    const severity = (payload.severity as Severity) || 'High';
    const rule = st.routingRules.find((r) => r.category === category);
    const dept =
      st.departments.find((d) => d.id === payload.departmentId) ||
      st.departments.find((d) => d.id === rule?.departmentId) ||
      st.departments[0];
    const sla = st.slaConfigs.find((s) => s.severity === severity);
    const now = new Date().toISOString();
    const id = makeId('cmp');
    const trackingCode = `NGR-${st.nextTrackingNum++}`;
    const imageUrl =
      (typeof payload.imageBase64 === 'string' && payload.imageBase64) ||
      (typeof payload.demoImagePath === 'string' && payload.demoImagePath) ||
      null;

    const created: ComplaintDetail = {
      id,
      trackingCode,
      citizenId: user.id,
      citizenName: user.fullName,
      title: String(payload.title || `${category} reported in ${ward.name}`),
      description: String(payload.description || 'Submitted via NagarAI civic intake.'),
      category,
      severity,
      status: 'Authority Assigned',
      latitude: lat,
      longitude: lng,
      addressLabel: String(payload.addressLabel || `${ward.name} Civic Sector`),
      wardId: ward.id,
      wardCode: ward.code,
      wardName: ward.name,
      departmentId: dept.id,
      departmentName: dept.name,
      assignedAuthorityId: ward.primaryAuthority?.id || 'auth-w14',
      assignedAuthorityName: ward.primaryAuthority?.title || 'Ward Desk (Demo)',
      assignedOfficerId: null,
      assignedOfficerName: null,
      voiceTranscript: typeof payload.voiceTranscript === 'string' ? payload.voiceTranscript : null,
      voiceLanguage: typeof payload.voiceLanguage === 'string' ? payload.voiceLanguage : null,
      duplicateGroupId: null,
      relatedCount: 1,
      slaDeadline: isoOffset(sla?.targetMinutes || 240),
      escalatedAt: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      verifiedAt: null,
      primaryImageUrl: imageUrl,
      isOverdue: false,
      overdueMinutes: 0,
      media: imageUrl ? [mkMedia(makeId('med'), id, imageUrl, 'Citizen uploaded evidence', user.id, now)] : [],
      aiAssessment: (payload.aiAssessment as AiAssessment | null) || null,
      statusHistory: [
        mkHist(makeId('h'), id, null, 'Submitted', user.id, user.fullName, user.role, 'Complaint filed by citizen', now),
        mkHist(makeId('h'), id, 'Submitted', 'Jurisdiction Identified', null, 'NagarAI Geo Engine', 'system', `Mapped to ${ward.code} ${ward.name}`, now),
        mkHist(makeId('h'), id, 'Jurisdiction Identified', 'Authority Assigned', null, 'NagarAI Routing Engine', 'system', `Routed to ${dept.name}`, now),
      ],
      updates: [],
      resolutionEvidence: [],
      duplicateGroup: null,
      escalations: [],
      citizenFeedback: [],
    };

    st.complaints.unshift(created);
    st.notifications.unshift({
      id: makeId('n'),
      userId: user.id,
      complaintId: created.id,
      title: `New Complaint Registered: ${trackingCode}`,
      body: `${created.title} routed to ${dept.name} (${ward.name}).`,
      notifType: 'status_update',
      isRead: false,
      createdAt: now,
    });
    saveState(st);
    return { complaint: created };
  },

  complaintAction(
    id: string,
    payload: {
      action: 'acknowledge' | 'forward' | 'assign_officer' | 'post_update' | 'escalate';
      note?: string;
      departmentId?: string;
      officerId?: string;
      delayReason?: string;
    }
  ) {
    const st = loadState();
    const cmp = st.complaints.find((c) => c.id === id);
    if (!cmp) throw new Error('Complaint not found.');
    const actor = getCurrentUser(st) || st.profiles.find((p) => p.role === 'ward_rep')!;
    const now = new Date().toISOString();
    const prev = cmp.status;

    if (payload.action === 'acknowledge') {
      cmp.status = 'Acknowledged';
    } else if (payload.action === 'forward') {
      const dept = st.departments.find((d) => d.id === payload.departmentId);
      if (dept) {
        cmp.departmentId = dept.id;
        cmp.departmentName = dept.name;
      }
      cmp.status = 'Forwarded';
    } else if (payload.action === 'assign_officer') {
      const officer = st.profiles.find((p) => p.id === payload.officerId);
      if (officer) {
        cmp.assignedOfficerId = officer.id;
        cmp.assignedOfficerName = officer.fullName;
      }
      cmp.status = 'Work Assigned';
    } else if (payload.action === 'escalate') {
      cmp.status = 'Escalated';
      cmp.escalatedAt = now;
      const esc: EscalationRecord = {
        id: makeId('esc'),
        complaintId: cmp.id,
        trackingCode: cmp.trackingCode,
        complaintTitle: cmp.title,
        severity: cmp.severity,
        wardName: cmp.wardName || 'Demo Ward',
        triggeredBy: actor.fullName,
        fromRole: actor.role,
        toRole: 'municipal_admin',
        overdueMinutes: Math.max(15, cmp.overdueMinutes),
        delayReason: payload.delayReason || payload.note || 'Manual escalation',
        status: 'Open',
        createdAt: now,
      };
      st.escalations.unshift(esc);
      cmp.escalations.unshift(esc);
    }

    cmp.updatedAt = now;
    if (payload.action === 'post_update' && payload.note) {
      cmp.updates.push(
        mkUpd(makeId('upd'), cmp.id, actor.id, actor.fullName, actor.role, 'public_update', payload.note, false, now)
      );
    } else {
      cmp.statusHistory.push(
        mkHist(makeId('h'), cmp.id, prev, cmp.status, actor.id, actor.fullName, actor.role, payload.note || `Action: ${payload.action}`, now)
      );
    }
    saveState(st);
    return { complaint: refreshLiveOverdue(cmp) };
  },

  fieldProgress(
    id: string,
    payload: {
      status: 'Work Assigned' | 'Inspection Pending' | 'Work Started' | 'In Progress' | 'Work Completed';
      note: string;
      obstacleFlag?: boolean;
    }
  ) {
    const st = loadState();
    const cmp = st.complaints.find((c) => c.id === id);
    if (!cmp) throw new Error('Complaint not found.');
    const actor = getCurrentUser(st) || st.profiles.find((p) => p.role === 'field_officer')!;
    const now = new Date().toISOString();
    const prev = cmp.status;
    cmp.status = payload.status;
    cmp.updatedAt = now;
    cmp.statusHistory.push(
      mkHist(makeId('h'), cmp.id, prev, payload.status, actor.id, actor.fullName, actor.role, payload.note, now)
    );
    cmp.updates.push(
      mkUpd(
        makeId('upd'),
        cmp.id,
        actor.id,
        actor.fullName,
        actor.role,
        payload.obstacleFlag ? 'obstacle' : 'field_progress',
        payload.note,
        Boolean(payload.obstacleFlag),
        now
      )
    );
    saveState(st);
    return { complaint: refreshLiveOverdue(cmp) };
  },

  submitResolutionEvidence(
    id: string,
    payload: {
      afterImageBase64?: string;
      demoAfterImagePath?: string;
      notes: string;
    }
  ) {
    const st = loadState();
    const cmp = st.complaints.find((c) => c.id === id);
    if (!cmp) throw new Error('Complaint not found.');
    const actor = getCurrentUser(st) || st.profiles.find((p) => p.role === 'field_officer')!;
    const now = new Date().toISOString();
    const afterUrl = payload.afterImageBase64 || payload.demoAfterImagePath || IMG_POTHOLE_AFTER;
    const prev = cmp.status;

    cmp.resolutionEvidence.unshift({
      id: makeId('ev'),
      complaintId: cmp.id,
      submittedBy: actor.id,
      submittedByName: actor.fullName,
      beforeMediaUrl: cmp.primaryImageUrl,
      afterMediaUrl: afterUrl,
      notes: payload.notes,
      aiRelevanceScore: 0.91,
      aiVisibleChanges: 'Post-repair photograph shows restored surface condition aligned with reported location.',
      aiResolutionAssessment: 'Likely Resolved',
      aiMismatchWarnings: ['Advisory check complete — on-site citizen verification required for final closure.'],
      aiConfidence: 0.88,
      aiExplanation: 'Evidence captured with field completion notes. Awaiting citizen verification.',
      createdAt: now,
    });
    cmp.status = 'Awaiting Citizen Verification';
    cmp.resolvedAt = now;
    cmp.updatedAt = now;
    cmp.statusHistory.push(
      mkHist(makeId('h'), cmp.id, prev, 'Awaiting Citizen Verification', actor.id, actor.fullName, actor.role, payload.notes, now)
    );
    saveState(st);
    return { complaint: refreshLiveOverdue(cmp), aiWarning: null };
  },

  verifyComplaint(
    id: string,
    payload: { verdict: 'resolved' | 'partially_resolved' | 'not_resolved'; comment?: string; rating?: number }
  ) {
    const st = loadState();
    const cmp = st.complaints.find((c) => c.id === id);
    if (!cmp) throw new Error('Complaint not found.');
    const actor = getCurrentUser(st) || st.profiles[0];
    const now = new Date().toISOString();
    const prev = cmp.status;
    const nextStatus: ComplaintStatus = payload.verdict === 'resolved' ? 'Citizen Verified' : 'Reopened';

    cmp.status = nextStatus;
    cmp.updatedAt = now;
    if (payload.verdict === 'resolved') cmp.verifiedAt = now;

    const fb: CitizenFeedback = {
      id: makeId('fb'),
      complaintId: cmp.id,
      citizenId: actor.id,
      verdict: payload.verdict,
      comment: payload.comment || null,
      rating: payload.rating || 5,
      createdAt: now,
    };
    st.feedback.unshift(fb);
    cmp.citizenFeedback.unshift(fb);
    cmp.statusHistory.push(
      mkHist(makeId('h'), cmp.id, prev, nextStatus, actor.id, actor.fullName, actor.role, payload.comment || `Citizen verdict: ${payload.verdict}`, now)
    );
    saveState(st);
    return { complaint: refreshLiveOverdue(cmp) };
  },

  runEscalationSweep() {
    const st = loadState();
    const now = new Date().toISOString();
    let count = 0;
    for (const cmp of st.complaints) {
      const live = refreshLiveOverdue(cmp);
      if (live.isOverdue && !CLOSED_STATUSES.has(cmp.status) && cmp.status !== 'Escalated') {
        cmp.status = 'Escalated';
        cmp.escalatedAt = now;
        cmp.updatedAt = now;
        const esc: EscalationRecord = {
          id: makeId('esc'),
          complaintId: cmp.id,
          trackingCode: cmp.trackingCode,
          complaintTitle: cmp.title,
          severity: cmp.severity,
          wardName: cmp.wardName || 'Demo Ward',
          triggeredBy: 'SLA Sweep',
          fromRole: 'ward_rep',
          toRole: 'municipal_admin',
          overdueMinutes: live.overdueMinutes,
          delayReason: 'Exceeded configured demo SLA target',
          status: 'Open',
          createdAt: now,
        };
        st.escalations.unshift(esc);
        cmp.escalations.unshift(esc);
        count++;
      }
    }
    saveState(st);
    return { escalatedCount: count, escalations: st.escalations };
  },

  updateRoutingRule(id: string, payload: { departmentId: string; defaultPriority: Severity; autoAssignEnabled: boolean }) {
    const st = loadState();
    const rule = st.routingRules.find((r) => r.id === id);
    const dept = st.departments.find((d) => d.id === payload.departmentId);
    if (rule) {
      rule.departmentId = payload.departmentId;
      rule.departmentName = dept?.name || rule.departmentName;
      rule.defaultPriority = payload.defaultPriority;
      rule.autoAssignEnabled = payload.autoAssignEnabled;
      rule.updatedAt = new Date().toISOString();
      saveState(st);
    }
    return { ok: true };
  },

  updateSlaConfig(id: string, payload: { targetMinutes: number; escalateToRole: 'ward_rep' | 'municipal_admin' }) {
    const st = loadState();
    const cfg = st.slaConfigs.find((s) => s.id === id);
    if (cfg) {
      cfg.targetMinutes = payload.targetMinutes;
      cfg.escalateToRole = payload.escalateToRole;
      cfg.updatedAt = new Date().toISOString();
      saveState(st);
    }
    return { ok: true };
  },

  updateWardAuthority(wardId: string, authorityId: string) {
    const st = loadState();
    st.wardAuthorityMap[wardId] = authorityId;
    saveState(st);
    return { ok: true };
  },

  getAdminUsers(): { users: AdminUserRecord[] } {
    const st = loadState();
    return {
      users: st.profiles.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.fullName,
        role: p.role,
        wardId: p.wardId,
        wardName: p.wardName || null,
        departmentId: p.departmentId,
        departmentName: p.departmentName || null,
        isDemo: p.isDemo,
        createdAt: p.createdAt,
      })),
    };
  },

  updateAdminUser(
    id: string,
    payload: {
      role: 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer';
      wardId: string | null;
      departmentId: string | null;
    }
  ) {
    const st = loadState();
    const usr = st.profiles.find((p) => p.id === id);
    if (usr) {
      usr.role = payload.role;
      usr.wardId = payload.wardId;
      usr.wardName = DEMO_WARDS.find((w) => w.id === payload.wardId)?.name || null;
      usr.departmentId = payload.departmentId;
      usr.departmentName = st.departments.find((d) => d.id === payload.departmentId)?.name || null;
      saveState(st);
    }
    return { ok: true };
  },

  getNotifications() {
    const st = loadState();
    return { notifications: st.notifications };
  },

  markAllNotificationsRead() {
    const st = loadState();
    st.notifications.forEach((n) => {
      n.isRead = true;
    });
    saveState(st);
    return { ok: true };
  },
};
