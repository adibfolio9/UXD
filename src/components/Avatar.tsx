import { useState } from 'react';
import { TeamMember } from '../types';

interface AvatarProps {
  member: TeamMember;
  size?: 'sm' | 'md';
}

export function Avatar({ member, size = 'sm' }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const dimensionClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';

  if (imgFailed || !member.avatarUrl) {
    return (
      <span
        className={`${dimensionClass} inline-flex items-center justify-center rounded-full bg-[#E8E8ED] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] font-medium shrink-0 select-none`}
        title={member.name}
      >
        {member.initials}
      </span>
    );
  }

  return (
    <img
      src={member.avatarUrl}
      alt={member.name}
      title={`${member.name} — ${member.role}`}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${dimensionClass} rounded-full object-cover shrink-0 ring-1 ring-black/10 dark:ring-white/15`}
    />
  );
}
