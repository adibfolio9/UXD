import { useState } from 'react';
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Kanban,
  Layers,
  Moon,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import heroWorkspaceImg from '../assets/images/uxd_hero_workspace_1795166653193.jpg';
import sheetSyncImg from '../assets/images/uxd_sheet_sync_1795166652457.jpg';
import intakeStudioImg from '../assets/images/uxd_intake_studio_1795166653255.jpg';

interface LandingPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSignUp: () => void;
  onOpenSignIn: () => void;
}

const PIPELINE_STAGES = [
  {
    id: 'applied',
    label: 'Applied',
    count: 412,
    summary:
      'Every Form Response, CSV row, and public intake submission lands here deduplicated by email, phone number, and portfolio link.',
    sampleCandidate: {
      name: 'Aryan Sharma',
      code: 'CND-689',
      experience: '6–8 years',
      aiWork: 'Yes, launched',
      location: 'Bengaluru, India',
      notice: '30 days',
    },
  },
  {
    id: 'review',
    label: 'Portfolio Review',
    count: 96,
    summary:
      'Review live portfolio URLs, AI product launches, and PDF resumes side-by-side without leaving the candidate drawer.',
    sampleCandidate: {
      name: 'Meera Krishnan',
      code: 'CND-542',
      experience: '9–10 years',
      aiWork: 'Yes, launched',
      location: 'Mumbai, India',
      notice: '15 days',
    },
  },
  {
    id: 'challenge',
    label: 'Design Challenge',
    count: 54,
    summary:
      'Track active take-home reviews and structured panel evaluations with configurable WIP limits per column.',
    sampleCandidate: {
      name: 'Rohan Kulkarni',
      code: 'CND-418',
      experience: '3–5 years',
      aiWork: 'Yes, designed but not launched',
      location: 'Dubai, UAE',
      notice: 'Immediate',
    },
  },
  {
    id: 'final',
    label: 'Final Panel',
    count: 27,
    summary:
      'Compare expected compensation, notice period, and relocation readiness cleanly before extending an offer.',
    sampleCandidate: {
      name: 'Ananya Deshmukh',
      code: 'CND-209',
      experience: '11+ years',
      aiWork: 'Yes, launched',
      location: 'Hyderabad, India',
      notice: '60 days',
    },
  },
] as const;

