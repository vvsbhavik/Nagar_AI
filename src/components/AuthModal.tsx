import { ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import type { UserProfile, Ward } from '../shared/types.ts';

interface AuthModalProps {
  wards: Ward[];
  onClose: () => void;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

export function AuthModal({ wards, onClose, onAuthenticated }: AuthModalProps) {
  const [tab, setTab] = useState<'demo' | 'login' | 'register'>('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [wardId, setWardId] = useState(wards[0]?.id || 'ward-14');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDemoSignIn = async (
    role: 'citizen' | 'ward_rep' | 'municipal_admin' | 'field_officer'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.demoLogin(role);
      onAuthenticated(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        tab === 'login'
          ? await api.login(email, password)
          : await api.register({ fullName, email, password, wardId });
      onAuthenticated(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0B261C]/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-[#E4E4DD] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E4E4DD] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#181C19]">
              Access NagarAI Workspace
            </h2>
            <p className="text-xs text-[#5A635D]">
              Role-based access control sharing one live civic database
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#5A635D] hover:bg-[#F7F7F4] hover:text-[#181C19]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#E4E4DD] px-6 pt-3">
          <div className="flex gap-1 rounded-lg bg-[#F3F4EF] p-1">
            {[
              { id: 'demo', label: 'Demo Personas' },
              { id: 'login', label: 'Sign In' },
              { id: 'register', label: 'Register Citizen' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id as 'demo' | 'login' | 'register');
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-white text-[#113829] shadow-xs'
                    : 'text-[#5A635D] hover:text-[#181C19]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]">
              {error}
            </div>
          )}

          {tab === 'demo' ? (
            <div className="space-y-3">
              <p className="text-xs text-[#5A635D]">
                Select a clearly labeled demo persona to test the complete citizen-to-government
                accountability lifecycle with server-verified role permissions.
              </p>
              <div className="grid gap-2.5">
                {[
                  {
                    role: 'citizen' as const,
                    name: 'Ananya Rao',
                    roleLabel: 'Citizen · Ward 14 Banjara Hills',
                    desc: 'Report issues with photo & Telugu/English voice, track timeline, verify repairs.',
                  },
                  {
                    role: 'ward_rep' as const,
                    name: 'Rajeshwari Devi',
                    roleLabel: 'Ward Representative · Ward 14 (Demo)',
                    desc: 'Acknowledge complaints, forward to departments, assign field officers, monitor SLA.',
                  },
                  {
                    role: 'field_officer' as const,
                    name: 'Suresh Babu',
                    roleLabel: 'Field Officer · Roads & Engineering (Demo)',
                    desc: 'Mobile task queue, inspection notes, obstacle flags, before/after resolution upload.',
                  },
                  {
                    role: 'municipal_admin' as const,
                    name: 'Vikramaditya Nair',
                    roleLabel: 'Municipal Administrator · City Command (Demo)',
                    desc: 'Citywide GIS analytics, hotspot intelligence, escalations, routing & SLA config.',
                  },
                ].map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoSignIn(acc.role)}
                    className="flex w-full items-start justify-between gap-4 rounded-lg border border-[#E4E4DD] bg-[#FAFAF8] px-4 py-3 text-left transition-colors hover:border-[#0F7B55] hover:bg-white disabled:opacity-50"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#181C19]">{acc.name}</div>
                      <div className="mt-0.5 text-xs font-medium text-[#0F7B55]">
                        {acc.roleLabel}
                      </div>
                      <div className="mt-1 text-xs text-[#5A635D]">{acc.desc}</div>
                    </div>
                    <span className="mt-1 text-xs font-semibold text-[#113829] whitespace-nowrap">
                      Enter →
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 text-[11px] text-[#5A635D]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0F7B55] shrink-0" />
                Demo accounts use clearly labeled sample municipal data and are not real government
                officials.
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {tab === 'register' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Srinivas Reddy"
                    className="w-full rounded-lg border border-[#D8DAD2] px-3.5 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="citizen@example.com"
                  className="w-full rounded-lg border border-[#D8DAD2] px-3.5 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-[#D8DAD2] px-3.5 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                />
              </div>
              {tab === 'register' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                    Primary Home Ward (Demo Boundary)
                  </label>
                  <select
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3.5 py-2 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  >
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name} ({w.zone})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#0F7B55] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0C6545] disabled:opacity-50"
              >
                {loading
                  ? 'Verifying...'
                  : tab === 'login'
                  ? 'Sign In to NagarAI'
                  : 'Create Citizen Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
