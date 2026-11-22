import {
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
  Shield,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CitizenDashboard } from './components/CitizenDashboard.tsx';
import { CivicAssistant } from './components/CivicAssistant.tsx';
import { ComplaintDetailView } from './components/ComplaintDetailView.tsx';
import { FieldOfficerDashboard } from './components/FieldOfficerDashboard.tsx';
import { PublicDashboard } from './components/PublicDashboard.tsx';
import { ReportIssueView } from './components/ReportIssueView.tsx';
import { WardRepDashboard } from './components/WardRepDashboard.tsx';
import { api, formatRelativeTime, setAuthToken, type MetaPayload } from './lib/api.ts';
import type { NotificationItem, UserProfile, UserRole } from './shared/types.ts';

type AppView =
  | 'citizen_home'
  | 'citizen_complaints'
  | 'report_issue'
  | 'ward_dashboard'
  | 'admin_dashboard'
  | 'field_dashboard'
  | 'public_portal'
  | 'assistant'
  | 'complaint_detail';

interface ToastState {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [view, setView] = useState<AppView>('citizen_home');
  const [previousView, setPreviousView] = useState<AppView>('citizen_home');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
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

  // Bootstrap metadata and default Demo Citizen session so Primary Demo works seamlessly
  useEffect(() => {
    (async () => {
      try {
        const [m, demoSession] = await Promise.all([
          api.getMeta(),
          api.demoLogin('citizen'),
        ]);
        setMeta(m);
        setAuthToken(demoSession.token);
        setUser(demoSession.user);
        setView('citizen_home');
        const nRes = await api.getNotifications();
        setNotifications(nRes.notifications);
      } catch {
        // Fallback cleanly to Public Transparency Portal
        try {
          const m = await api.getMeta();
          setMeta(m);
        } catch {
          /* handled below */
        }
        setView('public_portal');
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const handleAuthenticated = async (token: string, profile: UserProfile) => {
    setAuthToken(token);
    setUser(profile);
    if (profile.role === 'citizen') setView('citizen_home');
    else if (profile.role === 'ward_rep') setView('ward_dashboard');
    else if (profile.role === 'municipal_admin') setView('admin_dashboard');
    else if (profile.role === 'field_officer') setView('field_dashboard');
    setSelectedComplaintId(null);
    await refreshNotifications();
    showToast(`Switched workspace to ${profile.fullName}`, 'success');
  };

  const handleQuickRoleSwitch = async (role: UserRole) => {
    setMobileNavOpen(false);
    if (role === 'public_observer') {
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
      showToast('Viewing Public Transparency Portal (no login required)', 'info');
      return;
    }

    try {
      const res = await api.demoLogin(role);
      await handleAuthenticated(res.token, res.user);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Role switch failed.', 'error');
    }
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
      label: 'Citizen Overview',
      icon: LayoutDashboard,
      visible: activeRole === 'citizen',
    },
    {
      id: 'report_issue',
      label: 'Report an Issue',
      icon: Plus,
      visible: activeRole === 'citizen' || activeRole === 'municipal_admin',
    },
    {
      id: 'citizen_complaints',
      label: 'My Complaints',
      icon: FileText,
      visible: activeRole === 'citizen',
    },
    {
      id: 'ward_dashboard',
      label: 'Ward Operations',
      icon: UserCheck,
      visible: activeRole === 'ward_rep' || activeRole === 'municipal_admin',
    },
    {
      id: 'field_dashboard',
      label: 'Field Tasks',
      icon: HardHat,
      visible: activeRole === 'field_officer' || activeRole === 'municipal_admin',
    },
    {
      id: 'admin_dashboard',
      label: 'Command Center',
      icon: Building2,
      visible: activeRole === 'municipal_admin',
    },
    {
      id: 'public_portal',
      label: 'Public Map & Portal',
      icon: Globe,
      visible: true,
    },
    {
      id: 'assistant',
      label: 'AI Civic Assistant',
      icon: Bot,
      visible: true,
    },
  ];

  const breadcrumbLabel: Record<AppView, string> = {
    citizen_home: 'Citizen / Overview',
    citizen_complaints: 'Citizen / My Complaints',
    report_issue: 'Citizen / Report Civic Issue',
    ward_dashboard: 'Ward Representative / Operations',
    admin_dashboard: 'Municipal Admin / Command Center',
    field_dashboard: 'Field Operations / Assigned Tasks',
    public_portal: 'Public Transparency / Open Civic Map',
    assistant: 'Civic Intelligence / AI Assistant',
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
            Initializing geospatial wards &amp; civic intelligence workspace...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F7F4] text-[#181C19]">
      {/* Desktop Deep Forest Green Sidebar */}
      <aside className="hidden w-[256px] shrink-0 flex-col bg-[#113829] text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <button
            type="button"
            onClick={() =>
              setView(
                activeRole === 'citizen'
                  ? 'citizen_home'
                  : activeRole === 'ward_rep'
                  ? 'ward_dashboard'
                  : activeRole === 'municipal_admin'
                  ? 'admin_dashboard'
                  : activeRole === 'field_officer'
                  ? 'field_dashboard'
                  : 'public_portal'
              )
            }
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F7B55] font-display text-sm font-extrabold text-white">
              N
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-tight text-white">
                NagarAI
              </div>
              <div className="mt-1 text-[11px] text-white/65">Civic Intelligence</div>
            </div>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems
            .filter((n) => n.visible)
            .map((item) => {
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
                      ? 'bg-[#0F7B55] text-white'
                      : 'text-white/80 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        {/* Connected 5-Role Workspace Switcher */}
        <div className="border-t border-white/10 p-4">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-white/60">
            <span>Demo Role Switcher</span>
            <Shield className="h-3 w-3" />
          </div>
          <div className="space-y-1">
            {[
              { role: 'citizen' as UserRole, label: 'Citizen' },
              { role: 'ward_rep' as UserRole, label: 'Ward Representative' },
              { role: 'field_officer' as UserRole, label: 'Field Officer' },
              { role: 'municipal_admin' as UserRole, label: 'Municipal Admin' },
              { role: 'public_observer' as UserRole, label: 'Public Observer' },
            ].map((item) => (
              <button
                key={item.role}
                type="button"
                onClick={() => handleQuickRoleSwitch(item.role)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeRole === item.role
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {activeRole === item.role && (
                  <span className="font-mono text-[10px] text-[#6EE7B7]">Active</span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/60">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{user.fullName}</div>
                  <div className="truncate text-[10px] text-white/60">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('public_observer')}
                  className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                  title="Sign out to Public Observer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[900] flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative flex w-72 flex-col bg-[#113829] p-4 text-white shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-display text-base font-bold">NagarAI</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded p-1 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              {navItems
                .filter((n) => n.visible)
                .map((item) => {
                  const Icon = item.icon;
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
                        view === item.id ? 'bg-[#0F7B55] text-white' : 'text-white/80'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="mb-2 text-[11px] font-semibold text-white/60">
                Switch Connected Role
              </div>
              <div className="space-y-1">
                {(
                  [
                    ['citizen', 'Citizen'],
                    ['ward_rep', 'Ward Representative'],
                    ['field_officer', 'Field Officer'],
                    ['municipal_admin', 'Municipal Admin'],
                    ['public_observer', 'Public Observer'],
                  ] as Array<[UserRole, string]>
                ).map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleQuickRoleSwitch(role)}
                    className={`block w-full rounded px-2.5 py-1.5 text-left text-xs ${
                      activeRole === role ? 'bg-white/15 font-semibold text-white' : 'text-white/75'
                    }`}
                  >
                    {label}
                  </button>
                ))}
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

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setAssistantDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] whitespace-nowrap"
            >
              <Bot className="h-3.5 w-3.5 text-[#0F7B55]" />
              <span className="hidden sm:inline">Civic AI</span>
            </button>

            {user ? (
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
                              <span className="font-mono text-[10px] font-normal text-[#5A635D] shrink-0">
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
            ) : null}

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="rounded-lg bg-[#113829] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#164835] whitespace-nowrap"
            >
              {user ? `${user.avatarInitials} · Switch Account` : 'Sign In'}
            </button>
          </div>
        </header>

        {/* Active Viewport Content */}
        <main className="flex-1 px-4 py-6 lg:px-8">
          {view === 'citizen_home' && user && (
            <CitizenDashboard
              mode="overview"
              user={user}
              meta={meta}
              onReportIssue={() => setView('report_issue')}
              onSelectComplaint={openComplaint}
              onOpenAssistant={() => setAssistantDrawerOpen(true)}
            />
          )}

          {view === 'citizen_complaints' && user && (
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
              onCancel={() => setView(user?.role === 'municipal_admin' ? 'admin_dashboard' : 'citizen_home')}
              onSubmitted={(created) => {
                refreshNotifications();
                openComplaint(created.id);
              }}
              onToast={showToast}
            />
          )}

          {view === 'ward_dashboard' && user && (
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

          {view === 'field_dashboard' && user && (
            <FieldOfficerDashboard
              user={user}
              meta={meta}
              onSelectComplaint={openComplaint}
            />
          )}

          {view === 'public_portal' && (
            <PublicDashboard
              onSelectComplaint={openComplaint}
              onOpenAuth={() => setAuthModalOpen(true)}
              isSignedIn={Boolean(user)}
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
              view === 'complaint_detail' && selectedComplaintId
                ? selectedComplaintId
                : undefined
            }
            onSelectTrackingCode={(code) => openComplaint(code)}
            onClose={() => setAssistantDrawerOpen(false)}
          />
        </div>
      )}

      {/* Auth & Persona Modal */}
      {authModalOpen && (
        <AuthModal
          wards={meta.wards}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {/* Clean Toast Feedback */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[1100] max-w-sm rounded-lg border border-[#E4E4DD] bg-[#113829] px-4 py-3 text-xs font-medium text-white shadow-lg">
          <div className="flex items-center gap-2">
            <MapIcon className="h-3.5 w-3.5 text-[#6EE7B7] shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
