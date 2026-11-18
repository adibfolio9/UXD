import { User } from 'lucide-react';

interface CandidateAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_TONES = [
  'bg-[#E8F2FC] text-[#005BBF] ring-[#0071E3]/15 dark:bg-[#0A84FF]/20 dark:text-[#66B2FF] dark:ring-[#0A84FF]/30',
  'bg-[#EEF0FC] text-[#3B42C4] ring-[#5856D6]/15 dark:bg-[#5E5CE6]/22 dark:text-[#9E9CFF] dark:ring-[#5E5CE6]/30',
  'bg-[#F5ECF9] text-[#7D2F9E] ring-[#AF52DE]/15 dark:bg-[#BF5AF2]/20 dark:text-[#DF9BFF] dark:ring-[#BF5AF2]/30',
  'bg-[#E7F6F8] text-[#0C687A] ring-[#30B0C7]/20 dark:bg-[#40C8E0]/18 dark:text-[#70D7FF] dark:ring-[#40C8E0]/30',
  'bg-[#E8F7EC] text-[#17692C] ring-[#28CD41]/20 dark:bg-[#30D158]/18 dark:text-[#66E383] dark:ring-[#30D158]/30',
  'bg-[#FDF3E3] text-[#9A4200] ring-[#FF9500]/20 dark:bg-[#FF9F0A]/20 dark:text-[#FFB84D] dark:ring-[#FF9F0A]/30',
  'bg-[#FCEBEA] text-[#B80D1C] ring-[#FF3B30]/18 dark:bg-[#FF453A]/20 dark:text-[#FF7A72] dark:ring-[#FF453A]/30',
  'bg-[#EFEFF2] text-[#3A3A3C] ring-black/[0.08] dark:bg-white/[0.12] dark:text-[#E5E5EA] dark:ring-white/[0.16]',
] as const;

const SIZE_CLASSES: Record<NonNullable<CandidateAvatarProps['size']>, string> = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-8 h-8 text-[11px]',
  lg: 'w-11 h-11 text-sm',
};

const ICON_CLASSES: Record<NonNullable<CandidateAvatarProps['size']>, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

function getInitials(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9\s.]/g, ' ')
    .replace(/\./g, ' ')
    .trim();
  if (!cleaned) return '';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function getToneIndex(name: string): number {
  const normalized = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_TONES.length;
}

export function CandidateAvatar({
  name,
  size = 'md',
  className = '',
}: CandidateAvatarProps) {
  const initials = getInitials(name);
  const toneClass = initials
    ? AVATAR_TONES[getToneIndex(name)]
    : AVATAR_TONES[AVATAR_TONES.length - 1];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full ring-1 ring-inset font-semibold tracking-tight select-none shrink-0 ${SIZE_CLASSES[size]} ${toneClass} ${className}`}
    >
      {initials || <User className={ICON_CLASSES[size]} />}
    </span>
  );
}
