import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  GripVertical,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  PriorityLevel,
  Project,
  StatusDefinition,
  TaskItem,
  TeamMember,
} from '../types';
import {
  PRIORITY_LABELS,
  PRIORITY_TEXT_CLASSES,
  getStatusColorMeta,
  isExternalUrlValue,
  sanitizeExternalUrl,
} from '../utils/statusStyles';
import { Avatar } from './Avatar';
import { CandidateAvatar } from './CandidateAvatar';
import { StatusIcon } from './StatusIcon';

interface BoardViewProps {
  statuses: StatusDefinition[];
  tasks: TaskItem[];
  projects: Project[];
  members: TeamMember[];
  priorityFilter: PriorityLevel | 'all';
  onPriorityFilterChange: (priority: PriorityLevel | 'all') => void;
  assigneeFilter: string | 'all';
  onAssigneeFilterChange: (assigneeId: string | 'all') => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onMoveTask: (taskId: string, targetStatusId: string, targetIndex?: number) => void;
  onReorderStatus: (sourceStatusId: string, targetIndex: number) => void;
  onSelectTask: (taskId: string) => void;
  onQuickCreateTask: (statusId: string, fullName: string) => void;
  onOpenNewStatusModal: () => void;
  onOpenImportSheet: () => void;
  onOpenStatusPipeline: () => void;
}

