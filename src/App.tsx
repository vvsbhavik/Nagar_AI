import {
  ArrowLeftRight,
  Bell,
  Bot,
  Building2,
  FileText,
  Globe,
  HardHat,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu,
  Plus,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthPage } from './components/AuthPage.tsx';
import { CitizenDashboard } from './components/CitizenDashboard.tsx';
import { CivicAssistant } from './components/CivicAssistant.tsx';
import { ComplaintDetailView } from './components/ComplaintDetailView.tsx';
import { FieldOfficerDashboard } from './components/FieldOfficerDashboard.tsx';
import { PublicDashboard } from './components/PublicDashboard.tsx';
import { ReportIssueView } from './components/ReportIssueView.tsx';
import { WardRepDashboard } from './components/WardRepDashboard.tsx';
import { api, formatRelativeTime, setAuthToken, type MetaPayload } from './lib/api.ts';
import { LanguageToggle, useI18n } from './lib/i18n.tsx';
import type { NotificationItem, UserProfile, UserRole } from './shared/types.ts';

type AppView =
  | 'public_portal'
  | 'auth'
  | 'citizen_home'
  | 'citizen_complaints'
  | 'report_issue'
  | 'ward_dashboard'
  | 'admin_dashboard'
  | 'field_dashboard'
  | 'assistant'
  | 'complaint_detail';

interface ToastState {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export default function App() {
  const { t } = useI18n();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [view, setView] = useState<AppView>('public_portal');
  const [previousView, setPreviousView] = useState<AppView>('public_portal');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  };

  const refreshMeta = async () => {
    const m = await api.getMeta();
    setMeta(m);
  };

