import { PriorityLevel, StatusCategory, StatusColor } from '../types';

export const STATUS_COLOR_OPTIONS: {
  id: StatusColor;
  label: string;
  iconClass: string;
  barClass: string;
  tintBgClass: string;
}[] = [
  {
    id: 'slate',
    label: 'Graphite',
    iconClass: 'text-[#6E6E73] dark:text-[#A1A1A6]',
    barClass: 'bg-[#8E8E93]',
    tintBgClass: 'bg-[#F5F5F7] dark:bg-[#2C2C2E]',
  },
  {
    id: 'violet',
    label: 'Indigo',
    iconClass: 'text-[#8944AB] dark:text-[#BF5AF2]',
    barClass: 'bg-[#AF52DE]',
    tintBgClass: 'bg-[#AF52DE]/10 dark:bg-[#BF5AF2]/15',
  },
  {
    id: 'blue',
    label: 'Apple Blue',
    iconClass: 'text-[#0071E3] dark:text-[#2997FF]',
    barClass: 'bg-[#0071E3] dark:bg-[#0A84FF]',
    tintBgClass: 'bg-[#0071E3]/10 dark:bg-[#0A84FF]/15',
  },
  {
    id: 'amber',
    label: 'Amber',
    iconClass: 'text-[#B25000] dark:text-[#FF9F0A]',
    barClass: 'bg-[#FF9500] dark:bg-[#FF9F0A]',
    tintBgClass: 'bg-[#FF9500]/10 dark:bg-[#FF9F0A]/15',
  },
  {
    id: 'rose',
    label: 'Crimson',
    iconClass: 'text-[#D70015] dark:text-[#FF453A]',
    barClass: 'bg-[#FF3B30] dark:bg-[#FF453A]',
    tintBgClass: 'bg-[#FF3B30]/10 dark:bg-[#FF453A]/15',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    iconClass: 'text-[#1E7F34] dark:text-[#30D158]',
    barClass: 'bg-[#28CD41] dark:bg-[#30D158]',
    tintBgClass: 'bg-[#28CD41]/10 dark:bg-[#30D158]/15',
  },
];

export function getStatusColorMeta(color: StatusColor) {
  return STATUS_COLOR_OPTIONS.find((c) => c.id === color) ?? STATUS_COLOR_OPTIONS[0];
}

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  backlog: 'Backlog',
  active: 'Active Work',
  review: 'Verification',
  blocked: 'Blocked',
  done: 'Completed',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_TEXT_CLASSES: Record<PriorityLevel, string> = {
  urgent: 'text-[#D70015] dark:text-[#FF453A] font-medium',
  high: 'text-[#B25000] dark:text-[#FF9F0A] font-medium',
  medium: 'text-[#1D1D1F] dark:text-[#F5F5F7]',
  low: 'text-[#6E6E73] dark:text-[#A1A1A6]',
};

export function formatShortDate(isoDate: string): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function extractExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || /^n\/?a$/i.test(trimmed)) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;

  const explicitMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (explicitMatch) {
    return explicitMatch[0].replace(/[),.;]+$/, '');
  }

  if (!/\s/.test(trimmed) && (/^www\./i.test(trimmed) || /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed))) {
    return `https://${trimmed}`;
  }

  return null;
}

export function sanitizeExternalUrl(raw: string): string {
  return extractExternalUrl(raw) ?? '#';
}

export function isExternalUrlValue(raw: string): boolean {
  return extractExternalUrl(raw) !== null;
}

