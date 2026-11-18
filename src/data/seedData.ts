import { PriorityLevel, TaskItem, TeamMember, WorkflowPreset, WorkspaceState } from '../types';
import rawFormResponses from './formResponses.json';

interface RawFormResponse {
  timestamp: string;
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
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'member-elena',
    name: 'Elena Rostova',
    role: 'Lead Product Engineer',
    initials: 'ER',
    avatarUrl: '/src/assets/images/avatar_elena_rostova_1794982292054.jpg',
  },
  {
    id: 'member-marcus',
    name: 'Marcus Chen',
    role: 'Staff Systems Architect',
    initials: 'MC',
    avatarUrl: '/src/assets/images/avatar_marcus_chen_1794982294028.jpg',
  },
  {
    id: 'member-priya',
    name: 'Priya Nair',
    role: 'Principal Product Designer',
    initials: 'PN',
    avatarUrl: '/src/assets/images/avatar_priya_nair_1794982292766.jpg',
  },
  {
    id: 'member-david',
    name: 'David Okafor',
    role: 'Engineering Manager',
    initials: 'DO',
    avatarUrl: '/src/assets/images/avatar_david_okafor_1794982293475.jpg',
  },
];

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'preset-hiring-pipeline',
    name: 'Candidate Review Pipeline',
    description: 'Six-stage applicant workflow from incoming form submission through final offer.',
    statuses: [
      {
        id: 'status-applied',
        name: 'New Submissions',
        category: 'backlog',
        color: 'slate',
        wipLimit: null,
        description: 'Freshly submitted applicants awaiting initial portfolio screening.',
      },
      {
        id: 'status-shortlisted',
        name: 'Portfolio Shortlisted',
        category: 'backlog',
        color: 'violet',
        wipLimit: 25,
        description: 'Portfolio and AI product experience verified for first call.',
      },
      {
        id: 'status-in-review',
        name: 'AI Design Review',
        category: 'active',
        color: 'blue',
        wipLimit: 15,
        description: 'Deep-dive portfolio walkthrough and systems critique.',
      },
      {
        id: 'status-final-round',
        name: 'Final Interview',
        category: 'review',
        color: 'amber',
        wipLimit: 10,
        description: 'Panel alignment with engineering and leadership.',
      },
      {
        id: 'status-on-hold',
        name: 'On Hold',
        category: 'blocked',
        color: 'rose',
        wipLimit: null,
        description: 'Paused pending notice period or relocation confirmation.',
      },
      {
        id: 'status-offer-hired',
        name: 'Offer Extended',
        category: 'done',
        color: 'emerald',
        wipLimit: null,
        description: 'Compensation approved and offer sent to candidate.',
      },
    ],
  },
  {
    id: 'preset-saas-delivery',
    name: 'SaaS Engineering',
    description: 'Standard six-stage product delivery sequence from triage through release.',
    statuses: [
      {
        id: 'status-triage',
        name: 'Triage',
        category: 'backlog',
        color: 'slate',
        wipLimit: null,
        description: 'Newly reported scope awaiting sizing and prioritization.',
      },
      {
        id: 'status-planned',
        name: 'Planned',
        category: 'backlog',
        color: 'violet',
        wipLimit: 15,
        description: 'Scoped and committed for the current cycle.',
      },
      {
        id: 'status-in-progress',
        name: 'In Progress',
        category: 'active',
        color: 'blue',
        wipLimit: 10,
        description: 'Active work by assigned owner.',
      },
      {
        id: 'status-review',
        name: 'In Review',
        category: 'review',
        color: 'amber',
        wipLimit: 8,
        description: 'Verification and stakeholder critique.',
      },
      {
        id: 'status-blocked',
        name: 'Blocked',
        category: 'blocked',
        color: 'rose',
        wipLimit: null,
        description: 'Waiting on external dependency or approval.',
      },
      {
        id: 'status-shipped',
        name: 'Shipped',
        category: 'done',
        color: 'emerald',
        wipLimit: null,
        description: 'Completed and verified.',
      },
    ],
  },
  {
    id: 'preset-fast-track',
    name: 'Fast-Track Screening',
    description: 'Compact four-stage pipeline for rapid candidate triage and offers.',
    statuses: [
      {
        id: 'status-inbox',
        name: 'Inbox',
        category: 'backlog',
        color: 'slate',
        wipLimit: null,
        description: 'Unreviewed submissions from Excel or form sync.',
      },
      {
        id: 'status-screening',
        name: 'Screening Call',
        category: 'active',
        color: 'blue',
        wipLimit: 15,
        description: '15-minute intro and compensation alignment.',
      },
      {
        id: 'status-panel',
        name: 'Hiring Panel',
        category: 'review',
        color: 'amber',
        wipLimit: 10,
        description: 'Technical and portfolio assessment.',
      },
      {
        id: 'status-hired',
        name: 'Selected',
        category: 'done',
        color: 'emerald',
        wipLimit: null,
        description: 'Approved for onboarding.',
      },
    ],
  },
];

