export type UserRole =
  | 'citizen'
  | 'ward_rep'
  | 'municipal_admin'
  | 'field_officer'
  | 'public_observer';

export const COMPLAINT_CATEGORIES = [
  'Road damage',
  'Potholes',
  'Garbage',
  'Drainage',
  'Water leakage',
  'Streetlight failure',
  'Flooding',
  'Pollution',
  'Footpath damage',
  'Open manholes',
  'Other',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const COMPLAINT_STATUSES = [
  'Submitted',
  'AI Analysis',
  'Jurisdiction Identified',
  'Authority Assigned',
  'Acknowledged',
  'Forwarded',
  'Inspection Pending',
  'Work Assigned',
  'In Progress',
  'Resolution Evidence Submitted',
  'Awaiting Citizen Verification',
  'Resolved',
  'Citizen Verified',
  'Reopened',
  'Escalated',
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Exclude<UserRole, 'public_observer'>;
  wardId: string | null;
  wardName?: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  phoneMasked: string | null;
  avatarInitials: string;
  isDemo: boolean;
}

export interface Ward {
  id: string;
  code: string;
  name: string;
  zone: string;
  populationDemo: number;
  areaSqkm: number;
  centerLat: number;
  centerLng: number;
  boundaryGeojson: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  isDemoBoundary: boolean;
  primaryAuthority?: {
    id: string;
    name: string;
    title: string;
    contactLabelDemo: string;
    isDemoOfficial: boolean;
  } | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  slaEscalationEmailDemo: string;
  colorHex: string;
}

export interface RoutingRule {
  id: string;
  category: ComplaintCategory;
  departmentId: string;
  departmentName?: string;
  defaultPriority: Severity;
  autoAssignEnabled: boolean;
  updatedAt: string;
}

export interface SlaConfig {
  id: string;
  severity: Severity;
  targetMinutes: number;
  escalateToRole: string;
  isDemoTarget: boolean;
  updatedAt: string;
}

export interface ComplaintMedia {
  id: string;
  complaintId: string;
  mediaType: 'image' | 'audio' | 'video';
  url: string;
  mimeType: string;
  caption: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface AiAssessment {
  id?: string;
  complaintId?: string;
  modelName: string;
  categoryPredicted: ComplaintCategory;
  titleSuggested: string;
  descriptionSuggested: string;
  severityPredicted: Severity;
  deterministicSeverity: Severity;
  finalSeverity: Severity;
  deterministicRuleApplied: string | null;
  confidence: number;
  riskFactors: string[];
  severityExplanation: string;
  suggestedDepartment: string;
  suggestedDepartmentId?: string | null;
  suggestedAction: string;
  additionalInfoRequired: string[];
  voiceTranscript?: string | null;
  voiceLanguage?: string | null;
  voiceTranslationEn?: string | null;
  createdAt?: string;
}

export interface StatusHistoryEntry {
  id: string;
  complaintId: string;
  fromStatus: string | null;
  toStatus: ComplaintStatus;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  note: string | null;
  createdAt: string;
}

export interface ComplaintUpdate {
  id: string;
  complaintId: string;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  updateType: string;
  message: string;
  obstacleFlag: boolean;
  isPublic: boolean;
  createdAt: string;
}

export interface ResolutionEvidence {
  id: string;
  complaintId: string;
  submittedBy: string | null;
  submittedByName?: string;
  beforeMediaUrl: string | null;
  afterMediaUrl: string;
  notes: string | null;
  aiRelevanceScore: number | null;
  aiVisibleChanges: string | null;
  aiResolutionAssessment: string | null;
  aiMismatchWarnings: string[];
  aiConfidence: number | null;
  aiExplanation: string | null;
  createdAt: string;
}

export interface EscalationRecord {
  id: string;
  complaintId: string;
  trackingCode?: string;
  complaintTitle?: string;
  wardName?: string;
  severity?: Severity;
  triggeredBy: string;
  fromRole: string;
  toRole: string;
  overdueMinutes: number;
  delayReason: string | null;
  status: string;
  createdAt: string;
}

export interface CitizenFeedback {
  id: string;
  complaintId: string;
  citizenId: string;
  verdict: 'resolved' | 'partially_resolved' | 'not_resolved';
  comment: string | null;
  rating: number | null;
  createdAt: string;
}

export interface DuplicateGroup {
  id: string;
  canonicalComplaintId: string;
  category: ComplaintCategory;
  wardId: string | null;
  wardName?: string | null;
  centerLat: number;
  centerLng: number;
  addressLabel: string;
  priority: Severity;
  status: string;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  members?: Array<{
    complaintId: string;
    trackingCode: string;
    title: string;
    status: ComplaintStatus;
    severity: Severity;
    similarityScore: number;
    matchReasons: string[];
    createdAt: string;
  }>;
}

export interface ComplaintSummary {
  id: string;
  trackingCode: string;
  citizenId: string;
  citizenName?: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  severity: Severity;
  status: ComplaintStatus;
  latitude: number;
  longitude: number;
  addressLabel: string;
  wardId: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  assignedAuthorityId: string | null;
  assignedAuthorityName?: string | null;
  assignedAuthorityTitle?: string | null;
  assignedOfficerId: string | null;
  assignedOfficerName?: string | null;
  voiceTranscript: string | null;
  voiceLanguage: string | null;
  duplicateGroupId: string | null;
  relatedCount?: number;
  slaDeadline: string | null;
  isOverdue: boolean;
  overdueMinutes: number;
  escalatedAt: string | null;
  primaryImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  verifiedAt: string | null;
}

export interface ComplaintDetail extends ComplaintSummary {
  media: ComplaintMedia[];
  aiAssessment: AiAssessment | null;
  statusHistory: StatusHistoryEntry[];
  updates: ComplaintUpdate[];
  resolutionEvidence: ResolutionEvidence[];
  escalations: EscalationRecord[];
  citizenFeedback: CitizenFeedback[];
  duplicateGroup: DuplicateGroup | null;
}

export interface CivicInsight {
  id: string;
  insightType: 'sanitation_hotspot' | 'recurring_drainage' | 'road_cluster' | 'recurring_infrastructure' | 'concentration_spike' | 'overdue_cluster';
  wardId: string | null;
  wardName: string | null;
  category: string;
  title: string;
  summary: string;
  recommendation: string;
  isRecurringInfra: boolean;
  supportingData: {
    complaintCount: number;
    trackingCodes: string[];
    overdueCount?: number;
    monthSpan?: number;
    centerLat?: number;
    centerLng?: number;
    addressHint?: string;
  };
  createdAt: string;
}

export interface WardHealthScore {
  wardId: string;
  wardCode: string;
  wardName: string;
  zone: string;
  score: number;
  supportTier: 'Strong Capacity' | 'Moderate Support Needed' | 'Priority Support Area';
  metrics: {
    totalComplaints: number;
    openComplaints: number;
    criticalCount: number;
    overdueCount: number;
    recurringClusterCount: number;
    resolutionRatePct: number;
    avgResolutionHours: number;
    verifiedSatisfactionPct: number | null;
  };
  factors: Array<{
    label: string;
    impact: number;
    detail: string;
  }>;
}

export interface NotificationItem {
  id: string;
  userId: string;
  complaintId: string | null;
  title: string;
  body: string;
  notifType: string;
  isRead: boolean;
  createdAt: string;
}

export interface GeoIdentifyResult {
  ward: Ward | null;
  matchType: 'exact_polygon' | 'nearest_demo_ward';
  distanceMeters: number;
  isDemoBoundary: boolean;
  primaryAuthority: Ward['primaryAuthority'];
  nearbyDuplicates: Array<{
    complaintId: string;
    trackingCode: string;
    title: string;
    category: ComplaintCategory;
    status: ComplaintStatus;
    distanceMeters: number;
    similarityScore: number;
    createdAt: string;
  }>;
}
