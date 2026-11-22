import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Mic,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, fileToBase64, getSeverityStyle, type MetaPayload } from '../lib/api.ts';
import {
  COMPLAINT_CATEGORIES,
  SEVERITIES,
  type AiAssessment,
  type ComplaintCategory,
  type ComplaintDetail,
  type GeoIdentifyResult,
  type Severity,
} from '../shared/types.ts';
import { CivicMap } from './CivicMap.tsx';

const DEMO_POTHOLE_PHOTO = '/src/assets/images/civic_pothole_before_1795354764751.jpg';
const DEMO_TELUGU_VOICE =
  'బంజారా హిల్స్ రోడ్ నంబర్ 12 విరించి జంక్షన్ దగ్గర రోడ్డు మధ్యలో చాలా పెద్ద గుంత ఏర్పడింది. వర్షపు నీరు నిండిపోయి బైక్‌లు మరియు ఆటోలు జారిపోతున్నాయి. దయచేసి వెంటనే మరమ్మత్తు చేయించండి.';

interface ReportIssueViewProps {
  meta: MetaPayload;
  onCancel: () => void;
  onSubmitted: (complaint: ComplaintDetail) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export function ReportIssueView({
  meta,
  onCancel,
  onSubmitted,
  onToast,
}: ReportIssueViewProps) {
  // Media & voice inputs
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [demoImagePath, setDemoImagePath] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const [voiceLang, setVoiceLang] = useState<'te-IN' | 'en-IN'>('te-IN');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceAudioUpload, setVoiceAudioUpload] = useState<{ base64: string; mimeType: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [rawText, setRawText] = useState('');

  // Location & geospatial ward identification
  const [lat, setLat] = useState(17.4126);
  const [lng, setLng] = useState(78.4368);
  const [addressLabel, setAddressLabel] = useState(
    'Road No. 12, Banjara Hills (Near Virinchi Junction)'
  );
  const [landmarkQuery, setLandmarkQuery] = useState('');
  const [geoResult, setGeoResult] = useState<GeoIdentifyResult | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  // AI assessment & editable review form
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAssessment, setAiAssessment] = useState<AiAssessment | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('Potholes');
  const [severity, setSeverity] = useState<Severity>('High');
  const [departmentId, setDepartmentId] = useState<string>(
    meta.departments[0]?.id || 'dept-roads'
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Run geospatial ward lookup whenever coordinates or category change
  useEffect(() => {
    let active = true;
    api
      .identifyLocation({
        lat,
        lng,
        category,
        text: `${title} ${rawText} ${voiceTranscript}`,
      })
      .then((res) => {
        if (active) setGeoResult(res);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      active = false;
    };
  }, [lat, lng, category]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleMediaFile = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (file.size > 12 * 1024 * 1024) {
      setErrorMsg('Please select a photo or video smaller than 12MB.');
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      if (file.type.startsWith('video/')) {
        setVideoData({ base64: b64, mimeType: file.type, name: file.name });
        onToast(`Video attached: ${file.name}`, 'info');
      } else if (file.type.startsWith('image/')) {
        setImagePreview(b64);
        setImageBase64(b64);
        setImageMimeType(file.type);
        setDemoImagePath(null);
      } else {
        setErrorMsg('Supported formats: JPG, PNG, WebP images or MP4/WebM short clips.');
      }
    } catch {
      setErrorMsg('Could not read the selected file.');
    }
  };

  const startVoiceRecording = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setIsRecording(false);

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], 'voice-complaint.webm', { type: mimeType });
        const b64 = await fileToBase64(file);
        setVoiceAudioUpload({ base64: b64, mimeType });

