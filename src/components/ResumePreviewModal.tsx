import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  RefreshCw,
  X,
} from 'lucide-react';
import { auth, connectGoogleSheetsAccount, getSheetsAccessToken } from '../firebase';
import {
  DriveFileRestrictedError,
  DrivePreviewBlobResult,
  extractGoogleDriveResource,
  fetchAuthenticatedDrivePreviewViaProxy,
  fetchGoogleDriveFilePreviewBlob,
  grantAnyoneReadPermission,
  isDriveFileReadableByAnyone,
  isInlineBrowserRenderableMime,
} from '../services/googleDriveResumes';
import { SheetsAuthExpiredError } from '../services/googleSheetsSync';
import { TaskItem } from '../types';
import { getEmbeddableResumeUrl, sanitizeExternalUrl } from '../utils/statusStyles';

interface ResumePreviewModalProps {
  task: TaskItem | null;
  onClose: () => void;
}

export function ResumePreviewModal({ task, onClose }: ResumePreviewModalProps) {
  const [driveBlob, setDriveBlob] = useState<DrivePreviewBlobResult | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [restrictedByOwner, setRestrictedByOwner] = useState(false);
  const [forceEmbedFallback, setForceEmbedFallback] = useState(false);
  const [isPublicShared, setIsPublicShared] = useState<boolean | null>(null);
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [sharingFile, setSharingFile] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const activeBlobUrlRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);

  const replaceDriveBlob = useCallback((next: DrivePreviewBlobResult | null) => {
    if (activeBlobUrlRef.current && activeBlobUrlRef.current !== next?.objectUrl) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
    }
    activeBlobUrlRef.current = next?.objectUrl ?? null;
    setDriveBlob(next);
  }, []);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

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

  const driveResource = task ? extractGoogleDriveResource(task.resumeUrl) : null;
  const driveFileId = driveResource?.fileId ?? null;
  const driveKind = driveResource?.kind ?? null;

  const loadPreviewForTask = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    setDriveError(null);
    setRestrictedByOwner(false);
    setForceEmbedFallback(false);
    setShareFeedback(null);
    setIsPublicShared(null);

    if (!task || !driveFileId || !driveKind) {
      replaceDriveBlob(null);
      setLoadingDrive(false);
      return;
    }

    setLoadingDrive(true);
    const token = getSheetsAccessToken();

    try {
      if (token) {
        try {
          const [blobRes, anyoneReadable] = await Promise.all([
            fetchGoogleDriveFilePreviewBlob(driveFileId, token),
            isDriveFileReadableByAnyone(driveFileId, token).catch(() => null),
          ]);
          if (seq !== loadSeqRef.current) {
            URL.revokeObjectURL(blobRes.objectUrl);
            return;
          }
          replaceDriveBlob(blobRes);
          if (anyoneReadable !== null) {
            setIsPublicShared(anyoneReadable);
          }
          return;
        } catch (oauthErr) {
          if (seq !== loadSeqRef.current) return;
          // Non-owner Google accounts or expired OAuth tokens seamlessly fall back to
          // the authenticated server preview proxy below.
          if (!(oauthErr instanceof SheetsAuthExpiredError) && !auth.currentUser) {
            throw oauthErr;
          }
        }
      }

      if (auth.currentUser) {
        const proxyBlob = await fetchAuthenticatedDrivePreviewViaProxy({
          fileId: driveFileId,
          kind: driveKind,
        });
        if (seq !== loadSeqRef.current) {
          URL.revokeObjectURL(proxyBlob.objectUrl);
          return;
        }
        replaceDriveBlob(proxyBlob);
        setIsPublicShared(true);
      } else {
        replaceDriveBlob(null);
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      replaceDriveBlob(null);
      if (err instanceof DriveFileRestrictedError) {
        setRestrictedByOwner(true);
        setIsPublicShared(false);
      } else {
        setDriveError(
          err instanceof Error ? err.message : 'Unable to load resume preview.'
        );
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoadingDrive(false);
      }
    }
  }, [task?.id, driveFileId, driveKind, replaceDriveBlob]);

  useEffect(() => {
    setConfirmingShare(false);
    void loadPreviewForTask();
    return () => {
      loadSeqRef.current += 1;
      replaceDriveBlob(null);
    };
  }, [loadPreviewForTask, replaceDriveBlob]);

  if (!task) return null;

  const externalHref = sanitizeExternalUrl(task.resumeUrl);
  const embedHref = getEmbeddableResumeUrl(task.resumeUrl);

  const handleLoadWithGoogle = async () => {
    if (!driveFileId) return;
    setDriveError(null);
    setRestrictedByOwner(false);
    setLoadingDrive(true);
    try {
      const { accessToken } = await connectGoogleSheetsAccount();
      const [blobRes, anyoneReadable] = await Promise.all([
        fetchGoogleDriveFilePreviewBlob(driveFileId, accessToken),
        isDriveFileReadableByAnyone(driveFileId, accessToken).catch(() => null),
      ]);
      replaceDriveBlob(blobRes);
      if (anyoneReadable !== null) {
        setIsPublicShared(anyoneReadable);
      }
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Unable to connect Google Drive.'
      );
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleConfirmMakePublic = async () => {
    if (!driveFileId || !driveKind) return;
    setDriveError(null);
    setShareFeedback(null);
    setSharingFile(true);
    try {
      let token = getSheetsAccessToken();
      if (!token) {
        const res = await connectGoogleSheetsAccount();
        token = res.accessToken;
      }
      const outcome = await grantAnyoneReadPermission(driveFileId, token);
      setIsPublicShared(true);
      setRestrictedByOwner(false);
      setConfirmingShare(false);
      setShareFeedback(
        outcome === 'already_public'
          ? 'Already viewable by all logged-in users and anyone with the link.'
          : 'Updated! All logged-in users can now preview this resume.'
      );

      if (!driveBlob) {
        setLoadingDrive(true);
        try {
          const blobRes = await fetchGoogleDriveFilePreviewBlob(driveFileId, token);
          replaceDriveBlob(blobRes);
        } catch {
          if (auth.currentUser) {
            try {
              const proxyRes = await fetchAuthenticatedDrivePreviewViaProxy({
                fileId: driveFileId,
                kind: driveKind,
              });
              replaceDriveBlob(proxyRes);
            } catch {
              // Keep embed fallback available if blob load fails
            }
          }
        } finally {
          setLoadingDrive(false);
        }
      }
    } catch (err) {
      setDriveError(
        err instanceof Error
          ? err.message
          : 'Unable to update sharing permission for this resume.'
      );
    } finally {
      setSharingFile(false);
    }
  };

  const isImageBlob = Boolean(
    driveBlob?.mimeType.startsWith('image/') && !driveBlob.mimeType.includes('svg')
  );
  const canRenderBlobInline = Boolean(
    driveBlob && isInlineBrowserRenderableMime(driveBlob.mimeType, driveBlob.fileName)
  );

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
        <div className="min-h-14 px-5 py-2.5 border-b border-black/[0.08] dark:border-white/[0.10] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-display font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                {task.fullName || 'Candidate'} — Resume
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#86868B] truncate">
                {task.code} {task.email ? `· ${task.email}` : ''}
                {driveBlob?.fileName ? ` · ${driveBlob.fileName}` : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {driveFileId && isPublicShared === true && (
              <span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#28CD41]/10 dark:bg-[#30D158]/15 text-[11px] font-medium text-[#1E7F34] dark:text-[#30D158] whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Viewable by All Users</span>
              </span>
            )}

            {driveFileId && isPublicShared !== true && !confirmingShare && (
              <button
                type="button"
                onClick={() => setConfirmingShare(true)}
                className="h-8 px-3 rounded-lg border border-black/[0.10] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Globe className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF]" />
                <span>Allow Everyone to View</span>
              </button>
            )}

            {driveFileId && !driveBlob && !loadingDrive && (
              <button
                type="button"
                onClick={() => void handleLoadWithGoogle()}
                className="h-8 px-3 rounded-lg border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF]" />
                <span>Direct Drive Preview</span>
              </button>
            )}

            {externalHref !== '#' && (
              <a
                href={driveBlob?.objectUrl || externalHref}
                download={driveBlob ? driveBlob.fileName : undefined}
                target={driveBlob ? undefined : '_blank'}
                rel={driveBlob ? undefined : 'noopener noreferrer'}
                className="h-8 px-3 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {driveBlob ? (
                  <Download className="w-3.5 h-3.5" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                <span>{driveBlob ? 'Download' : 'Open in New Tab'}</span>
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

        {confirmingShare && driveFileId && (
          <div className="px-5 py-2.5 bg-[#0071E3]/[0.07] dark:bg-[#0A84FF]/[0.14] border-b border-[#0071E3]/20 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-[#1D1D1F] dark:text-[#F5F5F7]">
              Allow all logged-in team members and anyone with the link to preview this Google Drive resume (read-only)?
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={sharingFile}
                onClick={() => void handleConfirmMakePublic()}
                className="h-7 px-3 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] text-white font-medium disabled:opacity-50"
              >
                {sharingFile ? 'Updating...' : 'Confirm'}
              </button>
              <button
                type="button"
                disabled={sharingFile}
                onClick={() => setConfirmingShare(false)}
                className="h-7 px-2.5 rounded-lg text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {(driveError || shareFeedback) && (
          <div
            className={`px-5 py-2 border-b text-xs flex items-center gap-2 shrink-0 ${
              driveError
                ? 'bg-[#FF3B30]/[0.08] border-[#FF3B30]/20 text-[#D70015] dark:text-[#FF453A]'
                : 'bg-[#28CD41]/10 border-[#28CD41]/25 text-[#1E7F34] dark:text-[#30D158]'
            }`}
          >
            {driveError ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{driveError || shareFeedback}</span>
          </div>
        )}

        <div className="flex-1 bg-[#F5F5F7] dark:bg-black min-h-0 relative">
          {loadingDrive ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#0071E3] dark:text-[#2997FF]" />
              <span>Loading resume preview...</span>
            </div>
          ) : driveBlob ? (
            isImageBlob ? (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                <img
                  src={driveBlob.objectUrl}
                  alt={`Resume for ${task.fullName}`}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                />
              </div>
            ) : canRenderBlobInline ? (
              <iframe
                src={driveBlob.objectUrl}
                title={`Resume for ${task.fullName}`}
                className="w-full h-full border-0 bg-white"
              />
            ) : embedHref && (isPublicShared === true || forceEmbedFallback) ? (
              <iframe
                src={embedHref}
                title={`Resume for ${task.fullName}`}
                className="w-full h-full border-0 bg-white"
                allow="autoplay"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#2997FF] flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md">
                  <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {driveBlob.fileName}
                  </p>
                  <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                    This document format cannot be rendered natively by the browser as a local file. Download it directly or open it in Google Drive&apos;s viewer.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <a
                    href={driveBlob.objectUrl}
                    download={driveBlob.fileName}
                    className="h-9 px-4 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {driveBlob.fileName}</span>
                  </a>
                  {embedHref && (
                    <button
                      type="button"
                      onClick={() => setForceEmbedFallback(true)}
                      className="h-9 px-4 rounded-xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors"
                    >
                      Try Google Viewer
                    </button>
                  )}
                </div>
              </div>
            )
          ) : restrictedByOwner && !forceEmbedFallback ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/12 dark:bg-[#FF9F0A]/15 text-[#B25000] dark:text-[#FF9F0A] flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Google Drive File Access Restricted
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                  This resume is currently private in the Google Form owner&apos;s Drive. Ask the owner to click{' '}
                  <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Allow Everyone to View
                  </span>
                  , or load it directly with your Google Drive account.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {driveFileId && (
                  <button
                    type="button"
                    onClick={() => void handleLoadWithGoogle()}
                    className="h-9 px-4 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Direct Drive Preview</span>
                  </button>
                )}
                {driveFileId && !confirmingShare && (
                  <button
                    type="button"
                    onClick={() => setConfirmingShare(true)}
                    className="h-9 px-4 rounded-xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#2997FF]" />
                    <span>Allow Everyone to View</span>
                  </button>
                )}
                {embedHref && (
                  <button
                    type="button"
                    onClick={() => setForceEmbedFallback(true)}
                    className="h-9 px-3.5 rounded-xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors"
                  >
                    Try Drive Viewer
                  </button>
                )}
                {externalHref !== '#' && (
                  <a
                    href={externalHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3.5 rounded-xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#2C2C2E] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ) : embedHref ? (
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
