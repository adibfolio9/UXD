import { Project, StatusDefinition, TaskItem } from '../types';

export interface CandidateIdentityFields {
  fullName: string;
  email: string;
  contactNo: string;
  portfolioUrl: string;
}

export function normalizeCandidateEmail(email: string): string {
  let clean = (email || '').toLowerCase().replace(/\s+/g, '').trim();
  clean = clean
    .replace(/\.con$/i, '.com')
    .replace(/@gnail\.com$/i, '@gmail.com')
    .replace(/\.comhelp$/i, '.com');
  return clean.includes('@') ? clean : '';
}

export function normalizeCandidatePhone(contactNo: string): string {
  const digits = (contactNo || '').replace(/\D+/g, '');
  if (digits.length < 9) return '';
  const last10 = digits.slice(-10);
  if (/^0+$/.test(last10) || last10 === '1234567890') return '';
  return last10;
}

export function normalizeCandidatePortfolio(portfolioUrl: string): string {
  const clean = (portfolioUrl || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/+$/, '');
  if (
    !clean ||
    clean === '-' ||
    clean === 'na' ||
    clean === 'n/a' ||
    clean.length < 8 ||
    !clean.includes('.')
  ) {
    return '';
  }
  return clean;
}

export function normalizeCandidateName(fullName: string): string {
  return (fullName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function areCandidatesSamePerson(
  a: CandidateIdentityFields,
  b: CandidateIdentityFields
): boolean {
  const emailA = normalizeCandidateEmail(a.email);
  const emailB = normalizeCandidateEmail(b.email);
  if (emailA && emailB && emailA === emailB) return true;

  const phoneA = normalizeCandidatePhone(a.contactNo);
  const phoneB = normalizeCandidatePhone(b.contactNo);
  if (phoneA && phoneB && phoneA === phoneB) return true;

  const nameA = normalizeCandidateName(a.fullName);
  const nameB = normalizeCandidateName(b.fullName);
  const portA = normalizeCandidatePortfolio(a.portfolioUrl);
  const portB = normalizeCandidatePortfolio(b.portfolioUrl);
  if (nameA && nameB && nameA === nameB && portA && portB && portA === portB) {
    return true;
  }

  return false;
}

export function parseCandidateTimestampMs(timestamp: string, fallbackIso?: string): number {
  const raw = (timestamp || '').trim();
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (slashMatch) {
    const [, month, day, year, hour, min, sec = '0'] = slashMatch;
    const ms = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(min),
      Number(sec)
    );
    if (!Number.isNaN(ms)) return ms;
  }

  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (fallbackIso) {
    const fallback = Date.parse(fallbackIso);
    if (!Number.isNaN(fallback)) return fallback;
  }

  return 0;
}

const BACKFILL_FIELDS = [
  'fullName',
  'email',
  'contactNo',
  'portfolioUrl',
  'currentLocation',
  'yearsOfExperience',
  'designedAiProduct',
  'noticePeriod',
  'resumeUrl',
  'message',
  'expectedSalary',
  'readyToRelocateIn',
] as const;

function isBlankField(val: string | undefined): boolean {
  const trimmed = (val ?? '').trim();
  return !trimmed || trimmed === '-';
}

function completenessScore(task: TaskItem): number {
  let score = 0;
  for (const field of BACKFILL_FIELDS) {
    if (!isBlankField(task[field])) score += 1;
  }
  return score;
}

function survivorRank(task: TaskItem, index: number): [number, number, number, number] {
  const hasWorkflowState =
    task.statusId !== 'status-applied' || (task.statusHistory?.length ?? 0) > 0 ? 1 : 0;
  const tsMs = parseCandidateTimestampMs(task.timestamp, task.updatedAt);
  const comp = completenessScore(task);
  return [hasWorkflowState, tsMs, comp, index];
}

function compareRank(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export interface DeduplicationResult {
  uniqueTasks: TaskItem[];
  removedDuplicates: TaskItem[];
  updatedSurvivors: TaskItem[];
  removedCount: number;
  clusterCount: number;
}

export function deduplicateTaskList(tasks: TaskItem[]): DeduplicationResult {
  if (tasks.length <= 1) {
    return {
      uniqueTasks: tasks,
      removedDuplicates: [],
      updatedSurvivors: [],
      removedCount: 0,
      clusterCount: 0,
    };
  }

  const parent = tasks.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();
  const byNamePortfolio = new Map<string, number>();

  tasks.forEach((task, i) => {
    const email = normalizeCandidateEmail(task.email);
    const phone = normalizeCandidatePhone(task.contactNo);
    const name = normalizeCandidateName(task.fullName);
    const portfolio = normalizeCandidatePortfolio(task.portfolioUrl);

    if (email) {
      const existing = byEmail.get(email);
      if (existing !== undefined) union(existing, i);
      else byEmail.set(email, i);
    }
    if (phone) {
      const existing = byPhone.get(phone);
      if (existing !== undefined) union(existing, i);
      else byPhone.set(phone, i);
    }
    if (name && portfolio) {
      const key = `${name}::${portfolio}`;
      const existing = byNamePortfolio.get(key);
      if (existing !== undefined) union(existing, i);
      else byNamePortfolio.set(key, i);
    }
  });

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < tasks.length; i++) {
    const root = find(i);
    const arr = clusters.get(root);
    if (arr) arr.push(i);
    else clusters.set(root, [i]);
  }

  const keepByIndex = new Map<number, TaskItem>();
  const removedDuplicates: TaskItem[] = [];
  const updatedSurvivors: TaskItem[] = [];
  let clusterCount = 0;

  for (const indices of clusters.values()) {
    if (indices.length === 1) {
      const idx = indices[0];
      keepByIndex.set(idx, tasks[idx]);
      continue;
    }

    clusterCount += 1;
    // Sort cluster members from best survivor to oldest/duplicate
    const ranked = [...indices].sort((ia, ib) =>
      compareRank(survivorRank(tasks[ib], ib), survivorRank(tasks[ia], ia))
    );

    const winnerIdx = ranked[0];
    const winnerOriginal = tasks[winnerIdx];
    const merged: TaskItem = { ...winnerOriginal };
    let changed = false;

    // Sort other candidates newest-first so we backfill using the freshest non-empty values
    const othersByRecency = ranked.slice(1).sort((ia, ib) => {
      const tsDiff =
        parseCandidateTimestampMs(tasks[ib].timestamp, tasks[ib].updatedAt) -
        parseCandidateTimestampMs(tasks[ia].timestamp, tasks[ia].updatedAt);
      return tsDiff !== 0 ? tsDiff : ib - ia;
    });

    for (const otherIdx of othersByRecency) {
      const other = tasks[otherIdx];
      removedDuplicates.push(other);
      for (const field of BACKFILL_FIELDS) {
        if (isBlankField(merged[field]) && !isBlankField(other[field])) {
          merged[field] = other[field];
          changed = true;
        }
      }
      // Also adopt newer timestamp if winner had a custom status from an earlier row
      const otherTs = parseCandidateTimestampMs(other.timestamp, other.updatedAt);
      const mergedTs = parseCandidateTimestampMs(merged.timestamp, merged.updatedAt);
      if (otherTs > mergedTs && other.timestamp.trim()) {
        merged.timestamp = other.timestamp;
        changed = true;
      }
    }

    if (changed) {
      merged.updatedAt = new Date().toISOString();
      updatedSurvivors.push(merged);
    }

    keepByIndex.set(winnerIdx, merged);
  }

  const uniqueTasks: TaskItem[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const kept = keepByIndex.get(i);
    if (kept) uniqueTasks.push(kept);
  }

  return {
    uniqueTasks,
    removedDuplicates,
    updatedSurvivors,
    removedCount: removedDuplicates.length,
    clusterCount,
  };
}

export function mergeImportedTasksWithExisting(
  existingTasks: TaskItem[],
  importedTasks: TaskItem[]
): {
  newTasksToInsert: TaskItem[];
  updatedExistingTasks: TaskItem[];
  skippedAsDuplicateCount: number;
} {
  const newTasksToInsert: TaskItem[] = [];
  const updatedExistingMap = new Map<string, TaskItem>();
  let skippedAsDuplicateCount = 0;

  for (const imp of importedTasks) {
    const matchIndex = existingTasks.findIndex((ext) => areCandidatesSamePerson(ext, imp));
    if (matchIndex === -1) {
      newTasksToInsert.push(imp);
      continue;
    }

    skippedAsDuplicateCount += 1;
    const baseExisting = updatedExistingMap.get(existingTasks[matchIndex].id) ?? existingTasks[matchIndex];
    const nextExisting: TaskItem = { ...baseExisting };
    let changed = false;

    for (const field of BACKFILL_FIELDS) {
      if (isBlankField(nextExisting[field]) && !isBlankField(imp[field])) {
        nextExisting[field] = imp[field];
        changed = true;
      }
    }

    if (changed) {
      nextExisting.updatedAt = new Date().toISOString();
      updatedExistingMap.set(nextExisting.id, nextExisting);
    }
  }

  return {
    newTasksToInsert,
    updatedExistingTasks: Array.from(updatedExistingMap.values()),
    skippedAsDuplicateCount,
  };
}

export interface SheetSyncPlan {
  mergedTasks: TaskItem[];
  tasksToInsert: TaskItem[];
  tasksToUpdate: TaskItem[];
  duplicateIdsRemoved: string[];
  nextCodeNumber: number;
}

export function buildSheetSyncPlan(
  currentTasks: TaskItem[],
  seedTasks: TaskItem[],
  statuses: StatusDefinition[],
  projects: Project[],
  currentNextCodeNumber: number
): SheetSyncPlan {
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const validStatusIds = new Set(sortedStatuses.map((s) => s.id));
  const fallbackStatusId = sortedStatuses[0]?.id ?? 'status-applied';
  const validProjectIds = new Set(projects.map((p) => p.id));
  const fallbackProjectId = projects[0]?.id ?? 'proj-lead-staff';

  const initialDedup = deduplicateTaskList(currentTasks);
  const workingTasks: TaskItem[] = initialDedup.uniqueTasks.map((t) => ({ ...t }));
  const updatedMap = new Map<string, TaskItem>(
    initialDedup.updatedSurvivors.map((t) => [
      t.id,
      {
        ...t,
        statusId: validStatusIds.has(t.statusId) ? t.statusId : fallbackStatusId,
        projectId: validProjectIds.has(t.projectId) ? t.projectId : fallbackProjectId,
      },
    ])
  );
  const duplicateIdsRemoved = initialDedup.removedDuplicates.map((t) => t.id);

  const usedIds = new Set<string>([
    ...workingTasks.map((t) => t.id),
    ...duplicateIdsRemoved,
  ]);
  const usedCodes = new Set<string>(workingTasks.map((t) => t.code));
  const nextOrderByStatus = new Map<string, number>();
  for (const t of workingTasks) {
    const prevMax = nextOrderByStatus.get(t.statusId) ?? -1;
    if (t.order >= prevMax) {
      nextOrderByStatus.set(t.statusId, t.order + 1);
    }
  }

  let nextCode = Math.max(currentNextCodeNumber, 101);
  const tasksToInsert: TaskItem[] = [];
  const insertedIdSet = new Set<string>();

  for (const seedTask of seedTasks) {
    const matchIndex = workingTasks.findIndex((ext) =>
      areCandidatesSamePerson(ext, seedTask)
    );

    if (matchIndex !== -1) {
      const existing = { ...workingTasks[matchIndex] };
      let changed = false;

      if (!validStatusIds.has(existing.statusId)) {
        existing.statusId = fallbackStatusId;
        changed = true;
      }
      if (!validProjectIds.has(existing.projectId)) {
        existing.projectId = fallbackProjectId;
        changed = true;
      }

      for (const field of BACKFILL_FIELDS) {
        if (isBlankField(existing[field]) && !isBlankField(seedTask[field])) {
          existing[field] = seedTask[field];
          changed = true;
        }
      }

      const seedTs = parseCandidateTimestampMs(seedTask.timestamp, seedTask.updatedAt);
      const existingTs = parseCandidateTimestampMs(existing.timestamp, existing.updatedAt);
      if (seedTs > existingTs && seedTask.timestamp.trim()) {
        existing.timestamp = seedTask.timestamp;
        changed = true;
      }

      if (changed) {
        existing.updatedAt = new Date().toISOString();
        workingTasks[matchIndex] = existing;
        if (!insertedIdSet.has(existing.id)) {
          updatedMap.set(existing.id, existing);
        }
      }
      continue;
    }

    let newId = seedTask.id;
    if (usedIds.has(newId)) {
      newId = `cand-sync-${seedTask.id}`;
      let suffix = 1;
      while (usedIds.has(newId)) {
        newId = `cand-sync-${seedTask.id}-${suffix++}`;
      }
    }
    usedIds.add(newId);

    let newCode = seedTask.code;
    if (!newCode || usedCodes.has(newCode)) {
      while (usedCodes.has(`CND-${nextCode}`)) {
        nextCode += 1;
      }
      newCode = `CND-${nextCode}`;
      nextCode += 1;
    }
    usedCodes.add(newCode);

    const statusId = validStatusIds.has(seedTask.statusId)
      ? seedTask.statusId
      : fallbackStatusId;
    const projectId = validProjectIds.has(seedTask.projectId)
      ? seedTask.projectId
      : fallbackProjectId;
    const order = nextOrderByStatus.get(statusId) ?? 0;
    nextOrderByStatus.set(statusId, order + 1);

    const newTask: TaskItem = {
      ...seedTask,
      id: newId,
      code: newCode,
      statusId,
      projectId,
      order,
      updatedAt: new Date().toISOString(),
    };
    workingTasks.push(newTask);
    tasksToInsert.push(newTask);
    insertedIdSet.add(newId);
  }

  const finalDedup = deduplicateTaskList(workingTasks);
  const extraRemovedIds = finalDedup.removedDuplicates.map((t) => t.id);
  const removedIdSet = new Set([...duplicateIdsRemoved, ...extraRemovedIds]);

  let maxNumericCode = Math.max(nextCode - 1, currentNextCodeNumber - 1, 100 + seedTasks.length);
  for (const t of finalDedup.uniqueTasks) {
    const m = t.code.match(/^CND-(\d+)$/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNumericCode) {
        maxNumericCode = n;
      }
    }
  }

  return {
    mergedTasks: finalDedup.uniqueTasks,
    tasksToInsert: tasksToInsert.filter((t) => !removedIdSet.has(t.id)),
    tasksToUpdate: Array.from(updatedMap.values()).filter(
      (t) => !insertedIdSet.has(t.id) && !removedIdSet.has(t.id)
    ),
    duplicateIdsRemoved: Array.from(removedIdSet),
    nextCodeNumber: maxNumericCode + 1,
  };
}
