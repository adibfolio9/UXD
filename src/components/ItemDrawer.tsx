import { useEffect, useState } from 'react';
import { ExternalLink, Globe, Search, Trash2, X } from 'lucide-react';
import {
  PriorityLevel,
  Project,
  StatusDefinition,
  TaskItem,
  TeamMember,
} from '../types';
import {
  CandidateGroundingFocus,
  SearchGroundingResult,
  searchCandidateGrounding,
} from '../services/searchGrounding';
import {
  PRIORITY_LABELS,
  formatShortDate,
  isExternalUrlValue,
  sanitizeExternalUrl,
} from '../utils/statusStyles';
import { Avatar } from './Avatar';
import { CandidateAvatar } from './CandidateAvatar';
import { SearchGroundingResultPanel } from './SearchGroundingBlock';
import { StatusIcon } from './StatusIcon';

interface ItemDrawerProps {
  task: TaskItem | null;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  onClose: () => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskItem>) => void;
  onChangeStatus: (taskId: string, targetStatusId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const PRIORITIES: PriorityLevel[] = ['urgent', 'high', 'medium', 'low'];

export function ItemDrawer({
  task,
  statuses,
  projects,
  members,
  onClose,
  onUpdateTask,
  onChangeStatus,
  onDeleteTask,
}: ItemDrawerProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingQuestion, setGroundingQuestion] = useState('');
  const [activeFocus, setActiveFocus] = useState<CandidateGroundingFocus | null>(null);
  const [groundingCache, setGroundingCache] = useState<Record<string, SearchGroundingResult>>({});

  useEffect(() => {
    setConfirmingDelete(false);
    setGroundingError(null);
    setGroundingQuestion('');
    setActiveFocus(null);
  }, [task?.id]);

  if (!task) return null;

  const activeCacheKey = activeFocus ? `${task.id}:${activeFocus}` : null;
  const activeGroundingResult = activeCacheKey ? groundingCache[activeCacheKey] ?? null : null;

  const runCandidateSearch = async (
    focus: CandidateGroundingFocus,
    customQuestion?: string
  ) => {
    setActiveFocus(focus);
    setGroundingError(null);
    setGroundingLoading(true);
    try {
      const res = await searchCandidateGrounding({
        task,
        focus,
        customQuestion,
      });
      setGroundingCache((prev) => ({
        ...prev,
        [`${task.id}:${focus}`]: res,
      }));
    } catch (err) {
      setGroundingError(
        err instanceof Error ? err.message : 'Unable to run Google Search verification.'
      );
    } finally {
      setGroundingLoading(false);
    }
  };

  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const currentStatus = sortedStatuses.find((s) => s.id === task.statusId);
  const currentOwner = members.find((m) => m.id === task.assigneeId) ?? members[0];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Candidate profile for ${task.fullName}`}
    >
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-2xl bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border-l border-black/[0.08] dark:border-white/[0.12] h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-14 px-6 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 text-sm min-w-0">
            <span className="font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] shrink-0">
              {task.code}
            </span>
            <span className="text-[#D2D2D7] dark:text-[#38383A]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-xs tabular-nums text-[#86868B] truncate">
              {task.timestamp}
            </span>
            {currentStatus && (
              <>
                <span className="text-[#D2D2D7] dark:text-[#38383A]" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-[#1D1D1F] dark:text-[#F5F5F7] shrink-0">
                  <StatusIcon
                    category={currentStatus.category}
                    color={currentStatus.color}
                    className="w-4 h-4"
                  />
                  <span>{currentStatus.name}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {confirmingDelete ? (
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTask(task.id);
                    onClose();
                  }}
                  className="h-8 px-3 rounded-lg bg-[#D70015] dark:bg-[#FF453A] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete row"
                title="Delete row"
                className="p-2 rounded-lg text-[#86868B] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-[#FF3B30]/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="p-2 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Full Name */}
          <div className="flex items-center gap-3.5">
            <CandidateAvatar name={task.fullName} size="lg" />
            <div className="flex-1 min-w-0 space-y-1">
              <label
                htmlFor="drawer-fullname"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Full name
              </label>
              <input
                id="drawer-fullname"
                type="text"
                value={task.fullName}
                onChange={(e) => onUpdateTask(task.id, { fullName: e.target.value })}
                className="w-full text-xl font-display font-semibold tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7] bg-transparent border border-transparent hover:border-black/[0.10] dark:hover:border-white/[0.12] focus:border-[#0071E3] rounded-xl px-2.5 py-1.5 -mx-2.5 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Arrange Status Quick Selector */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
              Arrange Status
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortedStatuses.map((status) => {
                const isSelected = task.statusId === status.id;
                return (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => onChangeStatus(task.id, status.id)}
                    className={`px-3 py-2.5 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                      isSelected
                        ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                        : 'border-black/[0.08] dark:border-white/[0.10] bg-[#FBFBFD] dark:bg-[#2C2C2E]/60 text-[#1D1D1F] dark:text-[#E5E5EA] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E]'
                    }`}
                  >
                    <StatusIcon
                      category={status.category}
                      color={status.color}
                      className="w-3.5 h-3.5"
                    />
                    <span className="truncate">{status.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* All 13 Form Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-black/[0.08] dark:border-white/[0.10]">
            <div className="space-y-1.5">
              <label
                htmlFor="drawer-email"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Email ID
              </label>
              <input
                id="drawer-email"
                type="email"
                value={task.email}
                onChange={(e) => onUpdateTask(task.id, { email: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-contact"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Contact No / Whatsapp
              </label>
              <input
                id="drawer-contact"
                type="text"
                value={task.contactNo}
                onChange={(e) => onUpdateTask(task.id, { contactNo: e.target.value })}
                className="w-full h-9 px-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="drawer-portfolio"
                  className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
                >
                  Share your portfolio URL
                </label>
                {isExternalUrlValue(task.portfolioUrl) && (
                  <a
                    href={sanitizeExternalUrl(task.portfolioUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#0071E3] dark:text-[#2997FF] hover:underline"
                  >
                    <span>Open Portfolio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                id="drawer-portfolio"
                type="text"
                value={task.portfolioUrl}
                onChange={(e) => onUpdateTask(task.id, { portfolioUrl: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-location"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Current Location
              </label>
              <input
                id="drawer-location"
                type="text"
                value={task.currentLocation}
                onChange={(e) => onUpdateTask(task.id, { currentLocation: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-exp"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Years of Experience do you have?
              </label>
              <input
                id="drawer-exp"
                type="text"
                value={task.yearsOfExperience}
                onChange={(e) => onUpdateTask(task.id, { yearsOfExperience: e.target.value })}
                className="w-full h-9 px-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="drawer-ai"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Have you designed an AI-powered product or feature?
              </label>
              <input
                id="drawer-ai"
                type="text"
                value={task.designedAiProduct}
                onChange={(e) => onUpdateTask(task.id, { designedAiProduct: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-notice"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                What is your notice period?
              </label>
              <input
                id="drawer-notice"
                type="text"
                value={task.noticePeriod}
                onChange={(e) => onUpdateTask(task.id, { noticePeriod: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="drawer-resume"
                  className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
                >
                  Upload Resume
                </label>
                {isExternalUrlValue(task.resumeUrl) && (
                  <a
                    href={sanitizeExternalUrl(task.resumeUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#0071E3] dark:text-[#2997FF] hover:underline"
                  >
                    <span>Open Resume</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                id="drawer-resume"
                type="text"
                value={task.resumeUrl}
                onChange={(e) => onUpdateTask(task.id, { resumeUrl: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-salary"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Expected Salary
              </label>
              <input
                id="drawer-salary"
                type="text"
                value={task.expectedSalary}
                onChange={(e) => onUpdateTask(task.id, { expectedSalary: e.target.value })}
                className="w-full h-9 px-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-relocate"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Ready to relocate in
              </label>
              <input
                id="drawer-relocate"
                type="text"
                value={task.readyToRelocateIn}
                onChange={(e) => onUpdateTask(task.id, { readyToRelocateIn: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="drawer-message"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Any Message
              </label>
              <textarea
                id="drawer-message"
                rows={3}
                value={task.message}
                onChange={(e) => onUpdateTask(task.id, { message: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3] resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-project"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Role / Track
              </label>
              <select
                id="drawer-project"
                value={task.projectId}
                onChange={(e) => onUpdateTask(task.id, { projectId: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drawer-priority"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Priority
              </label>
              <select
                id="drawer-priority"
                value={task.priority}
                onChange={(e) =>
                  onUpdateTask(task.id, { priority: e.target.value as PriorityLevel })
                }
                className="w-full h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="drawer-owner"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Reviewer
              </label>
              <div className="flex items-center gap-2">
                <Avatar member={currentOwner} size="sm" />
                <select
                  id="drawer-owner"
                  value={task.assigneeId}
                  onChange={(e) => onUpdateTask(task.id, { assigneeId: e.target.value })}
                  className="flex-1 h-9 px-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Google Search Grounding */}
          <div className="pt-4 border-t border-black/[0.08] dark:border-white/[0.10] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF]" />
                <h3 className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Live Web &amp; Market Grounding
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#86868B]">
                Google Search · Gemini 4 Hydrogen
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={groundingLoading}
                onClick={() => void runCandidateSearch('web_profile')}
                className={`h-8 px-3 rounded-[10px] border text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  activeFocus === 'web_profile'
                    ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                    : 'border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C]'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Verify Web &amp; Portfolio</span>
              </button>

              <button
                type="button"
                disabled={groundingLoading}
                onClick={() => void runCandidateSearch('comp_benchmark')}
                className={`h-8 px-3 rounded-[10px] border text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  activeFocus === 'comp_benchmark'
                    ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                    : 'border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C]'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Benchmark Salary</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = groundingQuestion.trim();
                if (!clean || groundingLoading) return;
                void runCandidateSearch('custom', clean);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={groundingQuestion}
                onChange={(e) => setGroundingQuestion(e.target.value)}
                placeholder={`Ask Google Search about ${task.fullName} or ${task.currentLocation || 'role market'}...`}
                aria-label="Ask Google Search about this candidate"
                className="flex-1 h-9 px-3 text-xs rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
              <button
                type="submit"
                disabled={groundingLoading || !groundingQuestion.trim()}
                className="h-9 px-3.5 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-45 text-xs font-medium text-white transition-colors shrink-0"
              >
                Search
              </button>
            </form>

            <SearchGroundingResultPanel
              result={activeGroundingResult}
              loading={groundingLoading}
              error={groundingError}
              emptyHint="Run a live Google Search check to verify public portfolio links, design footprint, or 2026 compensation benchmarks."
            />
          </div>

          {/* Status Transition History */}
          <div className="pt-4 border-t border-black/[0.08] dark:border-white/[0.10] space-y-2.5">
            <h3 className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
              Status Transition Log
            </h3>
            {task.statusHistory.length === 0 ? (
              <p className="text-xs text-[#86868B]">
                No status transitions recorded yet.
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {task.statusHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] last:border-b-0"
                  >
                    <span className="text-[#6E6E73] dark:text-[#A1A1A6]">
                      {entry.fromStatusName} →{' '}
                      <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                        {entry.toStatusName}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[#86868B] shrink-0">
                      {formatShortDate(entry.changedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
