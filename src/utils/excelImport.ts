import * as XLSX from 'xlsx';
import {
  PriorityLevel,
  Project,
  StatusCategory,
  StatusColor,
  StatusDefinition,
  TaskItem,
  TeamMember,
} from '../types';

export interface ParsedWorkbook {
  fileName: string;
  sheetNames: string[];
  sheets: Record<
    string,
    {
      headers: string[];
      rows: Record<string, string>[];
    }
  >;
}

export interface ColumnMapping {
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
  status: string;
  priority: string;
  project: string;
}

const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  timestamp: ['timestamp', 'submitted at', 'created at', 'submission date'],
  fullName: ['full name', 'candidate name', 'name', 'applicant', 'title', 'candidate'],
  email: ['email id', 'email address', 'email', 'e-mail', 'mail'],
  contactNo: [
    'contact no / whatsapp',
    'contact no',
    'whatsapp',
    'phone number',
    'phone',
    'mobile',
    'contact',
  ],
  portfolioUrl: [
    'share your portfolio url',
    'portfolio url',
    'portfolio',
    'website',
    'behance',
    'dribbble',
  ],
  currentLocation: ['current location', 'location', 'city', 'country', 'residence'],
  yearsOfExperience: [
    'years of experience do you have?',
    'years of experience',
    'experience',
    'yrs',
    'yoe',
  ],
  designedAiProduct: [
    'have you designed an ai-powered product or feature?',
    'ai-powered product',
    'ai product',
    'designed ai',
    'ai experience',
  ],
  noticePeriod: [
    'what is your notice period?',
    'notice period',
    'notice',
    'availability',
  ],
  resumeUrl: ['upload resume', 'resume link', 'resume url', 'resume', 'cv'],
  message: ['any message', 'message', 'note', 'notes', 'cover letter', 'comments'],
  expectedSalary: [
    'expected salary',
    'salary',
    'compensation',
    'expected ctc',
    'ctc',
    'pay',
  ],
  readyToRelocateIn: [
    'ready to relocate in',
    'ready to relocate',
    'relocation',
    'relocate',
  ],
  status: ['status', 'stage', 'state', 'column', 'phase'],
  priority: ['priority', 'rating', 'urgency', 'importance'],
  project: ['project', 'role / track', 'role', 'position', 'track', 'department'],
};

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  }
  return String(value).trim();
}

function extractHtmlCellValue(cell: Element): string {
  const link = cell.querySelector('a[href]');
  const href = link?.getAttribute('href')?.trim() ?? '';

  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  const text = (clone.textContent ?? '').trim();

  if (href && /^https?:\/\//i.test(href)) {
    return href;
  }
  return text;
}

