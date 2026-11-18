import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Moon,
  RotateCcw,
  Send,
  Sun,
} from 'lucide-react';
import {
  PriorityLevel,
  Project,
  StatusDefinition,
  TaskItem,
  TeamMember,
  ViewMode,
} from '../types';
import {
  PRIORITY_LABELS,
  extractExternalUrl,
  isExternalUrlValue,
} from '../utils/statusStyles';
import { submitPublicLeadForm } from '../services/firestoreWorkspace';
import { CandidateAvatar } from './CandidateAvatar';
import { ResumePreviewModal } from './ResumePreviewModal';

const EXPERIENCE_OPTIONS = [
  '0-2 years',
  '3–5 years',
  '6–8 years',
  '9–10 years',
  '11+ years',
] as const;

const AI_EXPERIENCE_OPTIONS = [
  {
    value: 'Yes, launched',
    hint: 'Shipped AI-powered product or feature in production',
  },
  {
    value: 'Yes, designed but not launched',
    hint: 'Completed end-to-end UX/UI design awaiting release',
  },
  {
    value: 'Only prototypes or concepts',
    hint: 'Explorations, concepts, or interactive prototypes',
  },
  {
    value: 'No',
    hint: 'No AI-specific product work yet',
  },
] as const;

const NOTICE_OPTIONS = [
  'Immediate',
  '15 days',
  '30 days',
  '60 days',
  '90 days or more',
] as const;

const RELOCATION_OPTIONS = [
  'Any Indian Cities',
  'Dubai',
  'Other Gulf Countries',
  'Remote',
] as const;

const LOCATION_SUGGESTIONS = [
  'Bengaluru, India',
  'Mumbai, India',
  'Delhi NCR, India',
  'Hyderabad, India',
  'Pune, India',
  'Chennai, India',
  'Dubai, UAE',
  'Abu Dhabi, UAE',
  'Remote',
];

const PRIORITIES: PriorityLevel[] = ['urgent', 'high', 'medium', 'low'];

export function inferTrackFromExperience(
  yearsOfExperience: string,
  projects: Project[]
): string {
  const exp = yearsOfExperience.trim();
  let preferredId = 'proj-early';
  if (exp.startsWith('11+') || exp.startsWith('9')) {
    preferredId = 'proj-lead-staff';
  } else if (exp.startsWith('6')) {
    preferredId = 'proj-senior';
  } else if (exp.startsWith('3')) {
    preferredId = 'proj-mid';
  }
  if (projects.some((p) => p.id === preferredId)) return preferredId;
  return projects[0]?.id ?? '';
}

export function inferPriorityFromLead(
  yearsOfExperience: string,
  designedAiProduct: string,
  noticePeriod: string
): PriorityLevel {
  const ai = designedAiProduct.trim();
  const exp = yearsOfExperience.trim();
  const notice = noticePeriod.trim();
  const isSenior =
    exp.startsWith('6') || exp.startsWith('9') || exp.startsWith('11+');
  if (ai === 'Yes, launched' && isSenior && notice === 'Immediate') {
    return 'urgent';
  }
  if (ai === 'Yes, launched') return 'high';
  if (ai === 'No') return 'low';
  return 'medium';
}

