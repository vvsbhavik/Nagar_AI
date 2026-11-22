import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  formatDateTime,
  formatRelativeTime,
  getSeverityStyle,
  getStatusColor,
  type MetaPayload,
} from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  SEVERITIES,
  type ComplaintDetail,
  type ComplaintSummary,
  type UserProfile,
} from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

interface CitizenDashboardProps {
  mode: 'overview' | 'complaints';
  user: UserProfile;
  meta: MetaPayload;
  onReportIssue: () => void;
  onSelectComplaint: (id: string) => void;
  onOpenAssistant: () => void;
}

export function CitizenDashboard({
  mode,
  user,
  meta,
  onReportIssue,
  onSelectComplaint,
  onOpenAssistant,
}: CitizenDashboardProps) {
  const { t } = useI18n();
  const [myComplaints, setMyComplaints] = useState<ComplaintSummary[]>([]);
  const [nearbyComplaints, setNearbyComplaints] = useState<ComplaintSummary[]>([]);
  const [latestDetail, setLatestDetail] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters for My Complaints page
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [wardFilter, setWardFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [scopeTab, setScopeTab] = useState<'mine' | 'nearby'>('mine');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mineRes, nearbyRes] = await Promise.all([
        api.getComplaints({ scope: 'mine' }),
        api.getComplaints({ wardId: user.wardId || undefined }),
      ]);
      setMyComplaints(mineRes.complaints);
      setNearbyComplaints(nearbyRes.complaints);

      const featured =
        mineRes.complaints.find((c) => c.status !== 'Citizen Verified' && c.status !== 'Resolved') ||
        mineRes.complaints[0];
      if (featured) {
        try {
          const det = await api.getComplaintDetail(featured.id);
          setLatestDetail(det.complaint);
        } catch {
          setLatestDetail(null);
        }
      } else {
        setLatestDetail(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.id]);

  const closedSet = new Set(['Resolved', 'Citizen Verified']);
  const activeMine = myComplaints.filter((c) => !closedSet.has(c.status));
  const resolvedMine = myComplaints.filter((c) => closedSet.has(c.status));
  const needsAttention = myComplaints.filter(
    (c) => c.status === 'Awaiting Citizen Verification' || c.isOverdue
  );

  const sourceList = scopeTab === 'mine' ? myComplaints : nearbyComplaints;
  const filteredList = sourceList.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !c.trackingCode.toLowerCase().includes(q) &&
        !c.addressLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    if (wardFilter !== 'all' && c.wardId !== wardFilter) return false;
    if (dateFrom && c.createdAt.slice(0, 10) < dateFrom) return false;
    return true;
  });

  if (mode === 'complaints') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#181C19]">
              {t('navMyComplaints')} &amp; Local Reports
            </h1>
            <p className="mt-0.5 text-sm text-[#5A635D]">
              Track status changes, assigned authorities, SLA deadlines, and verification steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onReportIssue}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F7B55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0C6545] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            {t('reportProblemBtn')}
          </button>
        </div>

        {/* Scope & Filter Bar */}
        <div className="space-y-3 rounded-xl border border-[#E4E4DD] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg bg-[#F3F4EF] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setScopeTab('mine')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  scopeTab === 'mine'
                    ? 'bg-white text-[#113829] shadow-xs'
                    : 'text-[#5A635D] hover:text-[#181C19]'
                }`}
              >
                My Reports ({myComplaints.length})
              </button>
              <button
                type="button"
                onClick={() => setScopeTab('nearby')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  scopeTab === 'nearby'
                    ? 'bg-white text-[#113829] shadow-xs'
                    : 'text-[#5A635D] hover:text-[#181C19]'
                }`}
              >
                Nearby in {user.wardName || 'My Ward'} ({nearbyComplaints.length})
              </button>
            </div>

            <div className="relative min-w-[240px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#7A847D]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, title, or street..."
                className="w-full rounded-lg border border-[#D8DAD2] bg-white py-2 pl-9 pr-3 text-xs text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs text-[#181C19]"
            >
              <option value="all">All Statuses</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs text-[#181C19]"
            >
              <option value="all">All Categories</option>
              {COMPLAINT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs text-[#181C19]"
            >
              <option value="all">All Priorities</option>
              {SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
            <select
              value={wardFilter}
              onChange={(e) => setWardFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs text-[#181C19]"
            >
              <option value="all">All Wards</option>
              {meta.wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs text-[#181C19]"
              aria-label="Filter from date"
            />
          </div>
        </div>

        {/* High-Density Complaints Table */}
        <div className="overflow-hidden rounded-xl border border-[#E4E4DD] bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#5A635D]">Loading complaints...</div>
          ) : filteredList.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#181C19]">
                No complaints match your active filters.
              </p>
              <p className="mt-1 text-xs text-[#5A635D]">
                Adjust filters or submit a new civic issue report.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E4E4DD] bg-[#FAFAF8] text-xs font-semibold text-[#5A635D]">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Civic Issue</th>
                    <th className="px-4 py-3">Ward &amp; Dept</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEA]">
                  {filteredList.map((c) => {
                    const sev = getSeverityStyle(c.severity);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelectComplaint(c.id)}
                        className="cursor-pointer transition-colors hover:bg-[#F7F7F4]"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#113829] whitespace-nowrap">
                          {c.trackingCode}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#181C19]">{c.title}</div>
                          <div className="mt-0.5 text-xs text-[#5A635D]">
                            {c.category} · {c.addressLabel}
                            {(c.relatedCount || 1) > 1 ? ` · ${c.relatedCount} linked reports` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#344038] whitespace-nowrap">
                          <div className="font-medium">{c.wardName || 'Demo Zone'}</div>
                          <div className="text-[#5A635D]">{c.departmentName}</div>
                        </td>
                        <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${sev.text}`}>
                          {c.severity}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={`font-semibold ${getStatusColor(c.status)}`}>
                            {c.status}
                          </span>
                          {c.isOverdue && (
                            <div className="font-mono text-[11px] text-[#B91C1C]">
                              SLA Overdue
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[#5A635D] tabular-nums whitespace-nowrap">
                          {formatRelativeTime(c.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Citizen Dashboard Overview Mode
  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div>
          <p className="text-xs font-medium text-[#0F7B55]">
            {t('roleCitizen')} · {user.wardName || 'Greater Municipal Demo Zone'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#181C19]">
            Welcome back, {user.fullName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-[#5A635D]">{t('tagline')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAssistant}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D8DAD2] bg-white px-4 py-2.5 text-sm font-semibold text-[#181C19] hover:border-[#113829] whitespace-nowrap shrink-0"
          >
            <Bot className="h-4 w-4 text-[#0F7B55]" />
            {t('askAiBtn')}
          </button>
          <button
            type="button"
            onClick={onReportIssue}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F7B55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0C6545] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            {t('reportProblemBtn')}
          </button>
        </div>
      </div>

      {/* Exact 4 Citizen KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t('kpiTotalComplaints'),
            value: myComplaints.length,
            sub: `${nearbyComplaints.length} total records in your ward`,
            tone: 'text-[#181C19]',
          },
          {
            label: t('kpiActiveComplaints'),
            value: activeMine.length,
            sub: 'Currently progressing through municipal workflow',
            tone: 'text-[#113829]',
          },
          {
            label: t('kpiResolvedComplaints'),
            value: resolvedMine.length,
            sub: 'Closed with before/after proof',
            tone: 'text-[#15803D]',
          },
          {
            label: t('kpiNeedsAttention'),
            value: needsAttention.length,
            sub: 'Awaiting your verification or SLA escalated',
            tone: needsAttention.length > 0 ? 'text-[#C2410C]' : 'text-[#181C19]',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#E4E4DD] bg-white p-5">
            <div className="text-xs font-medium text-[#5A635D]">{kpi.label}</div>
            <div className={`mt-2 font-mono text-3xl font-bold tabular-nums ${kpi.tone}`}>
              {kpi.value}
            </div>
            <div className="mt-1 text-xs text-[#5A635D]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Attention Banner for Citizen Verification */}
      {needsAttention.length > 0 && (
        <section className="rounded-xl border border-[#0F7B55]/30 bg-[#F2F8F5] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#113829]">
            <AlertCircle className="h-4 w-4 text-[#0F7B55]" />
            {t('kpiNeedsAttention')}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {needsAttention.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectComplaint(c.id)}
                className="flex items-start justify-between gap-3 rounded-lg border border-[#D4E7DD] bg-white p-3.5 text-left transition-colors hover:border-[#0F7B55]"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-[#113829]">{c.trackingCode}</span>
                    <span className="text-[#5A635D]">·</span>
                    <span className={`font-semibold ${getStatusColor(c.status)}`}>{c.status}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#181C19]">{c.title}</div>
                  <div className="mt-0.5 text-xs text-[#5A635D]">
                    {c.status === 'Awaiting Citizen Verification'
                      ? 'Repair evidence uploaded — inspect before/after photos and verify'
                      : `Escalated · Overdue by ${c.overdueMinutes}m (Demo SLA)`}
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#0F7B55] whitespace-nowrap">
                  Open →
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Map Preview + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                {t('nearbyIssuesMap')}
              </h2>
              <p className="text-xs text-[#5A635D]">
                Click any marker to inspect status, ward authority, and repair updates
              </p>
            </div>
            <span className="font-mono text-xs text-[#5A635D]">
              {user.wardName || 'Citywide'}
            </span>
          </div>
          <CivicMap
            wards={meta.wards}
            complaints={nearbyComplaints}
            highlightWardId={user.wardId}
            onSelectComplaint={onSelectComplaint}
            heightClass="h-[360px]"
          />
        </section>

        <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-[#181C19]">
            {t('recentComplaints')}
          </h2>
          <p className="text-xs text-[#5A635D]">Live updates from ward offices and field crews</p>
          <div className="mt-4 divide-y divide-[#EFEFEA]">
            {myComplaints.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#5A635D]">
                You haven&apos;t submitted any reports yet. Click &ldquo;{t('reportProblemBtn')}
                &rdquo; to begin.
              </div>
            ) : (
              myComplaints.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectComplaint(c.id)}
                  className="flex w-full items-start justify-between gap-3 py-3 text-left transition-colors hover:bg-[#FAFAF8]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#5A635D]">
                      <span className="font-mono font-semibold text-[#113829]">
                        {c.trackingCode}
                      </span>
                      <span>·</span>
                      <span className={`font-semibold ${getStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium text-[#181C19]">
                      {c.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#5A635D]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.addressLabel}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-[#5A635D] tabular-nums">
                      {formatRelativeTime(c.updatedAt)}
                    </div>
                    {c.status === 'Citizen Verified' ? (
                      <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-[#15803D]" />
                    ) : (
                      <Clock className="ml-auto mt-1 h-4 w-4 text-[#5A635D]" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Inline Complaint Status Timeline */}
      {latestDetail && (
        <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEFEA] pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#5A635D]">
                <span className="font-semibold text-[#0F7B55]">{t('latestTimeline')}</span>
                <span>·</span>
                <span className="font-mono font-bold text-[#113829]">
                  {latestDetail.trackingCode}
                </span>
                <span>·</span>
                <span className={`font-semibold ${getStatusColor(latestDetail.status)}`}>
                  {latestDetail.status}
                </span>
              </div>
              <h2 className="mt-1 font-display text-base font-bold text-[#181C19]">
                {latestDetail.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSelectComplaint(latestDetail.id)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-3.5 py-2 text-xs font-semibold text-[#113829] hover:border-[#113829]"
            >
              Inspect Full Record →
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {latestDetail.statusHistory.slice(-4).map((step, idx, arr) => (
              <div
                key={step.id}
                className="rounded-lg border border-[#EFEFEA] bg-[#FAFAF8] p-3.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#5A635D] tabular-nums">
                  <span>Step {idx + 1}</span>
                  <span>{formatDateTime(step.createdAt)}</span>
                </div>
                <div
                  className={`mt-1.5 text-sm font-semibold ${
                    idx === arr.length - 1 ? 'text-[#0F7B55]' : 'text-[#181C19]'
                  }`}
                >
                  {step.toStatus}
                </div>
                <div className="mt-0.5 text-xs text-[#5A635D]">{step.actorName}</div>
                {step.note && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#344038]">
                    {step.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
