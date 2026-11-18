import { useState } from 'react';
import { X } from 'lucide-react';
import { StatusCategory, StatusColor } from '../types';
import {
  STATUS_CATEGORY_LABELS,
  STATUS_COLOR_OPTIONS,
} from '../utils/statusStyles';

interface NewStatusModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    category: StatusCategory;
    color: StatusColor;
    wipLimit: number | null;
    description: string;
    insertAtEnd: boolean;
  }) => void;
}

const CATEGORIES: StatusCategory[] = ['backlog', 'active', 'review', 'blocked', 'done'];

export function NewStatusModal({ open, onClose, onCreate }: NewStatusModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('active');
  const [color, setColor] = useState<StatusColor>('blue');
  const [wipLimit, setWipLimit] = useState('');
  const [description, setDescription] = useState('');
  const [insertAtEnd, setInsertAtEnd] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedWip = wipLimit.trim() === '' ? null : Math.max(1, Number(wipLimit));
    onCreate({
      name: trimmed,
      category,
      color,
      wipLimit: Number.isNaN(parsedWip) ? null : parsedWip,
      description: description.trim() || 'Custom workflow stage.',
      insertAtEnd,
    });
    setName('');
    setWipLimit('');
    setDescription('');
    onClose();
  };

  const fieldClass =
    'w-full h-10 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add status column"
    >
      <div
        className="fixed inset-0 bg-black/35 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between">
          <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Add Status Column
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="modal-status-name"
              className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
            >
              Status Name
            </label>
            <input
              id="modal-status-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Portfolio Challenge"
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="modal-status-cat"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Category
              </label>
              <select
                id="modal-status-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as StatusCategory)}
                className={fieldClass}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {STATUS_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="modal-status-color"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Color
              </label>
              <select
                id="modal-status-color"
                value={color}
                onChange={(e) => setColor(e.target.value as StatusColor)}
                className={fieldClass}
              >
                {STATUS_COLOR_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="modal-status-wip"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                WIP Limit
              </label>
              <input
                id="modal-status-wip"
                type="number"
                min={1}
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
                placeholder="No cap"
                className={`${fieldClass} font-mono tabular-nums`}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="modal-status-pos"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Placement
              </label>
              <select
                id="modal-status-pos"
                value={insertAtEnd ? 'end' : 'before-done'}
                onChange={(e) => setInsertAtEnd(e.target.value === 'end')}
                className={fieldClass}
              >
                <option value="before-done">Before Completed</option>
                <option value="end">End of Pipeline</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="modal-status-desc"
              className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
            >
              Description
            </label>
            <input
              id="modal-status-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Exit criteria for this status..."
              className={fieldClass}
            />
          </div>

          <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.10] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-[10px] text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-5 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium transition-colors"
            >
              Add Status
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
