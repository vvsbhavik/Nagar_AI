import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  HardHat,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { LanguageToggle, useI18n } from '../lib/i18n.tsx';
import type { UserProfile, Ward } from '../shared/types.ts';

interface AuthPageProps {
  wards: Ward[];
  onBackToPublic: () => void;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

const TRIAL_ACCOUNTS: Array<{
  role: 'citizen' | 'ward_rep' | 'field_officer' | 'municipal_admin';
  name: string;
  roleKey: string;
  email: string;
  password: string;
  scope: string;
  icon: typeof User;
}> = [
  {
    role: 'citizen',
    name: 'Ananya Rao',
    roleKey: 'roleCitizen',
    email: 'ananya.citizen@nagarai.demo',
    password: 'NagarAI@Demo2026',
    scope: 'Ward 14 · Banjara Hills · Report, Track & Verify',
    icon: User,
  },
  {
    role: 'ward_rep',
    name: 'Rajeshwari Devi',
    roleKey: 'roleWardRep',
    email: 'ward14.rep@nagarai.demo',
    password: 'NagarAI@Demo2026',
    scope: 'Ward 14 Coordinator · Acknowledge, Route & Assign',
    icon: UserCheck,
  },
  {
    role: 'field_officer',
    name: 'Suresh Babu',
    roleKey: 'roleFieldOfficer',
    email: 'field.roads@nagarai.demo',
    password: 'NagarAI@Demo2026',
    scope: 'Roads & Engineering Unit R-04 · Inspect & Upload Proof',
    icon: HardHat,
  },
  {
    role: 'municipal_admin',
    name: 'Vikramaditya Nair',
    roleKey: 'roleMunicipalAdmin',
    email: 'admin@nagarai.demo',
    password: 'NagarAI@Demo2026',
    scope: 'Citywide Command · Analytics, SLA, Routing & RBAC',
    icon: Building2,
  },
];

export function AuthPage({ wards, onBackToPublic, onAuthenticated }: AuthPageProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wardId, setWardId] = useState(wards[0]?.id || 'ward-14');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filledEmail, setFilledEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register({ fullName, email, password, wardId });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTrialLogin = async (
    role: 'citizen' | 'ward_rep' | 'field_officer' | 'municipal_admin'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.demoLogin(role);
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trial sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillCredentials = (accEmail: string, accPassword: string) => {
    setMode('login');
    setEmail(accEmail);
    setPassword(accPassword);
    setFilledEmail(accEmail);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F7F7F4] lg:grid lg:grid-cols-12">
      {/* Left Brand & Architecture Panel */}
      <div className="flex flex-col justify-between bg-[#113829] px-8 py-8 text-white lg:col-span-5 lg:px-12 lg:py-12">
        <div>
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBackToPublic}
              className="inline-flex items-center gap-2 text-xs font-medium text-white/80 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('authBackToSite')}
            </button>
            <div className="lg:hidden">
              <LanguageToggle compact />
            </div>
          </div>

          <div className="mt-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F7B55] font-display text-lg font-extrabold text-white">
              N
            </div>
            <div>
              <div className="font-display text-xl font-bold tracking-tight text-white">
                {t('brandName')}
              </div>
              <div className="text-xs text-white/70">{t('civicIntelligence')}</div>
            </div>
          </div>

          <h1 className="mt-8 font-display text-3xl font-bold leading-tight tracking-tight text-white [text-wrap:balance]">
            {t('tagline')}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
            One unified civic database connecting citizens, geospatial ward boundaries, responsible
            municipal departments, field execution crews, and public verification.
          </p>

