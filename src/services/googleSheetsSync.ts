import {
  GoogleSheetSyncConfig,
  GoogleSheetTabInfo,
  PriorityLevel,
  Project,
  StatusDefinition,
  TaskItem,
  TeamMember,
} from '../types';
import {
  clearSheetsAccessToken,
  getSheetsAccessToken,
} from '../firebase';
import {
  SheetSyncPlan,
  buildSheetSyncPlan,
} from '../utils/deduplicateCandidates';
import {
  buildImportPayload,
  detectColumnMapping,
} from '../utils/excelImport';

const CONFIG_KEY_PREFIX = 'uxd-vault-gsheet-sync-cfg-v1-';

export const DEFAULT_GOOGLE_FORM_ID = '1mGz4GJ2Xpu3QAP51AlL5wpLrVPbnHxbKxW4W2suYdHw';
export const DEFAULT_GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/1mGz4GJ2Xpu3QAP51AlL5wpLrVPbnHxbKxW4W2suYdHw/edit';

export interface ParsedSpreadsheetRef {
  spreadsheetId: string;
  isPublishedUrl: boolean;
  gid: string | null;
  normalizedUrl: string;
}

export interface ParsedGoogleFormRef {
  formId: string;
  normalizedUrl: string;
}

export interface GoogleFormQuestionInfo {
  questionId: string;
  title: string;
}

export interface GoogleFormMetadataResult {
  formId: string;
  title: string;
  linkedSheetId: string | null;
  questions: GoogleFormQuestionInfo[];
}

export interface SpreadsheetMetadataResult {
  spreadsheetId: string;
  title: string;
  tabs: GoogleSheetTabInfo[];
}

