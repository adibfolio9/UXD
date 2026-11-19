import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LeadNotification } from '../types';
import { CandidateAvatar } from './CandidateAvatar';

interface NotificationCenterProps {
  notifications: LeadNotification[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  browserPermission: NotificationPermission | 'unsupported';
  onRequestBrowserPermission: () => void;
  onOpenCandidate: (candidateId: string, notificationId: string) => void;
  onToggleRead: (notificationId: string, nextRead: boolean) => void;
  onMarkAllRead: () => void;
  onClearRead: () => void;
  onOpenLeadForm: () => void;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationCenter({
  notifications,
  soundEnabled,
  onToggleSound,
  browserPermission,
  onRequestBrowserPermission,
  onOpenCandidate,
  onToggleRead,
  onMarkAllRead,
  onClearRead,
  onOpenLeadForm,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const readCount = notifications.length - unreadCount;

  const visibleNotifications = useMemo(
    () => (tab === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, tab]
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
        }
        aria-expanded={open}
        className={`relative inline-flex items-center justify-center h-9 min-w-9 px-2.5 gap-1.5 rounded-[10px] border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
          open
            ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.16] text-[#0071E3] dark:text-[#2997FF]'
            : 'border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E]'
        }`}
      >
        <Bell className="w-4 h-4 text-[#6E6E73] dark:text-[#A1A1A6]" />
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] text-white text-[11px] font-mono font-semibold tabular-nums leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Lead notifications"
          className="absolute right-0 mt-2 w-[min(92vw,390px)] rounded-2xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] shadow-[0_18px_48px_rgba(0,0,0,0.16)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.55)] overflow-hidden z-40"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                Lead Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="text-xs font-mono tabular-nums text-[#0071E3] dark:text-[#2997FF] font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'Mute sound chime' : 'Enable sound chime'}
                aria-label={soundEnabled ? 'Mute sound chime' : 'Enable sound chime'}
                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF]" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>

              {browserPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={onRequestBrowserPermission}
                  disabled={browserPermission === 'granted'}
                  title={
                    browserPermission === 'granted'
                      ? 'Desktop notifications active'
                      : browserPermission === 'denied'
                      ? 'Browser notifications blocked in browser site settings'
                      : 'Enable desktop notifications'
                  }
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    browserPermission === 'granted'
                      ? 'bg-[#28CD41]/12 text-[#17692C] dark:text-[#66E383] cursor-default'
                      : browserPermission === 'denied'
                      ? 'bg-[#FF3B30]/10 text-[#D70015] dark:text-[#FF453A]'
                      : 'bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#E5E5EA] dark:hover:bg-[#3A3A3C]'
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>
                    {browserPermission === 'granted'
                      ? 'Desktop On'
                      : browserPermission === 'denied'
                      ? 'Blocked'
                      : 'Desktop Alerts'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Filter & Batch Actions Bar */}
          <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 bg-[#FBFBFD] dark:bg-[#161617]">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E]">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'all'
                    ? 'bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('unread')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'unread'
                    ? 'bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              {readCount > 0 && (
                <button
                  type="button"
                  onClick={onClearRead}
                  className="text-[11px] font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#D70015] dark:hover:text-[#FF453A] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear read</span>
                </button>
              )}
            </div>
          </div>

          {/* Notification Rows */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {visibleNotifications.length === 0 ? (
              <div className="px-6 py-9 text-center space-y-3">
                <Bell className="w-7 h-7 text-[#86868B] mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {tab === 'unread' ? 'No unread lead alerts' : 'No lead notifications yet'}
                  </p>
                  <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                    Every new application submitted on your public form triggers an instant alert here.
                  </p>
                </div>
                {notifications.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenLeadForm();
                    }}
                    className="h-8 px-3 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-xs font-medium transition-colors"
                  >
                    Open Lead Form
                  </button>
                )}
              </div>
            ) : (
              visibleNotifications.map((item) => (
                <div
                  key={item.id}
                  className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                    item.read
                      ? 'bg-white dark:bg-[#1C1C1E] hover:bg-[#FBFBFD] dark:hover:bg-[#242426]'
                      : 'bg-[#0071E3]/[0.04] dark:bg-[#0A84FF]/[0.08] hover:bg-[#0071E3]/[0.08] dark:hover:bg-[#0A84FF]/[0.12]'
                  }`}
                >
                  <CandidateAvatar name={item.candidateName} size="sm" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenCandidate(item.candidateId, item.id);
                    }}
                    className="flex-1 min-w-0 text-left focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                        {item.candidateName}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-[#86868B] whitespace-nowrap shrink-0">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6] line-clamp-2 leading-snug">
                      {item.message}
                    </p>

                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#86868B] truncate">
                      <span>{item.candidateCode}</span>
                      {item.experience && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{item.experience}</span>
                        </>
                      )}
                      {item.candidateEmail && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans truncate">{item.candidateEmail}</span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleRead(item.id, !item.read)}
                    title={item.read ? 'Mark as unread' : 'Mark as read'}
                    aria-label={item.read ? 'Mark notification as unread' : 'Mark notification as read'}
                    className="mt-1 p-1.5 rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.08] shrink-0"
                  >
                    <span
                      className={`block w-2 h-2 rounded-full ${
                        item.read
                          ? 'border border-[#86868B]'
                          : 'bg-[#0071E3] dark:bg-[#0A84FF]'
                      }`}
                    />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
