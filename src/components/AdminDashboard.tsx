import {
  AlertTriangle,
  Flame,
  Layers,
  MapPin,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  formatDateTime,
  formatDurationMinutes,
  getSeverityStyle,
  getStatusColor,
  type IntelligenceSummaryPayload,
  type MetaPayload,
} from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  SEVERITIES,
  type AdminUserRecord,
  type ComplaintSummary,
  type RoutingRule,
  type Severity,
  type SlaConfig,
} from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

interface AdminDashboardProps {
  meta: MetaPayload;
  onRefreshMeta: () => Promise<void>;
  onSelectComplaint: (id: string) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function AdminDashboard({
  meta,
  onRefreshMeta,
  onSelectComplaint,
  onToast,
}: AdminDashboardProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'hotspots' | 'escalations' | 'config' | 'governance'
  >('overview');
  const [intel, setIntel] = useState<IntelligenceSummaryPayload | null>(null);
  const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Citywide multi-facet filters
  const [wardId, setWardId] = useState('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');

  // Editable Routing & SLA configs
  const [routingDraft, setRoutingDraft] = useState<RoutingRule[]>(meta.routingRules);
  const [slaDraft, setSlaDraft] = useState<SlaConfig[]>(meta.slaConfigs);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Ward-Authority & RBAC Users
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [wardAuthorityDraft, setWardAuthorityDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setRoutingDraft(meta.routingRules);
    setSlaDraft(meta.slaConfigs);
    const map: Record<string, string> = {};
    for (const w of meta.wards) {
      if (w.primaryAuthority?.id) {
        map[w.id] = w.primaryAuthority.id;
      }
    }
    setWardAuthorityDraft(map);
  }, [meta]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [iRes, cRes] = await Promise.all([
        api.getIntelligenceSummary(),
        api.getComplaints({
          wardId,
          departmentId,
          category,
          severity,
          status,
          dateFrom,
        }),
      ]);
      setIntel(iRes);
      setComplaints(cRes.complaints);
    } finally {
      setLoading(false);
    }
  };

  const loadGovernanceUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await api.getAdminUsers();
      setAdminUsers(res.users);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load users.', 'error');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [wardId, departmentId, category, severity, status, dateFrom]);

  useEffect(() => {
    if (activeTab === 'governance' && adminUsers.length === 0) {
      loadGovernanceUsers();
    }
  }, [activeTab]);

  const handleEscalationSweep = async () => {
    setSweeping(true);
    try {
      const res = await api.runEscalationSweep();
      onToast(
        res.escalatedCount > 0
          ? `Escalated ${res.escalatedCount} newly overdue complaint(s) per configured SLA rules.`
          : 'All overdue complaints are already escalated and tracked.',
        'info'
      );
      await loadAdminData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Sweep failed.', 'error');
    } finally {
      setSweeping(false);
    }
  };

  const handleSaveRule = async (rule: RoutingRule) => {
    setSavingId(rule.id);
    try {
      await api.updateRoutingRule(rule.id, {
        departmentId: rule.departmentId,
        defaultPriority: rule.defaultPriority,
        autoAssignEnabled: rule.autoAssignEnabled,
      });
      await onRefreshMeta();
      onToast(`Saved smart routing rule for ${rule.category}.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save rule.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveSla = async (cfg: SlaConfig) => {
    setSavingId(cfg.id);
    try {
      await api.updateSlaConfig(cfg.id, {
        targetMinutes: cfg.targetMinutes,
        escalateToRole: cfg.escalateToRole as 'ward_rep' | 'municipal_admin',
      });
      await onRefreshMeta();
      onToast(`Updated demo SLA target for ${cfg.severity} severity.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update SLA.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveWardAuthority = async (wId: string) => {
    const authId = wardAuthorityDraft[wId];
    if (!authId) return;
    setSavingId(`wa-${wId}`);
    try {
      await api.updateWardAuthority(wId, authId);
      await onRefreshMeta();
      onToast('Updated ward-authority mapping.', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update mapping.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveUser = async (u: AdminUserRecord) => {
    setSavingId(`usr-${u.id}`);
    try {
      await api.updateAdminUser(u.id, {
        role: u.role as 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer',
        wardId: u.wardId || null,
        departmentId: u.departmentId || null,
      });
      await Promise.all([loadGovernanceUsers(), onRefreshMeta()]);
      onToast(`Updated role & jurisdiction for ${u.fullName}.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update user.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (loading && !intel) {
    return (
      <div className="p-10 text-center text-sm text-[#5A635D]">
        Loading Municipal Command Center...
      </div>
    );
  }

  const kpis = intel?.kpis;

  return (
    <div className="space-y-6">
      {/* Header + Sub-nav */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div>
          <p className="text-xs font-medium text-[#0F7B55]">
            {t('roleMunicipalAdmin')} · Citywide Command Center (Demo Administration)
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#181C19]">
            {t('navCommandCenter')} &amp; Civic Intelligence
          </h1>
          <p className="mt-1 text-sm text-[#5A635D]">
            Monitor ward capacity, department workloads, city issue heatmaps, SLA escalations,
            ward-authority mappings, and user permissions.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-[#EAECE5] p-1 text-xs font-semibold">
          {[
            { id: 'overview', label: 'Command Center' },
            { id: 'hotspots', label: `Hotspots (${intel?.insights.length || 0})` },
            { id: 'escalations', label: `Escalations (${intel?.escalations.length || 0})` },
            { id: 'config', label: 'Routing & SLA' },
            { id: 'governance', label: 'Authorities & Users' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded-md px-3 py-1.5 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-[#113829] shadow-xs'
                  : 'text-[#5A635D] hover:text-[#181C19]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Citywide KPIs (All Requested Command Metrics) */}
      {kpis && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            { label: t('kpiTotalComplaints'), val: kpis.totalComplaints, tone: 'text-[#181C19]' },
            { label: t('kpiActiveComplaints'), val: kpis.openComplaints, tone: 'text-[#113829]' },
            { label: t('kpiCriticalIssues'), val: kpis.criticalComplaints, tone: 'text-[#B91C1C]' },
            { label: t('kpiOverdueIssues'), val: kpis.overdueComplaints, tone: 'text-[#C2410C]' },
            { label: t('kpiResolutionRate'), val: `${kpis.resolutionRatePct}%`, tone: 'text-[#0F7B55]' },
            { label: t('kpiAvgResponse'), val: `${kpis.avgResponseHours}h`, tone: 'text-[#113829]' },
            { label: t('kpiAvgResolution'), val: `${kpis.avgResolutionHours}h`, tone: 'text-[#181C19]' },
            { label: t('kpiResolvedMonth'), val: kpis.resolvedThisMonth, tone: 'text-[#15803D]' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-[#E4E4DD] bg-white p-4">
              <div className="text-[11px] font-medium text-[#5A635D]">{k.label}</div>
              <div className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${k.tone}`}>
                {k.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'overview' && intel && (
        <div className="space-y-6">
          {/* Multi-Facet Filter Bar + City Map & Heatmap Toggle */}
          <section className="space-y-4 rounded-xl border border-[#E4E4DD] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  Citywide GIS Map &amp; Issue Heatmap
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Showing {complaints.length} matching complaint(s) across 6 Demo Ward Boundaries
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowHeatmap((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    showHeatmap
                      ? 'border-[#EA580C]/40 bg-[#FFF7ED] text-[#C2410C]'
                      : 'border-[#D8DAD2] bg-white text-[#5A635D] hover:text-[#181C19]'
                  }`}
                >
                  <Flame className="h-3.5 w-3.5" />
                  {showHeatmap ? 'Heatmap Layer: On' : 'Heatmap Layer: Off'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWardId('all');
                    setDepartmentId('all');
                    setCategory('all');
                    setSeverity('all');
                    setStatus('all');
                    setDateFrom('');
                  }}
                  className="text-xs font-semibold text-[#0F7B55] hover:underline"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <select
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Wards</option>
                {meta.wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Departments</option>
                {meta.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Categories</option>
                {COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Severities</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Statuses</option>
                {COMPLAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                aria-label="Filter from date"
              />
            </div>

            <CivicMap
              wards={meta.wards}
              complaints={complaints}
              clusters={intel.duplicateGroups}
              highlightWardId={wardId === 'all' ? null : wardId}
              onSelectComplaint={onSelectComplaint}
              showHeatmap={showHeatmap}
              heightClass="h-[390px]"
            />
          </section>

          {/* Charts Grid: Ward Distribution + Department Performance */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Ward Distribution (Open vs Resolved)
              </h2>
              <p className="text-xs text-[#5A635D]">Live database breakdown across demo wards</p>
              <div className="mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intel.wardDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEA" vertical={false} />
                    <XAxis dataKey="wardName" tick={{ fontSize: 11, fill: '#5A635D' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A635D' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E4E4DD', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="open" name="Open" fill="#113829" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="#0F7B55" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="critical" name="Critical" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Department Performance &amp; SLA Load
              </h2>
              <p className="text-xs text-[#5A635D]">Active vs overdue volume by municipal department</p>
              <div className="mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intel.departmentWorkload} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEA" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#5A635D' }} allowDecimals={false} />
                    <YAxis
                      dataKey="departmentName"
                      type="category"
                      width={145}
                      tick={{ fontSize: 11, fill: '#181C19' }}
                    />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E4E4DD', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="open" name="Open" fill="#113829" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="#15803D" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="overdue" name="Overdue" fill="#DC2626" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-5">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Complaint Intake vs Resolution Trend
              </h2>
              <p className="text-xs text-[#5A635D]">Computed strictly from recorded complaint dates</p>
              <div className="mt-4 h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={intel.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEA" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5A635D' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A635D' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E4E4DD', fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="reported"
                      name="Reported"
                      stroke="#113829"
                      fill="#113829"
                      fillOpacity={0.12}
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke="#0F7B55"
                      fill="#0F7B55"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Filtered Citywide Table */}
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-7">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Live Citywide Records ({complaints.length})
              </h2>
              <div className="mt-3 max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-[#E4E4DD] bg-[#FAFAF8] text-[#5A635D]">
                    <tr>
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Title &amp; Ward</th>
                      <th className="py-2 pr-3">Priority</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEA]">
                    {complaints.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => onSelectComplaint(c.id)}
                        className="cursor-pointer hover:bg-[#F7F7F4]"
                      >
                        <td className="py-2.5 pr-3 font-mono font-semibold text-[#113829] whitespace-nowrap">
                          {c.trackingCode}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-[#181C19]">{c.title}</div>
                          <div className="text-[11px] text-[#5A635D]">
                            {c.wardName} · {c.departmentName}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 pr-3 font-semibold whitespace-nowrap ${
                            getSeverityStyle(c.severity).text
                          }`}
                        >
                          {c.severity}
                        </td>
                        <td
                          className={`py-2.5 text-right font-semibold whitespace-nowrap ${getStatusColor(
                            c.status
                          )}`}
                        >
                          {c.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'hotspots' && intel && (
        <div className="space-y-6">
          {/* Civic Hotspot & Recurring Infrastructure Intelligence */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                AI-Grounded Civic Hotspot &amp; Recurring Infrastructure Insights
              </h2>
              <p className="text-xs text-[#5A635D]">
                Every insight below is dynamically computed from actual database complaint clusters
                with traceable supporting IDs.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {intel.insights.map((ins) => (
                <div
                  key={ins.id}
                  className="space-y-2.5 rounded-xl border border-[#E4E4DD] bg-[#FAFAF8] p-5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#0F7B55]">
                      {ins.isRecurringInfra ? 'Recurring Infrastructure Alert' : ins.category} ·{' '}
                      {ins.wardName}
                    </span>
                    <span className="font-mono font-bold text-[#113829] tabular-nums">
                      {ins.supportingData.complaintCount} supporting records
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-[#181C19]">{ins.title}</h3>
                  <p className="text-xs leading-relaxed text-[#344038]">{ins.summary}</p>
                  <div className="rounded-lg border border-[#D4E7DD] bg-[#F2F8F5] p-3 text-xs text-[#113829]">
                    <span className="font-semibold">Recommended Engineering Action: </span>
                    {ins.recommendation}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="text-[#5A635D]">Evidence IDs:</span>
                    {ins.supportingData.trackingCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => onSelectComplaint(code)}
                        className="font-mono font-semibold text-[#0F7B55] underline decoration-[#0F7B55]/40 hover:text-[#113829]"
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Duplicate Issue Clusters */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#0F7B55]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  Detected Duplicate &amp; Related Issue Clusters
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Grouped by geospatial proximity, category, and textual similarity while preserving
                  each individual citizen ticket.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E4E4DD] bg-[#FAFAF8] text-xs font-semibold text-[#5A635D]">
                  <tr>
                    <th className="px-4 py-3">Cluster Location</th>
                    <th className="px-4 py-3">Category &amp; Ward</th>
                    <th className="px-4 py-3">Linked Reports</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Reporting Span</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEA]">
                  {intel.duplicateGroups.map((g) => (
                    <tr key={g.id} className="hover:bg-[#F7F7F4]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#181C19]">{g.addressLabel}</div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
                          {(g.members || []).map((m) => (
                            <button
                              key={m.complaintId}
                              type="button"
                              onClick={() => onSelectComplaint(m.complaintId)}
                              className="font-mono text-[#0F7B55] hover:underline"
                            >
                              {m.trackingCode}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#344038]">
                        <div>{g.category}</div>
                        <div className="text-[#5A635D]">{g.wardName}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-[#113829] tabular-nums">
                        {g.reportCount}
                      </td>
                      <td
                        className={`px-4 py-3 text-xs font-semibold ${
                          getSeverityStyle(g.priority).text
                        }`}
                      >
                        {g.priority}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#5A635D] tabular-nums">
                        {new Date(g.firstReportedAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        →{' '}
                        {new Date(g.lastReportedAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-[#113829]">
                        {g.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'escalations' && intel && (
        <section className="space-y-5 rounded-xl border border-[#E4E4DD] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                SLA Monitoring &amp; Escalation Center
              </h2>
              <p className="text-xs text-[#5A635D]">
                Escalations are generated strictly from configured demo SLA rules and actual
                complaint deadlines.
              </p>
            </div>
            <button
              type="button"
              onClick={handleEscalationSweep}
              disabled={sweeping}
              className="inline-flex items-center gap-2 rounded-lg bg-[#113829] px-4 py-2 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sweeping ? 'animate-spin' : ''}`} />
              Run SLA Escalation Sweep
            </button>
          </div>

          <div className="space-y-3">
            {intel.escalations.map((esc) => (
              <div
                key={esc.id}
                onClick={() => onSelectComplaint(esc.complaintId)}
                className="flex cursor-pointer flex-wrap items-start justify-between gap-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2]/60 p-4 transition-colors hover:bg-[#FEF2F2]"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <ShieldAlert className="h-4 w-4 text-[#B91C1C]" />
                    <span className="font-mono font-bold text-[#113829]">{esc.trackingCode}</span>
                    <span className="text-[#5A635D]">·</span>
                    <span className="font-semibold text-[#B91C1C]">{esc.severity}</span>
                    <span className="text-[#5A635D]">·</span>
                    <span className="text-[#5A635D]">{esc.wardName}</span>
                  </div>
                  <div className="text-sm font-semibold text-[#181C19]">{esc.complaintTitle}</div>
                  <div className="text-xs text-[#344038]">
                    Delay Reason: {esc.delayReason || 'Pending authority response'}
                  </div>
                  <div className="font-mono text-[11px] text-[#5A635D]">
                    Escalated {esc.fromRole} → {esc.toRole} by {esc.triggeredBy} ·{' '}
                    {formatDateTime(esc.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-[#B91C1C] tabular-nums">
                    Overdue +{formatDurationMinutes(esc.overdueMinutes)}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#113829]">Inspect →</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'config' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Smart Department Routing Configuration */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6 lg:col-span-7">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-[#0F7B55]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  Smart Department Routing Rules
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Configure automatic category-to-department dispatch across NagarAI intake.
                </p>
              </div>
            </div>

            <div className="divide-y divide-[#EFEFEA]">
              {routingDraft.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-[140px] text-sm font-semibold text-[#181C19]">
                    {rule.category}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={rule.departmentId}
                      onChange={(e) => {
                        const next = [...routingDraft];
                        next[idx] = { ...rule, departmentId: e.target.value };
                        setRoutingDraft(next);
                      }}
                      className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                    >
                      {meta.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rule.defaultPriority}
                      onChange={(e) => {
                        const next = [...routingDraft];
                        next[idx] = { ...rule, defaultPriority: e.target.value as Severity };
                        setRoutingDraft(next);
                      }}
                      className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={savingId === rule.id}
                      onClick={() => handleSaveRule(rule)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#113829] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Configurable Demo SLA Targets */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6 lg:col-span-5">
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Configurable SLA Targets (Demo Settings)
              </h2>
              <p className="text-xs text-[#5A635D]">
                Clearly labeled demo-only response targets powering live overdue &amp; escalation
                monitoring.
              </p>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Demo Targets: Critical 15 min · High 4 hrs (240m) · Medium 24 hrs (1440m) · Low 72
                hrs (4320m).
              </span>
            </div>

            <div className="space-y-4">
              {slaDraft.map((cfg, idx) => (
                <div
                  key={cfg.id}
                  className="space-y-2.5 rounded-lg border border-[#EFEFEA] bg-[#FAFAF8] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${getSeverityStyle(cfg.severity).text}`}>
                      {cfg.severity} Priority
                    </span>
                    <span className="font-mono text-xs text-[#5A635D] tabular-nums">
                      {formatDurationMinutes(cfg.targetMinutes)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] text-[#5A635D]">
                        Target (Minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={43200}
                        value={cfg.targetMinutes}
                        onChange={(e) => {
                          const next = [...slaDraft];
                          next[idx] = {
                            ...cfg,
                            targetMinutes: Math.max(5, parseInt(e.target.value, 10) || 15),
                          };
                          setSlaDraft(next);
                        }}
                        className="w-full rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#5A635D]">Escalate To</label>
                      <select
                        value={cfg.escalateToRole}
                        onChange={(e) => {
                          const next = [...slaDraft];
                          next[idx] = { ...cfg, escalateToRole: e.target.value };
                          setSlaDraft(next);
                        }}
                        className="w-full rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="ward_rep">Ward Representative</option>
                        <option value="municipal_admin">Municipal Admin</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingId === cfg.id}
                    onClick={() => handleSaveSla(cfg)}
                    className="w-full rounded-lg border border-[#113829] bg-white py-1.5 text-xs font-semibold text-[#113829] hover:bg-[#113829] hover:text-white disabled:opacity-50"
                  >
                    Update Demo Target
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'governance' && (
        <div className="space-y-6">
          {/* Ward–Authority Mappings */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#0F7B55]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  Ward–Authority Accountability Mappings
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Assign the primary configured authority office responsible for each municipal ward
                  boundary.
                </p>
              </div>
            </div>

            <div className="divide-y divide-[#EFEFEA]">
              {meta.wards.map((ward) => (
                <div
                  key={ward.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#181C19]">
                      {ward.code} · {ward.name}
                    </div>
                    <div className="text-xs text-[#5A635D]">{ward.zone}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={wardAuthorityDraft[ward.id] || ''}
                      onChange={(e) =>
                        setWardAuthorityDraft((prev) => ({ ...prev, [ward.id]: e.target.value }))
                      }
                      className="rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs text-[#181C19]"
                    >
                      <option value="">Select Authority Office...</option>
                      {meta.authorities.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.title})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={savingId === `wa-${ward.id}` || !wardAuthorityDraft[ward.id]}
                      onClick={() => handleSaveWardAuthority(ward.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#113829] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" />
                      Save Mapping
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Users & Role-Based Permissions */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#0F7B55]" />
                <div>
                  <h2 className="font-display text-base font-semibold text-[#181C19]">
                    Users &amp; Role-Based Access Permissions (RBAC)
                  </h2>
                  <p className="text-xs text-[#5A635D]">
                    Manage platform roles, ward assignments, and municipal department scopes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadGovernanceUsers}
                className="text-xs font-semibold text-[#0F7B55] hover:underline"
              >
                Refresh Directory
              </button>
            </div>

            {usersLoading ? (
              <div className="py-8 text-center text-xs text-[#5A635D]">
                Loading user directory...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E4E4DD] bg-[#FAFAF8] font-semibold text-[#5A635D]">
                    <tr>
                      <th className="px-3 py-2.5">User</th>
                      <th className="px-3 py-2.5">Role</th>
                      <th className="px-3 py-2.5">Assigned Ward</th>
                      <th className="px-3 py-2.5">Department</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEA]">
                    {adminUsers.map((u, idx) => (
                      <tr key={u.id}>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-[#181C19]">{u.fullName}</div>
                          <div className="font-mono text-[11px] text-[#5A635D]">{u.email}</div>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={u.role}
                            onChange={(e) => {
                              const next = [...adminUsers];
                              next[idx] = { ...u, role: e.target.value as AdminUserRecord['role'] };
                              setAdminUsers(next);
                            }}
                            className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="citizen">Citizen</option>
                            <option value="ward_rep">Ward Representative</option>
                            <option value="field_officer">Field Officer</option>
                            <option value="municipal_admin">Municipal Administrator</option>
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={u.wardId || ''}
                            onChange={(e) => {
                              const next = [...adminUsers];
                              next[idx] = { ...u, wardId: e.target.value || null };
                              setAdminUsers(next);
                            }}
                            className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="">Citywide / None</option>
                            {meta.wards.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.code} · {w.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={u.departmentId || ''}
                            onChange={(e) => {
                              const next = [...adminUsers];
                              next[idx] = { ...u, departmentId: e.target.value || null };
                              setAdminUsers(next);
                            }}
                            className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="">All / None</option>
                            {meta.departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            disabled={savingId === `usr-${u.id}`}
                            onClick={() => handleSaveUser(u)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#113829] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
