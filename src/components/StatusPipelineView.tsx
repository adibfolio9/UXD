import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { WORKFLOW_PRESETS } from '../data/seedData';
import {
  StatusCategory,
  StatusColor,
  StatusDefinition,
  TaskItem,
  WorkflowPreset,
} from '../types';
import {
  STATUS_CATEGORY_LABELS,
  STATUS_COLOR_OPTIONS,
} from '../utils/statusStyles';
import { StatusIcon } from './StatusIcon';

interface StatusPipelineViewProps {
  statuses: StatusDefinition[];
  tasks: TaskItem[];
  onReorderStatus: (sourceStatusId: string, targetIndex: number) => void;
  onUpdateStatus: (statusId: string, patch: Partial<StatusDefinition>) => void;
  onCreateStatus: (payload: {
    name: string;
    category: StatusCategory;
    color: StatusColor;
    wipLimit: number | null;
    description: string;
    insertAtEnd: boolean;
  }) => void;
  onDeleteStatus: (statusId: string, reassignToStatusId?: string) => void;
  onApplyPreset: (preset: WorkflowPreset) => void;
}

const CATEGORIES: StatusCategory[] = ['backlog', 'active', 'review', 'blocked', 'done'];

export function StatusPipelineView({
  statuses,
  tasks,
  onReorderStatus,
  onUpdateStatus,
  onCreateStatus,
  onDeleteStatus,
  onApplyPreset,
}: StatusPipelineViewProps) {
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
  const [appliedPresetNotice, setAppliedPresetNotice] = useState<string | null>(null);

  // New status form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<StatusCategory>('active');
  const [newColor, setNewColor] = useState<StatusColor>('blue');
  const [newWipLimit, setNewWipLimit] = useState<string>('');
  const [newDescription, setNewDescription] = useState('');
  const [insertAtEnd, setInsertAtEnd] = useState(true);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const parsedWip = newWipLimit.trim() === '' ? null : Math.max(1, Number(newWipLimit));
    onCreateStatus({
      name: trimmed,
      category: newCategory,
      color: newColor,
      wipLimit: Number.isNaN(parsedWip) ? null : parsedWip,
      description: newDescription.trim() || 'Custom workflow stage.',
      insertAtEnd,
    });
    setNewName('');
    setNewWipLimit('');
    setNewDescription('');
  };

  const handleRequestDelete = (status: StatusDefinition, itemCount: number) => {
    if (sortedStatuses.length <= 2) return;
    if (itemCount === 0) {
      onDeleteStatus(status.id);
      return;
    }
    const fallbackTarget = sortedStatuses.find((s) => s.id !== status.id)?.id ?? '';
    setDeletingStatusId(status.id);
    setReassignTargetId(fallbackTarget);
  };

  const confirmDeleteWithReassign = (statusId: string) => {
    if (!reassignTargetId) return;
    onDeleteStatus(statusId, reassignTargetId);
    setDeletingStatusId(null);
    setReassignTargetId('');
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-black/[0.08] dark:border-white/[0.10] pb-6">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Status Pipeline Architecture
            </h1>
            <p className="mt-1.5 text-sm text-[#6E6E73] dark:text-[#A1A1A6] max-w-2xl">
              Arrange the sequence, semantic stages, WIP limits, and visual indicators used across your Kanban board and list views.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#6E6E73] dark:text-[#A1A1A6] shrink-0">
            {sortedStatuses.length} active stages · {tasks.length} tracked items
          </div>
        </div>

        {/* Live Left-to-Right Pipeline Preview */}
        <section aria-label="Live workflow preview" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              01. Live Board Sequence Preview
            </h2>
            <span className="text-xs text-[#86868B]">
              Left-to-right column order
            </span>
          </div>

          <div className="p-4 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 min-w-max">
              {sortedStatuses.map((status, idx) => {
                const count = tasks.filter((t) => t.statusId === status.id).length;
                return (
                  <div key={status.id} className="flex items-center gap-2">
                    <div className="px-3.5 py-2.5 rounded-xl border border-black/[0.07] dark:border-white/[0.09] bg-[#F5F5F7] dark:bg-[#2C2C2E]/70 min-w-[148px]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <StatusIcon category={status.category} color={status.color} className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                            {idx + 1}. {status.name || 'Untitled'}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-[#86868B]">
                          {count}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                        {STATUS_CATEGORY_LABELS[status.category]}
                        {status.wipLimit !== null ? ` · Max ${status.wipLimit}` : ''}
                      </div>
                    </div>
                    {idx < sortedStatuses.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-[#D2D2D7] dark:text-[#48484A] shrink-0" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Arrange Existing Statuses */}
        <section aria-label="Arrange statuses" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              02. Arrange &amp; Configure Statuses
            </h2>
            <span className="text-xs text-[#86868B]">
              Drag rows or use arrows to reorder
            </span>
          </div>

          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] divide-y divide-black/[0.06] dark:divide-white/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            {sortedStatuses.map((status, index) => {
              const itemCount = tasks.filter((t) => t.statusId === status.id).length;
              const isBeingDeleted = deletingStatusId === status.id;

              return (
                <div
                  key={status.id}
                  draggable={!isBeingDeleted}
                  onDragStart={() => setDraggedId(status.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedId && draggedId !== status.id) {
                      setDragOverId(status.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    if (dragOverId === status.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedId && draggedId !== status.id) {
                      onReorderStatus(draggedId, index);
                    }
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  className={`p-4 transition-colors duration-150 ${
                    dragOverId === status.id
                      ? 'bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/[0.12]'
                      : 'hover:bg-[#F5F5F7]/60 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Left: Drag Handle + Order Controls + Icon */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="cursor-grab active:cursor-grabbing p-1.5 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                        title="Drag to reorder status"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => onReorderStatus(status.id, index - 1)}
                          aria-label={`Move ${status.name} up`}
                          className="p-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.12] text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === sortedStatuses.length - 1}
                          onClick={() => onReorderStatus(status.id, index + 1)}
                          aria-label={`Move ${status.name} down`}
                          className="p-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.12] text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="w-7 text-center text-xs font-mono tabular-nums text-[#86868B]">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <StatusIcon category={status.category} color={status.color} className="w-4 h-4" />
                    </div>

                    {/* Center: Name, Category, Color, WIP Limit, Description */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-3">
                        <label className="sr-only" htmlFor={`status-name-${status.id}`}>
                          Status name
                        </label>
                        <input
                          id={`status-name-${status.id}`}
                          type="text"
                          value={status.name}
                          onChange={(e) => onUpdateStatus(status.id, { name: e.target.value })}
                          onBlur={(e) => {
                            if (!e.target.value.trim()) {
                              onUpdateStatus(status.id, { name: `Stage ${index + 1}` });
                            }
                          }}
                          className="w-full h-9 px-2.5 text-sm font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="sr-only" htmlFor={`status-cat-${status.id}`}>
                          Stage category
                        </label>
                        <select
                          id={`status-cat-${status.id}`}
                          value={status.category}
                          onChange={(e) =>
                            onUpdateStatus(status.id, {
                              category: e.target.value as StatusCategory,
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {STATUS_CATEGORY_LABELS[cat]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="sr-only" htmlFor={`status-color-${status.id}`}>
                          Color accent
                        </label>
                        <select
                          id={`status-color-${status.id}`}
                          value={status.color}
                          onChange={(e) =>
                            onUpdateStatus(status.id, {
                              color: e.target.value as StatusColor,
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs font-medium rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                        >
                          {STATUS_COLOR_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="sr-only" htmlFor={`status-wip-${status.id}`}>
                          WIP limit
                        </label>
                        <input
                          id={`status-wip-${status.id}`}
                          type="number"
                          min={1}
                          placeholder="No WIP cap"
                          value={status.wipLimit ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateStatus(status.id, {
                              wipLimit: val === '' ? null : Math.max(1, Number(val)),
                            });
                          }}
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-center justify-between lg:justify-end gap-3">
                        <span className="text-xs font-mono tabular-nums text-[#86868B] whitespace-nowrap">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>

                        <button
                          type="button"
                          disabled={sortedStatuses.length <= 2}
                          onClick={() => handleRequestDelete(status, itemCount)}
                          title={
                            sortedStatuses.length <= 2
                              ? 'Minimum 2 statuses required'
                              : `Remove ${status.name}`
                          }
                          aria-label={`Remove ${status.name}`}
                          className="p-2 rounded-lg text-[#86868B] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-[#FF3B30]/10 disabled:opacity-25 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D70015]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="sm:col-span-12">
                        <input
                          type="text"
                          value={status.description}
                          onChange={(e) =>
                            onUpdateStatus(status.id, { description: e.target.value })
                          }
                          placeholder="Stage entry or exit criteria..."
                          aria-label={`${status.name} description`}
                          className="w-full text-xs text-[#6E6E73] dark:text-[#A1A1A6] bg-transparent border-b border-transparent hover:border-black/[0.10] dark:hover:border-white/[0.12] focus:border-[#0071E3] focus:outline-none py-1 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Safe Reassignment Confirmation */}
                  {isBeingDeleted && (
                    <div className="mt-3 p-3 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-[#D70015] dark:text-[#FF453A]">
                        <span className="font-semibold">{status.name}</span> currently holds{' '}
                        <span className="font-mono font-semibold">{itemCount}</span>{' '}
                        {itemCount === 1 ? 'item' : 'items'}. Reassign them before removing:
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={reassignTargetId}
                          onChange={(e) => setReassignTargetId(e.target.value)}
                          aria-label="Reassign items to status"
                          className="h-8 px-2.5 text-xs rounded-lg border border-[#FF3B30]/30 bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                        >
                          {sortedStatuses
                            .filter((s) => s.id !== status.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                Move to {s.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => confirmDeleteWithReassign(status.id)}
                          className="h-8 px-3 text-xs font-medium rounded-lg bg-[#D70015] dark:bg-[#FF453A] text-white hover:opacity-90 transition-opacity"
                        >
                          Reassign &amp; Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingStatusId(null)}
                          className="h-8 px-2.5 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Add New Status */}
        <section aria-label="Add new status" className="space-y-3">
          <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            03. Add New Status Stage
          </h2>
          <form
            onSubmit={handleCreateSubmit}
            className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] grid grid-cols-1 sm:grid-cols-12 gap-4 items-end shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
          >
            <div className="sm:col-span-4 space-y-1.5">
              <label
                htmlFor="new-status-name"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Status Name
              </label>
              <input
                id="new-status-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Portfolio Challenge"
                className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <label
                htmlFor="new-status-category"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Stage Category
              </label>
              <select
                id="new-status-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as StatusCategory)}
                className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {STATUS_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <label
                htmlFor="new-status-color"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Indicator Color
              </label>
              <select
                id="new-status-color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value as StatusColor)}
                className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                {STATUS_COLOR_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="new-status-wip"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                WIP Cap
              </label>
              <input
                id="new-status-wip"
                type="number"
                min={1}
                value={newWipLimit}
                onChange={(e) => setNewWipLimit(e.target.value)}
                placeholder="Optional"
                className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="sm:col-span-6 space-y-1.5">
              <label
                htmlFor="new-status-desc"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Exit Criteria / Description
              </label>
              <input
                id="new-status-desc"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What qualifies a candidate to enter or leave this stage?"
                className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <label
                htmlFor="new-status-position"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Insert Position
              </label>
              <select
                id="new-status-position"
                value={insertAtEnd ? 'end' : 'before-done'}
                onChange={(e) => setInsertAtEnd(e.target.value === 'end')}
                className="w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                <option value="before-done">Before Completed Stages</option>
                <option value="end">End of Pipeline</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                className="w-full h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Status</span>
              </button>
            </div>
          </form>
        </section>

        {/* Workflow Templates */}
        <section aria-label="Workflow templates" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              04. Apply SaaS Workflow Template
            </h2>
            <span className="text-xs text-[#86868B]">
              {appliedPresetNotice ?? 'Existing items automatically remap by stage category'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {WORKFLOW_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] flex flex-col justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              >
                <div className="space-y-2">
                  <h3 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {preset.name}
                  </h3>
                  <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                    {preset.description}
                  </p>
                  <div className="pt-1 text-xs text-[#86868B] leading-relaxed">
                    {preset.statuses.map((s) => s.name).join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onApplyPreset(preset);
                    setAppliedPresetNotice(`Applied "${preset.name}" pipeline.`);
                  }}
                  className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                >
                  Apply {preset.name}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