export interface SheetRowsResult {
  title: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface LiveGoogleSheetSyncResult {
  spreadsheetTitle: string;
  sheetName: string;
  resolvedFormId?: string | null;
  resolvedFormTitle?: string | null;
  resolvedSpreadsheetId?: string;
  resolvedSpreadsheetUrl?: string;
  totalRows: number;
  uniqueSheetRows: number;
  newStatuses: StatusDefinition[];
  newProjects: Project[];
  plan: SheetSyncPlan;
}

export function extractSpreadsheetRef(input: string): ParsedSpreadsheetRef | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const pubMatch = trimmed.match(
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/(2PACX-[a-zA-Z0-9_-]{10,180})(?:\/[^\s?#]*)?(?:\?([^\s#]*))?(?:#([^\s]*))?$/i
  );
  if (pubMatch) {
    const pubId = pubMatch[1];
    const qParams = new URLSearchParams(pubMatch[2] || '');
    const gid = qParams.get('gid');
    return {
      spreadsheetId: `pub:${pubId}`,
      isPublishedUrl: true,
      gid: gid && /^\d+$/.test(gid) ? gid : null,
      normalizedUrl: trimmed,
    };
  }

  const docMatch = trimmed.match(
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{12,128})(?:\/[^\s?#]*)?(?:\?([^\s#]*))?(?:#([^\s]*))?$/i
  );
  if (docMatch) {
    const id = docMatch[1];
    const qParams = new URLSearchParams(docMatch[2] || '');
    const hashStr = docMatch[3] || '';
    const hashGid = hashStr.match(/gid=(\d+)/i)?.[1] ?? null;
    const queryGid = qParams.get('gid');
    const gid =
      hashGid && /^\d+$/.test(hashGid)
        ? hashGid
        : queryGid && /^\d+$/.test(queryGid)
          ? queryGid
          : null;
    return {
      spreadsheetId: id,
      isPublishedUrl: false,
      gid,
      normalizedUrl: `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ''}`,
    };
  }

  if (/^[a-zA-Z0-9_-]{16,128}$/.test(trimmed)) {
    return {
      spreadsheetId: trimmed,
      isPublishedUrl: false,
      gid: null,
      normalizedUrl: `https://docs.google.com/spreadsheets/d/${trimmed}/edit`,
    };
  }

  return null;
}

export function extractGoogleFormRef(input: string): ParsedGoogleFormRef | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  if (/^https:\/\/docs\.google\.com\/forms\/d\/e\//i.test(trimmed)) {
    throw new Error(
      'That is a public responder link (/forms/d/e/...). Please paste the Google Form editor URL (/forms/d/<FORM_ID>/edit) or its linked Google Sheet URL.'
    );
  }

  const match = trimmed.match(
    /^https:\/\/docs\.google\.com\/forms\/d\/([a-zA-Z0-9_-]{12,128})(?:\/[^\s?#]*)?(?:\?[^\s#]*)?(?:#[^\s]*)?$/i
  );
  if (!match) return null;

  const formId = match[1];
  return {
    formId,
    normalizedUrl: `https://docs.google.com/forms/d/${formId}/edit`,
  };
}

export class SheetsAuthExpiredError extends Error {
  constructor(message = 'Your Google session expired. Sign in with Google again to continue syncing.') {
    super(message);
    this.name = 'SheetsAuthExpiredError';
  }
}

function formatGoogleFormTimestamp(isoRaw?: string): string {
  if (!isoRaw) return '';
  const date = new Date(isoRaw);
  if (Number.isNaN(date.getTime())) return isoRaw;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${month}/${day}/${year} ${hh}:${mm}:${ss}`;
}

export async function fetchGoogleFormMetadataOAuth(
  formId: string,
  accessToken: string
): Promise<GoogleFormMetadataResult> {
  const safeFormId = encodeURIComponent(formId.trim());
  const url = `https://forms.googleapis.com/v1/forms/${safeFormId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    formId?: string;
    info?: { title?: string; documentTitle?: string };
    linkedSheetId?: string;
    items?: Array<{
      title?: string;
      questionItem?: {
        question?: { questionId?: string };
      };
      questionGroupItem?: {
        questions?: Array<{
          questionId?: string;
          rowQuestion?: { title?: string };
        }>;
      };
    }>;
  };

  if (!res.ok) {
    throw new Error(
      data?.error?.message || `Google Forms API error (HTTP ${res.status}).`
    );
  }

  const title =
    data.info?.title?.trim() ||
    data.info?.documentTitle?.trim() ||
    'Google Form Responses';
  const linkedSheetId =
    typeof data.linkedSheetId === 'string' && data.linkedSheetId.trim()
      ? data.linkedSheetId.trim()
      : null;

  const questions: GoogleFormQuestionInfo[] = [];
  for (const item of data.items ?? []) {
    const itemTitle = (item.title ?? '').trim();
    const singleId = item.questionItem?.question?.questionId;
    if (singleId) {
      questions.push({
        questionId: singleId,
        title: itemTitle || `Question ${questions.length + 1}`,
      });
    }
    for (const q of item.questionGroupItem?.questions ?? []) {
      if (q.questionId) {
        const subTitle = (q.rowQuestion?.title ?? '').trim();
        questions.push({
          questionId: q.questionId,
          title:
            itemTitle && subTitle
              ? `${itemTitle} (${subTitle})`
              : subTitle || itemTitle || `Question ${questions.length + 1}`,
        });
      }
    }
  }

  return {
    formId: formId.trim(),
    title,
    linkedSheetId,
    questions,
  };
}

export async function fetchGoogleFormResponsesOAuth(
  formId: string,
  accessToken: string,
  knownMeta?: GoogleFormMetadataResult
): Promise<SheetRowsResult> {
  const formMeta = knownMeta ?? (await fetchGoogleFormMetadataOAuth(formId, accessToken));
  const safeFormId = encodeURIComponent(formId.trim());

  const allResponses: Array<{
    createTime?: string;
    lastSubmittedTime?: string;
    respondentEmail?: string;
    answers?: Record<
      string,
      {
        textAnswers?: { answers?: Array<{ value?: string }> };
        fileUploadAnswers?: {
          answers?: Array<{ fileId?: string; fileName?: string }>;
        };
      }
    >;
  }> = [];

  let pageToken: string | undefined;
  let pages = 0;

  do {
    const qs = new URLSearchParams({ pageSize: '500' });
    if (pageToken) qs.set('pageToken', pageToken);
    const res = await fetch(
      `https://forms.googleapis.com/v1/forms/${safeFormId}/responses?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (res.status === 401) {
      clearSheetsAccessToken();
      throw new SheetsAuthExpiredError();
    }

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      responses?: typeof allResponses;
      nextPageToken?: string;
    };

    if (!res.ok) {
      throw new Error(
        data?.error?.message || `Failed to read Google Form responses (HTTP ${res.status}).`
      );
    }

    if (Array.isArray(data.responses)) {
      allResponses.push(...data.responses);
    }
    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 20);

  const seenHeaders = new Map<string, number>();
  const registerHeader = (raw: string): string => {
    const base = raw.trim() || 'Column';
    const count = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  };

  const tsHeader = registerHeader('Timestamp');
  const questionColumns = formMeta.questions.map((q) => ({
    questionId: q.questionId,
    header: registerHeader(q.title),
  }));
  const hasExplicitEmailCol = questionColumns.some((c) =>
    /email/i.test(c.header)
  );
  const respondentEmailHeader = !hasExplicitEmailCol
    ? registerHeader('Email Address')
    : null;

  const headers = [
    tsHeader,
    ...questionColumns.map((c) => c.header),
    ...(respondentEmailHeader ? [respondentEmailHeader] : []),
  ];

  const rows: Record<string, string>[] = [];
  for (const resp of allResponses) {
    const record: Record<string, string> = {};
    record[tsHeader] = formatGoogleFormTimestamp(
      resp.lastSubmittedTime || resp.createTime
    );

    let hasValue = false;
    for (const col of questionColumns) {
      const answer = resp.answers?.[col.questionId];
      let val = '';
      if (answer?.textAnswers?.answers?.length) {
        val = answer.textAnswers.answers
          .map((a) => (a.value ?? '').trim())
          .filter(Boolean)
          .join(', ');
      } else if (answer?.fileUploadAnswers?.answers?.length) {
        val = answer.fileUploadAnswers.answers
          .map((a) =>
            a.fileId
              ? `https://drive.google.com/file/d/${encodeURIComponent(a.fileId)}/view`
              : (a.fileName ?? '').trim()
          )
          .filter(Boolean)
          .join(', ');
      }
      if (val !== '') hasValue = true;
      record[col.header] = val;
    }

    if (respondentEmailHeader) {
      const emailVal = (resp.respondentEmail ?? '').trim();
      if (emailVal !== '') hasValue = true;
      record[respondentEmailHeader] = emailVal;
    }

    if (hasValue) {
      rows.push(record);
    }
  }

  return {
    title: formMeta.title,
    sheetName: 'Form Responses (Google Forms)',
    headers,
    rows,
  };
}

export async function fetchSpreadsheetMetadataOAuth(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadataResult> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets(properties(sheetId,title,gridProperties.rowCount))`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number };
      };
    }>;
  };

  if (!res.ok) {
    throw new Error(
      data?.error?.message || `Google Sheets API error (HTTP ${res.status}).`
    );
  }

  const title = data.properties?.title?.trim() || 'Google Form Responses';
  const tabs: GoogleSheetTabInfo[] = (data.sheets ?? [])
    .map((s) => ({
      sheetId: Number(s.properties?.sheetId ?? 0),
      title: String(s.properties?.title ?? '').trim(),
      rowCount: s.properties?.gridProperties?.rowCount,
    }))
    .filter((t) => t.title.length > 0);

  return { spreadsheetId, title, tabs };
}

export async function fetchSheetRowsOAuth(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  knownSpreadsheetTitle = 'Google Form Responses'
): Promise<SheetRowsResult> {
  const encodedRange = encodeURIComponent(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodedRange}?majorDimension=ROWS`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    values?: unknown[][];
  };