        setTranscribing(true);
        try {
          const res = await api.transcribeVoice({
            audioBase64: b64,
            mimeType,
            languageHint: voiceLang,
          });
          setVoiceTranscript(res.transcript);
          onToast(
            `Transcribed ${res.detectedLanguage === 'te-IN' ? 'Telugu' : 'English'} voice via Gemini`,
            'success'
          );
        } catch (err) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Voice transcription failed. You can edit or type the transcript below.'
          );
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg(
        'Microphone access was denied or unavailable. You can type a Telugu/English note or use the Primary Demo sample.'
      );
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const loadPrimaryDemoScenario = () => {
    setErrorMsg(null);
    setImagePreview(DEMO_POTHOLE_PHOTO);
    setImageBase64(null);
    setImageMimeType('image/jpeg');
    setDemoImagePath(DEMO_POTHOLE_PHOTO);
    setVoiceLang('te-IN');
    setVoiceTranscript(DEMO_TELUGU_VOICE);
    setRawText('Deep waterlogged pothole on Road No. 12 arterial lane causing bike skids.');
    setLat(17.4128);
    setLng(78.4370);
    setAddressLabel('Road No. 12, Banjara Hills (Near Virinchi Junction)');
    setAiAssessment(null);
    onToast(
      'Primary Demo loaded (Road No. 12 pothole photo + Telugu voice). Click "Analyze with Gemini AI" next.',
      'info'
    );
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Browser geolocation is unavailable.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Math.round(pos.coords.latitude * 100000) / 100000);
        setLng(Math.round(pos.coords.longitude * 100000) / 100000);
        setAddressLabel(
          `GPS Coordinates (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
        );
        setLocatingGps(false);
        onToast('GPS location captured and mapped to ward boundaries.', 'success');
      },
      () => {
        setLocatingGps(false);
        setErrorMsg('Unable to access GPS. Please click the map or pick a landmark.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRunAiAnalysis = async () => {
    setErrorMsg(null);
    if (!imageBase64 && !demoImagePath && !rawText.trim() && !voiceTranscript.trim()) {
      setErrorMsg('Add a photo, voice note, or written description before running AI analysis.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await api.analyzeComplaint({
        text: rawText.trim() || undefined,
        voiceTranscript: voiceTranscript.trim() || undefined,
        voiceLanguage: voiceTranscript.trim() ? voiceLang : undefined,
        imageBase64: imageBase64 || undefined,
        imageMimeType: imageMimeType || undefined,
        demoImagePath: demoImagePath || undefined,
        addressHint: addressLabel,
      });

      const a = res.assessment;
      setAiAssessment(a);
      setCategory(a.categoryPredicted);
      setTitle(a.titleSuggested);
      setDescription(a.descriptionSuggested);
      setSeverity(a.finalSeverity);
      if (a.suggestedDepartmentId) {
        setDepartmentId(a.suggestedDepartmentId);
      } else {
        const rule = meta.routingRules.find((r) => r.category === a.categoryPredicted);
        if (rule) setDepartmentId(rule.departmentId);
      }
      onToast('Gemini AI multimodal analysis completed. Review and confirm below.', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const finalTitle = title.trim() || `${category} reported at ${addressLabel}`;
    const finalDesc =
      description.trim() ||
      rawText.trim() ||
      voiceTranscript.trim();

    if (finalTitle.length < 5 || finalDesc.length < 10) {
      setErrorMsg('Please provide a clear title (5+ chars) and description (10+ chars), or run Gemini AI analysis first.');
      return;
    }

    setSubmitting(true);
    try {
      const mediaUploads: Array<{
        base64?: string;
        mimeType: string;
        existingUrl?: string;
        caption?: string;
      }> = [];

      if (imageBase64 && imageMimeType) {
        mediaUploads.push({
          base64: imageBase64,
          mimeType: imageMimeType,
          caption: 'Citizen uploaded photographic evidence',
        });
      } else if (demoImagePath) {
        mediaUploads.push({
          existingUrl: demoImagePath,
          mimeType: 'image/jpeg',
          caption: 'Citizen street photograph (Primary Demo pothole)',
        });
      }

      if (videoData) {
        mediaUploads.push({
          base64: videoData.base64,
          mimeType: videoData.mimeType,
          caption: `Citizen video clip: ${videoData.name}`,
        });
      }

      if (voiceAudioUpload) {
        mediaUploads.push({
          base64: voiceAudioUpload.base64,
          mimeType: voiceAudioUpload.mimeType,
          caption: `Citizen voice recording (${voiceLang})`,
        });
      }

      const res = await api.createComplaint({
        title: finalTitle,
        description: finalDesc,
        category,
        severity,
        latitude: lat,
        longitude: lng,
        addressLabel: addressLabel.trim(),
        departmentId,
        voiceTranscript: voiceTranscript.trim() || null,
        voiceLanguage: voiceTranscript.trim() ? voiceLang : null,
        mediaUploads,
        aiAssessment,
      });

      onToast(
        `Complaint ${res.complaint.trackingCode} submitted and routed to ${res.complaint.departmentName}.`,
        'success'
      );
      onSubmitted(res.complaint);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLandmarks = meta.landmarks.filter((lm) =>
    landmarkQuery.trim()
      ? lm.label.toLowerCase().includes(landmarkQuery.toLowerCase())
      : true
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E4DD] pb-5">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#5A635D] hover:text-[#113829]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </button>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#181C19]">
            Report a Civic Issue
          </h1>
          <p className="mt-1 text-sm text-[#5A635D]">
            Capture photo, video, or Telugu/English voice. NagarAI identifies the ward boundary,
            checks nearby duplicates, and routes to the responsible department.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPrimaryDemoScenario}
          className="inline-flex items-center gap-2 rounded-lg border border-[#0F7B55] bg-[#0F7B55]/8 px-4 py-2 text-xs font-semibold text-[#113829] transition-colors hover:bg-[#0F7B55]/15 whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#0F7B55]" />
          Load Primary Demo (Pothole + Telugu Voice)
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Evidence + Voice + Location */}
        <div className="space-y-6 lg:col-span-7">
          {/* 01. Evidence & Voice */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  01. Visual Evidence &amp; Multilingual Voice
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Upload a street photo/video or record in Telugu or English
                </p>
              </div>
              <span className="font-mono text-xs text-[#5A635D]">Photo · Video · Audio</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Photo / Video Dropzone */}
              <div className="flex flex-col justify-between rounded-lg border border-dashed border-[#C7CBC2] bg-[#FAFAF8] p-4">
                {imagePreview ? (
                  <div className="space-y-2.5">
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-md bg-[#E4E4DD]">
                      <img
                        src={imagePreview}
                        alt="Uploaded civic issue preview"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#15803D]">Photo ready for AI</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview(null);
                          setImageBase64(null);
                          setDemoImagePath(null);
                        }}
                        className="font-medium text-[#5A635D] hover:text-[#B91C1C]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex h-full min-h-[170px] cursor-pointer flex-col items-center justify-center text-center">
                    <Camera className="mb-2 h-6 w-6 text-[#0F7B55]" />
                    <span className="text-sm font-semibold text-[#181C19]">
                      Upload Photo or Video
                    </span>
                    <span className="mt-1 text-xs text-[#5A635D]">
                      JPG, PNG, WebP or MP4 (max 12MB)
                    </span>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-medium text-[#181C19]">
                      <Upload className="h-3.5 w-3.5" />
                      Choose File
                    </span>
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm"
                      className="hidden"
                      onChange={(e) => handleMediaFile(e.target.files?.[0])}
                    />
                  </label>
                )}
                {videoData && (
                  <div className="mt-2 flex items-center justify-between border-t border-[#E4E4DD] pt-2 text-xs text-[#181C19]">
                    <span className="truncate">Video: {videoData.name}</span>
                    <button
                      type="button"
                      onClick={() => setVideoData(null)}
                      className="text-[#B91C1C]"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Voice Recorder (Telugu & English) */}
              <div className="flex flex-col justify-between rounded-lg border border-[#E4E4DD] bg-[#FAFAF8] p-4">
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#181C19]">Voice Complaint</span>
                    <div className="flex rounded-md border border-[#D8DAD2] bg-white p-0.5 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setVoiceLang('te-IN')}
                        className={`rounded px-2 py-0.5 transition-colors ${
                          voiceLang === 'te-IN'
                            ? 'bg-[#113829] text-white'
                            : 'text-[#5A635D] hover:text-[#181C19]'
                        }`}
                      >
                        తెలుగు
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceLang('en-IN')}
                        className={`rounded px-2 py-0.5 transition-colors ${
                          voiceLang === 'en-IN'
                            ? 'bg-[#113829] text-white'
                            : 'text-[#5A635D] hover:text-[#181C19]'
                        }`}
                      >
                        English
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={transcribing}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                      isRecording
                        ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                        : 'bg-[#113829] text-white hover:bg-[#164835]'
                    } disabled:opacity-50`}
                  >
                    {isRecording ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current" />
                        Stop Recording ({recordingSeconds}s)
                      </>
                    ) : transcribing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Transcribing via Gemini...
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        Record {voiceLang === 'te-IN' ? 'Telugu' : 'English'} Voice
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-medium text-[#5A635D]">
                    Voice Transcript (editable · Telugu or English)
                  </label>
                  <textarea
                    rows={3}
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder={
                      voiceLang === 'te-IN'
                        ? 'తెలుగు వాయిస్ ట్రాన్స్క్రిప్ట్ ఇక్కడ కనిపిస్తుంది...'
                        : 'Spoken complaint transcript appears here...'
                    }
                    className="w-full rounded-md border border-[#D8DAD2] bg-white px-2.5 py-2 text-xs text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                Additional Written Note (Optional)
              </label>
              <textarea
                rows={2}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Describe any landmarks, safety hazards, or how long the issue has persisted..."
                className="w-full rounded-lg border border-[#D8DAD2] px-3.5 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEFEA] pt-4">
              <p className="text-xs text-[#5A635D]">
                Gemini analyzes uploaded photo &amp; Telugu/English voice on the server and combines
                it with deterministic safety rules.
              </p>
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                disabled={analyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F7B55] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0C6545] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze with Gemini AI
                  </>
                )}
              </button>
            </div>
          </section>

          {/* 02. Location & Geospatial Ward Mapping */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#181C19]">
                  02. Location &amp; Geospatial Ward Identification
                </h2>
                <p className="text-xs text-[#5A635D]">
                  Click anywhere on the map, use GPS, or pick a city landmark · Ward matched via
                  polygon containment
                </p>
              </div>
              <button
                type="button"
                onClick={handleUseGps}
                disabled={locatingGps}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#181C19] hover:border-[#0F7B55] hover:text-[#0F7B55]"
              >
                <Crosshair className="h-3.5 w-3.5" />
                {locatingGps ? 'Locating...' : 'Use My GPS'}
              </button>
            </div>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5A635D]">
                  Quick Landmark Search
                </label>
                <input
                  type="text"
                  value={landmarkQuery}
                  onChange={(e) => setLandmarkQuery(e.target.value)}
                  placeholder="Filter Banjara Hills, Madhapur, Begumpet..."
                  className="w-full rounded-lg border border-[#D8DAD2] px-3 py-1.5 text-xs text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
                <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto rounded-md border border-[#EFEFEA] bg-[#FAFAF8] p-1.5">
                  {filteredLandmarks.slice(0, 5).map((lm) => (
                    <button
                      key={lm.label}
                      type="button"
                      onClick={() => {
                        setLat(lm.lat);
                        setLng(lm.lng);
                        setAddressLabel(lm.label);
                      }}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-[#181C19] hover:bg-white hover:text-[#0F7B55]"
                    >
                      <MapPin className="h-3 w-3 shrink-0 text-[#0F7B55]" />
                      <span className="truncate">{lm.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#5A635D]">
                  Confirmed Street / Landmark Address
                </label>
                <input
                  type="text"
                  required
                  value={addressLabel}
                  onChange={(e) => setAddressLabel(e.target.value)}
                  className="w-full rounded-lg border border-[#D8DAD2] px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
                <div className="mt-2 font-mono text-[11px] text-[#5A635D] tabular-nums">
                  WGS84: {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
                {geoResult?.ward && (
                  <div className="mt-2 rounded-lg border border-[#E4E4DD] bg-[#F7F7F4] p-2.5 text-xs">
                    <div className="font-semibold text-[#113829]">
                      {geoResult.ward.code} · {geoResult.ward.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5A635D]">
                      {geoResult.matchType === 'exact_polygon'
                        ? 'Matched via Demo Ward Polygon'
                        : `Nearest Demo Ward (${geoResult.distanceMeters}m from center)`}{' '}
                      · Authority: {geoResult.primaryAuthority?.name || 'Ward Desk (Demo)'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <CivicMap
              wards={meta.wards}
              selectedLocation={{ lat, lng }}
              highlightWardId={geoResult?.ward?.id || null}
              interactivePicker
              onPickLocation={(newLat, newLng) => {
                setLat(newLat);
                setLng(newLng);
              }}
              heightClass="h-[300px]"
            />

            {/* Nearby Potential Duplicate Alert */}
            {geoResult && geoResult.nearbyDuplicates.length > 0 && (
              <div className="mt-4 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
                <div className="text-xs font-semibold text-[#92400E]">
                  {geoResult.nearbyDuplicates.length} Related Civic Report(s) Detected Within 400m
                </div>
                <p className="mt-0.5 text-xs text-[#78350F]">
                  Your individual complaint will be preserved and automatically linked to this civic
                  issue cluster so authorities see collective impact.
                </p>
                <div className="mt-2 space-y-1">
                  {geoResult.nearbyDuplicates.slice(0, 3).map((dup) => (
                    <div
                      key={dup.complaintId}
                      className="flex items-center justify-between text-xs text-[#78350F]"
                    >
                      <span className="truncate">
                        <span className="font-mono font-semibold">{dup.trackingCode}</span> ·{' '}
                        {dup.title}
                      </span>
                      <span className="ml-2 font-mono text-[11px] whitespace-nowrap">
                        {dup.distanceMeters}m · {Math.round(dup.similarityScore * 100)}% match
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: AI Review + Editable Confirmation + Submit */}
        <div className="space-y-6 lg:col-span-5">
          {/* AI Analysis Output Panel */}
          {aiAssessment && (
            <section className="rounded-xl border border-[#0F7B55]/30 bg-[#F2F8F5] p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#113829]">
                  Gemini AI Assessment
                </h3>
                <span className="font-mono text-xs font-semibold text-[#0F7B55] tabular-nums">
                  {Math.round(aiAssessment.confidence * 100)}% confidence
                </span>
              </div>

              {aiAssessment.voiceTranslationEn && (
                <div className="mt-3 rounded-lg border border-[#D4E7DD] bg-white p-3 text-xs">
                  <div className="font-semibold text-[#113829]">
                    Telugu Voice → English Translation
                  </div>
                  <p className="mt-1 text-[#181C19]">{aiAssessment.voiceTranslationEn}</p>
                </div>
              )}

              <div className="mt-3 space-y-2 text-xs text-[#181C19]">
                <div className="flex items-center justify-between border-b border-[#D4E7DD] pb-2">
                  <span className="text-[#5A635D]">AI Severity vs Deterministic Guardrail</span>
                  <span className="font-mono font-semibold">
                    {aiAssessment.severityPredicted} →{' '}
                    <span className={getSeverityStyle(aiAssessment.finalSeverity).text}>
                      {aiAssessment.finalSeverity}
                    </span>
                  </span>
                </div>
                <p className="leading-relaxed text-[#344038]">{aiAssessment.severityExplanation}</p>
                {aiAssessment.deterministicRuleApplied && (
                  <p className="rounded-md bg-white/80 px-2.5 py-1.5 text-[11px] font-medium text-[#113829]">
                    {aiAssessment.deterministicRuleApplied}
                  </p>
                )}

                {aiAssessment.riskFactors.length > 0 && (
                  <div className="pt-1">
                    <div className="font-semibold text-[#113829]">Observed Risk Factors</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[#344038]">
                      {aiAssessment.riskFactors.map((rf, i) => (
                        <li key={i}>{rf}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-1">
                  <div className="font-semibold text-[#113829]">Recommended Municipal Action</div>
                  <p className="mt-0.5 text-[#344038]">{aiAssessment.suggestedAction}</p>
                </div>

                {aiAssessment.additionalInfoRequired.length > 0 && (
                  <div className="pt-1">
                    <div className="font-semibold text-[#113829]">
                      Optional Info Helpful for Field Crew
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[#5A635D]">
                      {aiAssessment.additionalInfoRequired.map((info, i) => (
                        <li key={i}>{info}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 03. Review, Edit & Confirm */}
          <section className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-[#181C19]">
                03. Review, Edit &amp; Submit Complaint
              </h2>
              <p className="text-xs text-[#5A635D]">
                You control every detail before submitting to the accountable ward workflow.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#181C19]">
                  Complaint Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Concise title describing the civic issue"
                  className="w-full rounded-lg border border-[#D8DAD2] px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#181C19]">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      const nextCat = e.target.value as ComplaintCategory;
                      setCategory(nextCat);
                      const rule = meta.routingRules.find((r) => r.category === nextCat);
                      if (rule) setDepartmentId(rule.departmentId);
                    }}
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  >
                    {COMPLAINT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#181C19]">
                    Severity Priority
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Severity)}
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#181C19]">
                  Routed Municipal Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                >
                  {meta.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#181C19]">
                  Detailed Description
                </label>
                <textarea
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the observed civic problem..."
                  className="w-full rounded-lg border border-[#D8DAD2] px-3 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-[#E4E4DD] bg-[#F7F7F4] p-3 text-xs text-[#5A635D]">
                <div className="font-semibold text-[#181C19]">Accountable Routing Preview</div>
                <div className="mt-1 font-mono text-[11px] text-[#113829]">
                  {geoResult?.ward ? `${geoResult.ward.code} ${geoResult.ward.name}` : 'Location'} →{' '}
                  {meta.departments.find((d) => d.id === departmentId)?.name || 'Department'} →{' '}
                  {geoResult?.primaryAuthority?.title || 'Ward Desk (Demo)'}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#113829] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#164835] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting &amp; Routing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Accountable Complaint
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