interface WorkspaceLeadFormProps {
  mode: 'workspace';
  userUid: string;
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
  defaultProjectId: string;
  onCreateLead: (payload: {
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
  onNavigateView: (view: ViewMode) => void;
}

interface PublicLeadFormProps {
  mode: 'public';
  targetUid: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onExitPublicMode?: () => void;
}

type LeadFormViewProps = WorkspaceLeadFormProps | PublicLeadFormProps;

export function LeadFormView(props: LeadFormViewProps) {
  const isWorkspace = props.mode === 'workspace';
  const [previewingPublic, setPreviewingPublic] = useState(false);

  const sortedStatuses = useMemo(() => {
    if (!isWorkspace) return [];
    return [...props.statuses].sort((a, b) => a.order - b.order);
  }, [isWorkspace, props]);

  // Form fields (12 lead columns)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<string>('3–5 years');
  const [designedAiProduct, setDesignedAiProduct] = useState<string>('Yes, launched');
  const [noticePeriod, setNoticePeriod] = useState<string>('30 days');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [selectedRelocations, setSelectedRelocations] = useState<string[]>(['Dubai']);
  const [customRelocation, setCustomRelocation] = useState('');
  const [message, setMessage] = useState('');

  // Workspace routing state
  const [manualProjectId, setManualProjectId] = useState<string | null>(
    isWorkspace && props.defaultProjectId !== 'all' ? props.defaultProjectId : null
  );
  const [statusId, setStatusId] = useState<string>(
    isWorkspace ? sortedStatuses[0]?.id ?? '' : ''
  );
  const [manualPriority, setManualPriority] = useState<PriorityLevel | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>(
    isWorkspace ? props.members[0]?.id ?? '' : ''
  );

  // Submission & UI feedback state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<{
    name: string;
    code: string;
    statusName: string;
  } | null>(null);
  const [publicSubmittedName, setPublicSubmittedName] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resumePreviewOpen, setResumePreviewOpen] = useState(false);

  const effectiveRelocationString = useMemo(() => {
    const parts = [...selectedRelocations];
    const custom = customRelocation.trim();
    if (custom) parts.push(custom);
    return parts.join(', ');
  }, [selectedRelocations, customRelocation]);

  const resolvedStatusId = useMemo(() => {
    if (!isWorkspace) return '';
    return sortedStatuses.some((s) => s.id === statusId)
      ? statusId
      : sortedStatuses[0]?.id ?? '';
  }, [isWorkspace, sortedStatuses, statusId]);

  const resolvedProjectId = useMemo(() => {
    if (!isWorkspace) return '';
    if (manualProjectId && props.projects.some((p) => p.id === manualProjectId)) {
      return manualProjectId;
    }
    return inferTrackFromExperience(yearsOfExperience, props.projects);
  }, [isWorkspace, manualProjectId, props, yearsOfExperience]);

  const resolvedPriority = useMemo(() => {
    if (manualPriority) return manualPriority;
    return inferPriorityFromLead(yearsOfExperience, designedAiProduct, noticePeriod);
  }, [manualPriority, yearsOfExperience, designedAiProduct, noticePeriod]);