  if (!res.ok) {
    throw new Error(
      data?.error?.message || `Failed to read tab "${sheetTitle}" (HTTP ${res.status}).`
    );
  }

  const values = Array.isArray(data.values) ? data.values : [];
  if (values.length === 0) {
    return {
      title: knownSpreadsheetTitle,
      sheetName: sheetTitle,
      headers: [],
      rows: [],
    };
  }

  const seenHeaders = new Map<string, number>();
  const headers = (values[0] ?? []).map((cell, idx) => {
    const base = String(cell ?? '').trim() || `Column ${idx + 1}`;
    const count = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const arr = Array.isArray(values[r]) ? values[r] : [];
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, cIdx) => {
      const val = String(arr[cIdx] ?? '').trim();
      if (val !== '') hasValue = true;
      record[h] = val;
    });
    if (hasValue) rows.push(record);
  }

  return {
    title: knownSpreadsheetTitle,
    sheetName: sheetTitle,
    headers,
    rows,
  };
}

export async function fetchPublicGoogleSheetRows(
  urlOrId: string,
  gid?: string | null
): Promise<SheetRowsResult & { spreadsheetId: string }> {
  const res = await fetch('/api/google-sheets/public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ urlOrId, gid: gid ?? undefined }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    requiresGoogleAuth?: boolean;
    spreadsheetId?: string;
    title?: string;
    headers?: string[];
    rows?: Record<string, string>[];
  };

  if (!res.ok) {
    throw new Error(payload.error || `Could not read public Google Sheet (HTTP ${res.status}).`);
  }

  return {
    spreadsheetId: payload.spreadsheetId || urlOrId,
    title: payload.title || 'Google Form Responses',
    sheetName: payload.title || 'Form Responses',
    headers: Array.isArray(payload.headers) ? payload.headers : [],
    rows: Array.isArray(payload.rows) ? payload.rows : [],
  };
}