export function BoardView({
  statuses,
  tasks,
  projects,
  members,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  searchQuery,
  onSearchChange,
  onMoveTask,
  onReorderStatus,
  onSelectTask,
  onQuickCreateTask,
  onOpenNewStatusModal,
  onOpenImportSheet,
  onOpenStatusPipeline,
}: BoardViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [columnDropTargetId, setColumnDropTargetId] = useState<string | null>(null);

  const [inlineAddStatusId, setInlineAddStatusId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');
  const [columnVisibleLimits, setColumnVisibleLimits] = useState<Record<string, number>>({});

  const DEFAULT_CARD_LIMIT = 40;

  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    e.stopPropagation();
    setDraggedTaskId(taskId);
    setDraggedStatusId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-strata-task', taskId);
  };

  const handleStatusDragStart = (e: React.DragEvent, statusId: string) => {
    setDraggedStatusId(statusId);
    setDraggedTaskId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-strata-status', statusId);
  };

  const handleColumnDragOver = (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (draggedTaskId) {
      setDragOverStatusId(statusId);
    } else if (draggedStatusId && draggedStatusId !== statusId) {
      setColumnDropTargetId(statusId);
    }
  };

  const handleColumnDragLeave = (e: React.DragEvent, statusId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    if (dragOverStatusId === statusId) setDragOverStatusId(null);
    if (columnDropTargetId === statusId) setColumnDropTargetId(null);
  };

  const handleColumnDrop = (e: React.DragEvent, targetStatusId: string) => {
    e.preventDefault();
    const taskPayload = e.dataTransfer.getData('application/x-strata-task') || draggedTaskId;
    const statusPayload = e.dataTransfer.getData('application/x-strata-status') || draggedStatusId;

    if (taskPayload) {
      onMoveTask(taskPayload, targetStatusId);
    } else if (statusPayload && statusPayload !== targetStatusId) {
      const targetIndex = sortedStatuses.findIndex((s) => s.id === targetStatusId);
      if (targetIndex !== -1) {
        onReorderStatus(statusPayload, targetIndex);
      }
    }

    setDraggedTaskId(null);
    setDragOverStatusId(null);
    setDraggedStatusId(null);
    setColumnDropTargetId(null);
  };

  const handleCardDrop = (e: React.DragEvent, targetStatusId: string, targetTaskIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const taskPayload = e.dataTransfer.getData('application/x-strata-task') || draggedTaskId;
    if (taskPayload) {
      onMoveTask(taskPayload, targetStatusId, targetTaskIndex);
    }
    setDraggedTaskId(null);
    setDragOverStatusId(null);
  };

  const submitInlineTask = (e: React.FormEvent, statusId: string) => {
    e.preventDefault();
    const trimmed = inlineName.trim();
    if (!trimmed) return;
    onQuickCreateTask(statusId, trimmed);
    setInlineName('');
    setInlineAddStatusId(null);
  };

  const priorities: (PriorityLevel | 'all')[] = ['all', 'urgent', 'high', 'medium', 'low'];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter Toolbar */}
      <div className="px-4 sm:px-6 py-3 bg-[#FBFBFD]/90 dark:bg-[#161617]/90 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative md:hidden w-full sm:w-56">
            <Search
              className="w-4 h-4 text-[#86868B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter candidates..."
              className="w-full h-9 pl-9 pr-3 text-sm rounded-[10px] border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by priority"
            className="inline-flex items-center p-0.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08] overflow-x-auto max-w-full"
          >
            {priorities.map((p) => {
              const active = priorityFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPriorityFilterChange(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] ${
                    active
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {p === 'all' ? 'All Priorities' : PRIORITY_LABELS[p]}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
            <span className="hidden sm:inline">Reviewer</span>
            <select
              value={assigneeFilter}
              onChange={(e) => onAssigneeFilterChange(e.target.value)}
              aria-label="Filter by reviewer"
              className="h-8 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            >
              <option value="all">All Reviewers</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenStatusPipeline}
            className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Arrange Statuses</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportSheet}
            className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Drop or Import Excel</span>
          </button>
        </div>
      </div>

      {/* Horizontal Status Columns Canvas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 sm:px-6 py-5">
        <div className="flex items-start gap-4 h-full min-w-max">
          {sortedStatuses.map((status, colIndex) => {
            const columnTasks = tasks
              .filter((t) => t.statusId === status.id)
              .sort((a, b) => a.order - b.order);

            const isOverWip = status.wipLimit !== null && columnTasks.length > status.wipLimit;
            const isTaskDropTarget = dragOverStatusId === status.id;
            const isColumnDropTarget = columnDropTargetId === status.id;
            const colorMeta = getStatusColorMeta(status.color);

            return (
              <section
                key={status.id}
                aria-label={`${status.name} status column`}
                onDragOver={(e) => handleColumnDragOver(e, status.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, status.id)}
                onDrop={(e) => handleColumnDrop(e, status.id)}
                className={`w-[320px] shrink-0 max-h-full flex flex-col rounded-2xl border transition-colors duration-150 ${
                  isTaskDropTarget || isColumnDropTarget
                    ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.05] dark:bg-[#0A84FF]/[0.10]'
                    : 'border-black/[0.07] dark:border-white/[0.09] bg-[#ECECEE]/75 dark:bg-[#161617]/90'
                }`}
              >
                <div className={`h-0.5 w-full rounded-t-2xl ${colorMeta.barClass}`} />

                {/* Column Header */}
                <div
                  draggable
                  onDragStart={(e) => handleStatusDragStart(e, status.id)}
                  onDragEnd={() => {
                    setDraggedStatusId(null);
                    setColumnDropTargetId(null);
                  }}
                  className="px-3.5 py-3 flex items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.08] cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical
                      className="w-3.5 h-3.5 text-[#86868B] opacity-50 group-hover:opacity-100 shrink-0"
                      aria-hidden="true"
                    />
                    <StatusIcon category={status.category} color={status.color} className="w-4 h-4" />
                    <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                      {status.name}
                    </h2>
                    <span
                      className={`text-xs font-mono tabular-nums shrink-0 ${
                        isOverWip
                          ? 'text-[#D70015] dark:text-[#FF453A] font-semibold'
                          : 'text-[#86868B]'
                      }`}
                    >
                      {status.wipLimit !== null
                        ? `${columnTasks.length}/${status.wipLimit}`
                        : columnTasks.length}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={colIndex === 0}
                      onClick={() => onReorderStatus(status.id, colIndex - 1)}
                      aria-label={`Move ${status.name} left`}
                      title="Move status left"
                      className="p-1.5 rounded-lg text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-white dark:hover:bg-[#2C2C2E] disabled:opacity-25 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={colIndex === sortedStatuses.length - 1}
                      onClick={() => onReorderStatus(status.id, colIndex + 1)}
                      aria-label={`Move ${status.name} right`}
                      title="Move status right"
                      className="p-1.5 rounded-lg text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-white dark:hover:bg-[#2C2C2E] disabled:opacity-25 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isOverWip && (
                  <div className="px-3.5 py-2 bg-[#FF3B30]/10 dark:bg-[#FF453A]/15 border-b border-[#FF3B30]/20 flex items-center gap-1.5 text-xs font-medium text-[#D70015] dark:text-[#FF453A]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Over WIP limit ({columnTasks.length} of {status.wipLimit})</span>
                  </div>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {columnTasks.length === 0 ? (
                    <div className="py-8 px-4 text-center rounded-xl border border-dashed border-black/[0.10] dark:border-white/[0.10]">
                      <p className="text-xs text-[#86868B]">
                        No candidates in {status.name}
                      </p>
                    </div>
                  ) : (
                    columnTasks
                      .slice(0, columnVisibleLimits[status.id] ?? DEFAULT_CARD_LIMIT)
                      .map((task, taskIdx) => {
                        const project = projectMap.get(task.projectId);
                        const assignee = memberMap.get(task.assigneeId) ?? members[0];
                        const prevStatus = colIndex > 0 ? sortedStatuses[colIndex - 1] : null;
                        const nextStatus =
                          colIndex < sortedStatuses.length - 1 ? sortedStatuses[colIndex + 1] : null;

                      return (
                        <article
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleTaskDragStart(e, task.id)}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverStatusId(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => handleCardDrop(e, status.id, taskIdx)}
                          onClick={() => onSelectTask(task.id)}
                          className={`group rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:hover:border-white/[0.18] transition-all duration-150 apple-ease cursor-pointer ${
                            draggedTaskId === task.id ? 'opacity-50 scale-[0.98]' : ''
                          }`}
                        >
                          {/* Unboxed Metadata Line */}
                          <div className="flex items-center gap-1.5 text-[11px] text-[#6E6E73] dark:text-[#A1A1A6] mb-1 truncate">
                            <span className="truncate">{task.currentLocation || 'Location N/A'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums shrink-0">
                              {task.yearsOfExperience || 'Exp N/A'}
                            </span>
                            {task.expectedSalary && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-[#1D1D1F] dark:text-[#E5E5EA] shrink-0">
                                  {task.expectedSalary}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Candidate Full Name & Role */}
                          <div className="flex items-center gap-2.5 mb-2">
                            <CandidateAvatar name={task.fullName} size="md" />
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7] leading-snug truncate">
                                {task.fullName || 'Unnamed Candidate'}
                              </h3>
                              <div className="text-xs text-[#86868B] truncate">
                                {project?.name ?? 'Candidate'}
                              </div>
                            </div>
                          </div>

                          {/* AI Experience + Notice */}
                          {task.designedAiProduct && (
                            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] line-clamp-1 mb-1">
                              {task.designedAiProduct}
                            </p>
                          )}
                          <div className="text-[11px] text-[#86868B] truncate mb-3">
                            Notice {task.noticePeriod || '—'} · Relocate {task.readyToRelocateIn || '—'}
                          </div>

                          {/* Bottom Row */}
                          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-black/[0.06] dark:border-white/[0.08]">
                            <div className="flex items-center gap-2 text-xs min-w-0">
                              <span className={PRIORITY_TEXT_CLASSES[task.priority]}>
                                {PRIORITY_LABELS[task.priority]}
                              </span>
                              {isExternalUrlValue(task.portfolioUrl) && (
                                <>
                                  <span className="text-[#D2D2D7] dark:text-[#38383A]" aria-hidden="true">
                                    ·
                                  </span>
                                  <a
                                    href={sanitizeExternalUrl(task.portfolioUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[#0071E3] dark:text-[#2997FF] hover:underline whitespace-nowrap"
                                  >
                                    <span>Portfolio</span>
                                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                  </a>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <div
                                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={!prevStatus}
                                  onClick={() => prevStatus && onMoveTask(task.id, prevStatus.id)}
                                  title={
                                    prevStatus
                                      ? `Move back to ${prevStatus.name}`
                                      : 'Already at first status'
                                  }
                                  aria-label={
                                    prevStatus
                                      ? `Move ${task.fullName} to ${prevStatus.name}`
                                      : 'Cannot move back'
                                  }
                                  className="p-1 rounded-md text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] disabled:opacity-25 disabled:pointer-events-none"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!nextStatus}
                                  onClick={() => nextStatus && onMoveTask(task.id, nextStatus.id)}
                                  title={
                                    nextStatus
                                      ? `Advance to ${nextStatus.name}`
                                      : 'Already at final status'
                                  }
                                  aria-label={
                                    nextStatus
                                      ? `Move ${task.fullName} to ${nextStatus.name}`
                                      : 'Cannot advance'
                                  }
                                  className="p-1 rounded-md text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] disabled:opacity-25 disabled:pointer-events-none"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <Avatar member={assignee} size="sm" />
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                  {columnTasks.length > (columnVisibleLimits[status.id] ?? DEFAULT_CARD_LIMIT) && (
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setColumnVisibleLimits((prev) => ({
                            ...prev,
                            [status.id]: (prev[status.id] ?? DEFAULT_CARD_LIMIT) + 40,
                          }))
                        }
                        className="flex-1 h-9 px-3 rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors font-mono tabular-nums"
                      >
                        Show 40 more ({columnTasks.length - (columnVisibleLimits[status.id] ?? DEFAULT_CARD_LIMIT)} left)
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Add Candidate */}
                <div className="p-2.5 pt-0 shrink-0">
                  {inlineAddStatusId === status.id ? (
                    <form
                      onSubmit={(e) => submitInlineTask(e, status.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setInlineAddStatusId(null);
                          setInlineName('');
                        }
                      }}
                      className="p-2.5 rounded-xl border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] space-y-2"
                    >
                      <input
                        type="text"
                        value={inlineName}
                        onChange={(e) => setInlineName(e.target.value)}
                        placeholder={`Full name in ${status.name}...`}
                        autoFocus
                        className="w-full text-sm text-[#1D1D1F] dark:text-[#F5F5F7] bg-transparent focus:outline-none placeholder:text-[#86868B]"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setInlineAddStatusId(null);
                            setInlineName('');
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInlineAddStatusId(status.id);
                        setInlineName('');
                      }}
                      className="w-full h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add candidate</span>
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          <button
            type="button"
            onClick={onOpenNewStatusModal}
            className="w-[260px] h-14 shrink-0 rounded-2xl border border-dashed border-black/[0.15] dark:border-white/[0.18] hover:border-[#0071E3] dark:hover:border-[#0A84FF] bg-white/50 dark:bg-[#1C1C1E]/50 hover:bg-white dark:hover:bg-[#1C1C1E] flex items-center justify-center gap-2 text-[13px] font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#0071E3] dark:hover:text-[#2997FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Status Column</span>
          </button>
        </div>
      </div>
    </div>
  );
}
