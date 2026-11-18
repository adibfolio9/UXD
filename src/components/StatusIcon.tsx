import {
  AlertOctagon,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Eye,
} from 'lucide-react';
import { StatusCategory, StatusColor } from '../types';
import { getStatusColorMeta } from '../utils/statusStyles';

interface StatusIconProps {
  category: StatusCategory;
  color: StatusColor;
  className?: string;
}

export function StatusIcon({ category, color, className = 'w-4 h-4' }: StatusIconProps) {
  const { iconClass } = getStatusColorMeta(color);
  const combined = `${className} ${iconClass} shrink-0`;

  switch (category) {
    case 'backlog':
      return <CircleDashed className={combined} aria-hidden="true" />;
    case 'active':
      return <Clock3 className={combined} aria-hidden="true" />;
    case 'review':
      return <Eye className={combined} aria-hidden="true" />;
    case 'blocked':
      return <AlertOctagon className={combined} aria-hidden="true" />;
    case 'done':
      return <CheckCircle2 className={combined} aria-hidden="true" />;
  }
}
