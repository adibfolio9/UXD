import { useEffect, useState } from 'react';
import { ArrowRight, Bell, X } from 'lucide-react';
import { LeadNotification } from '../types';
import { CandidateAvatar } from './CandidateAvatar';

interface NewLeadToastProps {
  notification: LeadNotification | null;
  queueCount: number;
  onViewLead: (candidateId: string, notificationId: string) => void;
  onDismiss: () => void;
}

export function NewLeadToast({
  notification,
  queueCount,
  onViewLead,
  onDismiss,
}: NewLeadToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!notification || paused) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [notification, paused, onDismiss]);

  if (!notification) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="fixed bottom-5 right-5 z-40 w-[min(92vw,376px)] rounded-2xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.14)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#0071E3] dark:text-[#2997FF]">
          <Bell className="w-3.5 h-3.5 shrink-0" />
          <span>
            {queueCount > 1 ? `New Lead Received (+${queueCount - 1} more)` : 'New Lead Received'}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="p-1 -m-1 rounded-md text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <CandidateAvatar name={notification.candidateName} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
            {notification.candidateName}
          </div>
          <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate">
            {notification.candidateCode}
            {notification.experience ? ` · ${notification.experience}` : ''}
            {notification.designedAiProduct ? ` · AI: ${notification.designedAiProduct}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-8 px-3 rounded-lg text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors whitespace-nowrap"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => onViewLead(notification.candidateId, notification.id)}
          className="h-8 px-3 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <span>View Lead</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
