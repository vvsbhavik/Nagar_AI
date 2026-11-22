import { AlertTriangle, Check, Search, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  formatDurationMinutes,
  formatRelativeTime,
  getSeverityStyle,
  getStatusColor,
  type IntelligenceSummaryPayload,
  type MetaPayload,
} from '../lib/api.ts';
import {
  COMPLAINT_STATUSES,
  SEVERITIES,
  type ComplaintSummary,
  type UserProfile,
} from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

interface WardRepDashboardProps {
  user: UserProfile;
  meta: MetaPayload;
  onSelectComplaint: (id: string) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function WardRepDashboard({
  user,
  meta,
  onSelectComplaint,
  onToast,
}: WardRepDashboardProps) {
  const [selectedWardId, setSelectedWardId] = useState<string>(user.wardId || 'ward-14');
  const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
  const [intel, setIntel] = useState<IntelligenceSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadWardData = async () => {
    setLoading(true);
    try {
      const [cRes, iRes] = await Promise.all([
        api.getComplaints({ wardId: selectedWardId }),
        api.getIntelligenceSummary(),
      ]);
      setComplaints(cRes.complaints);
      setIntel(iRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWardData();
  }, [selectedWardId]);

  const handleQuickAcknowledge = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBusyId(id);
    try {
      await api.complaintAction(id, {
        action: 'acknowledge',
        note: 'Acknowledged by Ward Representative Office for priority scheduling.',
      });
      onToast('Complaint acknowledged and citizen notified.', 'success');
      await loadWardData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickAssign = async (e: React.MouseEvent, c: ComplaintSummary) => {
    e.stopPropagation();
    const matchingOfficer =
      meta.fieldOfficers.find((fo) => fo.departmentId === c.departmentId) ||
      meta.fieldOfficers[0];
    if (!matchingOfficer) return;
    setBusyId(c.id);
    try {
      await api.complaintAction(c.id, {
        action: 'assign_officer',
        officerId: matchingOfficer.id,
        note: `Dispatched ${matchingOfficer.fullName} from Ward Queue.`,
      });
      onToast(`Assigned ${c.trackingCode} to ${matchingOfficer.fullName}.`, 'success');
      await loadWardData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Assignment failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const currentWard = meta.wards.find((w) => w.id === selectedWardId);
  const wardHealth = intel?.wardHealth.find((w) => w.wardId === selectedWardId);
  const wardClusters = (intel?.duplicateGroups || []).filter((g) => g.wardId === selectedWardId);
  const wardInsights = (intel?.insights || []).filter((i) => i.wardId === selectedWardId);

  const closedSet = new Set(['Resolved', 'Citizen Verified']);
  const pending = complaints.filter((c) => !closedSet.has(c.status));
  const critical = pending.filter((c) => c.severity === 'Critical');
  const overdue = pending.filter((c) => c.isOverdue);
  const resolved = complaints.filter((c) => closedSet.has(c.status));

  const filtered = complaints.filter((c) => {
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
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div>
          <p className="text-xs font-medium text-[#0F7B55]">
            Ward Representative Operations · Demo Jurisdiction
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#181C19]">
            {currentWard ? `${currentWard.code} — ${currentWard.name}` : 'Ward Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-[#5A635D]">
            Acknowledge citizen complaints, dispatch department field units, and address recurring
            ward infrastructure issues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#5A635D]">Inspect Ward:</label>
          <select
            value={selectedWardId}
            onChange={(e) => setSelectedWardId(e.target.value)}
            className="rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-xs font-semibold text-[#181C19]"
          >
            {meta.wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ward KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: 'Total Reports', val: complaints.length, tone: 'text-[#181C19]' },
          { label: 'Pending Open', val: pending.length, tone: 'text-[#113829]' },
          { label: 'Critical Open', val: critical.length, tone: 'text-[#B91C1C]' },
          { label: 'SLA Overdue', val: overdue.length, tone: 'text-[#C2410C]' },
          { label: 'Resolved', val: resolved.length, tone: 'text-[#15803D]' },
          {
            label: 'Avg Resolution',
            val: `${wardHealth?.metrics.avgResolutionHours ?? 0}h`,
            tone: 'text-[#181C19]',
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-[#E4E4DD] bg-white p-4">
            <div className="text-xs text-[#5A635D]">{k.label}</div>
            <div className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${k.tone}`}>
              {k.val}
            </div>
          </div>
        ))}
      </div>

      {/* Map + Explainable Ward Health & Recurring Problems */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#181C19]">
              Ward Geospatial Issue Map
            </h2>
            <span className="font-mono text-xs text-[#5A635D]">
              {currentWard?.zone} · {complaints.length} records
            </span>
          </div>
          <CivicMap
            wards={meta.wards}
            complaints={complaints}
            clusters={wardClusters}
            highlightWardId={selectedWardId}
            onSelectComplaint={onSelectComplaint}
            heightClass="h-[340px]"
          />
        </section>

        <div className="space-y-5 lg:col-span-5">
          {wardHealth && (
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#181C19]">
                    Explainable Ward Health Index
                  </h2>
                  <p className="text-xs text-[#5A635D]">
                    Resource support indicator · {wardHealth.supportTier}
                  </p>
                </div>
                <div className="font-mono text-3xl font-bold text-[#113829] tabular-nums">
                  {wardHealth.score}
                  <span className="text-xs font-normal text-[#5A635D]">/100</span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {wardHealth.factors.length === 0 ? (
                  <p className="text-xs text-[#15803D]">
                    No active SLA delays or critical hazards in this ward.
                  </p>
                ) : (
                  wardHealth.factors.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 border-t border-[#EFEFEA] pt-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#181C19]">{f.label}</div>
                        <div className="text-[#5A635D]">{f.detail}</div>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          f.impact > 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {f.impact > 0 ? `+${f.impact}` : f.impact}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
            <h2 className="font-display text-sm font-semibold text-[#181C19]">
              Recurring Infrastructure &amp; Cluster Alerts
            </h2>
            {wardInsights.length === 0 ? (
              <p className="mt-2 text-xs text-[#5A635D]">
                No multi-report recurring clusters flagged in this ward yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {wardInsights.map((ins) => (
                  <div
                    key={ins.id}
                    className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-[#92400E]">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {ins.title}
                    </div>
                    <p className="mt-1 text-[#78350F]">{ins.summary}</p>
                    <p className="mt-1.5 font-medium text-[#113829]">
                      Recommendation: {ins.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Ward Actionable Queue */}
      <section className="rounded-xl border border-[#E4E4DD] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4DD] p-4">
          <h2 className="font-display text-base font-semibold text-[#181C19]">
            Ward Complaint Queue
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#7A847D]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search queue..."
                className="rounded-lg border border-[#D8DAD2] py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="all">All Statuses</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="all">All Severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[#5A635D]">Loading ward queue...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4DD] bg-[#FAFAF8] text-xs font-semibold text-[#5A635D]">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Issue &amp; Location</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Priority / SLA</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {filtered.map((c) => {
                  const sev = getSeverityStyle(c.severity);
                  const isClosed = closedSet.has(c.status);
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
                          {c.category} · {c.addressLabel} · {formatRelativeTime(c.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#344038] whitespace-nowrap">
                        <div>{c.departmentName}</div>
                        <div className="text-[#5A635D]">
                          {c.assignedOfficerName || 'Unassigned crew'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className={`font-semibold ${sev.text}`}>{c.severity}</div>
                        {c.isOverdue && (
                          <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[#B91C1C]">
                            <ShieldAlert className="h-3 w-3" />+
                            {formatDurationMinutes(c.overdueMinutes)}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${getStatusColor(c.status)}`}>
                        {c.status}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isClosed &&
                            (c.status === 'Authority Assigned' || c.status === 'Escalated' || c.status === 'Submitted') && (
                              <button
                                type="button"
                                disabled={busyId === c.id}
                                onClick={(e) => handleQuickAcknowledge(e, c.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#0F7B55] px-2.5 py-1 text-xs font-semibold text-[#0F7B55] hover:bg-[#F2F8F5]"
                              >
                                <Check className="h-3 w-3" />
                                Acknowledge
                              </button>
                            )}
                          {!isClosed && !c.assignedOfficerId && (
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={(e) => handleQuickAssign(e, c)}
                              className="rounded-md bg-[#113829] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#164835]"
                            >
                              Dispatch Crew
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectComplaint(c.id);
                            }}
                            className="rounded-md border border-[#D8DAD2] bg-white px-2.5 py-1 text-xs font-medium text-[#181C19] hover:border-[#113829]"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
