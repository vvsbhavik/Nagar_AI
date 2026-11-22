import { Bot, Send, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citedTrackingCodes?: string[];
  error?: boolean;
}

interface CivicAssistantProps {
  focusedComplaintId?: string;
  onSelectTrackingCode?: (trackingCode: string) => void;
  onClose?: () => void;
  embedded?: boolean;
}

const QUICK_PROMPTS = [
  'Why is NGR-1001 escalated and who is handling it?',
  'What happened so far on NGR-1002?',
  'How many similar pothole reports exist near Banjara Hills Road No. 12?',
  'What does Awaiting Citizen Verification mean?',
  'Which wards currently need priority support based on live records?',
];

export function CivicAssistant({
  focusedComplaintId,
  onSelectTrackingCode,
  onClose,
  embedded = false,
}: CivicAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask me about any complaint status, assigned authority, SLA deadlines, nearby related complaints, or ward health metrics. Every answer is grounded strictly in live NagarAI database records.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const askQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.askAssistant({
        question: q,
        complaintId: focusedComplaintId,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.answer,
          citedTrackingCodes: res.citedTrackingCodes,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach AI assistant right now.',
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col bg-white ${
        embedded
          ? 'h-[620px] rounded-xl border border-[#E4E4DD]'
          : 'h-full border-l border-[#E4E4DD]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#E4E4DD] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#113829] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-[#181C19]">
              AI Civic Assistant
            </h3>
            <p className="text-xs text-[#5A635D]">
              Grounded in live database records · Zero fabricated statuses
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#5A635D] hover:bg-[#F7F7F4] hover:text-[#181C19]"
            aria-label="Close AI Civic Assistant"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#113829] text-white'
                  : m.error
                  ? 'border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                  : 'border border-[#E4E4DD] bg-[#F7F7F4] text-[#181C19]'
              }`}
            >
              {m.text}
            </div>
            {m.citedTrackingCodes && m.citedTrackingCodes.length > 0 && onSelectTrackingCode && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {m.citedTrackingCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onSelectTrackingCode(code)}
                    className="font-mono text-xs font-medium text-[#0F7B55] underline decoration-[#0F7B55]/40 underline-offset-2 hover:text-[#113829]"
                  >
                    Open {code}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#5A635D]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0F7B55] border-t-transparent" />
            Querying live civic database & generating grounded answer...
          </div>
        )}
      </div>

      <div className="border-t border-[#E4E4DD] bg-[#FAFAF8] px-4 py-3">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.slice(0, embedded ? 5 : 3).map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => askQuestion(prompt)}
              disabled={loading}
              className="rounded-md border border-[#E4E4DD] bg-white px-2.5 py-1 text-left text-xs text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about complaint status, authority, SLA, or nearby issues..."
            className="flex-1 rounded-lg border border-[#D8DAD2] bg-white px-3.5 py-2 text-sm text-[#181C19] placeholder:text-[#7A847D] focus:border-[#0F7B55] focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F7B55] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0C6545] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
