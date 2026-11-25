export type ViewMode = 'dashboard' | 'form' | 'list' | 'board' | 'pipeline' | 'analytics' | 'import';

export type StatusCategory = 'backlog' | 'active' | 'review' | 'blocked' | 'done';

export type StatusColor = 'slate' | 'blue' | 'amber' | 'violet' | 'rose' | 'emerald';

export type PriorityLevel = 'urgent' | 'high' | 'medium' | 'low';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarUrl: string;
}

export interface StatusDefinition {
  id: string;
  name: string;
  category: StatusCategory;
  color: StatusColor;
  wipLimit: number | null;
  description: string;
  order: number;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  summary: string;
  leadId: string;
  targetDate: string;
}

export interface StatusTransition {
  id: string;
  fromStatusName: string;
  toStatusName: string;
  changedAt: string;
}

export interface TaskItem {
  id: string;
  code: string;
  projectId: string;
  statusId: string;
  order: number;
  priority: PriorityLevel;
  assigneeId: string;
  updatedAt: string;
  statusHistory: StatusTransition[];
  // Candidate / Form Table Columns
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

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  statuses: Omit<StatusDefinition, 'order'>[];
}

export interface WorkspaceState {
  workspaceName: string;
  statuses: StatusDefinition[];
  projects: Project[];
  tasks: TaskItem[];
  nextCodeNumber: number;
}

export interface LeadNotification {
  id: string;
  type: 'new_lead';
  candidateId: string;
  candidateCode: string;
  candidateName: string;
  candidateEmail: string;
  experience: string;
  designedAiProduct: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type GoogleSheetAuthMode = 'oauth' | 'public_link';

export interface GoogleSheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
}

export interface GoogleSheetSyncConfig {
  sourceType?: 'sheet' | 'form';
  formId?: string | null;
  formUrl?: string | null;
  formTitle?: string | null;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  sheetName: string;
  authMode: GoogleSheetAuthMode;
  enabled: boolean;
  intervalMinutes: number;
  autoCreateStatuses: boolean;
  lastSyncedAt: string | null;
  lastSyncedRowCount: number | null;
  lastSyncSummary: string | null;
}


