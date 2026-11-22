import type {
  AdminUserRecord,
  AiAssessment,
  AuthorityRecord,
  CivicInsight,
  ComplaintDetail,
  ComplaintStatus,
  ComplaintSummary,
  Department,
  DuplicateGroup,
  EscalationRecord,
  GeoIdentifyResult,
  NotificationItem,
  RoutingRule,
  Severity,
  SlaConfig,
  UserProfile,
  Ward,
  WardHealthScore,
} from '../shared/types.ts';

// Keep auth token strictly in JS memory (never localStorage)
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface MetaPayload {
  wards: Ward[];
  landmarks: Array<{ label: string; wardId: string; lat: number; lng: number }>;
  authorities: AuthorityRecord[];
  departments: Department[];
  routingRules: RoutingRule[];
  slaConfigs: SlaConfig[];
  fieldOfficers: Array<{
    id: string;
    fullName: string;
    wardId: string | null;
    wardName: string | null;
    departmentId: string | null;
    departmentName: string | null;
    avatarInitials: string;
  }>;
}

export interface PublicOverviewPayload {
  stats: {
    totalReports: number;
    openIssues: number;
    resolvedIssues: number;
    verifiedResolutions: number;
    resolutionRatePct: number;
    avgResolutionHours: number;
  };
  complaints: ComplaintSummary[];
  wards: Ward[];
  wardHealth: WardHealthScore[];
  categoryBreakdown: Array<{ category: string; count: number }>;
  trends: Array<{ month: string; reported: number; resolved: number }>;
  insights: CivicInsight[];
  clusters: DuplicateGroup[];
  verifiedShowcase: ComplaintSummary[];
}

export interface IntelligenceSummaryPayload {
  kpis: {
    totalComplaints: number;
    openComplaints: number;
    criticalComplaints: number;
    overdueComplaints: number;
    resolvedThisMonth: number;
    avgResolutionHours: number;
    avgResponseHours: number;
    resolutionRatePct: number;
  };
  departmentWorkload: Array<{
    departmentId: string;
    departmentName: string;
    colorHex: string;
    total: number;
    open: number;
    resolved: number;
    overdue: number;
  }>;
  wardDistribution: Array<{
    wardId: string;
    wardCode: string;
    wardName: string;
    total: number;
    open: number;
    critical: number;
    resolved: number;
  }>;
  trends: Array<{ month: string; reported: number; resolved: number }>;
  wardHealth: WardHealthScore[];
  insights: CivicInsight[];
  duplicateGroups: DuplicateGroup[];
  escalations: EscalationRecord[];
  recentFeedback: Array<{
    id: string;
    complaintId: string;
    trackingCode: string;
    complaintTitle: string;
    wardId: string | null;
    wardName: string | null;
    verdict: string;
    comment: string | null;
    rating: number | null;
    createdAt: string;
  }>;
}