function parseHtmlSheetDocument(htmlText: string, fileName: string): ParsedWorkbook {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  const targetTable =
    doc.querySelector('table.waffle') ??
    tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];

  if (!targetTable) {
    throw new Error('No HTML table found in file.');
  }

  const rawRows = Array.from(targetTable.querySelectorAll('tr'))
    .map((tr) => Array.from(tr.querySelectorAll('th, td')).map(extractHtmlCellValue))
    .filter((cells) => cells.some((c) => c !== ''));

  if (rawRows.length === 0) {
    throw new Error('No data rows found in HTML table.');
  }

  const seenHeaders = new Map<string, number>();
  const rawHeaders = rawRows[0].map((cell, idx) => {
    const base = cell || `Column ${idx + 1}`;
    const count = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rowArr = rawRows[r];
    const record: Record<string, string> = {};
    let hasAnyValue = false;

    rawHeaders.forEach((header, cIdx) => {
      const val = rowArr[cIdx] ?? '';
      if (val !== '') hasAnyValue = true;
      record[header] = val;
    });

    if (hasAnyValue) {
      rows.push(record);
    }
  }

  const sheetName =
    doc.querySelector('.docs-title-input')?.textContent?.trim() ||
    doc.title?.trim() ||
    'Form Responses';

  return {
    fileName,
    sheetNames: [sheetName],
    sheets: {
      [sheetName]: {
        headers: rawHeaders,
        rows,
      },
    },
  };
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedWorkbook> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || file.type === 'text/html') {
    const htmlText = await file.text();
    return parseHtmlSheetDocument(htmlText, file.name);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No worksheets found in file.');
  }

  const sheets: ParsedWorkbook['sheets'] = {};

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (matrix.length === 0) {
      sheets[sheetName] = { headers: [], rows: [] };
      continue;
    }

    const seenHeaders = new Map<string, number>();
    const rawHeaders = matrix[0].map((cell, idx) => {
      const base = normalizeCell(cell) || `Column ${idx + 1}`;
      const count = seenHeaders.get(base) ?? 0;
      seenHeaders.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });

    const rows: Record<string, string>[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const rowArr = matrix[r];
      const record: Record<string, string> = {};
      let hasAnyValue = false;

      rawHeaders.forEach((header, cIdx) => {
        const val = normalizeCell(rowArr[cIdx]);
        if (val !== '') hasAnyValue = true;
        record[header] = val;
      });

      if (hasAnyValue) {
        rows.push(record);
      }
    }

    sheets[sheetName] = { headers: rawHeaders, rows };
  }

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    sheets,
  };
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const usedHeaders = new Set<string>();

  const findExact = (field: keyof ColumnMapping): string => {
    const aliases = HEADER_ALIASES[field];
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const lower = header.toLowerCase().replace(/\s+/g, ' ').trim();
      if (aliases.includes(lower)) {
        usedHeaders.add(header);
        return header;
      }
    }
    return '';
  };

  const findPartial = (field: keyof ColumnMapping): string => {
    const aliases = HEADER_ALIASES[field];
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const lower = header.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (aliases.some((alias) => lower.includes(alias))) {
        usedHeaders.add(header);
        return header;
      }
    }
    return '';
  };

  const fields = Object.keys(HEADER_ALIASES) as (keyof ColumnMapping)[];
  const result = {} as ColumnMapping;

  // First pass: exact header matches take priority so nothing gets stolen by substrings
  for (const field of fields) {
    result[field] = findExact(field);
  }
  // Second pass: partial substring matches for remaining unmapped fields
  for (const field of fields) {
    if (!result[field]) {
      result[field] = findPartial(field);
    }
  }

  if (!result.fullName) {
    result.fullName = headers.find((h) => !usedHeaders.has(h)) || headers[1] || headers[0] || '';
  }

  return result;
}

export function inferStatusCategoryAndColor(name: string): {
  category: StatusCategory;
  color: StatusColor;
} {
  const lower = name.toLowerCase();
  if (/offer|hired|selected|done|complete|shipped|accepted/.test(lower)) {
    return { category: 'done', color: 'emerald' };
  }
  if (/hold|reject|block|pause|wait|drop/.test(lower)) {
    return { category: 'blocked', color: 'rose' };
  }
  if (/final|panel|interview|verify|qa|audit/.test(lower)) {
    return { category: 'review', color: 'amber' };
  }
  if (/review|screen|call|active|progress|task|test/.test(lower)) {
    return { category: 'active', color: 'blue' };
  }
  return { category: 'backlog', color: 'slate' };
}

export function parsePriority(raw: string): PriorityLevel {
  const lower = raw.toLowerCase().trim();
  if (/urgent|critical|p0|top|strong yes/.test(lower)) return 'urgent';
  if (/high|p1|yes/.test(lower)) return 'high';
  if (/low|p3|minor/.test(lower)) return 'low';
  return 'medium';
}

