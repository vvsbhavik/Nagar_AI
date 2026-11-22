import { CheckCircle2, Clock, ExternalLink, MapPin, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  formatDurationMinutes,
  formatRelativeTime,
  getSeverityStyle,
  getStatusColor,
  type MetaPayload,
} from '../lib/api.ts';
import type { ComplaintSummary, UserProfile } from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

interface FieldOfficerDashboardProps {
  user: UserProfile;
  meta: MetaPayload;
  onSelectComplaint: (id: string) => void;
}

const WORKFLOW_STEPS = [
  'Work Assigned',
  'Inspection Pending',
  'In Progress',
  'Awaiting Citizen Verification',
  'Citizen Verified',
];

function getStepIndex(status: string): number {
  if (status === 'Citizen Verified' || status === 'Resolved') return 4;
  if (status === 'Awaiting Citizen Verification' || status === 'Resolution Evidence Submitted') return 3;
  if (status === 'In Progress') return 2;
  if (status === 'Inspection Pending') return 1;
  return 0;
}

export function FieldOfficerDashboard({
  user,
  meta,
  onSelectComplaint,
}: FieldOfficerDashboardProps) {
  const [tasks, setTasks] = useState<ComplaintSummary[]>([]);
  const [scope, setScope] = useState<'assigned' | 'department'>('assigned');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params =
      scope === 'assigned'
        ? { scope: 'assigned' }
        : { departmentId: user.departmentId || undefined };
    api
      .getComplaints(params)
      .then((res) => setTasks(res.complaints))
      .finally(() => setLoading(false));
  }, [scope, user.id]);

  const activeTasks = tasks.filter(
    (t) => t.status !== 'Citizen Verified' && t.status !== 'Resolved'
  );
  const awaitingVerify = tasks.filter((t) => t.status === 'Awaiting Citizen Verification');
  const completedTasks = tasks.filter(
    (t) => t.status === 'Citizen Verified' || t.status === 'Resolved'
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div>
          <p className="text-xs font-medium text-[#0F7B55]">
            Mobile Field Execution · {user.departmentName || 'Municipal Field Unit'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#181C19]">
            Field Officer Tasks
          </h1>
          <p className="mt-1 text-sm text-[#5A635D]">
            Inspect assigned locations, log obstacles, and submit before/after repair evidence.
          </p>
        </div>

        <div className="flex rounded-lg bg-[#EAECE5] p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setScope('assigned')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              scope === 'assigned' ? 'bg-white text-[#113829] shadow-xs' : 'text-[#5A635D]'
            }`}
          >
            Assigned to Me
          </button>
          <button
            type="button"
            onClick={() => setScope('department')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              scope === 'department' ? 'bg-white text-[#113829] shadow-xs' : 'text-[#5A635D]'
            }`}
          >
            Department Queue
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-[#E4E4DD] bg-white p-4">
          <div className="text-xs text-[#5A635D]">Active Field Jobs</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#113829] tabular-nums">
            {activeTasks.length}
          </div>
        </div>
        <div className="rounded-xl border border-[#E4E4DD] bg-white p-4">
          <div className="text-xs text-[#5A635D]">Awaiting Citizen Sign-Off</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#0F7B55] tabular-nums">
            {awaitingVerify.length}
          </div>
        </div>
        <div className="rounded-xl border border-[#E4E4DD] bg-white p-4">
          <div className="text-xs text-[#5A635D]">Verified Complete</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#15803D] tabular-nums">
            {completedTasks.length}
          </div>
        </div>
      </div>

      {/* Field Route Map */}
      <section className="rounded-xl border border-[#E4E4DD] bg-white p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-[#181C19]">
            Assigned Site Locations
          </h2>
          <span className="text-xs text-[#5A635D]">Tap marker to open work order</span>
        </div>
        <CivicMap
          wards={meta.wards}
          complaints={tasks}
          onSelectComplaint={onSelectComplaint}
          heightClass="h-[260px]"
          showClusters={false}
        />
      </section>

      {/* Mobile-First Task Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-[#E4E4DD] bg-white p-8 text-center text-sm text-[#5A635D]">
            Loading field assignments...
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-[#E4E4DD] bg-white p-8 text-center text-sm text-[#5A635D]">
            No field tasks assigned right now.
          </div>
        ) : (
          tasks.map((task) => {
            const sev = getSeverityStyle(task.severity);
            const stepIdx = getStepIndex(task.status);
            const navUrl = `https://www.openstreetmap.org/directions?to=${task.latitude}%2C${task.longitude}`;

            return (
              <div
                key={task.id}
                className="rounded-xl border border-[#E4E4DD] bg-white p-5 transition-colors hover:border-[#0F7B55]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5A635D]">
                      <span className="font-mono font-bold text-[#113829]">
                        {task.trackingCode}
                      </span>
                      <span>·</span>
                      <span className={`font-semibold ${sev.text}`}>{task.severity}</span>
                      <span>·</span>
                      <span className={`font-semibold ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                      {task.isOverdue && (
                        <>
                          <span>·</span>
                          <span className="font-mono font-semibold text-[#B91C1C]">
                            Overdue +{formatDurationMinutes(task.overdueMinutes)}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display text-base font-bold text-[#181C19]">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#5A635D]">
                      <MapPin className="h-3.5 w-3.5 text-[#0F7B55] shrink-0" />
                      {task.addressLabel} · {task.wardName}
                    </div>
                  </div>

                  {task.primaryImageUrl && (
                    <img
                      src={task.primaryImageUrl}
                      alt={task.title}
                      referrerPolicy="no-referrer"
                      className="h-16 w-24 rounded-lg border border-[#E4E4DD] object-cover shrink-0"
                    />
                  )}
                </div>

                {/* Workflow Step Bar */}
                <div className="mt-4 grid grid-cols-5 gap-1.5">
                  {WORKFLOW_STEPS.map((label, i) => (
                    <div key={label} className="space-y-1">
                      <div
                        className={`h-1.5 rounded-full ${
                          i <= stepIdx ? 'bg-[#0F7B55]' : 'bg-[#E4E4DD]'
                        }`}
                      />
                      <div className="truncate text-[10px] text-[#5A635D]">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#EFEFEA] pt-3.5">
                  <span className="inline-flex items-center gap-1 text-xs text-[#5A635D]">
                    <Clock className="h-3.5 w-3.5" />
                    Updated {formatRelativeTime(task.updatedAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={navUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-xs font-semibold text-[#181C19] hover:border-[#113829]"
                    >
                      Navigate
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelectComplaint(task.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#113829] px-4 py-2 text-xs font-semibold text-white hover:bg-[#164835]"
                    >
                      {task.status === 'Citizen Verified' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          View Record
                        </>
                      ) : (
                        <>
                          <Wrench className="h-3.5 w-3.5" />
                          Update / Upload Evidence
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
