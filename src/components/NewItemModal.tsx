import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  PriorityLevel,
  Project,
  StatusDefinition,
  TeamMember,
} from '../types';
import { PRIORITY_LABELS } from '../utils/statusStyles';

interface NewItemModalProps {
  open: boolean;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  defaultProjectId: string;
  onClose: () => void;
  onOpenFullForm?: () => void;
  onCreate: (payload: {
    projectId: string;
    statusId: string;
    priority: PriorityLevel;
    assigneeId: string;
    fullName: string;
    email: string;
    contactNo: string;
    portfolioUrl: string;
    currentLocation: string;
    yearsOfExperience: string;
    designedAiProduct: string;
    noticePeriod: string;
    resumeUrl: string;
    message: string;
    expectedSalary: string;
    readyToRelocateIn: string;
  }) => void;
}

const PRIORITIES: PriorityLevel[] = ['urgent', 'high', 'medium', 'low'];

export function NewItemModal({
  open,
  statuses,
  projects,
  members,
  defaultProjectId,
  onClose,
  onOpenFullForm,
  onCreate,
}: NewItemModalProps) {
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [designedAiProduct, setDesignedAiProduct] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [message, setMessage] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [readyToRelocateIn, setReadyToRelocateIn] = useState('');

  const [projectId, setProjectId] = useState(defaultProjectId);
  const [statusId, setStatusId] = useState(sortedStatuses[0]?.id ?? '');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [assigneeId, setAssigneeId] = useState(members[0]?.id ?? '');

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId);
      setStatusId(sortedStatuses[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId]);

  if (!open) return null;

  const resolvedProjectId = projects.some((p) => p.id === projectId)
    ? projectId
    : projects[0]?.id ?? '';
  const resolvedStatusId = sortedStatuses.some((s) => s.id === statusId)
    ? statusId
    : sortedStatuses[0]?.id ?? '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) return;
    onCreate({
      projectId: resolvedProjectId,
      statusId: resolvedStatusId,
      priority,
      assigneeId,
      fullName: trimmedName,
      email: email.trim(),
      contactNo: contactNo.trim(),
      portfolioUrl: portfolioUrl.trim(),
      currentLocation: currentLocation.trim(),
      yearsOfExperience: yearsOfExperience.trim(),
      designedAiProduct: designedAiProduct.trim(),
      noticePeriod: noticePeriod.trim(),
      resumeUrl: resumeUrl.trim(),
      message: message.trim(),
      expectedSalary: expectedSalary.trim(),
      readyToRelocateIn: readyToRelocateIn.trim(),
    });
    setFullName('');
    setEmail('');
    setContactNo('');
    setPortfolioUrl('');
    setCurrentLocation('');
    setYearsOfExperience('');
    setDesignedAiProduct('');
    setNoticePeriod('');
    setResumeUrl('');
    setMessage('');
    setExpectedSalary('');
    setReadyToRelocateIn('');
    onClose();
  };

  const inputClass =
    'w-full h-9 px-3 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add candidate entry"
    >
      <div
        className="fixed inset-0 bg-black/35 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] rounded-2xl border border-black/[0.10] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between shrink-0">
          <h2 className="text-[15px] font-display font-semibold tracking-[-0.01em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Add Candidate Row
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-name"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Full name *
              </label>
              <input
                id="new-cand-name"
                type="text"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ananya Kulkarni"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-email"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Email ID
              </label>
              <input
                id="new-cand-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-contact"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Contact No / Whatsapp
              </label>
              <input
                id="new-cand-contact"
                type="text"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="+91 98204 51290"
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-portfolio"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Share your portfolio URL
              </label>
              <input
                id="new-cand-portfolio"
                type="text"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://portfolio.design"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-location"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Current Location
              </label>
              <input
                id="new-cand-location"
                type="text"
                value={currentLocation}
                onChange={(e) => setCurrentLocation(e.target.value)}
                placeholder="Bengaluru, IN"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-exp"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Years of Experience do you have?
              </label>
              <input
                id="new-cand-exp"
                type="text"
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
                placeholder="5 yrs"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="new-cand-ai"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Have you designed an AI-powered product or feature?
              </label>
              <input
                id="new-cand-ai"
                type="text"
                value={designedAiProduct}
                onChange={(e) => setDesignedAiProduct(e.target.value)}
                placeholder="Yes — Designed AI workflow copilot..."
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-notice"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                What is your notice period?
              </label>
              <input
                id="new-cand-notice"
                type="text"
                value={noticePeriod}
                onChange={(e) => setNoticePeriod(e.target.value)}
                placeholder="30 days"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-resume"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Upload Resume (URL or Filename)
              </label>
              <input
                id="new-cand-resume"
                type="text"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                placeholder="Resume_2026.pdf or https://..."
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-salary"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Expected Salary
              </label>
              <input
                id="new-cand-salary"
                type="text"
                value={expectedSalary}
                onChange={(e) => setExpectedSalary(e.target.value)}
                placeholder="₹30 LPA or $145,000 / yr"
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-relocate"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Ready to relocate in
              </label>
              <input
                id="new-cand-relocate"
                type="text"
                value={readyToRelocateIn}
                onChange={(e) => setReadyToRelocateIn(e.target.value)}
                placeholder="2 weeks / Remote"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="new-cand-message"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Any Message
              </label>
              <textarea
                id="new-cand-message"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Candidate message or reviewer note..."
                className="w-full px-3 py-2 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-status"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Initial Status
              </label>
              <select
                id="new-cand-status"
                value={resolvedStatusId}
                onChange={(e) => setStatusId(e.target.value)}
                className={inputClass}
              >
                {sortedStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-project"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Role / Track
              </label>
              <select
                id="new-cand-project"
                value={resolvedProjectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
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
                htmlFor="new-cand-priority"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Priority
              </label>
              <select
                id="new-cand-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className={inputClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-cand-owner"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Reviewer
              </label>
              <select
                id="new-cand-owner"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={inputClass}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.10] flex items-center justify-between gap-2">
            {onOpenFullForm ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullForm();
                }}
                className="text-xs font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
              >
                Open Full Lead Form
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
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
                Add Row
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