export function buildImportPayload(params: {
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  existingStatuses: StatusDefinition[];
  existingProjects: Project[];
  members: TeamMember[];
  autoCreateStatuses: boolean;
  fallbackStatusId: string;
  fallbackProjectId: string;
  startingCodeNumber: number;
}): {
  newStatuses: StatusDefinition[];
  newProjects: Project[];
  importedTasks: TaskItem[];
  nextCodeNumber: number;
} {
  const {
    rows,
    mapping,
    existingStatuses,
    existingProjects,
    members,
    autoCreateStatuses,
    fallbackStatusId,
    fallbackProjectId,
    startingCodeNumber,
  } = params;

  const workingStatuses = [...existingStatuses].sort((a, b) => a.order - b.order);
  const resolvedFallbackStatusId =
    workingStatuses.find((s) => s.id === fallbackStatusId)?.id ??
    workingStatuses[0]?.id ??
    '';

  const newStatuses: StatusDefinition[] = [];
  const workingProjects = [...existingProjects];
  const newProjects: Project[] = [];

  let nextCode = startingCodeNumber;
  const importedTasks: TaskItem[] = [];
  const statusOrderCounters = new Map<string, number>();

  for (const s of workingStatuses) {
    statusOrderCounters.set(s.id, 0);
  }

  const findOrCreateStatus = (rawStatusName: string): string => {
    const trimmed = rawStatusName.trim();
    if (!trimmed) return resolvedFallbackStatusId;

    const match = workingStatuses.find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match.id;

    if (!autoCreateStatuses) return resolvedFallbackStatusId;

    const inferred = inferStatusCategoryAndColor(trimmed);
    const created: StatusDefinition = {
      id: `status-imp-${Date.now()}-${newStatuses.length}`,
      name: trimmed,
      category: inferred.category,
      color: inferred.color,
      wipLimit: null,
      description: 'Created from imported spreadsheet.',
      order: workingStatuses.length,
    };

    const firstDoneIdx = workingStatuses.findIndex((s) => s.category === 'done');
    if (inferred.category !== 'done' && firstDoneIdx !== -1) {
      workingStatuses.splice(firstDoneIdx, 0, created);
    } else {
      workingStatuses.push(created);
    }
    newStatuses.push(created);
    statusOrderCounters.set(created.id, 0);
    return created.id;
  };

  const findOrCreateProject = (rawProjectName: string): string => {
    const trimmed = rawProjectName.trim();
    if (!trimmed) return fallbackProjectId;
    const match = workingProjects.find(
      (p) =>
        p.name.toLowerCase() === trimmed.toLowerCase() ||
        p.key.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match.id;

    const key =
      trimmed
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 4) || 'ROLE';

    const created: Project = {
      id: `proj-imp-${Date.now()}-${newProjects.length}`,
      key,
      name: trimmed,
      summary: 'Imported from spreadsheet.',
      leadId: members[0]?.id ?? 'member-priya',
      targetDate: '2026-12-20',
    };
    workingProjects.push(created);
    newProjects.push(created);
    return created.id;
  };

  rows.forEach((row, index) => {
    const fullName = (mapping.fullName ? row[mapping.fullName] : '') || '';
    const email = (mapping.email ? row[mapping.email] : '') || '';
    if (!fullName.trim() && !email.trim()) return;

    const rawStatus = mapping.status ? row[mapping.status] : '';
    const statusId = findOrCreateStatus(rawStatus);

    const rawProject = mapping.project ? row[mapping.project] : '';
    const projectId = findOrCreateProject(rawProject);

    const orderInCol = statusOrderCounters.get(statusId) ?? 0;
    statusOrderCounters.set(statusId, orderInCol + 1);

    const nowFormatted = new Date().toISOString().slice(0, 16).replace('T', ' ');

    importedTasks.push({
      id: `cand-imp-${Date.now()}-${index}`,
      code: `CND-${nextCode++}`,
      projectId,
      statusId,
      order: orderInCol,
      priority: parsePriority(mapping.priority ? row[mapping.priority] ?? '' : ''),
      assigneeId: members[index % members.length]?.id ?? 'member-priya',
      updatedAt: new Date().toISOString(),
      statusHistory: [],
      timestamp: (mapping.timestamp ? row[mapping.timestamp] : '') || nowFormatted,
      fullName: fullName.trim() || email.trim(),
      email: email.trim(),
      contactNo: (mapping.contactNo ? row[mapping.contactNo] : '') || '',
      portfolioUrl: (mapping.portfolioUrl ? row[mapping.portfolioUrl] : '') || '',
      currentLocation: (mapping.currentLocation ? row[mapping.currentLocation] : '') || '',
      yearsOfExperience:
        (mapping.yearsOfExperience ? row[mapping.yearsOfExperience] : '') || '',
      designedAiProduct:
        (mapping.designedAiProduct ? row[mapping.designedAiProduct] : '') || '',
      noticePeriod: (mapping.noticePeriod ? row[mapping.noticePeriod] : '') || '',
      resumeUrl: (mapping.resumeUrl ? row[mapping.resumeUrl] : '') || '',
      message: (mapping.message ? row[mapping.message] : '') || '',
      expectedSalary: (mapping.expectedSalary ? row[mapping.expectedSalary] : '') || '',
      readyToRelocateIn:
        (mapping.readyToRelocateIn ? row[mapping.readyToRelocateIn] : '') || '',
    });
  });

  const normalizedNewStatuses = workingStatuses
    .map((s, idx) => ({ ...s, order: idx }))
    .filter((s) => newStatuses.some((ns) => ns.id === s.id));

  return {
    newStatuses: normalizedNewStatuses,
    newProjects,
    importedTasks,
    nextCodeNumber: nextCode,
  };
}