function inferTrackId(yearsOfExperience: string): string {
  const exp = yearsOfExperience.trim();
  if (exp.startsWith('11+') || exp.startsWith('9')) return 'proj-lead-staff';
  if (exp.startsWith('6')) return 'proj-senior';
  if (exp.startsWith('3')) return 'proj-mid';
  return 'proj-early';
}

function inferPriority(row: RawFormResponse): PriorityLevel {
  const ai = row.designedAiProduct.trim();
  const exp = row.yearsOfExperience.trim();
  const notice = row.noticePeriod.trim();
  const isSenior = exp.startsWith('6') || exp.startsWith('9') || exp.startsWith('11+');

  if (ai === 'Yes, launched' && isSenior && notice === 'Immediate') {
    return 'urgent';
  }
  if (ai === 'Yes, launched') {
    return 'high';
  }
  if (ai === 'No') {
    return 'low';
  }
  return 'medium';
}

function parseFormTimestampToIso(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return '2026-11-18T11:02:58Z';
  const [, month, day, year, hour, min, sec] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min}:${sec}Z`;
}

const FETCHED_TASKS: TaskItem[] = (rawFormResponses as RawFormResponse[]).map((row, index) => ({
  id: `cand-${101 + index}`,
  code: `CND-${101 + index}`,
  projectId: inferTrackId(row.yearsOfExperience),
  statusId: 'status-applied',
  order: index,
  priority: inferPriority(row),
  assigneeId: TEAM_MEMBERS[index % TEAM_MEMBERS.length].id,
  updatedAt: parseFormTimestampToIso(row.timestamp),
  statusHistory: [],
  timestamp: row.timestamp,
  fullName: row.fullName,
  email: row.email,
  contactNo: row.contactNo,
  portfolioUrl: row.portfolioUrl,
  currentLocation: row.currentLocation,
  yearsOfExperience: row.yearsOfExperience,
  designedAiProduct: row.designedAiProduct,
  noticePeriod: row.noticePeriod,
  resumeUrl: row.resumeUrl,
  message: row.message,
  expectedSalary: row.expectedSalary,
  readyToRelocateIn: row.readyToRelocateIn,
}));

export const INITIAL_WORKSPACE_STATE: WorkspaceState = {
  workspaceName: 'Form Responses 1',
  nextCodeNumber: 101 + FETCHED_TASKS.length,
  statuses: WORKFLOW_PRESETS[0].statuses.map((status, index) => ({
    ...status,
    order: index,
  })),
  projects: [
    {
      id: 'proj-lead-staff',
      key: 'LEAD',
      name: 'Lead & Staff (9+ yrs)',
      summary: 'Principal and staff product designers with 9–11+ years of experience.',
      leadId: 'member-priya',
      targetDate: '2026-12-12',
    },
    {
      id: 'proj-senior',
      key: 'SR',
      name: 'Senior Designers (6–8 yrs)',
      summary: 'Senior AI and SaaS product designers with 6–8 years of experience.',
      leadId: 'member-marcus',
      targetDate: '2026-12-08',
    },
    {
      id: 'proj-mid',
      key: 'MID',
      name: 'Mid-Level (3–5 yrs)',
      summary: 'Product designers with 3–5 years of shipping web and AI workflows.',
      leadId: 'member-elena',
      targetDate: '2026-12-15',
    },
    {
      id: 'proj-early',
      key: 'JR',
      name: 'Early Career (0–2 yrs)',
      summary: 'Associate and early-career designers with 0–2 years of experience.',
      leadId: 'member-david',
      targetDate: '2026-12-20',
    },
  ],
  tasks: FETCHED_TASKS,
};