export const api = {
  demoLogin: (role: 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer') =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: { fullName: string; email: string; password: string; wardId?: string }) =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getMe: () => apiFetch<{ user: UserProfile; unreadNotifications: number }>('/api/auth/me'),

  getMeta: () => apiFetch<MetaPayload>('/api/meta'),

  getPublicOverview: () => apiFetch<PublicOverviewPayload>('/api/public/overview'),

  getIntelligenceSummary: () => apiFetch<IntelligenceSummaryPayload>('/api/intelligence/summary'),

  identifyLocation: (payload: { lat: number; lng: number; category?: string; text?: string }) =>
    apiFetch<GeoIdentifyResult>('/api/geo/identify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getComplaints: (params: Record<string, string | boolean | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== 'all') {
        qs.set(k, String(v));
      }
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<{ complaints: ComplaintSummary[] }>(`/api/complaints${suffix}`);
  },

  getComplaintDetail: (id: string) =>
    apiFetch<{ complaint: ComplaintDetail }>(`/api/complaints/${encodeURIComponent(id)}`),

  transcribeVoice: (payload: {
    audioBase64: string;
    mimeType: string;
    languageHint?: 'te-IN' | 'en-IN' | 'auto';
  }) =>
    apiFetch<{ transcript: string; detectedLanguage: string }>('/api/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeComplaint: (payload: {
    text?: string;
    voiceTranscript?: string;
    voiceLanguage?: string;
    imageBase64?: string;
    imageMimeType?: string;
    demoImagePath?: string;
    addressHint?: string;
  }) =>
    apiFetch<{ assessment: AiAssessment }>('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  askAssistant: (payload: { question: string; complaintId?: string }) =>
    apiFetch<{ answer: string; citedTrackingCodes: string[] }>('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createComplaint: (payload: Record<string, unknown>) =>
    apiFetch<{ complaint: ComplaintDetail }>('/api/complaints', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  complaintAction: (
    id: string,
    payload: {
      action: 'acknowledge' | 'forward' | 'assign_officer' | 'post_update' | 'escalate';
      note?: string;
      departmentId?: string;
      officerId?: string;
      delayReason?: string;
    }
  ) =>
    apiFetch<{ complaint: ComplaintDetail }>(`/api/complaints/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  fieldProgress: (
    id: string,
    payload: {
      status:
        | 'Work Assigned'
        | 'Inspection Pending'
        | 'Work Started'
        | 'In Progress'
        | 'Work Completed';
      note: string;
      obstacleFlag?: boolean;
    }
  ) =>
    apiFetch<{ complaint: ComplaintDetail }>(
      `/api/complaints/${encodeURIComponent(id)}/field-progress`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getAdminUsers: () => apiFetch<{ users: AdminUserRecord[] }>('/api/admin/users'),

  updateAdminUser: (
    id: string,
    payload: {
      role: 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer';
      wardId: string | null;
      departmentId: string | null;
    }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateWardAuthority: (wardId: string, authorityId: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/ward-authorities/${encodeURIComponent(wardId)}`, {
      method: 'PUT',
      body: JSON.stringify({ authorityId }),
    }),

  submitResolutionEvidence: (
    id: string,
    payload: {
      afterImageBase64?: string;
      afterMimeType?: string;
      demoAfterImagePath?: string;
      notes: string;
      runAiComparison?: boolean;
    }
  ) =>
    apiFetch<{ complaint: ComplaintDetail; aiWarning?: string | null }>(
      `/api/complaints/${encodeURIComponent(id)}/resolution-evidence`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  verifyComplaint: (
    id: string,
    payload: {
      verdict: 'resolved' | 'partially_resolved' | 'not_resolved';
      comment?: string;
      rating?: number;
    }
  ) =>
    apiFetch<{ complaint: ComplaintDetail }>(`/api/complaints/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runEscalationSweep: () =>
    apiFetch<{ escalatedCount: number; escalations: EscalationRecord[] }>('/api/escalations/sweep', {
      method: 'POST',
    }),

  updateRoutingRule: (
    id: string,
    payload: { departmentId: string; defaultPriority: Severity; autoAssignEnabled: boolean }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateSlaConfig: (
    id: string,
    payload: { targetMinutes: number; escalateToRole: 'ward_rep' | 'municipal_admin' }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/admin/sla-configs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getNotifications: () => apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),

  markAllNotificationsRead: () =>
    apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),
};

export function formatRelativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHr = hours % 24;
  return remHr > 0 ? `${days}d ${remHr}h` : `${days}d`;
}

export function getSeverityStyle(severity: Severity): {
  text: string;
  dot: string;
  border: string;
  hex: string;
} {
  switch (severity) {
    case 'Critical':
      return { text: 'text-[#B91C1C]', dot: 'bg-[#DC2626]', border: 'border-[#FECACA]', hex: '#DC2626' };
    case 'High':
      return { text: 'text-[#C2410C]', dot: 'bg-[#EA580C]', border: 'border-[#FED7AA]', hex: '#EA580C' };
    case 'Medium':
      return { text: 'text-[#B45309]', dot: 'bg-[#D97706]', border: 'border-[#FDE68A]', hex: '#D97706' };
    case 'Low':
      return { text: 'text-[#1D4ED8]', dot: 'bg-[#2563EB]', border: 'border-[#BFDBFE]', hex: '#2563EB' };
  }
}

export function getStatusColor(status: ComplaintStatus): string {
  if (status === 'Citizen Verified' || status === 'Resolved') return 'text-[#15803D]';
  if (status === 'Escalated' || status === 'Reopened') return 'text-[#B91C1C]';
  if (status === 'Awaiting Citizen Verification' || status === 'Resolution Evidence Submitted')
    return 'text-[#0F7B55]';
  if (status === 'In Progress' || status === 'Work Assigned') return 'text-[#1D4ED8]';
  return 'text-[#5A635D]';
}

export function getMarkerHex(complaint: ComplaintSummary): string {
  if (complaint.status === 'Citizen Verified' || complaint.status === 'Resolved') return '#15803D';
  return getSeverityStyle(complaint.severity).hex;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}