  const refreshNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch {
      setNotifications([]);
    }
  };

  // Start directly on the Public Website & Open Transparency Portal (no auto demo login)
  useEffect(() => {
    (async () => {
      try {
        const m = await api.getMeta();
        setMeta(m);
      } catch {
        const { clientFallbackEngine } = await import('./lib/clientFallbackEngine.ts');
        setMeta(clientFallbackEngine.getMeta());
      } finally {
        setView('public_portal');
        setInitializing(false);
      }
    })();
  }, []);

  const getDefaultViewForRole = (role: UserRole | null): AppView => {
    if (role === 'citizen') return 'citizen_home';
    if (role === 'ward_rep') return 'ward_dashboard';
    if (role === 'municipal_admin') return 'admin_dashboard';
    if (role === 'field_officer') return 'field_dashboard';
    return 'public_portal';
  };

  const getRoleLabel = (role: UserRole): string => {
    if (role === 'citizen') return t('roleCitizen');
    if (role === 'ward_rep') return t('roleWardRep');
    if (role === 'field_officer') return t('roleFieldOfficer');
    if (role === 'municipal_admin') return t('roleMunicipalAdmin');
    return t('rolePublicObserver');
  };

  const handleAuthenticated = async (token: string, profile: UserProfile) => {
    setAuthToken(token);
    setUser(profile);
    setSelectedComplaintId(null);
    setView(getDefaultViewForRole(profile.role));
    await refreshNotifications();
    showToast(`Signed in as ${profile.fullName} (${getRoleLabel(profile.role)})`, 'success');
  };

  const handleSignOut = async () => {
    setMobileNavOpen(false);
    setNotifOpen(false);
    try {
      if (user) await api.logout();
    } catch {
      /* ignore */
    }
    setAuthToken(null);
    setUser(null);
    setNotifications([]);
    setSelectedComplaintId(null);
    setView('public_portal');
    showToast('Signed out. Viewing Public Transparency Portal.', 'info');
  };

  const openAuthPage = () => {
    setMobileNavOpen(false);
    setAssistantDrawerOpen(false);
    setNotifOpen(false);
    if (view !== 'auth') {
      setPreviousView(view);
    }
    setView('auth');
  };

  const openComplaint = (id: string) => {
    if (view !== 'complaint_detail') {
      setPreviousView(view);
    }
    setSelectedComplaintId(id);
    setView('complaint_detail');
    setAssistantDrawerOpen(false);
    setNotifOpen(false);
  };

  const scrollToPublicSection = (sectionId: string) => {
    setSelectedComplaintId(null);
    setView('public_portal');
    window.setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeRole: UserRole = user?.role ?? 'public_observer';

  const navItems: Array<{
    id: AppView;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
  }> = [
    {
      id: 'citizen_home',
      label: t('navCitizenOverview'),
      icon: LayoutDashboard,
      visible: activeRole === 'citizen',
    },
    {
      id: 'report_issue',
      label: t('navReportIssue'),
      icon: Plus,
      visible: activeRole === 'citizen' || activeRole === 'municipal_admin',
    },
    {
      id: 'citizen_complaints',
      label: t('navMyComplaints'),
      icon: FileText,
      visible: activeRole === 'citizen',
    },
    {
      id: 'ward_dashboard',
      label: t('navWardOps'),
      icon: UserCheck,
      visible: activeRole === 'ward_rep' || activeRole === 'municipal_admin',
    },
    {
      id: 'field_dashboard',
      label: t('navFieldTasks'),
      icon: HardHat,
      visible: activeRole === 'field_officer' || activeRole === 'municipal_admin',
    },
    {
      id: 'admin_dashboard',
      label: t('navCommandCenter'),
      icon: Building2,
      visible: activeRole === 'municipal_admin',
    },
    {
      id: 'public_portal',
      label: t('navPublicPortal'),
      icon: Globe,
      visible: Boolean(user),
    },
    {
      id: 'assistant',
      label: t('navAiAssistant'),
      icon: Bot,
      visible: Boolean(user),
    },
  ];

  const breadcrumbLabel: Record<AppView, string> = {
    public_portal: `${t('navPublicPortal')} / ${t('navLiveMap')}`,
    auth: t('signIn'),
    citizen_home: `${t('roleCitizen')} / ${t('navCitizenOverview')}`,
    citizen_complaints: `${t('roleCitizen')} / ${t('navMyComplaints')}`,
    report_issue: `${t('roleCitizen')} / ${t('navReportIssue')}`,
    ward_dashboard: `${t('roleWardRep')} / ${t('navWardOps')}`,
    admin_dashboard: `${t('roleMunicipalAdmin')} / ${t('navCommandCenter')}`,
    field_dashboard: `${t('roleFieldOfficer')} / ${t('navFieldTasks')}`,
    assistant: `${t('civicIntelligence')} / ${t('navAiAssistant')}`,
    complaint_detail: 'Accountable Record / Detail View',
  };

  if (initializing || !meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F4]">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#113829] font-display text-lg font-bold text-white">
            N
          </div>
          <div className="mt-3 font-display text-base font-bold text-[#181C19]">NagarAI</div>
          <div className="mt-1 text-xs text-[#5A635D]">
            Loading geospatial wards &amp; public transparency ledger...
          </div>
        </div>
      </div>
    );
  }

  // Dedicated Full-Page Sign-In & Registration Experience
  if (view === 'auth') {
    return (
      <>
        <AuthPage
          wards={meta.wards}
          onBackToPublic={() => {
            setView(user ? getDefaultViewForRole(user.role) : 'public_portal');
          }}
          onAuthenticated={handleAuthenticated}
        />
        {toast && (
          <div className="fixed bottom-5 right-5 z-[1100] max-w-sm rounded-lg border border-[#E4E4DD] bg-[#113829] px-4 py-3 text-xs font-medium text-white shadow-lg">
            <div className="flex items-center gap-2">
              <MapIcon className="h-3.5 w-3.5 shrink-0 text-[#6EE7B7]" />
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </>
    );
  }

  // PUBLIC WEBSITE SHELL (No Sidebar — Clean 3-Zone Top Navigation Bar)
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F7F7F4] text-[#181C19]">
        <header className="sticky top-0 z-[500] border-b border-[#E4E4DD] bg-white/95 backdrop-blur-xs">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            {/* Zone 1: Brand Wordmark */}
            <button
              type="button"
              onClick={() => scrollToPublicSection('overview')}
              className="flex items-center gap-2.5 text-left shrink-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#113829] font-display text-sm font-extrabold text-white">
                N
              </div>
              <div>
                <div className="font-display text-base font-bold leading-none tracking-tight text-[#113829]">
                  {t('brandName')}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-[#5A635D]">
                  {t('civicIntelligence')}
                </div>
              </div>
            </button>

            {/* Zone 2: Center Links */}
            <nav className="hidden items-center gap-6 md:flex">
              {[
                { id: 'overview', label: t('navOverview') },
                { id: 'live-map', label: t('navLiveMap') },
                { id: 'ward-index', label: t('navWardIndex') },
                { id: 'resolutions', label: t('navResolutions') },
              ].map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollToPublicSection(link.id)}
                  className="text-sm font-medium text-[#344038] transition-colors hover:text-[#0F7B55] whitespace-nowrap"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Zone 3: Language Globe Toggle + Civic AI + Sign In */}
            <div className="flex items-center gap-2.5 shrink-0">
              <LanguageToggle />
              <button
                type="button"
                onClick={() => setAssistantDrawerOpen((v) => !v)}
                className="hidden items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] sm:inline-flex whitespace-nowrap"
              >
                <Bot className="h-3.5 w-3.5 text-[#0F7B55]" />
                <span>Civic AI</span>
              </button>
              <button
                type="button"
                onClick={openAuthPage}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#113829] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#164835] whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                {t('signIn')}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 lg:px-8">
          {view === 'complaint_detail' && selectedComplaintId ? (
            <ComplaintDetailView
              complaintId={selectedComplaintId}
              user={null}
              meta={meta}
              onBack={() => setView('public_portal')}
              onSelectComplaint={openComplaint}
              onToast={showToast}
            />
          ) : view === 'assistant' ? (
            <div className="mx-auto max-w-4xl">
              <CivicAssistant
                embedded
                focusedComplaintId={selectedComplaintId || undefined}
                onSelectTrackingCode={(code) => openComplaint(code)}
              />
            </div>
          ) : (
            <PublicDashboard
              onSelectComplaint={openComplaint}
              onOpenAuth={openAuthPage}
              onOpenAssistant={() => setAssistantDrawerOpen(true)}
              isSignedIn={false}
            />
          )}
        </main>

        <footer className="border-t border-[#E4E4DD] bg-white py-5 text-xs text-[#5A635D]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="font-medium text-[#181C19]">
              NagarAI · {t('tagline')}
            </div>
            <div>{t('demoDatasetBadge')}</div>
          </div>
        </footer>

        {assistantDrawerOpen && (
          <div className="fixed inset-y-0 right-0 z-[800] w-full max-w-md shadow-2xl">
            <CivicAssistant
              focusedComplaintId={
                view === 'complaint_detail' && selectedComplaintId ? selectedComplaintId : undefined
              }
              onSelectTrackingCode={(code) => openComplaint(code)}
              onClose={() => setAssistantDrawerOpen(false)}
            />
          </div>
        )}

        {toast && (
          <div className="fixed bottom-5 right-5 z-[1100] max-w-sm rounded-lg border border-[#E4E4DD] bg-[#113829] px-4 py-3 text-xs font-medium text-white shadow-lg">
            <div className="flex items-center gap-2">
              <MapIcon className="h-3.5 w-3.5 shrink-0 text-[#6EE7B7]" />
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // AUTHENTICATED WORKSPACE SHELL (Crisp White Sidebar + Deep Forest Green Active States)
  const visibleNavItems = navItems.filter((n) => n.visible);

  return (
    <div className="flex min-h-screen bg-[#F7F7F4] text-[#181C19]">
      {/* Sleek Light Desktop Sidebar */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[#E4E4DD] bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-[#E4E4DD] px-5">
          <button
            type="button"
            onClick={() => {
              setSelectedComplaintId(null);
              setView(getDefaultViewForRole(user.role));
            }}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#113829] font-display text-sm font-extrabold text-white">
              N
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-tight text-[#113829]">
                {t('brandName')}
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-[#5A635D]">
                {getRoleLabel(user.role)}
              </div>
            </div>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-[#7A847D]">Workspace</div>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedComplaintId(null);
                  setView(item.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#113829] text-white'
                    : 'text-[#344038] hover:bg-[#F3F4EF] hover:text-[#113829]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#6EE7B7]' : 'text-[#5A635D]'}`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Clean Authenticated User Account Footer */}
        <div className="border-t border-[#E4E4DD] p-3.5">
          <div className="rounded-xl border border-[#EFEFEA] bg-[#FAFAF8] p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#113829] font-mono text-xs font-bold text-white">
                {user.avatarInitials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-[#181C19]">{user.fullName}</div>
                <div className="truncate text-[11px] text-[#0F7B55]">{getRoleLabel(user.role)}</div>
              </div>
            </div>
            {(user.wardName || user.departmentName) && (
              <div className="mt-2 truncate border-t border-[#EFEFEA] pt-2 text-[11px] text-[#5A635D]">
                {user.wardName || user.departmentName}
              </div>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={openAuthPage}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#D8DAD2] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#181C19] transition-colors hover:border-[#113829]"
              >
                <ArrowLeftRight className="h-3 w-3" />
                {t('switchAccount')}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#D8DAD2] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2]"
              >
                <LogOut className="h-3 w-3" />
                {t('signOut')}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[900] flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative flex w-72 flex-col bg-white p-4 text-[#181C19] shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#E4E4DD] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#113829] font-display text-xs font-extrabold text-white">
                  N
                </div>
                <span className="font-display text-base font-bold text-[#113829]">
                  {t('brandName')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded p-1 text-[#5A635D] hover:bg-[#F3F4EF]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedComplaintId(null);
                      setView(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      active ? 'bg-[#113829] text-white' : 'text-[#344038] hover:bg-[#F3F4EF]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[#6EE7B7]' : 'text-[#5A635D]'}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 border-t border-[#E4E4DD] pt-4">
              <div className="text-xs font-bold text-[#181C19]">{user.fullName}</div>
              <div className="text-[11px] text-[#5A635D]">{user.email}</div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={openAuthPage}
                  className="rounded-lg border border-[#D8DAD2] py-2 text-xs font-semibold text-[#181C19]"
                >
                  {t('switchAccount')}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] py-2 text-xs font-semibold text-[#B91C1C]"
                >
                  {t('signOut')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean Single-Row Top Header Bar */}
        <header className="sticky top-0 z-[500] flex h-14 items-center justify-between gap-4 border-b border-[#E4E4DD] bg-white/95 px-4 backdrop-blur-xs lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-1.5 text-[#181C19] hover:bg-[#F7F7F4] lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-xs font-medium text-[#5A635D]">
              <span className="font-display font-bold text-[#113829] lg:hidden">NagarAI · </span>
              {breadcrumbLabel[view]}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <LanguageToggle compact />

            <button
              type="button"
              onClick={() => setAssistantDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] whitespace-nowrap"
            >
              <Bot className="h-3.5 w-3.5 text-[#0F7B55]" />
              <span className="hidden sm:inline">Civic AI</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={async () => {
                  setNotifOpen((o) => !o);
                  if (!notifOpen) await refreshNotifications();
                }}
                className="relative rounded-lg border border-[#D8DAD2] bg-white p-1.5 text-[#181C19] hover:border-[#113829]"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 font-mono text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#E4E4DD] bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-[#EFEFEA] px-4 py-3">
                    <span className="text-xs font-bold text-[#181C19]">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.markAllNotificationsRead();
                          await refreshNotifications();
                        }}
                        className="text-[11px] font-semibold text-[#0F7B55] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 divide-y divide-[#EFEFEA] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#5A635D]">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (n.complaintId) openComplaint(n.complaintId);
                            setNotifOpen(false);
                          }}
                          className={`block w-full px-4 py-3 text-left hover:bg-[#F7F7F4] ${
                            !n.isRead ? 'bg-[#F2F8F5]/60' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#181C19]">
                            <span className="truncate">{n.title}</span>
                            <span className="shrink-0 font-mono text-[10px] font-normal text-[#5A635D]">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-[#5A635D]">{n.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Viewport Content */}
        <main className="flex-1 px-4 py-6 lg:px-8">
          {view === 'citizen_home' && (
            <CitizenDashboard
              mode="overview"
              user={user}
              meta={meta}
              onReportIssue={() => setView('report_issue')}
              onSelectComplaint={openComplaint}
              onOpenAssistant={() => setAssistantDrawerOpen(true)}
            />
          )}

          {view === 'citizen_complaints' && (
            <CitizenDashboard
              mode="complaints"
              user={user}
              meta={meta}
              onReportIssue={() => setView('report_issue')}
              onSelectComplaint={openComplaint}
              onOpenAssistant={() => setAssistantDrawerOpen(true)}
            />
          )}

          {view === 'report_issue' && (
            <ReportIssueView
              meta={meta}
              onCancel={() =>
                setView(user.role === 'municipal_admin' ? 'admin_dashboard' : 'citizen_home')
              }
              onSubmitted={(created) => {
                refreshNotifications();
                openComplaint(created.id);
              }}
              onToast={showToast}
            />
          )}

          {view === 'ward_dashboard' && (
            <WardRepDashboard
              user={user}
              meta={meta}
              onSelectComplaint={openComplaint}
              onToast={showToast}
            />
          )}

          {view === 'admin_dashboard' && (
            <AdminDashboard
              meta={meta}
              onRefreshMeta={refreshMeta}
              onSelectComplaint={openComplaint}
              onToast={showToast}
            />
          )}

          {view === 'field_dashboard' && (
            <FieldOfficerDashboard
              user={user}
              meta={meta}
              onSelectComplaint={openComplaint}
            />
          )}

          {view === 'public_portal' && (
            <PublicDashboard
              onSelectComplaint={openComplaint}
              onOpenAuth={openAuthPage}
              onOpenAssistant={() => setAssistantDrawerOpen(true)}
              isSignedIn={true}
            />
          )}

          {view === 'assistant' && (
            <div className="mx-auto max-w-4xl">
              <CivicAssistant
                embedded
                focusedComplaintId={selectedComplaintId || undefined}
                onSelectTrackingCode={(code) => openComplaint(code)}
              />
            </div>
          )}

          {view === 'complaint_detail' && selectedComplaintId && (
            <ComplaintDetailView
              complaintId={selectedComplaintId}
              user={user}
              meta={meta}
              onBack={() => setView(previousView)}
              onSelectComplaint={openComplaint}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Slide-Over AI Civic Assistant Drawer */}
      {assistantDrawerOpen && (
        <div className="fixed inset-y-0 right-0 z-[800] w-full max-w-md shadow-2xl">
          <CivicAssistant
            focusedComplaintId={
              view === 'complaint_detail' && selectedComplaintId ? selectedComplaintId : undefined
            }
            onSelectTrackingCode={(code) => openComplaint(code)}
            onClose={() => setAssistantDrawerOpen(false)}
          />
        </div>
      )}

      {/* Clean Toast Feedback */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[1100] max-w-sm rounded-lg border border-[#E4E4DD] bg-[#113829] px-4 py-3 text-xs font-medium text-white shadow-lg">
          <div className="flex items-center gap-2">
            <MapIcon className="h-3.5 w-3.5 shrink-0 text-[#6EE7B7]" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