function inferTrackIdFromSheet(expRaw: string, projects: Project[]): string {
  const exp = expRaw.trim().toLowerCase();
  if ((exp.startsWith('11+') || exp.startsWith('9')) && projects.some((p) => p.id === 'proj-lead-staff')) {
    return 'proj-lead-staff';
  }
  if (exp.startsWith('6') && projects.some((p) => p.id === 'proj-senior')) {
    return 'proj-senior';
  }
  if (exp.startsWith('3') && projects.some((p) => p.id === 'proj-mid')) {
    return 'proj-mid';
  }
  if ((exp.startsWith('0') || exp.startsWith('1') || exp.startsWith('2')) && projects.some((p) => p.id === 'proj-early')) {
    return 'proj-early';
  }
  return projects[0]?.id ?? 'proj-lead-staff';
}

function inferPriorityFromSheet(
  yearsOfExperience: string,
  designedAiProduct: string,
  noticePeriod: string
): PriorityLevel {
  const ai = designedAiProduct.trim();
  const exp = yearsOfExperience.trim();
  const notice = noticePeriod.trim();
  const isSenior = exp.startsWith('6') || exp.startsWith('9') || exp.startsWith('11+');
  if (ai === 'Yes, launched' && isSenior && notice === 'Immediate') return 'urgent';
  if (ai === 'Yes, launched') return 'high';
  if (ai === 'No') return 'low';
  return 'medium';
}