export function LandingPage({
  isDark,
  onToggleTheme,
  onOpenSignUp,
  onOpenSignIn,
}: LandingPageProps) {
  const [activeStageId, setActiveStageId] = useState<(typeof PIPELINE_STAGES)[number]['id']>(
    'applied'
  );
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [sheetImgFailed, setSheetImgFailed] = useState(false);
  const [studioImgFailed, setStudioImgFailed] = useState(false);

  const activeStage =
    PIPELINE_STAGES.find((stage) => stage.id === activeStageId) ?? PIPELINE_STAGES[0];

  return (
    <div
      id="top"
      className="min-h-screen bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col"
    >
      {/* Top Bar: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7]/90 dark:bg-black/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single clean brand wordmark */}
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-lg"
          >
            <img
              src="/assets/aistudio/image_9e6b3606.png"
              alt="UXD Vault logo"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover bg-black shrink-0"
            />
            <span className="font-display font-semibold text-base tracking-[-0.02em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              UXD Vault
            </span>
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
          >
            <a
              href="#capabilities"
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#workflow"
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pipeline
            </a>
            <a
              href="#intake"
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Lead Intake
            </a>
            <button
              type="button"
              onClick={onOpenSignIn}
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenSignUp}
              className="h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2"
            >
              <span>Sign Up</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Section 1: Hero Proposition */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-14">
          <div className="max-w-3xl space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
              <span>Candidate Pipeline</span>
              <span aria-hidden="true">·</span>
              <span>Spreadsheet &amp; HTML Sync</span>
              <span aria-hidden="true">·</span>
              <span>Public Lead Intake</span>
            </div>

            <h1 className="font-display font-bold tracking-[-0.03em] leading-[1.08] text-[#1D1D1F] dark:text-[#F5F5F7] text-[clamp(2.25rem,4vw,3.75rem)]">
              Turn scattered designer applications into a structured hiring pipeline.
            </h1>

            <p className="text-[15px] sm:text-base leading-[1.65] text-[#6E6E73] dark:text-[#A1A1A6] max-w-[65ch]">
              UXD Vault consolidates Google Forms responses, Excel imports, and direct
              applications into one private workspace. Remove duplicate entries automatically,
              inspect portfolios and AI product experience, and move candidates cleanly from
              first review to offer.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={onOpenSignUp}
                className="h-11 px-6 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2"
              >
                <span>Create Free Account</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onOpenSignIn}
                className="h-11 px-2 text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#0071E3] dark:hover:text-[#2997FF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in to existing workspace
              </button>
            </div>
          </div>

          {/* Focal 16:9 Product Scene */}
          <div className="mt-10 sm:mt-12 rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] aspect-video relative">
            {!heroImgFailed ? (
              <img
                src={heroWorkspaceImg}
                alt="UXD Vault workspace displaying structured candidate Kanban lanes and spreadsheet table"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#F5F5F7] to-[#E8E8ED] dark:from-[#1C1C1E] dark:to-[#0A0A0C] text-center">
                <Kanban className="w-10 h-10 text-[#0071E3] dark:text-[#2997FF] mb-3" />
                <p className="font-display font-semibold text-base">
                  UXD Vault Kanban &amp; List Workspace
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1">
                  Create an account to open your live candidate pipeline.
                </p>
              </div>
            )}
          </div>

          {/* Full-width 4-column benchmark strip below hero */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 border-t border-black/[0.08] dark:border-white/[0.10] pt-6">
            <div>
              <div className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                589
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1">
                Unique candidates synced from Form Responses
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                155
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1">
                Duplicate rows merged across email &amp; phone
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                12
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1">
                Structured hiring attributes per dossier
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1D1D1F] dark:text-[#F5F5F7]">
                &lt; 30s
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1">
                From spreadsheet drop to sorted Kanban lanes
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Core Capabilities — Asymmetric Bento Grid */}
        <section
          id="capabilities"
          className="border-t border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#0D0D0F] py-16 sm:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2.5">
              <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                Core Capabilities
              </div>
              <h2 className="font-display font-bold tracking-[-0.025em] text-[24px] sm:text-[32px] leading-[1.15] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Built for high-volume UX &amp; AI design recruiting.
              </h2>
              <p className="text-[15px] leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                Stop cleaning up broken Google Sheet exports by hand. Every workspace combines
                spreadsheet ingestion, live Kanban boards, and direct candidate intake.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              {/* Marquee 2-column capability */}
              <div className="lg:col-span-2 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#1C1C1E] overflow-hidden grid grid-cols-1 md:grid-cols-2 items-stretch">
                <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
                  <div className="space-y-3">
                    <div className="text-xs font-mono text-[#0071E3] dark:text-[#2997FF] tabular-nums">
                      01. Spreadsheet &amp; HTML Sync
                    </div>
                    <h3 className="font-display font-semibold text-xl tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                      Automatic deduplication across every upload
                    </h3>
                    <p className="text-sm leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                      Drop `.xlsx`, `.csv`, `.ods`, or Google Sheets `.html` files directly into
                      the workspace. UXD Vault detects repeated applicants by normalized email,
                      phone number, and portfolio URL, merging blank fields into the freshest
                      submission without losing interview status.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-4 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                    <span className="tabular-nums font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                      744 rows → 589 unique
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Append or Replace modes</span>
                  </div>
                </div>

                <div className="aspect-[4/3] md:aspect-auto md:h-full bg-[#E8E8ED] dark:bg-[#141416] overflow-hidden">
                  {!sheetImgFailed ? (
                    <img
                      src={sheetSyncImg}
                      alt="Structured spreadsheet deduplication and candidate stage index cards"
                      referrerPolicy="no-referrer"
                      onError={() => setSheetImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                      <FileSpreadsheet className="w-8 h-8 text-[#0071E3] dark:text-[#2997FF] mb-2" />
                      <span className="text-xs font-medium">
                        Column Auto-Mapping &amp; Deduplication
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Vertical capability card */}
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#1C1C1E] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="text-xs font-mono text-[#0071E3] dark:text-[#2997FF] tabular-nums">
                    02. Status Pipeline
                  </div>
                  <h3 className="font-display font-semibold text-xl tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Configurable Kanban &amp; List views
                  </h3>
                  <p className="text-sm leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                    Switch between drag-and-drop Kanban columns and a fast sortable table.
                    Define custom statuses, WIP limits, and experience tracks from Early Career
                    to Staff Design.
                  </p>
                </div>

                <ul className="space-y-2.5 text-xs text-[#1D1D1F] dark:text-[#F5F5F7] border-t border-black/[0.06] dark:border-white/[0.08] pt-4">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                    <span>Bulk status moves across selected candidates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                    <span>Timestamped stage transition history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                    <span>One-click clean Excel export anytime</span>
                  </li>
                </ul>
              </div>

              {/* Bottom left compact capability */}
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#1C1C1E] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="text-xs font-mono text-[#0071E3] dark:text-[#2997FF] tabular-nums">
                    03. Private Cloud Workspace
                  </div>
                  <h3 className="font-display font-semibold text-xl tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Scoped to your verified account
                  </h3>
                  <p className="text-sm leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                    Every candidate record, workflow column, and notification is isolated to your
                    authenticated account in Cloud Firestore with real-time synchronization across
                    devices.
                  </p>
                </div>

                <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  <ShieldCheck className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
                  <span>Verified email &amp; Google sign-in</span>
                </div>
              </div>

              {/* Bottom right 2-column capability with studio image */}
              <div
                id="intake"
                className="lg:col-span-2 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#1C1C1E] overflow-hidden grid grid-cols-1 md:grid-cols-2 items-stretch"
              >
                <div className="aspect-[4/3] md:aspect-auto md:h-full bg-[#E8E8ED] dark:bg-[#141416] overflow-hidden">
                  {!studioImgFailed ? (
                    <img
                      src={intakeStudioImg}
                      alt="Product design leads reviewing a designer portfolio during hiring calibration"
                      referrerPolicy="no-referrer"
                      onError={() => setStudioImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                      <Send className="w-8 h-8 text-[#0071E3] dark:text-[#2997FF] mb-2" />
                      <span className="text-xs font-medium">
                        Shareable Public Lead Intake Form
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
                  <div className="space-y-3">
                    <div className="text-xs font-mono text-[#0071E3] dark:text-[#2997FF] tabular-nums">
                      04. Live Lead Intake Form
                    </div>
                    <h3 className="font-display font-semibold text-xl tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                      Share an application link that routes straight into your board
                    </h3>
                    <p className="text-sm leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                      Publish a dedicated application form capturing portfolio URL, resume link,
                      years of experience, AI product history, notice period, expected salary, and
                      relocation preference—triggering instant notifications when candidates apply.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-4 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                    <span>Auto-routes by seniority track</span>
                    <span aria-hidden="true">·</span>
                    <span>Standalone HTML export</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Interactive Pipeline Walkthrough & Workflow Proof */}
        <section id="workflow" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-5">
              <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                Interactive Pipeline Preview
              </div>
              <h2 className="font-display font-bold tracking-[-0.025em] text-[24px] sm:text-[32px] leading-[1.15] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Inspect every hiring stage before you sign up.
              </h2>
              <p className="text-[15px] leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                Select a workflow column to see how UXD Vault surfaces candidate qualifications,
                AI design background, and compensation context in a single view.
              </p>

              {/* Interactive stage tabs */}
              <div
                role="tablist"
                aria-label="Pipeline stage preview"
                className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.08]"
              >
                {PIPELINE_STAGES.map((stage) => {
                  const selected = stage.id === activeStage.id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveStageId(stage.id)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selected
                          ? 'bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-xs'
                          : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                      }`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-5">
                <div>
                  <h3 className="font-display font-semibold text-lg text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {activeStage.label}
                  </h3>
                  <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-1 max-w-lg leading-relaxed">
                    {activeStage.summary}
                  </p>
                </div>
                <div className="font-mono text-sm font-medium tabular-nums text-[#0071E3] dark:text-[#2997FF] shrink-0">
                  {activeStage.count} candidates
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                      {activeStage.sampleCandidate.name}
                    </div>
                    <div className="text-xs font-mono text-[#6E6E73] dark:text-[#A1A1A6] tabular-nums mt-0.5">
                      {activeStage.sampleCandidate.code} · {activeStage.sampleCandidate.location}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    Notice: {activeStage.sampleCandidate.notice}
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="py-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                    <dt className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                      Experience Level
                    </dt>
                    <dd className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mt-1 tabular-nums">
                      {activeStage.sampleCandidate.experience}
                    </dd>
                  </div>
                  <div className="py-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                    <dt className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                      AI Product Experience
                    </dt>
                    <dd className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mt-1">
                      {activeStage.sampleCandidate.aiWork}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Conversion CTA -> Sign Up -> Dashboard */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1C1C1E] p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="max-w-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                <span>01. Sign Up</span>
                <span aria-hidden="true">→</span>
                <span>02. Verify Email</span>
                <span aria-hidden="true">→</span>
                <span>03. Dashboard Opens</span>
              </div>
              <h2 className="font-display font-bold tracking-[-0.025em] text-[24px] sm:text-[32px] leading-[1.15] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Ready to open your UXD Vault dashboard?
              </h2>
              <p className="text-[15px] leading-[1.6] text-[#6E6E73] dark:text-[#A1A1A6]">
                Create your workspace account with Google or email. Once verified, your candidate
                dashboard, Kanban board, analytics, and import tools open immediately.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <button
                type="button"
                onClick={onOpenSignUp}
                className="h-11 px-6 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              >
                <Layers className="w-4 h-4" aria-hidden="true" />
                <span>Sign Up &amp; Open Dashboard</span>
              </button>
              <button
                type="button"
                onClick={onOpenSignIn}
                className="h-11 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7] dark:bg-black py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              UXD Vault
            </span>
            <span aria-hidden="true">·</span>
            <span>Candidate &amp; Lead Tracking Workspace</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <a
              href="#capabilities"
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#workflow"
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
            >
              Pipeline
            </a>
            <button
              type="button"
              onClick={onOpenSignUp}
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={onOpenSignIn}
              className="hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex items-center gap-1.5 hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
