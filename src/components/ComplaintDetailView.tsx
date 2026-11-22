import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  fileToBase64,
  formatDateTime,
  formatDurationMinutes,
  formatRelativeTime,
  getSeverityStyle,
  getStatusColor,
  type MetaPayload,
} from '../lib/api.ts';
import type { ComplaintDetail, UserProfile } from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

const DEMO_AFTER_PHOTO = '/src/assets/images/civic_pothole_after_1795354768452.jpg';

interface ComplaintDetailViewProps {
  complaintId: string;
  user: UserProfile | null;
  meta: MetaPayload;
  onBack: () => void;
  onSelectComplaint: (id: string) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function ComplaintDetailView({
  complaintId,
  user,
  meta,
  onBack,
  onSelectComplaint,
  onToast,
}: ComplaintDetailViewProps) {
  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Authority controls
  const [actionNote, setActionNote] = useState('');
  const [selectedOfficerId, setSelectedOfficerId] = useState(
    meta.fieldOfficers[0]?.id || 'user-officer-roads'
  );
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [delayReason, setDelayReason] = useState('');

  // Field officer controls
  const [fieldNote, setFieldNote] = useState('');
  const [obstacleFlag, setObstacleFlag] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [afterBase64, setAfterBase64] = useState<string | null>(null);
  const [afterMime, setAfterMime] = useState<string | null>(null);
  const [demoAfterPath, setDemoAfterPath] = useState<string | null>(null);

  // Citizen verification controls
  const [verifyComment, setVerifyComment] = useState('');
  const [verifyRating, setVerifyRating] = useState(5);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getComplaintDetail(complaintId);
      setComplaint(res.complaint);
      setSelectedDeptId(res.complaint.departmentId || meta.departments[0]?.id || '');
      if (res.complaint.assignedOfficerId) {
        setSelectedOfficerId(res.complaint.assignedOfficerId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load complaint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [complaintId]);

  const runAuthorityAction = async (
    action: 'acknowledge' | 'forward' | 'assign_officer' | 'post_update' | 'escalate'
  ) => {
    if (!complaint) return;
    setBusyAction(true);
    try {
      const res = await api.complaintAction(complaint.id, {
        action,
        note: actionNote.trim() || undefined,
        departmentId: action === 'forward' ? selectedDeptId : undefined,
        officerId: action === 'assign_officer' ? selectedOfficerId : undefined,
        delayReason: action === 'escalate' ? delayReason.trim() || actionNote.trim() : undefined,
      });
      setComplaint(res.complaint);
      setActionNote('');
      setDelayReason('');
      onToast(`Updated ${res.complaint.trackingCode} (${res.complaint.status})`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const runFieldProgress = async (status: 'Inspection Pending' | 'In Progress') => {
    if (!complaint) return;
    if (fieldNote.trim().length < 3) {
      onToast('Please enter a brief field inspection or progress note first.', 'error');
      return;
    }
    setBusyAction(true);
    try {
      const res = await api.fieldProgress(complaint.id, {
        status,
        note: fieldNote.trim(),
        obstacleFlag,
      });
      setComplaint(res.complaint);
      setFieldNote('');
      setObstacleFlag(false);
      onToast(`Field progress recorded: ${status}`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleEvidenceFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setAfterPreview(b64);
      setAfterBase64(b64);
      setAfterMime(file.type);
      setDemoAfterPath(null);
    } catch {
      onToast('Could not read repair photo.', 'error');
    }
  };

  const handleSubmitEvidence = async () => {
    if (!complaint) return;
    if (!afterBase64 && !demoAfterPath) {
      onToast('Attach an after-repair photo (or load the demo repaired road photo).', 'error');
      return;
    }
    if (evidenceNotes.trim().length < 4) {
      onToast('Add brief completion notes before submitting resolution evidence.', 'error');
      return;
    }

    setBusyAction(true);
    try {
      const res = await api.submitResolutionEvidence(complaint.id, {
        afterImageBase64: afterBase64 || undefined,
        afterMimeType: afterMime || undefined,
        demoAfterImagePath: demoAfterPath || undefined,
        notes: evidenceNotes.trim(),
        runAiComparison: true,
      });
      setComplaint(res.complaint);
      setEvidenceNotes('');
      setAfterPreview(null);
      setAfterBase64(null);
      setDemoAfterPath(null);
      onToast(
        res.aiWarning
          ? `Resolution evidence saved (AI note: ${res.aiWarning})`
          : 'Resolution evidence uploaded & Gemini comparison completed!',
        res.aiWarning ? 'info' : 'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCitizenVerify = async (
    verdict: 'resolved' | 'partially_resolved' | 'not_resolved'
  ) => {
    if (!complaint) return;
    setBusyAction(true);
    try {
      const res = await api.verifyComplaint(complaint.id, {
        verdict,
        comment: verifyComment.trim() || undefined,
        rating: verifyRating,
      });
      setComplaint(res.complaint);
      setVerifyComment('');
      onToast(
        verdict === 'resolved'
          ? `${res.complaint.trackingCode} verified resolved! Public analytics updated.`
          : `${res.complaint.trackingCode} reopened for follow-up inspection.`,
        'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Verification failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#5A635D]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#0F7B55]" />
        Loading accountable complaint record...
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-6 text-sm text-[#991B1B]">
        <p>{error || 'Complaint record not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-xs font-semibold underline"
        >
          Return to previous view
        </button>
      </div>
    );
  }

  const sev = getSeverityStyle(complaint.severity);
  const canAuthorityAct = user && (user.role === 'ward_rep' || user.role === 'municipal_admin');
  const canFieldAct = user && (user.role === 'field_officer' || user.role === 'municipal_admin');
  const canCitizenVerify =
    user &&
    ((user.role === 'citizen' && user.id === complaint.citizenId) ||
      user.role === 'municipal_admin') &&
    (complaint.status === 'Awaiting Citizen Verification' ||
      complaint.status === 'Resolved' ||
      complaint.status === 'Citizen Verified');

  const directionsUrl = `https://www.openstreetmap.org/directions?to=${complaint.latitude}%2C${complaint.longitude}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Top Action & Metadata Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5A635D] hover:text-[#113829]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#5A635D]">
            <span className="font-mono font-bold text-[#113829]">{complaint.trackingCode}</span>
            <span>·</span>
            <span className={`font-semibold ${sev.text}`}>{complaint.severity} Priority</span>
            <span>·</span>
            <span className={`font-semibold ${getStatusColor(complaint.status)}`}>
              {complaint.status}
            </span>
            <span>·</span>
            <span>{complaint.category}</span>
            <span>·</span>
            <span>Reported {formatRelativeTime(complaint.createdAt)}</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#181C19]">
            {complaint.title}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-[#5A635D]">
            <MapPin className="h-3.5 w-3.5 text-[#0F7B55] shrink-0" />
            {complaint.addressLabel} · {complaint.wardCode || ''} {complaint.wardName || 'Demo Zone'}
          </p>
        </div>

        {/* Live SLA Indicator Box */}
        <div
          className={`rounded-lg border px-4 py-3 text-right ${
            complaint.isOverdue
              ? 'border-[#FECACA] bg-[#FEF2F2]'
              : 'border-[#E4E4DD] bg-white'
          }`}
        >
          <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-[#5A635D]">
            <Clock className="h-3.5 w-3.5" />
            Demo SLA Monitor
          </div>
          {complaint.status === 'Citizen Verified' || complaint.status === 'Resolved' ? (
            <div className="mt-1 font-mono text-sm font-bold text-[#15803D]">
              Closed · Verified
            </div>
          ) : complaint.isOverdue ? (
            <div className="mt-1 font-mono text-sm font-bold text-[#B91C1C] tabular-nums">
              Overdue by {formatDurationMinutes(complaint.overdueMinutes)}
            </div>
          ) : complaint.slaDeadline ? (
            <div className="mt-1 font-mono text-sm font-bold text-[#113829] tabular-nums">
              Due {formatDateTime(complaint.slaDeadline)}
            </div>
          ) : (
            <div className="mt-1 text-xs text-[#5A635D]">No deadline set</div>
          )}
          <div className="mt-0.5 text-[11px] text-[#5A635D]">
            Demo target rules (Critical 15m · High 4h)
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Main Left Column */}
        <div className="space-y-6 lg:col-span-8">
          {/* Description & Media */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <h2 className="font-display text-base font-semibold text-[#181C19]">
              Reported Issue &amp; Citizen Evidence
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[#344038]">{complaint.description}</p>

            {complaint.voiceTranscript && (
              <div className="mt-4 rounded-lg border border-[#E4E4DD] bg-[#FAFAF8] p-3.5">
                <div className="text-xs font-semibold text-[#113829]">
                  Citizen Voice Transcript ({complaint.voiceLanguage === 'te-IN' ? 'Telugu' : 'English'})
                </div>
                <p className="mt-1 text-sm text-[#181C19]">{complaint.voiceTranscript}</p>
              </div>
            )}

            {complaint.media.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {complaint.media.map((m) => (
                  <div
                    key={m.id}
                    className="overflow-hidden rounded-lg border border-[#E4E4DD] bg-[#F7F7F4]"
                  >
                    {m.mediaType === 'image' ? (
                      <img
                        src={m.url}
                        alt={m.caption || complaint.title}
                        referrerPolicy="no-referrer"
                        className="aspect-4/3 w-full object-cover"
                      />
                    ) : m.mediaType === 'audio' ? (
                      <div className="p-4">
                        <audio controls src={m.url} className="w-full" />
                      </div>
                    ) : (
                      <video controls src={m.url} className="aspect-video w-full bg-black" />
                    )}
                    {m.caption && (
                      <div className="px-3 py-2 text-xs text-[#5A635D]">{m.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* AI Analysis & Severity Explanation */}
          {complaint.aiAssessment && (
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  AI Analysis &amp; Transparent Severity Guardrails
                </h2>
                <span className="font-mono text-xs text-[#0F7B55] tabular-nums">
                  {complaint.aiAssessment.modelName} ·{' '}
                  {Math.round(complaint.aiAssessment.confidence * 100)}% confidence
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-[#F7F7F4] p-3">
                  <div className="text-[11px] text-[#5A635D]">AI Severity</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#181C19]">
                    {complaint.aiAssessment.severityPredicted}
                  </div>
                </div>
                <div className="rounded-lg bg-[#F7F7F4] p-3">
                  <div className="text-[11px] text-[#5A635D]">Deterministic Rule Floor</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#181C19]">
                    {complaint.aiAssessment.deterministicSeverity}
                  </div>
                </div>
                <div className="rounded-lg bg-[#F7F7F4] p-3">
                  <div className="text-[11px] text-[#5A635D]">Suggested Department</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#113829]">
                    {complaint.aiAssessment.suggestedDepartment}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-sm text-[#344038]">
                {complaint.aiAssessment.severityExplanation}
              </p>

              {complaint.aiAssessment.deterministicRuleApplied && (
                <div className="mt-2.5 rounded-lg border border-[#E4E4DD] bg-[#FAFAF8] px-3.5 py-2 text-xs text-[#113829]">
                  {complaint.aiAssessment.deterministicRuleApplied}
                </div>
              )}

              {complaint.aiAssessment.riskFactors.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-[#181C19]">Risk Factors</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[#5A635D]">
                    {complaint.aiAssessment.riskFactors.map((rf, idx) => (
                      <li key={idx}>{rf}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 border-t border-[#EFEFEA] pt-3 text-xs text-[#344038]">
                <span className="font-semibold text-[#181C19]">Suggested Remediation: </span>
                {complaint.aiAssessment.suggestedAction}
              </div>
            </section>
          )}

          {/* Resolution Evidence & Gemini Advisory Comparison */}
          {complaint.resolutionEvidence.length > 0 && (
            <section className="rounded-xl border border-[#0F7B55]/30 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  Resolution Evidence &amp; Before/After Verification
                </h2>
                <span className="font-mono text-xs text-[#0F7B55]">
                  AI Comparison Advisory · Human Review Required
                </span>
              </div>

              {complaint.resolutionEvidence.map((ev) => (
                <div key={ev.id} className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-[#5A635D]">
                        Before Repair (Original Complaint)
                      </div>
                      {ev.beforeMediaUrl ? (
                        <img
                          src={ev.beforeMediaUrl}
                          alt="Before repair"
                          referrerPolicy="no-referrer"
                          className="aspect-4/3 w-full rounded-lg border border-[#E4E4DD] object-cover"
                        />
                      ) : (
                        <div className="flex aspect-4/3 items-center justify-center rounded-lg border border-[#E4E4DD] bg-[#F7F7F4] text-xs text-[#5A635D]">
                          No original photo attached
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-[#15803D]">
                        After Repair ({ev.submittedByName})
                      </div>
                      <img
                        src={ev.afterMediaUrl}
                        alt="After repair resolution evidence"
                        referrerPolicy="no-referrer"
                        className="aspect-4/3 w-full rounded-lg border border-[#E4E4DD] object-cover"
                      />
                    </div>
                  </div>

                  {ev.notes && (
                    <div className="rounded-lg bg-[#F7F7F4] p-3 text-xs text-[#181C19]">
                      <span className="font-semibold">Field Completion Notes: </span>
                      {ev.notes}
                    </div>
                  )}

                  {ev.aiResolutionAssessment && (
                    <div className="rounded-lg border border-[#D4E7DD] bg-[#F2F8F5] p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#113829]">
                          Gemini Advisory Assessment: {ev.aiResolutionAssessment}
                        </span>
                        <span className="font-mono text-[#0F7B55] tabular-nums">
                          Relevance {Math.round((ev.aiRelevanceScore ?? 0) * 100)}% · Confidence{' '}
                          {Math.round((ev.aiConfidence ?? 0) * 100)}%
                        </span>
                      </div>
                      {ev.aiVisibleChanges && (
                        <p className="mt-2 text-[#181C19]">
                          <span className="font-semibold">Visible Changes: </span>
                          {ev.aiVisibleChanges}
                        </p>
                      )}
                      {ev.aiExplanation && (
                        <p className="mt-1.5 text-[#344038]">{ev.aiExplanation}</p>
                      )}
                      {ev.aiMismatchWarnings.length > 0 && (
                        <div className="mt-2.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] p-2.5 text-[#92400E]">
                          <div className="font-semibold">Advisory Cautions / Mismatch Checks</div>
                          <ul className="mt-1 list-disc pl-4">
                            {ev.aiMismatchWarnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Citizen Verification Panel */}
          {canCitizenVerify && (
            <section className="rounded-xl border border-[#113829]/25 bg-[#F2F8F5] p-6">
              <h2 className="font-display text-base font-bold text-[#113829]">
                Citizen Verification &amp; Accountability Sign-Off
              </h2>
              <p className="mt-1 text-xs text-[#344038]">
                AI evidence comparison is advisory only. Confirm whether the civic problem has truly
                been resolved on the ground, or reject and reopen the issue.
              </p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-[#181C19]">Quality Rating:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setVerifyRating(star)}
                      className={`rounded-md border px-2.5 py-1 font-mono text-xs font-semibold ${
                        verifyRating === star
                          ? 'border-[#113829] bg-[#113829] text-white'
                          : 'border-[#D8DAD2] bg-white text-[#5A635D]'
                      }`}
                    >
                      {star}/5
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={verifyComment}
                  onChange={(e) => setVerifyComment(e.target.value)}
                  placeholder="Share on-site verification feedback (e.g. asphalt level is smooth, or debris still remains)..."
                  className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleCitizenVerify('resolved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm Resolved
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleCitizenVerify('partially_resolved')}
                    className="rounded-lg border border-[#D97706] bg-white px-4 py-2 text-xs font-semibold text-[#B45309] hover:bg-[#FFFBEB] disabled:opacity-50"
                  >
                    Partially Resolved (Reopen)
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleCitizenVerify('not_resolved')}
                    className="rounded-lg border border-[#DC2626] bg-white px-4 py-2 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                  >
                    Reject &amp; Reopen
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Authority Controls (Ward Rep / Municipal Admin) */}
          {canAuthorityAct && (
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Authority Workflow Controls
              </h2>
              <p className="mt-0.5 text-xs text-[#5A635D]">
                Every action is recorded in the auditable complaint timeline and notifies the
                citizen.
              </p>

              <div className="mt-4 space-y-4">
                <textarea
                  rows={2}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Official note, dispatch instructions, or citizen update..."
                  className="w-full rounded-lg border border-[#D8DAD2] px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#5A635D]">
                      Assign Field Officer
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedOfficerId}
                        onChange={(e) => setSelectedOfficerId(e.target.value)}
                        className="flex-1 rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-2 text-xs text-[#181C19]"
                      >
                        {meta.fieldOfficers.map((fo) => (
                          <option key={fo.id} value={fo.id}>
                            {fo.fullName} ({fo.departmentName})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => runAuthorityAction('assign_officer')}
                        className="rounded-lg bg-[#113829] px-3 py-2 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50 whitespace-nowrap"
                      >
                        Assign
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#5A635D]">
                      Forward to Department
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedDeptId}
                        onChange={(e) => setSelectedDeptId(e.target.value)}
                        className="flex-1 rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-2 text-xs text-[#181C19]"
                      >
                        {meta.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => runAuthorityAction('forward')}
                        className="rounded-lg border border-[#113829] px-3 py-2 text-xs font-semibold text-[#113829] hover:bg-[#F7F7F4] disabled:opacity-50 whitespace-nowrap"
                      >
                        Forward
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 border-t border-[#EFEFEA] pt-3">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => runAuthorityAction('acknowledge')}
                    className="rounded-lg bg-[#0F7B55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0C6545] disabled:opacity-50"
                  >
                    Acknowledge Complaint
                  </button>
                  <button
                    type="button"
                    disabled={busyAction || !actionNote.trim()}
                    onClick={() => runAuthorityAction('post_update')}
                    className="rounded-lg border border-[#D8DAD2] bg-white px-4 py-2 text-xs font-semibold text-[#181C19] hover:border-[#113829] disabled:opacity-50"
                  >
                    Post Public Update
                  </button>
                  <input
                    type="text"
                    value={delayReason}
                    onChange={(e) => setDelayReason(e.target.value)}
                    placeholder="Delay reason (optional for escalation)"
                    className="min-w-[200px] flex-1 rounded-lg border border-[#D8DAD2] px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => runAuthorityAction('escalate')}
                    className="rounded-lg border border-[#DC2626] bg-white px-3.5 py-2 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                  >
                    Escalate
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Field Officer Operations & Evidence Upload */}
          {canFieldAct && (
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                Field Execution &amp; Repair Evidence Upload
              </h2>
              <p className="mt-0.5 text-xs text-[#5A635D]">
                Log site inspection, report obstacles, or upload after-repair photography for Gemini
                comparison and citizen verification.
              </p>

              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-[#EFEFEA] bg-[#FAFAF8] p-4 space-y-3">
                  <div className="text-xs font-semibold text-[#181C19]">
                    Site Inspection / Progress Update
                  </div>
                  <textarea
                    rows={2}
                    value={fieldNote}
                    onChange={(e) => setFieldNote(e.target.value)}
                    placeholder="Inspection notes, material status, or obstacle encountered..."
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-sm text-[#181C19]"
                  />
                  <label className="flex items-center gap-2 text-xs text-[#181C19]">
                    <input
                      type="checkbox"
                      checked={obstacleFlag}
                      onChange={(e) => setObstacleFlag(e.target.checked)}
                      className="rounded border-[#D8DAD2]"
                    />
                    Flag field obstacle (e.g., underground utility line, rain delay, traffic access)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => runFieldProgress('Inspection Pending')}
                      className="rounded-lg border border-[#113829] bg-white px-3.5 py-2 text-xs font-semibold text-[#113829] hover:bg-[#F2F8F5] disabled:opacity-50"
                    >
                      Mark Inspection Logged
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => runFieldProgress('In Progress')}
                      className="rounded-lg bg-[#113829] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#164835] disabled:opacity-50"
                    >
                      Mark Work In Progress
                    </button>
                  </div>
                </div>

                {/* Upload After-Repair Evidence */}
                <div className="rounded-lg border border-[#0F7B55]/25 bg-[#F2F8F5]/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#113829]">
                      Submit After-Repair Resolution Evidence
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAfterPreview(DEMO_AFTER_PHOTO);
                        setDemoAfterPath(DEMO_AFTER_PHOTO);
                        setAfterBase64(null);
                        setEvidenceNotes(
                          'Completed dewatering, sub-base compaction, hot-mix bitumen resurfacing, and white lane shoulder restoration.'
                        );
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F7B55] hover:underline"
                    >
                      <Sparkles className="h-3 w-3" />
                      Load Demo Repaired Road Photo
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#0F7B55]/40 bg-white p-3 text-center">
                      {afterPreview ? (
                        <img
                          src={afterPreview}
                          alt="After repair preview"
                          referrerPolicy="no-referrer"
                          className="h-28 w-full rounded object-cover"
                        />
                      ) : (
                        <>
                          <Upload className="mb-1.5 h-5 w-5 text-[#0F7B55]" />
                          <span className="text-xs font-medium text-[#181C19]">
                            Upload After-Repair Photo
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleEvidenceFile(e.target.files?.[0])}
                      />
                    </label>
                    <textarea
                      rows={4}
                      value={evidenceNotes}
                      onChange={(e) => setEvidenceNotes(e.target.value)}
                      placeholder="Describe repair work completed and materials used..."
                      className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-xs text-[#181C19]"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleSubmitEvidence}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0F7B55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0C6545] disabled:opacity-50"
                  >
                    {busyAction ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading &amp; Running Gemini Comparison...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Upload Evidence &amp; Request Citizen Verification
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Auditable Lifecycle Timeline */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <h2 className="font-display text-base font-semibold text-[#181C19]">
              Auditable Accountability Timeline
            </h2>
            <div className="mt-4 space-y-4">
              {complaint.statusHistory.map((item, idx) => (
                <div key={item.id} className="relative flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        idx === complaint.statusHistory.length - 1
                          ? 'bg-[#0F7B55]'
                          : 'bg-[#B9C1BA]'
                      }`}
                    />
                    {idx < complaint.statusHistory.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-[#E4E4DD]" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#181C19]">
                        {item.toStatus}
                      </span>
                      <span className="font-mono text-[11px] text-[#5A635D] tabular-nums">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-[#5A635D]">
                      {item.actorName} ({item.actorRole.replace('_', ' ')})
                    </div>
                    {item.note && (
                      <p className="mt-1 text-xs leading-relaxed text-[#344038]">{item.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {complaint.updates.length > 0 && (
              <div className="mt-6 border-t border-[#EFEFEA] pt-4">
                <h3 className="text-xs font-semibold text-[#5A635D]">
                  Field &amp; Authority Activity Notes
                </h3>
                <div className="mt-2.5 space-y-2.5">
                  {complaint.updates.map((u) => (
                    <div
                      key={u.id}
                      className={`rounded-lg border p-3 text-xs ${
                        u.obstacleFlag
                          ? 'border-[#FDE68A] bg-[#FFFBEB]'
                          : 'border-[#EFEFEA] bg-[#FAFAF8]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#181C19]">
                          {u.authorName}
                          {u.obstacleFlag ? ' · Obstacle Flagged' : ''}
                        </span>
                        <span className="font-mono text-[11px] text-[#5A635D]">
                          {formatRelativeTime(u.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[#344038]">{u.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Context Sidebar */}
        <div className="space-y-6 lg:col-span-4">
          {/* Accountability Chain */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-[#181C19]">
              Accountability Chain
            </h3>
            <dl className="mt-3 space-y-3 text-xs">
              <div className="flex justify-between gap-2 border-b border-[#EFEFEA] pb-2">
                <dt className="text-[#5A635D]">Ward (Demo GIS)</dt>
                <dd className="text-right font-semibold text-[#181C19]">
                  {complaint.wardCode} {complaint.wardName || 'Unmapped'}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[#EFEFEA] pb-2">
                <dt className="text-[#5A635D]">Department</dt>
                <dd className="text-right font-semibold text-[#113829]">
                  {complaint.departmentName || 'Unassigned'}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[#EFEFEA] pb-2">
                <dt className="text-[#5A635D]">Configured Authority</dt>
                <dd className="text-right font-medium text-[#181C19]">
                  {complaint.assignedAuthorityName || 'Ward Desk (Demo)'}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[#EFEFEA] pb-2">
                <dt className="text-[#5A635D]">Assigned Field Officer</dt>
                <dd className="text-right font-medium text-[#181C19]">
                  {complaint.assignedOfficerName || 'Pending Assignment'}
                </dd>
              </div>
              {complaint.citizenName && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#5A635D]">Reported By</dt>
                  <dd className="text-right font-medium text-[#181C19]">
                    {complaint.citizenName}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Location Map */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#181C19]">Location Map</h3>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F7B55] hover:underline"
              >
                Navigate
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <CivicMap
              wards={meta.wards}
              complaints={[complaint]}
              selectedLocation={{ lat: complaint.latitude, lng: complaint.longitude }}
              highlightWardId={complaint.wardId}
              heightClass="h-[230px]"
              zoom={14}
              showClusters={false}
            />
            <div className="mt-2 font-mono text-[11px] text-[#5A635D] tabular-nums">
              {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
            </div>
          </section>

          {/* Duplicate / Related Issue Cluster */}
          {complaint.duplicateGroup && (
            <section className="rounded-xl border border-[#E4E4DD] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-[#181C19]">
                  Related Reports Cluster
                </h3>
                <span className="font-mono text-xs font-bold text-[#B45309] tabular-nums">
                  {complaint.duplicateGroup.reportCount} reports
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5A635D]">
                {complaint.duplicateGroup.addressLabel} · {complaint.duplicateGroup.status}
              </p>
              <div className="mt-3 space-y-2">
                {(complaint.duplicateGroup.members || []).map((m) => (
                  <button
                    key={m.complaintId}
                    type="button"
                    onClick={() => onSelectComplaint(m.complaintId)}
                    className={`block w-full rounded-lg border p-2.5 text-left transition-colors ${
                      m.complaintId === complaint.id
                        ? 'border-[#0F7B55] bg-[#F2F8F5]'
                        : 'border-[#EFEFEA] bg-[#FAFAF8] hover:border-[#0F7B55]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-[#113829]">
                        {m.trackingCode}
                      </span>
                      <span className="text-[11px] text-[#5A635D]">{m.status}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs font-medium text-[#181C19]">
                      {m.title}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Escalation History */}
          {complaint.escalations.length > 0 && (
            <section className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#991B1B]">
                <ShieldAlert className="h-4 w-4" />
                Escalation History
              </div>
              <div className="mt-3 space-y-2.5">
                {complaint.escalations.map((esc) => (
                  <div
                    key={esc.id}
                    className="rounded-lg border border-[#FECACA] bg-white p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-[#991B1B]">
                      <span>
                        {esc.fromRole} → {esc.toRole}
                      </span>
                      <span className="font-mono tabular-nums">+{esc.overdueMinutes}m</span>
                    </div>
                    <div className="mt-1 text-[#344038]">
                      {esc.delayReason || 'SLA threshold breached'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#5A635D]">
                      {esc.triggeredBy} · {formatDateTime(esc.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
