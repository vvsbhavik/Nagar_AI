import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import {
  COMPLAINT_CATEGORIES,
  SEVERITIES,
  type AiAssessment,
  type ComplaintCategory,
  type Severity,
} from '../shared/types.ts';
import { evaluateDeterministicSeverity } from './geo.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return new Error(
      'Gemini API key was rejected (403/400). Please check your GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return new Error(
      'Gemini API rate limit reached (429). Please wait a moment and try again.'
    );
  }
  return new Error(`AI service error: ${msg}`);
}

export async function transcribeCivicVoice(params: {
  audioBase64: string;
  mimeType: string;
  languageHint?: 'te-IN' | 'en-IN' | 'auto';
}): Promise<{ transcript: string; detectedLanguage: string }> {
  const ai = getClient();
  const langPrompt =
    params.languageHint === 'te-IN'
      ? 'Transcribe this Telugu civic complaint voice note accurately in Telugu script (and preserve any English road names or numbers spoken). Return only the exact verbatim transcription without adding extra commentary.'
      : params.languageHint === 'en-IN'
      ? 'Transcribe this English civic complaint voice note accurately. Return only the exact verbatim transcription.'
      : 'Transcribe this civic complaint voice note accurately in its spoken language (Telugu or English). Preserve Telugu script if spoken in Telugu. Return only the exact verbatim transcription.';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.audioBase64,
            },
          },
          { text: langPrompt },
        ],
      },
    });

    const transcript = (response.text ?? '').trim();
    const hasTelugu = /[\u0C00-\u0C7F]/.test(transcript);
    return {
      transcript,
      detectedLanguage: hasTelugu
        ? 'te-IN'
        : params.languageHint === 'te-IN'
        ? 'te-IN'
        : 'en-IN',
    };
  } catch (err) {
    throw formatGeminiError(err);
  }
}

const aiComplaintSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  title: z.string().min(4).max(160),
  description: z.string().min(10).max(1200),
  severity: z.enum(SEVERITIES),
  confidence: z.number().min(0).max(1),
  riskFactors: z.array(z.string()).max(6),
  severityExplanation: z.string().min(8).max(500),
  suggestedDepartment: z.string().min(2).max(120),
  suggestedAction: z.string().min(8).max(400),
  additionalInfoRequired: z.array(z.string()).max(4),
  voiceTranslationEn: z.string().nullable().optional(),
});