  const shareableUrl = useMemo(() => {
    if (!isWorkspace || typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.search = `?lead-form=${encodeURIComponent(props.userUid)}`;
    url.hash = '';
    return url.toString();
  }, [isWorkspace, props]);

  const resetFormFields = () => {
    setFullName('');
    setEmail('');
    setContactNo('');
    setCurrentLocation('');
    setPortfolioUrl('');
    setResumeUrl('');
    setYearsOfExperience('3–5 years');
    setDesignedAiProduct('Yes, launched');
    setNoticePeriod('30 days');
    setExpectedSalary('');
    setSelectedRelocations(['Dubai']);
    setCustomRelocation('');
    setMessage('');
    setManualProjectId(
      isWorkspace && props.defaultProjectId !== 'all' ? props.defaultProjectId : null
    );
    setManualPriority(null);
    setSubmitError(null);
  };

  const toggleRelocation = (option: string) => {
    setSelectedRelocations((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
    );
  };

  const handleCopyShareLink = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2400);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, goToTableAfter = false) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setSubmitError('Please enter the candidate or lead full name.');
      return;
    }

    if (isWorkspace && !previewingPublic) {
      const assignedCode = `CND-${props.nextCodeNumber}`;
      const chosenStatus = sortedStatuses.find((s) => s.id === resolvedStatusId);
      props.onCreateLead({
        projectId: resolvedProjectId,
        statusId: resolvedStatusId,
        priority: resolvedPriority,
        assigneeId: assigneeId || props.members[0]?.id || 'member-priya',
        fullName: trimmedName,
        email: email.trim(),
        contactNo: contactNo.trim(),
        portfolioUrl: portfolioUrl.trim(),
        currentLocation: currentLocation.trim(),
        yearsOfExperience,
        designedAiProduct,
        noticePeriod,
        resumeUrl: resumeUrl.trim(),
        message: message.trim(),
        expectedSalary: expectedSalary.trim(),
        readyToRelocateIn: effectiveRelocationString,
      });

      setSavedNotice({
        name: trimmedName,
        code: assignedCode,
        statusName: chosenStatus?.name ?? 'New Submissions',
      });
      resetFormFields();

      if (goToTableAfter) {
        props.onNavigateView('list');
      }
      return;
    }

    // Public Lead Form Submission (or workspace public preview test)
    const targetUid = isWorkspace ? props.userUid : props.targetUid;
    setSubmitting(true);
    try {
      await submitPublicLeadForm(targetUid, {
        fullName: trimmedName,
        email: email.trim(),
        contactNo: contactNo.trim(),
        portfolioUrl: portfolioUrl.trim(),
        currentLocation: currentLocation.trim(),
        yearsOfExperience,
        designedAiProduct,
        noticePeriod,
        resumeUrl: resumeUrl.trim(),
        message: message.trim(),
        expectedSalary: expectedSalary.trim(),
        readyToRelocateIn: effectiveRelocationString,
      });
      setPublicSubmittedName(trimmedName);
      resetFormFields();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not submit the form right now. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const validPortfolioHref = extractExternalUrl(portfolioUrl);
  const validResumeHref = extractExternalUrl(resumeUrl);

  const previewTaskForResumeModal: TaskItem | null = resumePreviewOpen && validResumeHref
    ? {
        id: 'preview-resume',
        code: isWorkspace ? `CND-${props.nextCodeNumber}` : 'LEAD',
        projectId: resolvedProjectId,
        statusId: resolvedStatusId,
        order: 0,
        priority: resolvedPriority,
        assigneeId: assigneeId,
        updatedAt: new Date().toISOString(),
        statusHistory: [],
        timestamp: '',
        fullName: fullName.trim() || 'Candidate',
        email: email.trim(),
        contactNo: contactNo.trim(),
        portfolioUrl: portfolioUrl.trim(),
        currentLocation: currentLocation.trim(),
        yearsOfExperience,
        designedAiProduct,
        noticePeriod,
        resumeUrl: resumeUrl.trim(),
        message: message.trim(),
        expectedSalary: expectedSalary.trim(),
        readyToRelocateIn: effectiveRelocationString,
      }
    : null;

  const inputClass =
    'w-full h-10 px-3.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:bg-white dark:focus:bg-[#1C1C1E] transition-colors';

  const labelClass = 'block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]';

  const showPublicLayout = !isWorkspace || previewingPublic;

  // Confirmation Screen for Public Lead Submission
  if (showPublicLayout && publicSubmittedName) {
    return (
      <div className="min-h-screen h-full overflow-y-auto bg-[#F5F5F7] dark:bg-black px-4 sm:px-6 py-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <div className="w-12 h-12 rounded-full bg-[#28CD41]/15 text-[#1E7F34] dark:text-[#30D158] mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7]">
            Application Submitted
          </h1>
          <p className="mt-2 text-sm text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
            Thank you, <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{publicSubmittedName}</span>. Your profile, portfolio, and resume details have been added directly to the hiring pipeline.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPublicSubmittedName(null)}
              className="h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white text-sm font-medium transition-colors"
            >
              Submit Another Response
            </button>
            {isWorkspace && previewingPublic && (
              <button
                type="button"
                onClick={() => {
                  setPublicSubmittedName(null);
                  setPreviewingPublic(false);
                }}
                className="h-10 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors"
              >
                Back to Workspace Form
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-full overflow-y-auto ${
        showPublicLayout ? 'min-h-screen bg-[#F5F5F7] dark:bg-black' : ''
      } px-4 sm:px-8 py-7`}
    >
      <div className={`${showPublicLayout ? 'max-w-3xl' : 'max-w-6xl'} mx-auto space-y-6 pb-12`}>
        {/* Public Top Bar when opened externally or previewing */}
        {showPublicLayout && (
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-black/[0.08] dark:border-white/[0.10]">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/aistudio/image_9e6b3606.png"
                alt="UXD Vault official logo"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover bg-black shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
              />
              <span className="font-display font-semibold text-base tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                UXD Vault
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isWorkspace && previewingPublic ? (
                <button
                  type="button"
                  onClick={() => setPreviewingPublic(false)}
                  className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] transition-colors"
                >
                  Exit Public Preview
                </button>
              ) : (
                !isWorkspace && (
                  <>
                    <button
                      type="button"
                      onClick={props.onToggleTheme}
                      aria-label={props.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                      className="h-9 px-3 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] inline-flex items-center gap-1.5"
                    >
                      {props.isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                      <span>{props.isDark ? 'Light' : 'Dark'}</span>
                    </button>
                    {props.onExitPublicMode && (
                      <button
                        type="button"
                        onClick={props.onExitPublicMode}
                        className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E]"
                      >
                        Workspace Sign In
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-black/[0.08] dark:border-white/[0.10] pb-5">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-display font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              {showPublicLayout ? 'Candidate & Lead Intake Form' : 'Lead Intake Form'}
            </h1>
            <p className="mt-1 text-sm text-[#6E6E73] dark:text-[#A1A1A6] max-w-2xl">
              {showPublicLayout
                ? 'Share your contact details, portfolio, resume, AI product work, notice period, and relocation preferences.'
                : 'Collect every lead detail in one structured form or copy the shareable link so candidates can submit directly into New Submissions.'}
            </p>
          </div>

          {isWorkspace && !previewingPublic && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#1E7F34] dark:text-[#30D158]" />
                    <span>Shareable Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#A1A1A6]" />
                    <span>Copy Shareable Form Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  setPublicSubmittedName(null);
                  setPreviewingPublic(true);
                }}
                className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#A1A1A6]" />
                <span>Preview Public Form</span>
              </button>
            </div>
          )}
        </div>

        {/* Workspace Save Confirmation Banner */}
        {isWorkspace && !previewingPublic && savedNotice && (
          <div className="rounded-xl border border-[#28CD41]/30 bg-[#28CD41]/[0.08] dark:bg-[#30D158]/[0.12] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-[#17692C] dark:text-[#66E383]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Saved <strong className="font-semibold">{savedNotice.name}</strong> ({savedNotice.code}) into{' '}
                <strong className="font-semibold">{savedNotice.statusName}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => props.onNavigateView('list')}
              className="text-xs font-semibold text-[#0071E3] dark:text-[#2997FF] hover:underline whitespace-nowrap"
            >
              View in List / Table
            </button>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/[0.08] px-4 py-3 text-sm text-[#D70015] dark:text-[#FF453A]"
          >
            {submitError}
          </div>
        )}

        {/* Form Body */}
        <form
          onSubmit={(e) => void handleSubmit(e, false)}
          className={`grid grid-cols-1 ${
            showPublicLayout ? '' : 'lg:grid-cols-12'
          } gap-6 items-start`}
        >
          {/* Left Column: All 12 Lead Information Fields */}
          <div className={`${showPublicLayout ? '' : 'lg:col-span-8'} space-y-5`}>
            {/* Section 1: Identity & Contact */}
            <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  01. Candidate Identity &amp; Contact
                </h2>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Core contact details and current city.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="lead-fullname" className={labelClass}>
                    Full Name <span className="text-[#D70015] dark:text-[#FF453A]">*</span>
                  </label>
                  <input
                    id="lead-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ananya Kulkarni"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="lead-email" className={labelClass}>
                    Email ID {showPublicLayout && <span className="text-[#D70015] dark:text-[#FF453A]">*</span>}
                  </label>
                  <input
                    id="lead-email"
                    type="email"
                    required={showPublicLayout}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="lead-contact" className={labelClass}>
                    Contact No / WhatsApp
                  </label>
                  <input
                    id="lead-contact"
                    type="tel"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    placeholder="+91 98204 51290 or +971 50 123 4567"
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="lead-location" className={labelClass}>
                    Current Location
                  </label>
                  <input
                    id="lead-location"
                    type="text"
                    list="lead-location-suggestions"
                    value={currentLocation}
                    onChange={(e) => setCurrentLocation(e.target.value)}
                    placeholder="e.g. Bengaluru, India or Dubai, UAE"
                    className={inputClass}
                  />
                  <datalist id="lead-location-suggestions">
                    {LOCATION_SUGGESTIONS.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
              </div>
            </section>

            {/* Section 2: Portfolio, Resume & Experience */}
            <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  02. Portfolio, Resume &amp; AI Product Background
                </h2>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Work links, design seniority, and AI product experience.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="lead-portfolio" className={labelClass}>
                      Portfolio URL
                    </label>
                    {validPortfolioHref && (
                      <a
                        href={validPortfolioHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Test link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <input
                    id="lead-portfolio"
                    type="text"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    placeholder="https://behance.net/... or https://framer.website"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="lead-resume" className={labelClass}>
                      Resume Link (Google Drive / Docs / PDF)
                    </label>
                    {validResumeHref && (
                      <button
                        type="button"
                        onClick={() => setResumePreviewOpen(true)}
                        className="text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    )}
                  </div>
                  <input
                    id="lead-resume"
                    type="text"
                    value={resumeUrl}
                    onChange={(e) => setResumeUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or PDF link"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Years of Experience */}
              <div className="space-y-2">
                <span className={labelClass}>Years of Experience</span>
                <div
                  role="radiogroup"
                  aria-label="Years of Experience"
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2"
                >
                  {EXPERIENCE_OPTIONS.map((opt) => {
                    const active = yearsOfExperience === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setYearsOfExperience(opt)}
                        className={`h-10 px-3 rounded-[10px] border text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                            : 'border-black/[0.08] dark:border-white/[0.12] bg-[#FBFBFD] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#E5E5EA] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C]'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI-Powered Product Experience */}
              <div className="space-y-2">
                <span className={labelClass}>
                  Have you designed an AI-powered product or feature?
                </span>
                <div
                  role="radiogroup"
                  aria-label="AI product design experience"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                >
                  {AI_EXPERIENCE_OPTIONS.map((opt) => {
                    const active = designedAiProduct === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDesignedAiProduct(opt.value)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active
                            ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.07] dark:bg-[#0A84FF]/[0.16]'
                            : 'border-black/[0.08] dark:border-white/[0.12] bg-[#FBFBFD] dark:bg-[#2C2C2E]/70 hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E]'
                        }`}
                      >
                        <div
                          className={`text-xs font-semibold ${
                            active
                              ? 'text-[#0071E3] dark:text-[#2997FF]'
                              : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
                          }`}
                        >
                          {opt.value}
                        </div>
                        <div className="text-[11px] text-[#86868B] mt-0.5 leading-snug">
                          {opt.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Section 3: Availability, Compensation & Relocation */}
            <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  03. Availability, Salary &amp; Relocation
                </h2>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Notice period, expected compensation, relocation options, and message.
                </p>
              </div>

              {/* Notice Period */}
              <div className="space-y-2">
                <span className={labelClass}>What is your notice period?</span>
                <div
                  role="radiogroup"
                  aria-label="Notice period"
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2"
                >
                  {NOTICE_OPTIONS.map((opt) => {
                    const active = noticePeriod === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setNoticePeriod(opt)}
                        className={`h-10 px-2.5 rounded-[10px] border text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                            : 'border-black/[0.08] dark:border-white/[0.12] bg-[#FBFBFD] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#E5E5EA] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C]'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="lead-salary" className={labelClass}>
                    Expected Salary
                  </label>
                  <input
                    id="lead-salary"
                    type="text"
                    value={expectedSalary}
                    onChange={(e) => setExpectedSalary(e.target.value)}
                    placeholder="e.g. ₹24 LPA or AED 18,000 / mo"
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="lead-relocate-custom" className={labelClass}>
                    Other Relocation Location (optional)
                  </label>
                  <input
                    id="lead-relocate-custom"
                    type="text"
                    value={customRelocation}
                    onChange={(e) => setCustomRelocation(e.target.value)}
                    placeholder="e.g. Abu Dhabi, Singapore, London"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Relocation Multi-Select */}
              <div className="space-y-2">
                <span className={labelClass}>Ready to relocate in</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RELOCATION_OPTIONS.map((opt) => {
                    const checked = selectedRelocations.includes(opt);
                    return (
                      <label
                        key={opt}
                        className={`min-h-10 px-3 py-2 rounded-[10px] border flex items-center gap-2 text-xs font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.07] dark:bg-[#0A84FF]/[0.16] text-[#0071E3] dark:text-[#2997FF]'
                            : 'border-black/[0.08] dark:border-white/[0.12] bg-[#FBFBFD] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#E5E5EA]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRelocation(opt)}
                          className="rounded border-black/25 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                        />
                        <span className="truncate">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Any Message */}
              <div className="space-y-1.5">
                <label htmlFor="lead-message" className={labelClass}>
                  Any Message / Cover Note
                </label>
                <textarea
                  id="lead-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share highlights of key design systems, AI features, case studies, or interview notes..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:bg-white dark:focus:bg-[#1C1C1E] transition-colors"
                />
              </div>
            </section>

            {/* Public Submit Footer */}
            {showPublicLayout && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetFormFields}
                  className="h-10 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Form</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 px-6 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-60 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Submitting...' : 'Submit Lead Details'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column (Workspace Mode Only): Live Preview & Pipeline Routing */}
          {isWorkspace && !previewingPublic && (
            <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-6">
              {/* Live Candidate Snapshot Preview */}
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#86868B]">
                    Live Record Preview
                  </span>
                  <span className="text-xs font-mono tabular-nums text-[#86868B]">
                    CND-{props.nextCodeNumber}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <CandidateAvatar name={fullName || 'New Lead'} size="lg" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                      {fullName.trim() || 'Candidate Name'}
                    </div>
                    <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] truncate">
                      {email.trim() || 'email@domain.com'}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                  <div>
                    <div className="text-[#86868B]">Experience</div>
                    <div className="font-mono tabular-nums font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mt-0.5">
                      {yearsOfExperience}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#86868B]">Notice</div>
                    <div className="font-mono tabular-nums font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mt-0.5">
                      {noticePeriod}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#86868B]">Location</div>
                    <div className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate mt-0.5">
                      {currentLocation.trim() || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#86868B]">Links</div>
                    <div className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mt-0.5">
                      {isExternalUrlValue(portfolioUrl) ? 'Portfolio' : 'No portfolio'} ·{' '}
                      {isExternalUrlValue(resumeUrl) ? 'Resume' : 'No resume'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pipeline & Triage Routing */}
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] p-5 space-y-4">
                <h2 className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Pipeline Routing
                </h2>

                <div className="space-y-1.5">
                  <label htmlFor="lead-route-status" className={labelClass}>
                    Initial Status
                  </label>
                  <select
                    id="lead-route-status"
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
                  <label htmlFor="lead-route-project" className={labelClass}>
                    Role / Track
                  </label>
                  <select
                    id="lead-route-project"
                    value={resolvedProjectId}
                    onChange={(e) => setManualProjectId(e.target.value)}
                    className={inputClass}
                  >
                    {props.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <span className={labelClass}>Priority</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PRIORITIES.map((p) => {
                      const active = resolvedPriority === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setManualPriority(p)}
                          className={`h-8 px-2 rounded-lg border text-xs font-medium transition-colors ${
                            active
                              ? 'border-[#0071E3] dark:border-[#0A84FF] bg-[#0071E3]/[0.08] dark:bg-[#0A84FF]/[0.18] text-[#0071E3] dark:text-[#2997FF]'
                              : 'border-black/[0.08] dark:border-white/[0.12] bg-[#FBFBFD] dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-[#A1A1A6]'
                          }`}
                        >
                          {PRIORITY_LABELS[p]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="lead-route-owner" className={labelClass}>
                    Assigned Reviewer
                  </label>
                  <select
                    id="lead-route-owner"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className={inputClass}
                  >
                    {props.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    className="w-full h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>Save Lead to Pipeline</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(e) => void handleSubmit(e, true)}
                      className="h-9 px-3 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#FBFBFD] dark:bg-[#2C2C2E] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors whitespace-nowrap"
                    >
                      Save &amp; View Table
                    </button>
                    <button
                      type="button"
                      onClick={resetFormFields}
                      className="h-9 px-3 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear Form</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </form>
      </div>

      <ResumePreviewModal
        task={previewTaskForResumeModal}
        onClose={() => setResumePreviewOpen(false)}
      />
    </div>
  );
}
