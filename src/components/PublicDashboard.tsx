import { CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  formatRelativeTime,
  getStatusColor,
  type PublicOverviewPayload,
} from '../lib/api.ts';
import { CivicMap } from './CivicMap.tsx';

interface PublicDashboardProps {
  onSelectComplaint: (id: string) => void;
  onOpenAuth: () => void;
  isSignedIn: boolean;
}

export function PublicDashboard({
  onSelectComplaint,
  onOpenAuth,
  isSignedIn,
}: PublicDashboardProps) {
  const [data, setData] = useState<PublicOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [wardFilter, setWardFilter] = useState('all');

  useEffect(() => {
    api
      .getPublicOverview()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="p-10 text-center text-sm text-[#5A635D]">
        Loading Public Transparency Portal...
      </div>
    );
  }

  const visibleComplaints =
    wardFilter === 'all'
      ? data.complaints
      : data.complaints.filter((c) => c.wardId === wardFilter);

  return (
    <div className="space-y-6">
      {/* Public Hero Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-[#0F7B55]">
            Open Civic Transparency Portal · Accessible Without Login
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#181C19] [text-wrap:balance]">
            From Citizen Voice to Government Action.
          </h1>
          <p className="mt-2 text-sm text-[#5A635D]">
            Live, anonymized neighborhood infrastructure intelligence across Greater Municipal Demo
            Wards. Personal citizen details and house-level coordinates are automatically stripped.
          </p>
        </div>

        {!isSignedIn && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="rounded-lg bg-[#0F7B55] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0C6545] whitespace-nowrap shrink-0"
          >
            Sign In / Report an Issue
          </button>
        )}
      </div>

      {/* Demo & Privacy Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E4E4DD] bg-white px-4 py-2.5 text-xs text-[#5A635D]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#0F7B55] shrink-0" />
          <span>
            Privacy-Protected Open Feed: Reporter names, contact numbers, and exact pinpoint
            locations are anonymized (~110m radius).
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#113829]">
          Demo Municipal Dataset &amp; Demo Ward Boundaries
        </span>
      </div>

      {/* Transparency KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total Civic Reports', val: data.stats.totalReports, tone: 'text-[#181C19]' },
          { label: 'Open Civic Issues', val: data.stats.openIssues, tone: 'text-[#113829]' },
          { label: 'Verified Resolutions', val: data.stats.verifiedResolutions, tone: 'text-[#15803D]' },
          { label: 'Resolution Rate', val: `${data.stats.resolutionRatePct}%`, tone: 'text-[#0F7B55]' },
          { label: 'Avg Resolution Time', val: `${data.stats.avgResolutionHours}h`, tone: 'text-[#181C19]' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#E4E4DD] bg-white p-5">
            <div className="text-xs text-[#5A635D]">{kpi.label}</div>
            <div className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${kpi.tone}`}>
              {kpi.val}
            </div>
          </div>
        ))}
      </div>

      {/* Anonymized Civic Issue Map */}
      <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#181C19]">
              Anonymized City Civic Issue Map
            </h2>
            <p className="text-xs text-[#5A635D]">
              Approximate locations, demo ward boundaries, and live issue clusters
            </p>
          </div>
          <select
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            className="rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#181C19]"
          >
            <option value="all">All 6 Demo Wards</option>
            {data.wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>

        <CivicMap
          wards={data.wards}
          complaints={visibleComplaints}
          clusters={data.clusters}
          highlightWardId={wardFilter === 'all' ? null : wardFilter}
          onSelectComplaint={onSelectComplaint}
          heightClass="h-[400px]"
        />
      </section>

      {/* Category Distribution + Ward Health Support Index */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-6">
          <h2 className="font-display text-base font-semibold text-[#181C19]">
            Issues by Civic Category
          </h2>
          <p className="text-xs text-[#5A635D]">Live database distribution across all wards</p>
          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.categoryBreakdown}
                layout="vertical"
                margin={{ top: 4, right: 20, bottom: 4, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEA" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#5A635D' }} allowDecimals={false} />
                <YAxis
                  dataKey="category"
                  type="category"
                  width={115}
                  tick={{ fontSize: 11, fill: '#181C19' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: '#E4E4DD',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#113829" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#E4E4DD] bg-white p-5 lg:col-span-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Ward Health &amp; Support Index
              </h2>
              <p className="text-xs text-[#5A635D]">
                Explainable resource-planning score identifying wards needing extra support
              </p>
            </div>
            <Info className="h-4 w-4 text-[#5A635D] shrink-0" />
          </div>

          <div className="mt-4 space-y-3">
            {data.wardHealth.map((wh) => (
              <div key={wh.wardId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-semibold text-[#113829]">{wh.wardCode}</span>{' '}
                    <span className="font-semibold text-[#181C19]">{wh.wardName}</span>
                    <span className="ml-2 text-[#5A635D]">· {wh.supportTier}</span>
                  </div>
                  <span className="font-mono font-bold text-[#181C19] tabular-nums">
                    {wh.score}/100
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFEFEA]">
                  <div
                    className={`h-full rounded-full ${
                      wh.score >= 75
                        ? 'bg-[#15803D]'
                        : wh.score >= 52
                        ? 'bg-[#D97706]'
                        : 'bg-[#DC2626]'
                    }`}
                    style={{ width: `${wh.score}%` }}
                  />
                </div>
                <div className="text-[11px] text-[#5A635D] tabular-nums">
                  {wh.metrics.totalComplaints} reports · {wh.metrics.openComplaints} open ·{' '}
                  {wh.metrics.resolutionRatePct}% resolved
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Verified Resolutions Showcase */}
      <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#181C19]">
              Verified Resolutions &amp; Evidence Transparency
            </h2>
            <p className="text-xs text-[#5A635D]">
              Recent civic fixes backed by field documentation and citizen confirmation
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
            <CheckCircle2 className="h-4 w-4" />
            {data.stats.verifiedResolutions} Citizen Verified
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {data.verifiedShowcase.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectComplaint(item.id)}
              className="flex flex-col overflow-hidden rounded-lg border border-[#E4E4DD] bg-[#FAFAF8] text-left transition-colors hover:border-[#0F7B55] hover:bg-white"
            >
              {item.primaryImageUrl && (
                <img
                  src={item.primaryImageUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="aspect-4/3 w-full object-cover"
                />
              )}
              <div className="p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-[#113829]">{item.trackingCode}</span>
                  <span className={`font-semibold ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold text-[#181C19]">
                  {item.title}
                </h3>
                <div className="mt-2 text-xs text-[#5A635D]">
                  {item.wardName} · {item.departmentName} · {formatRelativeTime(item.updatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