export function exportTasksToExcel(params: {
  tasks: TaskItem[];
  statuses: StatusDefinition[];
  projects: Project[];
  fileName?: string;
}) {
  const { tasks, statuses, projects, fileName = 'strata_candidates_export.xlsx' } = params;
  const statusMap = new Map(statuses.map((s) => [s.id, s]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const rows = tasks.map((t) => ({
    Timestamp: t.timestamp,
    'Full name': t.fullName,
    'Email ID': t.email,
    'Contact No / Whatsapp ': t.contactNo,
    'Share your portfolio URL': t.portfolioUrl,
    'Current Location': t.currentLocation,
    'Years of Experience do you have?': t.yearsOfExperience,
    'Have you designed an AI-powered product or feature?': t.designedAiProduct,
    'What is your notice period?': t.noticePeriod,
    'Upload Resume': t.resumeUrl,
    'Any Message': t.message,
    'Expected Salary ': t.expectedSalary,
    'Ready to relocate in': t.readyToRelocateIn,
    Status: statusMap.get(t.statusId)?.name ?? '',
    'Role / Track': projectMap.get(t.projectId)?.name ?? '',
    Priority: t.priority,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Candidates');
  XLSX.writeFile(workbook, fileName);
}

export function downloadSampleExcelTemplate() {
  const sampleRows = [
    {
      Timestamp: '2026-11-17 10:15',
      'Full name': 'Ananya Kulkarni',
      'Email ID': 'ananya.k@designstudio.in',
      'Contact No / Whatsapp ': '+91 98112 34098',
      'Share your portfolio URL': 'https://ananyakulkarni.design',
      'Current Location': 'Mumbai, IN',
      'Years of Experience do you have?': '5 yrs',
      'Have you designed an AI-powered product or feature?':
        'Yes — AI document summarizer & workspace assistant',
      'What is your notice period?': '30 days',
      'Upload Resume': 'Ananya_Kulkarni_Resume.pdf',
      'Any Message': 'Excited to design high-density SaaS workflows.',
      'Expected Salary ': '₹30 LPA',
      'Ready to relocate in': '2 weeks (Bengaluru)',
      Status: 'Portfolio Shortlisted',
    },
    {
      Timestamp: '2026-11-17 11:40',
      'Full name': 'Lucas Meyer',
      'Email ID': 'lucas@meyerux.de',
      'Contact No / Whatsapp ': '+49 170 4429103',
      'Share your portfolio URL': 'https://lucasmeyer.io',
      'Current Location': 'Berlin, DE',
      'Years of Experience do you have?': '6 yrs',
      'Have you designed an AI-powered product or feature?':
        'Yes — Generative UI builder & prompt evaluation console',
      'What is your notice period?': '15 days',
      'Upload Resume': 'Lucas_Meyer_CV_2026.pdf',
      'Any Message': 'Open to hybrid or remote product teams.',
      'Expected Salary ': '€96,000 / yr',
      'Ready to relocate in': 'Immediate (Berlin / Remote)',
      Status: 'AI Design Review',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Responses');
  XLSX.writeFile(workbook, 'candidate_tracker_template.xlsx');
}
