import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Globe, ShieldCheck, X } from 'lucide-react';
import { getSheetsAccessToken } from '../firebase';
import {
  BatchResumeShareProgress,
  collectDriveResumeFileIds,
  shareAllDriveResumesForEveryone,
} from '../services/googleDriveResumes';
import { SheetsAuthExpiredError } from '../services/googleSheetsSync';
import { TaskItem } from '../types';

interface ShareResumesConfirmModalProps {
  open: boolean;
  tasks: TaskItem[];
  sheetsConnected: boolean;
  onConnectGoogle: () => Promise<string | null>;
  onAuthExpired: () => void;
  onClose: () => void;
}

export function ShareResumesConfirmModal({
  open,
  tasks,
  sheetsConnected,
  onConnectGoogle,
  onAuthExpired,
  onClose,
}: ShareResumesConfirmModalProps) {
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState<BatchResumeShareProgress | null>(null);
  const [doneResult, setDoneResult] = useState<BatchResumeShareProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { driveTaskCount, uniqueFileIds } = useMemo(
    () => collectDriveResumeFileIds(tasks),
    [tasks]
  );

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setRunning(false);
      setConnecting(false);
      setProgress(null);
      setDoneResult(null);
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirmShare = async () => {
    setErrorMsg(null);
    setDoneResult(null);

    let token = getSheetsAccessToken();
    if (!token) {
      setConnecting(true);
      try {
        token = await onConnectGoogle();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to connect Google Drive.'
        );
        setConnecting(false);
        return;
      } finally {
        setConnecting(false);
      }
    }

    if (!token) {
      setErrorMsg('Sign in with Google to update resume sharing permissions.');
      return;
    }

    if (uniqueFileIds.length === 0) {
      setErrorMsg('No Google Drive resume links were found in the current candidate list.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress({
      processed: 0,
      total: uniqueFileIds.length,
      newlyShared: 0,
      alreadyPublic: 0,
      failed: 0,
    });

    try {
      const result = await shareAllDriveResumesForEveryone({
        fileIds: uniqueFileIds,
        accessToken: token,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setDoneResult(result);
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        onAuthExpired();
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to update Google Drive resume permissions.'
      );
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-resumes-title"
    >
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={() => {
          if (!running) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#2997FF] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="share-resumes-title"
                className="text-base font-display font-semibold tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]"
              >
                Allow Everyone to View Resumes
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                Update Google Drive sharing permissions so anyone viewing candidates can open resumes without requesting access.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (running) {
                abortRef.current?.abort();
              }
              onClose();
            }}
            aria-label="Close resume sharing dialog"
            className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/70 border border-black/[0.06] dark:border-white/[0.08] space-y-2 text-xs text-[#1D1D1F] dark:text-[#F5F5F7]">
          <div className="flex items-center justify-between">
            <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Google Drive resume files affected</span>
            <span className="font-mono font-semibold tabular-nums">
              {uniqueFileIds.length} files ({driveTaskCount} candidates)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Permission granted</span>
            <span className="inline-flex items-center gap-1 font-medium text-[#1E7F34] dark:text-[#30D158]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Anyone with link · View only
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 flex items-start gap-2 text-xs text-[#D70015] dark:text-[#FF453A]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              <span>
                {running ? 'Updating Drive sharing permissions...' : 'Completed'}
              </span>
              <span className="font-mono tabular-nums">
                {progress.processed} / {progress.total} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.07] dark:bg-white/[0.10] overflow-hidden">
              <div
                className="h-full bg-[#0071E3] dark:bg-[#0A84FF] transition-all duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {doneResult && (
          <div className="p-3.5 rounded-xl bg-[#28CD41]/10 dark:bg-[#30D158]/15 border border-[#28CD41]/25 flex items-start gap-2.5 text-xs text-[#1E7F34] dark:text-[#30D158]">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">Resume permissions updated</p>
              <p>
                {doneResult.newlyShared} newly shared for everyone · {doneResult.alreadyPublic} already viewable
                {doneResult.failed > 0 ? ` · ${doneResult.failed} skipped (owned by another account)` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              if (running) {
                abortRef.current?.abort();
              }
              onClose();
            }}
            className="h-9 px-4 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors"
          >
            {doneResult ? 'Done' : running ? 'Stop' : 'Cancel'}
          </button>

          {!doneResult && (
            <button
              type="button"
              disabled={running || connecting || uniqueFileIds.length === 0}
              onClick={() => void handleConfirmShare()}
              className="h-9 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-45 text-white text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {connecting
                  ? 'Connecting Google...'
                  : running
                    ? 'Sharing Resumes...'
                    : sheetsConnected
                      ? `Confirm & Share ${uniqueFileIds.length} Resumes`
                      : 'Sign in & Share Resumes'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