export async function runLiveGoogleSheetSync(params: {
  config: GoogleSheetSyncConfig;
  currentTasks: TaskItem[];
  statuses: StatusDefinition[];
  projects: Project[];
  members: TeamMember[];
  nextCodeNumber: number;
}): Promise<LiveGoogleSheetSyncResult> {
  const { config, currentTasks, statuses, projects, members, nextCodeNumber } = params;
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const fallbackStatusId = sortedStatuses[0]?.id ?? 'status-applied';
  const fallbackProjectId = projects[0]?.id ?? 'proj-lead-staff';

  let sheetResult: SheetRowsResult;
  let resolvedFormId = config.formId ?? null;
  let resolvedFormTitle = config.formTitle ?? null;
  let resolvedSpreadsheetId = config.spreadsheetId || '';
  let resolvedSpreadsheetUrl = config.spreadsheetUrl || '';

  if (config.authMode === 'oauth') {
    const token = getSheetsAccessToken();
    if (!token) {
      throw new SheetsAuthExpiredError(
        'Sign in with Google to fetch responses from your private Google Form and its linked Sheet.'
      );
    }

    if (config.sourceType === 'form' && config.formId) {
      let formMeta: GoogleFormMetadataResult | null = null;
      try {
        formMeta = await fetchGoogleFormMetadataOAuth(config.formId, token);
        resolvedFormId = formMeta.formId;
        resolvedFormTitle = formMeta.title;
        if (formMeta.linkedSheetId && !resolvedSpreadsheetId) {
          resolvedSpreadsheetId = formMeta.linkedSheetId;
          resolvedSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${formMeta.linkedSheetId}/edit`;
        }
      } catch (formErr) {
        if (formErr instanceof SheetsAuthExpiredError || !resolvedSpreadsheetId) {
          throw formErr;
        }
      }

      if (resolvedSpreadsheetId) {
        try {
          let resolvedTab = config.sheetName.trim();
          let resolvedTitle = config.spreadsheetTitle || formMeta?.title || 'Google Form Responses';
          if (!resolvedTab || resolvedTab.startsWith('Form Responses (Google Forms)')) {
            const meta = await fetchSpreadsheetMetadataOAuth(resolvedSpreadsheetId, token);
            resolvedTitle = meta.title;
            const preferred =
              meta.tabs.find((t) => /form\s*responses/i.test(t.title)) ?? meta.tabs[0];
            if (!preferred) {
              throw new Error('No tabs were found inside the linked Google Sheet.');
            }
            resolvedTab = preferred.title;
          }
          sheetResult = await fetchSheetRowsOAuth(
            resolvedSpreadsheetId,
            resolvedTab,
            token,
            resolvedTitle
          );
          if (sheetResult.rows.length === 0 && formMeta) {
            const directResponses = await fetchGoogleFormResponsesOAuth(
              config.formId,
              token,
              formMeta
            );
            if (directResponses.rows.length > 0) {
              sheetResult = directResponses;
            }
          }
        } catch (sheetErr) {
          if (sheetErr instanceof SheetsAuthExpiredError) {
            throw sheetErr;
          }
          sheetResult = await fetchGoogleFormResponsesOAuth(
            config.formId,
            token,
            formMeta ?? undefined
          );
        }
      } else {
        sheetResult = await fetchGoogleFormResponsesOAuth(
          config.formId,
          token,
          formMeta ?? undefined
        );
      }
    } else {
      let resolvedTab = config.sheetName.trim();
      let resolvedTitle = config.spreadsheetTitle || 'Google Form Responses';
      if (!resolvedTab) {
        const meta = await fetchSpreadsheetMetadataOAuth(config.spreadsheetId, token);
        resolvedTitle = meta.title;
        const preferred =
          meta.tabs.find((t) => /form\s*responses/i.test(t.title)) ?? meta.tabs[0];
        if (!preferred) {
          throw new Error('No tabs were found inside this Google Spreadsheet.');
        }
        resolvedTab = preferred.title;
      }
      sheetResult = await fetchSheetRowsOAuth(
        config.spreadsheetId,
        resolvedTab,
        token,
        resolvedTitle
      );
    }
  } else {
    const ref = extractSpreadsheetRef(config.spreadsheetUrl || config.spreadsheetId);
    sheetResult = await fetchPublicGoogleSheetRows(
      config.spreadsheetUrl || config.spreadsheetId,
      ref?.gid
    );
  }

  if (sheetResult.headers.length === 0) {
    throw new Error('No candidate response columns were found yet in this Google Form or Sheet.');
  }

  const mapping = detectColumnMapping(sheetResult.headers);
  if (!mapping.fullName && !mapping.email) {
    throw new Error(
      'Could not find a "Full name" or "Email ID" column in this Google Sheet.'
    );
  }

  const built = buildImportPayload({
    rows: sheetResult.rows,
    mapping,
    existingStatuses: sortedStatuses,
    existingProjects: projects,
    members,
    autoCreateStatuses: config.autoCreateStatuses,
    deduplicate: true,
    fallbackStatusId,
    fallbackProjectId,
    startingCodeNumber: nextCodeNumber,
  });

  const hasExplicitProjectCol = Boolean(mapping.project);
  const hasExplicitPriorityCol = Boolean(mapping.priority);

  const enrichedSheetTasks: TaskItem[] = built.importedTasks.map((t) => ({
    ...t,
    projectId: hasExplicitProjectCol
      ? t.projectId
      : inferTrackIdFromSheet(t.yearsOfExperience, [...projects, ...built.newProjects]),
    priority: hasExplicitPriorityCol
      ? t.priority
      : inferPriorityFromSheet(
          t.yearsOfExperience,
          t.designedAiProduct,
          t.noticePeriod
        ),
  }));

  const mergedStatuses =
    built.newStatuses.length > 0
      ? [...sortedStatuses, ...built.newStatuses].map((s, idx) => ({ ...s, order: idx }))
      : sortedStatuses;
  const mergedProjects = [...projects, ...built.newProjects];

  const plan = buildSheetSyncPlan(
    currentTasks,
    enrichedSheetTasks,
    mergedStatuses,
    mergedProjects,
    nextCodeNumber
  );

  return {
    spreadsheetTitle: sheetResult.title,
    sheetName: sheetResult.sheetName,
    resolvedFormId,
    resolvedFormTitle,
    resolvedSpreadsheetId: resolvedSpreadsheetId || undefined,
    resolvedSpreadsheetUrl: resolvedSpreadsheetUrl || undefined,
    totalRows: sheetResult.rows.length,
    uniqueSheetRows: enrichedSheetTasks.length,
    newStatuses: built.newStatuses,
    newProjects: built.newProjects,
    plan,
  };
}

export function createDefaultFormSyncConfig(): GoogleSheetSyncConfig {
  return {
    sourceType: 'form',
    formId: DEFAULT_GOOGLE_FORM_ID,
    formUrl: DEFAULT_GOOGLE_FORM_URL,
    formTitle: 'Linked Google Form',
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: 'Linked Google Form',
    sheetName: '',
    authMode: 'oauth',
    enabled: true,
    intervalMinutes: 5,
    autoCreateStatuses: true,
    lastSyncedAt: null,
    lastSyncedRowCount: null,
    lastSyncSummary: null,
  };
}

export function loadGoogleSheetSyncConfig(uid: string): GoogleSheetSyncConfig | null {
  try {
    const raw = localStorage.getItem(`${CONFIG_KEY_PREFIX}${uid}`);
    if (!raw) {
      return createDefaultFormSyncConfig();
    }
    const parsed = JSON.parse(raw) as Partial<GoogleSheetSyncConfig> & { unlinked?: boolean };
    if (parsed?.unlinked) {
      return null;
    }
    const hasSpreadsheet = typeof parsed?.spreadsheetId === 'string' && parsed.spreadsheetId.length > 0;
    const hasForm = typeof parsed?.formId === 'string' && parsed.formId.length > 0;
    if (!parsed || (!hasSpreadsheet && !hasForm)) {
      return createDefaultFormSyncConfig();
    }
    return {
      sourceType: parsed.sourceType === 'form' || hasForm ? 'form' : 'sheet',
      formId: typeof parsed.formId === 'string' ? parsed.formId : null,
      formUrl: typeof parsed.formUrl === 'string' ? parsed.formUrl : null,
      formTitle: typeof parsed.formTitle === 'string' ? parsed.formTitle : null,
      spreadsheetId: parsed.spreadsheetId || '',
      spreadsheetUrl: parsed.spreadsheetUrl || '',
      spreadsheetTitle: parsed.spreadsheetTitle || parsed.formTitle || 'Google Form Responses',
      sheetName: parsed.sheetName || '',
      authMode: parsed.authMode === 'public_link' ? 'public_link' : 'oauth',
      enabled: Boolean(parsed.enabled),
      intervalMinutes:
        typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes >= 1
          ? parsed.intervalMinutes
          : 5,
      autoCreateStatuses: parsed.autoCreateStatuses !== false,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      lastSyncedRowCount:
        typeof parsed.lastSyncedRowCount === 'number' ? parsed.lastSyncedRowCount : null,
      lastSyncSummary:
        typeof parsed.lastSyncSummary === 'string' ? parsed.lastSyncSummary : null,
    };
  } catch {
    return createDefaultFormSyncConfig();
  }
}

export function saveGoogleSheetSyncConfig(
  uid: string,
  config: GoogleSheetSyncConfig
): void {
  try {
    localStorage.setItem(`${CONFIG_KEY_PREFIX}${uid}`, JSON.stringify(config));
  } catch {
    // Ignore storage failures
  }
}

export function clearGoogleSheetSyncConfig(uid: string): void {
  try {
    localStorage.setItem(`${CONFIG_KEY_PREFIX}${uid}`, JSON.stringify({ unlinked: true }));
  } catch {
    // Ignore storage failures
  }
}
