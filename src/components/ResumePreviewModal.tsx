import { useEffect } from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';
import { TaskItem } from '../types';
import { getEmbeddableResumeUrl, sanitizeExternalUrl } from '../utils/statusStyles';

interface ResumePreviewModalProps {
  task: TaskItem | null;
  onClose: () => void;
}

export function ResumePreviewModal({ task, onClose }: ResumePreviewModalProps) {
  useEffect(() => {
    if (!task) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [task, onClose]);

  if (!task) return null;

  const externalHref = sanitizeExternalUrl(task.resumeUrl);
  const embedHref = getEmbeddableResumeUrl(task.resumeUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Resume preview for ${task.fullName}`}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-4xl h-[85vh] rounded-2xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] shadow-2xl flex flex-col overflow-hidden">
        <div className="h-14 px-5 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                {task.fullName || 'Candidate'} — Resume
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#86868B] truncate">
                {task.code} {task.email ? `· ${task.email}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {externalHref !== '#' && (
              <a
                href={externalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Open in New Tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close resume preview"
              className="p-2 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#F5F5F7] dark:bg-black min-h-0 relative">
          {embedHref ? (
            <iframe
              src={embedHref}
              title={`Resume for ${task.fullName}`}
              className="w-full h-full border-0"
              allow="autoplay"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                No previewable resume link attached
              </p>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                {task.resumeUrl || 'No resume URL provided for this candidate.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
