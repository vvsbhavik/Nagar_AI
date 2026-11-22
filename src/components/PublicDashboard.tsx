import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Info,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
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
import { useI18n } from '../lib/i18n.tsx';
import { CivicMap } from './CivicMap.tsx';

interface PublicDashboardProps {
  onSelectComplaint: (id: string) => void;
  onOpenAuth: () => void;
  onOpenAssistant?: () => void;
  isSignedIn: boolean;
}

export function PublicDashboard({
  onSelectComplaint,
  onOpenAuth,
  onOpenAssistant,
  isSignedIn,
}: PublicDashboardProps) {
  const { t } = useI18n();
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
      <div className="p-12 text-center text-sm text-[#5A635D]">
        Loading Public Civic Transparency Portal...
      </div>
    );
  }

  const visibleComplaints =
    wardFilter === 'all'
      ? data.complaints
      : data.complaints.filter((c) => c.wardId === wardFilter);

  const pipelineSteps = [
    t('pipelineLocation'),
    t('pipelineWard'),
    t('pipelineAuthority'),
    t('pipelineAction'),
    t('pipelineAccountability'),
  ];

  return (
    <div className="space-y-10 pb-12">
      {/* Flagship Editorial GovTech Hero (First View when opening website!) */}
      <section id="overview" className="border-b border-[#E4E4DD] pb-8 pt-2">
        <div className="grid items-stretch gap-8 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-8">
            <p className="text-xs font-semibold text-[#0F7B55]">{t('publicPortalEyebrow')}</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[#181C19] sm:text-5xl [text-wrap:balance]">
              {t('tagline')}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#465049]">
              {t('publicHeroSubtitle')}
            </p>

            {/* Core Innovation Pipeline */}
            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs font-semibold text-[#113829]">
              {pipelineSteps.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-2">
                  <span>{step}</span>
                  {i < pipelineSteps.length - 1 && (
                    <ChevronRight className="h-3.5 w-3.5 text-[#0F7B55]" />
                  )}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!isSignedIn && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F7B55] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0C6545] whitespace-nowrap"
                >
                  {t('signInToReport')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <a
                href="#live-map"
                className="inline-flex items-center gap-2 rounded-lg border border-[#D8DAD2] bg-white px-5 py-3 text-sm font-semibold text-[#181C19] transition-colors hover:border-[#113829] whitespace-nowrap"
              >
                <MapPin className="h-4 w-4 text-[#0F7B55]" />
                {t('exploreLiveMap')}
              </a>
              {onOpenAssistant && (
                <button
                  type="button"
                  onClick={onOpenAssistant}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#D8DAD2] bg-white px-4 py-3 text-sm font-semibold text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] whitespace-nowrap"
                >
                  <Bot className="h-4 w-4 text-[#0F7B55]" />
                  {t('askAiBtn')}
                </button>
              )}
            </div>
          </div>

          {/* Right Live Accountability Snapshot Card */}
          <div className="flex flex-col justify-between rounded-xl border border-[#E4E4DD] bg-white p-6 lg:col-span-4">
            <div>
              <div className="text-xs font-semibold text-[#0F7B55]">
                Live Public Accountability Ledger
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[#181C19]">
                Greater Municipal Demo Zone
              </div>
              <p className="mt-1 text-xs text-[#5A635D]">
                Real-time anonymized data across 6 demo ward boundaries and 6 municipal departments.
              </p>
            </div>

            <dl className="mt-5 divide-y divide-[#EFEFEA] text-xs">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#5A635D]">{t('kpiTotalComplaints')}</dt>
                <dd className="font-mono text-base font-bold text-[#181C19] tabular-nums">
                  {data.stats.totalReports}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#5A635D]">{t('kpiOpenIssues')}</dt>
                <dd className="font-mono text-base font-bold text-[#113829] tabular-nums">
                  {data.stats.openIssues}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#5A635D]">{t('kpiVerifiedResolutions')}</dt>
                <dd className="font-mono text-base font-bold text-[#15803D] tabular-nums">
                  {data.stats.verifiedResolutions}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#5A635D]">{t('kpiResolutionRate')}</dt>
                <dd className="font-mono text-base font-bold text-[#0F7B55] tabular-nums">
                  {data.stats.resolutionRatePct}%
                </dd>
              </div>
              <div className="flex items-center justify-between pt-2.5">
                <dt className="text-[#5A635D]">{t('kpiAvgResolution')}</dt>
                <dd className="font-mono text-base font-bold text-[#181C19] tabular-nums">
                  {data.stats.avgResolutionHours}h
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Privacy & Demo Data Disclosure */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E4E4DD] bg-white px-4 py-2.5 text-xs text-[#5A635D]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#0F7B55] shrink-0" />
            <span>{t('privacyNotice')}</span>
          </div>
          <span className="font-mono text-[11px] text-[#113829]">{t('demoDatasetBadge')}</span>
        </div>
      </section>

      {/* Anonymized Civic Issue Map */}
      <section id="live-map" className="rounded-xl border border-[#E4E4DD] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#181C19]">
              Anonymized City Civic Issue Map
            </h2>
            <p className="text-xs text-[#5A635D]">
              Approximate locations (~110m privacy rounding), demo ward boundaries, and live issue
              clusters
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
          heightClass="h-[420px]"
        />
      </section>

      {/* City Civic Trends + Category Distribution */}
      <section id="trends" className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#E4E4DD] bg-white p-6 lg:col-span-6">
          <h2 className="font-display text-base font-bold text-[#181C19]">
            {t('cityTrendsTitle')}
          </h2>
          <p className="text-xs text-[#5A635D]">
            Monthly reported vs resolved civic issues computed directly from database records
          </p>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends}>
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
                  fillOpacity={0.22}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#E4E4DD] bg-white p-6 lg:col-span-6">
          <h2 className="font-display text-base font-bold text-[#181C19]">
            {t('categoryDistTitle')}
          </h2>
          <p className="text-xs text-[#5A635D]">Live civic category distribution across all wards</p>
          <div className="mt-4 h-[260px] w-full">
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
                  width={118}
                  tick={{ fontSize: 11, fill: '#181C19' }}
                />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E4E4DD', fontSize: 12 }} />
                <Bar dataKey="count" fill="#113829" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Ward Health & Support Index */}
      <section id="ward-index" className="rounded-xl border border-[#E4E4DD] bg-white p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-[#181C19]">
              {t('wardHealthTitle')}
            </h2>
            <p className="text-xs text-[#5A635D]">
              Explainable ward summaries identifying neighborhoods requiring additional municipal
              capacity and engineering support.
            </p>
          </div>
          <Info className="h-4 w-4 text-[#5A635D] shrink-0" />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {data.wardHealth.map((wh) => (
            <div
              key={wh.wardId}
              className="rounded-lg border border-[#EFEFEA] bg-[#FAFAF8] p-4 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-[#113829]">{wh.wardCode}</span>{' '}
                  <span className="font-semibold text-[#181C19]">{wh.wardName}</span>
                </div>
                <span className="font-mono text-sm font-bold text-[#181C19] tabular-nums">
                  {wh.score}/100
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E4E4DD]">
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
              <div className="flex items-center justify-between text-[11px] text-[#5A635D] tabular-nums">
                <span>{wh.supportTier}</span>
                <span>
                  {wh.metrics.totalComplaints} reports · {wh.metrics.resolutionRatePct}% resolved
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Verified Resolutions Showcase */}
      <section id="resolutions" className="rounded-xl border border-[#E4E4DD] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-[#181C19]">
              {t('verifiedShowcaseTitle')}
            </h2>
            <p className="text-xs text-[#5A635D]">
              Recent civic fixes backed by photographic proof and citizen confirmation
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
            <CheckCircle2 className="h-4 w-4" />
            {data.stats.verifiedResolutions} {t('kpiVerifiedResolutions')}
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
                  <span className="font-mono font-semibold text-[#113829]">
                    {item.trackingCode}
                  </span>
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