export async function analyzeCivicComplaint(params: {
  text?: string;
  voiceTranscript?: string;
  voiceLanguage?: string;
  imageBase64?: string;
  imageMimeType?: string;
  addressHint?: string;
  availableDepartments: string[];
}): Promise<AiAssessment> {
  const ai = getClient();

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }

  const contextLines = [
    `Allowed Categories (choose exact match): ${COMPLAINT_CATEGORIES.join(', ')}`,
    `Configured Municipal Departments: ${params.availableDepartments.join(', ')}`,
    params.addressHint ? `Reported Location Context: ${params.addressHint}` : '',
    params.text ? `Citizen Written Description: ${params.text}` : '',
    params.voiceTranscript
      ? `Citizen Voice Transcript (${params.voiceLanguage || 'auto'}): ${params.voiceTranscript}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  parts.push({
    text: `Analyze the civic infrastructure issue provided above (image and/or citizen text/voice).
Strict integrity rules:
1. NEVER invent visual details, hazards, measurements, or objects that are not genuinely present in the supplied photo or citizen report.
2. NEVER invent government officials, ward numbers, official ticket statuses, or municipal actions.
3. If Telugu voice/text is provided, translate its meaning accurately into English in voiceTranslationEn and write the title & description in clear professional English while preserving landmark names.
4. Pick the closest matching category from the Allowed Categories list and recommend the most relevant department from Configured Municipal Departments.
5. Be calibrated and conservative with confidence (0.0 to 1.0) and clearly list any missing details in additionalInfoRequired.

${contextLines}`,
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are NagarAI, a rigorous civic infrastructure intake analyst. Classify municipal issues strictly from observed evidence without hallucinating observations, authorities, or official claims.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, description: 'Exact category from allowed list' },
            title: { type: Type.STRING, description: 'Concise factual issue title (max 120 chars)' },
            description: { type: Type.STRING, description: 'Clear factual summary grounded strictly in supplied evidence' },
            severity: { type: Type.STRING, description: 'One of: Critical, High, Medium, Low' },
            confidence: { type: Type.NUMBER, description: 'Calibrated confidence between 0 and 1' },
            riskFactors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Concrete observed risk factors',
            },
            severityExplanation: {
              type: Type.STRING,
              description: 'Transparent explanation for the assigned severity level',
            },
            suggestedDepartment: {
              type: Type.STRING,
              description: 'Best matching municipal department from configured list',
            },
            suggestedAction: {
              type: Type.STRING,
              description: 'Practical municipal field remediation step',
            },
            additionalInfoRequired: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Optional follow-up facts helpful for field crews',
            },
            voiceTranslationEn: {
              type: Type.STRING,
              nullable: true,
              description: 'English translation if non-English voice/text was provided, otherwise null',
            },
          },
          required: [
            'category',
            'title',
            'description',
            'severity',
            'confidence',
            'riskFactors',
            'severityExplanation',
            'suggestedDepartment',
            'suggestedAction',
            'additionalInfoRequired',
          ],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsedJson = JSON.parse(rawText);

    // Coerce category/severity defensively before strict Zod validation
    if (!COMPLAINT_CATEGORIES.includes(parsedJson.category)) {
      parsedJson.category = 'Other';
    }
    if (!SEVERITIES.includes(parsedJson.severity)) {
      parsedJson.severity = 'Medium';
    }

    const validated = aiComplaintSchema.parse(parsedJson);
    const combinedText = [
      params.text || '',
      params.voiceTranscript || '',
      validated.voiceTranslationEn || '',
      validated.title,
      validated.description,
    ].join(' ');

    const ruleCheck = evaluateDeterministicSeverity(
      validated.category as ComplaintCategory,
      combinedText,
      validated.severity as Severity
    );

    return {
      modelName: 'gemini-4-hydrogen',
      categoryPredicted: validated.category,
      titleSuggested: validated.title,
      descriptionSuggested: validated.description,
      severityPredicted: validated.severity,
      deterministicSeverity: ruleCheck.deterministicSeverity,
      finalSeverity: ruleCheck.finalSeverity,
      deterministicRuleApplied: ruleCheck.ruleApplied,
      confidence: Math.round(validated.confidence * 100) / 100,
      riskFactors: validated.riskFactors,
      severityExplanation: validated.severityExplanation,
      suggestedDepartment: validated.suggestedDepartment,
      suggestedAction: validated.suggestedAction,
      additionalInfoRequired: validated.additionalInfoRequired,
      voiceTranscript: params.voiceTranscript || null,
      voiceLanguage: params.voiceLanguage || null,
      voiceTranslationEn: validated.voiceTranslationEn || null,
    };
  } catch (err) {
    throw formatGeminiError(err);
  }
}

const evidenceSchema = z.object({
  relevanceScore: z.number().min(0).max(1),
  visibleChanges: z.string().min(8).max(600),
  resolutionAssessment: z.enum([
    'Likely Resolved',
    'Partially Resolved',
    'Unclear / Insufficient Evidence',
    'Possible Mismatch',
  ]),
  mismatchWarnings: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(10).max(700),
});

export async function compareResolutionEvidence(params: {
  beforeImageBase64?: string | null;
  beforeMimeType?: string | null;
  afterImageBase64: string;
  afterMimeType: string;
  complaintTitle: string;
  complaintCategory: string;
  fieldNotes?: string;
}) {
  const ai = getClient();
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.beforeImageBase64 && params.beforeMimeType) {
    parts.push({ text: 'IMAGE 1 (ORIGINAL REPORTED ISSUE — BEFORE REPAIR):' });
    parts.push({
      inlineData: {
        mimeType: params.beforeMimeType,
        data: params.beforeImageBase64,
      },
    });
  }

  parts.push({ text: 'IMAGE 2 (FIELD OFFICER RESOLUTION EVIDENCE — AFTER REPAIR):' });
  parts.push({
    inlineData: {
      mimeType: params.afterMimeType,
      data: params.afterImageBase64,
    },
  });

  parts.push({
    text: `Compare the submitted resolution photo against the original civic complaint.
Complaint: "${params.complaintTitle}" (Category: ${params.complaintCategory})
Field Officer Notes: "${params.fieldNotes || 'None provided'}"

Rules:
1. This assessment is strictly ADVISORY — citizen verification and human review remain decisive.
2. Identify concrete visible changes between before and after images.
3. Flag any potential mismatches (different location cues, angle ambiguity, incomplete debris cleanup, temporary patchwork, or missing before reference) in mismatchWarnings.
4. Never fabricate repairs you cannot see in the photo.`,
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are an impartial civic accountability auditor performing advisory visual verification of municipal repair evidence.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relevanceScore: { type: Type.NUMBER, description: '0 to 1 relevance score' },
            visibleChanges: { type: Type.STRING, description: 'Objective visible differences' },
            resolutionAssessment: {
              type: Type.STRING,
              description:
                'One of: Likely Resolved, Partially Resolved, Unclear / Insufficient Evidence, Possible Mismatch',
            },
            mismatchWarnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Any cautions, angle differences, or mismatch flags',
            },
            confidence: { type: Type.NUMBER, description: '0 to 1 confidence score' },
            explanation: {
              type: Type.STRING,
              description: 'Advisory explanation noting human/citizen verification is required',
            },
          },
          required: [
            'relevanceScore',
            'visibleChanges',
            'resolutionAssessment',
            'mismatchWarnings',
            'confidence',
            'explanation',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return evidenceSchema.parse(parsed);
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function answerCivicAssistant(params: {
  question: string;
  userRole: string;
  userName: string;
  databaseContext: Record<string, unknown>;
}): Promise<{ answer: string; citedTrackingCodes: string[] }> {
  const ai = getClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Current User: ${params.userName} (Role: ${params.userRole})
Verified Live Database Snapshot (ONLY source of truth):
${JSON.stringify(params.databaseContext, null, 2)}

User Question: ${params.question}`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: `You are NagarAI's Grounded Civic Assistant.
STRICT RULES:
1. Answer ONLY using facts explicitly present in the provided Verified Live Database Snapshot.
2. NEVER invent complaint statuses, official names, phone numbers, escalation actions, deadlines, or city statistics.
3. If a complaint or detail is not present in the database snapshot, state clearly that it is not found in current records.
4. Always note that demo SLA targets and demo ward officials are labeled demo configurations when citing them.
5. Keep answers clear, concise, empathetic, and structured with concrete tracking codes (e.g., NGR-1001), timestamps, and next steps.`,
      },
    });

    const answer = (response.text ?? '').trim();
    const matches = answer.match(/NGR-\d{4}/g) ?? [];
    const citedTrackingCodes = Array.from(new Set(matches));
    return { answer, citedTrackingCodes };
  } catch (err) {
    throw formatGeminiError(err);
  }
}
