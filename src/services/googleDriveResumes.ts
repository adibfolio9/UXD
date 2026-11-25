import { clearSheetsAccessToken } from '../firebase';
import { TaskItem } from '../types';
import { extractExternalUrl } from '../utils/statusStyles';
import { SheetsAuthExpiredError } from './googleSheetsSync';

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  const clean = extractExternalUrl(rawUrl);
  if (!clean) return null;

  try {
    const url = new URL(clean);
    if (url.hostname === 'drive.google.com') {
      const idParam = url.searchParams.get('id');
      if (idParam && /^[a-zA-Z0-9_-]{10,128}$/.test(idParam.trim())) {
        return idParam.trim();
      }
      const fileMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{10,128})/);
      if (fileMatch?.[1]) {
        return fileMatch[1];
      }
    }
    if (url.hostname === 'docs.google.com') {
      const docMatch = url.pathname.match(
        /\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]{10,128})/
      );
      if (docMatch?.[1]) {
        return docMatch[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function collectDriveResumeFileIds(tasks: TaskItem[]): {
  driveTaskCount: number;
  uniqueFileIds: string[];
} {
  const seen = new Set<string>();
  let driveTaskCount = 0;

  for (const task of tasks) {
    const fileId = extractGoogleDriveFileId(task.resumeUrl);
    if (fileId) {
      driveTaskCount += 1;
      seen.add(fileId);
    }
  }

  return {
    driveTaskCount,
    uniqueFileIds: Array.from(seen),
  };
}

export interface DrivePreviewBlobResult {
  objectUrl: string;
  mimeType: string;
  fileName: string;
}

export async function fetchGoogleDriveFilePreviewBlob(
  fileId: string,
  accessToken: string
): Promise<DrivePreviewBlobResult> {
  const safeId = encodeURIComponent(fileId.trim());
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${safeId}?fields=id,name,mimeType&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (metaRes.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  const meta = (await metaRes.json().catch(() => ({}))) as {
    name?: string;
    mimeType?: string;
    error?: { message?: string };
  };

  if (!metaRes.ok) {
    throw new Error(
      meta?.error?.message || `Unable to access Google Drive resume (HTTP ${metaRes.status}).`
    );
  }

  const rawMime = meta.mimeType || 'application/pdf';
  const fileName = meta.name || 'resume.pdf';
  const isGoogleWorkspaceDoc = rawMime.startsWith('application/vnd.google-apps.');

  const mediaUrl = isGoogleWorkspaceDoc
    ? `https://www.googleapis.com/drive/v3/files/${safeId}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${safeId}?alt=media&supportsAllDrives=true`;

  const mediaRes = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (mediaRes.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  if (!mediaRes.ok) {
    throw new Error(`Unable to load resume content (HTTP ${mediaRes.status}).`);
  }

  const blob = await mediaRes.blob();
  const effectiveMime = isGoogleWorkspaceDoc
    ? 'application/pdf'
    : blob.type || rawMime;
  const typedBlob =
    blob.type === effectiveMime ? blob : new Blob([blob], { type: effectiveMime });

  return {
    objectUrl: URL.createObjectURL(typedBlob),
    mimeType: effectiveMime,
    fileName,
  };
}

export async function isDriveFileReadableByAnyone(
  fileId: string,
  accessToken: string
): Promise<boolean> {
  const safeId = encodeURIComponent(fileId.trim());
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${safeId}/permissions?fields=permissions(id,type,role)&supportsAllDrives=true`,
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

  if (!res.ok) return false;

  const data = (await res.json().catch(() => ({}))) as {
    permissions?: Array<{ type?: string; role?: string }>;
  };

  return (data.permissions ?? []).some(
    (p) =>
      p.type === 'anyone' &&
      (p.role === 'reader' || p.role === 'commenter' || p.role === 'writer')
  );
}

export async function grantAnyoneReadPermission(
  fileId: string,
  accessToken: string
): Promise<'newly_shared' | 'already_public'> {
  const already = await isDriveFileReadableByAnyone(fileId, accessToken);
  if (already) {
    return 'already_public';
  }

  const safeId = encodeURIComponent(fileId.trim());
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${safeId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (res.status === 401) {
    clearSheetsAccessToken();
    throw new SheetsAuthExpiredError();
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      errBody?.error?.message || `Failed to share resume file (HTTP ${res.status}).`
    );
  }

  return 'newly_shared';
}

export interface BatchResumeShareProgress {
  processed: number;
  total: number;
  newlyShared: number;
  alreadyPublic: number;
  failed: number;
}

export async function shareAllDriveResumesForEveryone(params: {
  fileIds: string[];
  accessToken: string;
  signal?: AbortSignal;
  onProgress?: (progress: BatchResumeShareProgress) => void;
}): Promise<BatchResumeShareProgress> {
  const { fileIds, accessToken, signal, onProgress } = params;
  const total = fileIds.length;
  let processed = 0;
  let newlyShared = 0;
  let alreadyPublic = 0;
  let failed = 0;

  let cursor = 0;
  const concurrency = 6;

  const worker = async () => {
    while (cursor < fileIds.length) {
      if (signal?.aborted) return;
      const idx = cursor;
      cursor += 1;
      const fileId = fileIds[idx];

      try {
        const outcome = await grantAnyoneReadPermission(fileId, accessToken);
        if (outcome === 'already_public') {
          alreadyPublic += 1;
        } else {
          newlyShared += 1;
        }
      } catch (err) {
        if (err instanceof SheetsAuthExpiredError) {
          throw err;
        }
        failed += 1;
      } finally {
        processed += 1;
        onProgress?.({
          processed,
          total,
          newlyShared,
          alreadyPublic,
          failed,
        });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, fileIds.length)) },
    () => worker()
  );
  await Promise.all(workers);

  return {
    processed,
    total,
    newlyShared,
    alreadyPublic,
    failed,
  };
}