          <div className="mt-8 space-y-4 border-t border-white/12 pt-8">
            <div className="text-xs font-semibold text-[#6EE7B7]">
              Role-Based Access &amp; Automatic Routing
            </div>
            {[
              {
                title: t('roleCitizen'),
                desc: 'Multimodal reporting (photo, video, Telugu/English voice), live status tracking, and repair verification.',
              },
              {
                title: t('roleWardRep'),
                desc: 'Ward-level coordination queue, department forwarding, officer dispatch, and recurring issue oversight.',
              },
              {
                title: t('roleFieldOfficer'),
                desc: 'Mobile field task checklist, site navigation, obstacle flags, and before/after evidence submission.',
              },
              {
                title: t('roleMunicipalAdmin'),
                desc: 'Citywide GIS command center, hotspot intelligence, SLA escalation monitor, and routing configuration.',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6EE7B7]" />
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-white/70">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-white/12 pt-6 text-xs text-white/65">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#6EE7B7] shrink-0" />
            <span>
              Your credentials automatically determine your dashboard role and server-verified
              permissions.
            </span>
          </div>
        </div>
      </div>

      {/* Right Sign-In Form + Trial Demo Accounts Panel */}
      <div className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:col-span-7 lg:px-14 lg:py-10">
        <div className="hidden items-center justify-end lg:flex">
          <LanguageToggle />
        </div>

        <div className="mx-auto my-auto w-full max-w-xl space-y-8 py-4">
          {/* Primary Credential Card */}
          <div className="rounded-xl border border-[#E4E4DD] bg-white p-7 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#181C19]">
                  {mode === 'login' ? t('authWelcomeTitle') : t('createAccount')}
                </h2>
                <p className="mt-1 text-xs text-[#5A635D]">{t('authWelcomeSub')}</p>
              </div>
              <div className="flex rounded-lg bg-[#F3F4EF] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white text-[#113829] shadow-xs'
                      : 'text-[#5A635D] hover:text-[#181C19]'
                  }`}
                >
                  {t('signIn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white text-[#113829] shadow-xs'
                      : 'text-[#5A635D] hover:text-[#181C19]'
                  }`}
                >
                  {t('createAccount')}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#991B1B]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                    {t('authFullNameLabel')}
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-[#7A847D]" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Srinivas Reddy"
                      className="w-full rounded-lg border border-[#D8DAD2] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                  {t('authEmailLabel')}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-[#7A847D]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@nagarai.demo"
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                  {t('authPasswordLabel')}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-[#7A847D]" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#181C19]">
                    {t('authHomeWardLabel')}
                  </label>
                  <select
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                    className="w-full rounded-lg border border-[#D8DAD2] bg-white px-3.5 py-2.5 text-sm text-[#181C19] focus:border-[#0F7B55] focus:outline-none"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F7B55] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0C6545] disabled:opacity-50"
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? t('authSignInSubmit')
                  : t('authRegisterSubmit')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Clearly Labeled Trial Demo Credentials Directory */}
          <div className="rounded-xl border border-[#E4E4DD] bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#0F7B55]" />
                  <h3 className="font-display text-sm font-bold text-[#181C19]">
                    {t('authDemoDirectoryTitle')}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[#5A635D]">{t('authDemoDirectorySub')}</p>
              </div>
              <span className="font-mono text-[11px] text-[#5A635D] whitespace-nowrap">
                Pass: NagarAI@Demo2026
              </span>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {TRIAL_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                const isFilled = filledEmail === acc.email;
                return (
                  <div
                    key={acc.role}
                    className={`flex flex-col justify-between rounded-lg border p-3.5 transition-colors ${
                      isFilled
                        ? 'border-[#0F7B55] bg-[#F2F8F5]'
                        : 'border-[#E4E4DD] bg-[#FAFAF8] hover:border-[#C7CBC2]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#113829]">
                          <Icon className="h-3.5 w-3.5 text-[#0F7B55]" />
                          {t(acc.roleKey)}
                        </div>
                        <span className="text-[11px] font-medium text-[#5A635D]">{acc.name}</span>
                      </div>
                      <div className="mt-1.5 truncate font-mono text-[11px] text-[#181C19]">
                        {acc.email}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#5A635D]">{acc.scope}</div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 pt-2 border-t border-[#EFEFEA]">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleFillCredentials(acc.email, acc.password)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#181C19] hover:border-[#113829] disabled:opacity-50"
                      >
                        <Copy className="h-3 w-3" />
                        {t('authFillBtn')}
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleQuickTrialLogin(acc.role)}
                        className="flex-1 rounded-md bg-[#113829] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#164835] disabled:opacity-50 whitespace-nowrap"
                      >
                        {t('authQuickEnterBtn')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-[#5A635D]">
          Demo accounts use clearly labeled sample municipal data and are not real government
          officials.
        </div>
      </div>
    </div>
  );
}
