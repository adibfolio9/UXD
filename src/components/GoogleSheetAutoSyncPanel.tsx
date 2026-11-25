import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  RefreshCw,
  Sheet,
  Unlink,
} from 'lucide-react';
import {
  GoogleSheetAuthMode,
  GoogleSheetSyncConfig,
  GoogleSheetTabInfo,
} from '../types';
import { getSheetsAccessToken } from '../firebase';
import {
  DEFAULT_GOOGLE_FORM_URL,
  extractGoogleFormRef,
  extractSpreadsheetRef,
  fetchGoogleFormMetadataOAuth,
  fetchPublicGoogleSheetRows,
  fetchSpreadsheetMetadataOAuth,
} from '../services/googleSheetsSync';

interface GoogleSheetAutoSyncPanelProps {
  config: GoogleSheetSyncConfig | null;
  sheetsConnected: boolean;
  isSyncing: boolean;
  syncError: string | null;
  userEmail: string;
  onConnectGoogleSheets: () => Promise<string | null>;
  onDisconnectGoogleSheets: () => void;
  onSaveConfig: (next: GoogleSheetSyncConfig | null) => void;
  onSyncNow: (overrideConfig?: GoogleSheetSyncConfig) => Promise<void>;
}

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every 1 min' },
  { value: 5, label: 'Every 5 min' },
  { value: 15, label: 'Every 15 min' },
  { value: 30, label: 'Every 30 min' },
];

export function GoogleSheetAutoSyncPanel({
  config,
  sheetsConnected,
  isSyncing,
  syncError,
  userEmail,
  onConnectGoogleSheets,
  onDisconnectGoogleSheets,
  onSaveConfig,
  onSyncNow,
}: GoogleSheetAutoSyncPanelProps) {
  const [urlInput, setUrlInput] = useState(
    config?.formUrl || config?.spreadsheetUrl || config?.spreadsheetId || DEFAULT_GOOGLE_FORM_URL
  );
  const [authMode, setAuthMode] = useState<GoogleSheetAuthMode>(
    config?.authMode ?? 'oauth'
  );
  const [tabs, setTabs] = useState<GoogleSheetTabInfo[]>(
    config?.sheetName ? [{ sheetId: 0, title: config.sheetName }] : []
  );
  const [selectedTab, setSelectedTab] = useState(config?.sheetName || '');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(config?.spreadsheetTitle || '');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(config?.intervalMinutes ?? 5);
  const [autoCreateStatuses, setAutoCreateStatuses] = useState<boolean>(
    config?.autoCreateStatuses ?? true
  );
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? true);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelSuccess, setPanelSuccess] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  useEffect(() => {
    if (config) {
      setUrlInput(config.formUrl || config.spreadsheetUrl || config.spreadsheetId);
      setAuthMode(config.authMode);
      setSelectedTab(config.sheetName);
      setSpreadsheetTitle(config.spreadsheetTitle);
      setIntervalMinutes(config.intervalMinutes);
      setAutoCreateStatuses(config.autoCreateStatuses);
      setEnabled(config.enabled);
      if (config.sheetName && tabs.length === 0) {
        setTabs([{ sheetId: 0, title: config.sheetName }]);
      }
    }
  }, [config]);

  useEffect(() => {
    const token = getSheetsAccessToken();
    if (!sheetsConnected || !token || !config?.spreadsheetId || config.authMode !== 'oauth') {
      return;
    }
    let cancelled = false;
    void fetchSpreadsheetMetadataOAuth(config.spreadsheetId, token)
      .then((meta) => {
        if (cancelled) return;
        setTabs(meta.tabs);
        setSpreadsheetTitle(meta.title);
      })
      .catch(() => {
        // Ignore silent tab refresh errors
      });
    return () => {
      cancelled = true;
    };
  }, [sheetsConnected, config?.spreadsheetId, config?.authMode]);

  const handleGoogleConnectClick = async () => {
    setPanelError(null);
    setPanelSuccess(null);
    setConnectingGoogle(true);
    try {
      const token = await onConnectGoogleSheets();
      if (token) {
        setAuthMode('oauth');
        if ((config?.spreadsheetId || config?.formId) && config.authMode === 'oauth') {
          await onSyncNow({ ...config, authMode: 'oauth' });
          setPanelSuccess(
            'Google connected and candidate submissions synced from your Form & Sheet.'
          );
        } else {
          setPanelSuccess(
            'Google connected. Paste your Google Form or Sheet link below to load tabs and start auto-syncing.'
          );
        }
      }
    } catch (err) {
      setPanelError(
        err instanceof Error ? err.message : 'Unable to connect Google Forms & Sheets.'
      );
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleLoadAndConnectSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    setPanelSuccess(null);

    let formRef = null;
    try {
      formRef = extractGoogleFormRef(urlInput);
    } catch (formParseErr) {
      setPanelError(
        formParseErr instanceof Error ? formParseErr.message : 'Invalid Google Form URL.'
      );
      return;
    }

    if (formRef) {
      setLoadingTabs(true);
      try {
        const token = getSheetsAccessToken();
        if (!token) {
          setPanelError(
            'Click "Sign in with Google" above to fetch responses from your Google Form and its linked Sheet.'
          );
          setLoadingTabs(false);
          return;
        }

        const formMeta = await fetchGoogleFormMetadataOAuth(formRef.formId, token);
        let linkedSheetId = formMeta.linkedSheetId || '';
        let linkedSheetUrl = linkedSheetId
          ? `https://docs.google.com/spreadsheets/d/${linkedSheetId}/edit`
          : '';
        let sheetTitle = formMeta.title;
        let chosenTab = 'Form Responses (Google Forms)';

        if (linkedSheetId) {
          try {
            const sheetMeta = await fetchSpreadsheetMetadataOAuth(linkedSheetId, token);
            setTabs(sheetMeta.tabs);
            sheetTitle = sheetMeta.title;
            const formTabMatch = sheetMeta.tabs.find((t) => /form\s*responses/i.test(t.title));
            chosenTab =
              (selectedTab && sheetMeta.tabs.some((t) => t.title === selectedTab)
                ? selectedTab
                : '') ||
              formTabMatch?.title ||
              sheetMeta.tabs[0]?.title ||
              '';
            setSelectedTab(chosenTab);
          } catch {
            // Keep Form metadata if Sheet metadata cannot be read directly
          }
        } else {
          setTabs([]);
          setSelectedTab(chosenTab);
        }

        setSpreadsheetTitle(sheetTitle);
        const nextConfig: GoogleSheetSyncConfig = {
          sourceType: 'form',
          formId: formRef.formId,
          formUrl: formRef.normalizedUrl,
          formTitle: formMeta.title,
          spreadsheetId: linkedSheetId,
          spreadsheetUrl: linkedSheetUrl,
          spreadsheetTitle: sheetTitle,
          sheetName: chosenTab,
          authMode: 'oauth',
          enabled,
          intervalMinutes,
          autoCreateStatuses,
          lastSyncedAt: config?.lastSyncedAt ?? null,
          lastSyncedRowCount: config?.lastSyncedRowCount ?? null,
          lastSyncSummary: config?.lastSyncSummary ?? null,
        };
        onSaveConfig(nextConfig);
        await onSyncNow(nextConfig);
        setPanelSuccess(
          linkedSheetId
            ? `Linked Google Form "${formMeta.title}" and its Sheet (${chosenTab}) — synced responses.`
            : `Linked Google Form "${formMeta.title}" and synced responses directly from Forms.`
        );
      } catch (err) {
        setPanelError(
          err instanceof Error ? err.message : 'Unable to load Google Form or its linked Sheet.'
        );
      } finally {
        setLoadingTabs(false);
      }
      return;
    }

    const parsed = extractSpreadsheetRef(urlInput);
    if (!parsed) {
      setPanelError(
        'Paste a valid Google Form URL (https://docs.google.com/forms/d/.../edit), Google Sheets URL (/spreadsheets/d/...), or ID.'
      );
      return;
    }

    setLoadingTabs(true);
    try {
      const token = getSheetsAccessToken();
      const useOAuth = !parsed.isPublishedUrl && (authMode === 'oauth' || Boolean(token));

      if (useOAuth) {
        if (!token) {
          setPanelError(
            'Click "Sign in with Google" above to grant read access for private Google Sheets, or switch to Link-Shared mode if your sheet is shared publicly.'
          );
          setLoadingTabs(false);
          return;
        }

        const meta = await fetchSpreadsheetMetadataOAuth(parsed.spreadsheetId, token);
        setTabs(meta.tabs);
        setSpreadsheetTitle(meta.title);

        const gidMatch = parsed.gid
          ? meta.tabs.find((t) => String(t.sheetId) === parsed.gid)
          : undefined;
        const formTabMatch = meta.tabs.find((t) => /form\s*responses/i.test(t.title));
        const chosenTab =
          (selectedTab && meta.tabs.some((t) => t.title === selectedTab) ? selectedTab : '') ||
          gidMatch?.title ||
          formTabMatch?.title ||
          meta.tabs[0]?.title ||
          '';

        setSelectedTab(chosenTab);

        const nextConfig: GoogleSheetSyncConfig = {
          sourceType: 'sheet',
          formId: null,
          formUrl: null,
          formTitle: null,
          spreadsheetId: parsed.spreadsheetId,
          spreadsheetUrl: parsed.normalizedUrl,
          spreadsheetTitle: meta.title,
          sheetName: chosenTab,
          authMode: 'oauth',
          enabled,
          intervalMinutes,
          autoCreateStatuses,
          lastSyncedAt: config?.lastSyncedAt ?? null,
          lastSyncedRowCount: config?.lastSyncedRowCount ?? null,
          lastSyncSummary: config?.lastSyncSummary ?? null,
        };
        onSaveConfig(nextConfig);
        await onSyncNow(nextConfig);
        setPanelSuccess(
          `Linked "${meta.title}" (${chosenTab}) and synced rows.`
        );
      } else {
        const result = await fetchPublicGoogleSheetRows(
          parsed.normalizedUrl,
          parsed.gid
        );
        const tabName = result.sheetName || 'Form Responses';
        setTabs([{ sheetId: Number(parsed.gid ?? 0), title: tabName }]);
        setSelectedTab(tabName);
        setSpreadsheetTitle(result.title);

        const nextConfig: GoogleSheetSyncConfig = {
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: parsed.normalizedUrl,
          spreadsheetTitle: result.title,
          sheetName: tabName,
          authMode: 'public_link',
          enabled,
          intervalMinutes,
          autoCreateStatuses,
          lastSyncedAt: config?.lastSyncedAt ?? null,
          lastSyncedRowCount: config?.lastSyncedRowCount ?? null,
          lastSyncSummary: config?.lastSyncSummary ?? null,
        };
        onSaveConfig(nextConfig);
        await onSyncNow(nextConfig);
        setPanelSuccess(
          `Connected "${result.title}" via link sharing and synced ${result.rows.length} rows.`
        );
      }
    } catch (err) {
      setPanelError(
        err instanceof Error ? err.message : 'Unable to load Google Sheet.'
      );
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleSettingChange = (patch: Partial<GoogleSheetSyncConfig>) => {
    if (!config) return;
    const next: GoogleSheetSyncConfig = {
      ...config,
      ...patch,
    };
    onSaveConfig(next);
  };

  const needsReconnect =
    Boolean(config) &&
    config?.authMode === 'oauth' &&
    config.enabled &&
    !sheetsConnected;

  const activeError = panelError || syncError;

  return (
    <section
      aria-label="Live Google Form Sheet Auto-Sync"
      className="rounded-2xl border border-[#0071E3]/20 dark:border-[#0A84FF]/25 bg-white dark:bg-[#1C1C1E] p-5 sm:p-6 space-y-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#2997FF] flex items-center justify-center shrink-0">
            <Sheet className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-display font-semibold tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7]">
                Live Google Form Sheet Auto-Sync
              </h2>
              {config?.enabled && !needsReconnect && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1E7F34] dark:text-[#30D158]">
                  <span className="w-2 h-2 rounded-full bg-[#28CD41] dark:bg-[#30D158]" />
                  Active · Every {config.intervalMinutes}m
                </span>
              )}
              {needsReconnect && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0071E3] dark:text-[#2997FF]">
                  <span className="w-2 h-2 rounded-full bg-[#0071E3] dark:bg-[#2997FF]" />
                  Pre-attached · Ready to sync
                </span>
              )}
            </div>
            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] max-w-2xl leading-relaxed">
              Link your Google Form response spreadsheet once to automatically pull new candidates, merge repeat submissions, and update existing profiles on schedule without manual exports.
            </p>
          </div>
        </div>

        {/* Official Google Sign-In button for Google Sheets access */}
        <div className="flex items-center gap-2 shrink-0">
          {sheetsConnected ? (
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[#28CD41]/30 bg-[#28CD41]/10 dark:bg-[#30D158]/15 text-xs font-medium text-[#1E7F34] dark:text-[#30D158] whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Google Connected</span>
              </span>
              <button
                type="button"
                onClick={onDisconnectGoogleSheets}
                className="h-9 px-3 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7] transition-colors whitespace-nowrap"
              >
                Revoke Session
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={connectingGoogle}
              onClick={() => void handleGoogleConnectClick()}
              className="gsi-material-button h-10 px-4 rounded-[10px] border border-[#747775]/40 dark:border-white/20 bg-white dark:bg-[#131314] hover:bg-[#F8F9FA] dark:hover:bg-[#1F1F21] text-[#1F1F1F] dark:text-[#E3E3E3] text-xs font-medium inline-flex items-center justify-center gap-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <span className="w-4 h-4 shrink-0 inline-flex items-center justify-center">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </span>
              <span>
                {connectingGoogle ? 'Connecting Google...' : 'Sign in with Google'}
              </span>
            </button>
          )}
        </div>
      </div>

      {activeError && (
        <div className="p-3 rounded-xl bg-[#FF3B30]/[0.08] dark:bg-[#FF453A]/[0.12] border border-[#FF3B30]/20 flex items-start gap-2 text-xs text-[#D70015] dark:text-[#FF453A]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{activeError}</span>
        </div>
      )}

      {panelSuccess && !activeError && (
        <div className="p-3 rounded-xl bg-[#28CD41]/10 dark:bg-[#30D158]/15 border border-[#28CD41]/25 flex items-start gap-2 text-xs text-[#1E7F34] dark:text-[#30D158]">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{panelSuccess}</span>
        </div>
      )}

      {/* Connection Mode & Spreadsheet URL Form */}
      <form onSubmit={(e) => void handleLoadAndConnectSheet(e)} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Google Sheet access mode"
            className="inline-flex items-center p-0.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => setAuthMode('oauth')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                authMode === 'oauth'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Private Sheet (Google Account)
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('public_link')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                authMode === 'public_link'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Shared / Published Link
            </button>
          </div>

          <span className="text-[11px] text-[#86868B]">
            {authMode === 'oauth'
              ? `Read-only access via ${userEmail || 'your Google account'}`
              : 'Works with "Anyone with the link" or "Publish to web" URLs'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-[#86868B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste Google Form URL (docs.google.com/forms/d/...) or Sheet URL (docs.google.com/spreadsheets/d/...)"
              aria-label="Google Form or Spreadsheet URL"
              className="w-full h-10 pl-9 pr-3 text-xs rounded-[10px] border border-black/[0.12] dark:border-white/[0.14] bg-[#F5F5F7] dark:bg-black text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:bg-white dark:focus:bg-[#1C1C1E]"
            />
          </div>

          <button
            type="submit"
            disabled={loadingTabs || isSyncing || !urlInput.trim()}
            className="h-10 px-4 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] dark:bg-[#0A84FF] dark:hover:bg-[#2997FF] disabled:opacity-40 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTabs || isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {loadingTabs
                ? 'Connecting...'
                : config
                  ? 'Fetch & Sync Now'
                  : 'Connect & Sync'}
            </span>
          </button>
        </div>
      </form>

      {/* Active Linked Sheet Controls */}
      {config && (
        <div className="pt-4 border-t border-black/[0.08] dark:border-white/[0.10] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Tab Picker */}
            <div className="space-y-1">
              <label
                htmlFor="gsheet-tab-select"
                className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Worksheet Tab
              </label>
              {tabs.length > 0 && authMode === 'oauth' ? (
                <select
                  id="gsheet-tab-select"
                  value={selectedTab || config.sheetName}
                  onChange={(e) => {
                    const nextTab = e.target.value;
                    setSelectedTab(nextTab);
                    handleSettingChange({ sheetName: nextTab });
                  }}
                  className="w-full h-9 px-2.5 text-xs rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  {tabs.map((tab) => (
                    <option key={`${tab.sheetId}-${tab.title}`} value={tab.title}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="h-9 px-3 rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 flex items-center text-xs text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                  {config.sheetName || spreadsheetTitle || 'Active Tab'}
                </div>
              )}
            </div>

            {/* Interval */}
            <div className="space-y-1">
              <label
                htmlFor="gsheet-interval-select"
                className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#A1A1A6]"
              >
                Auto-Sync Frequency
              </label>
              <select
                id="gsheet-interval-select"
                value={intervalMinutes}
                onChange={(e) => {
                  const nextInterval = Number(e.target.value);
                  setIntervalMinutes(nextInterval);
                  handleSettingChange({ intervalMinutes: nextInterval });
                }}
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-black/[0.10] dark:border-white/[0.12] bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7]"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Schedule Toggle + Status Option */}
            <div className="flex flex-col justify-end gap-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const nextEnabled = e.target.checked;
                    setEnabled(nextEnabled);
                    handleSettingChange({ enabled: nextEnabled });
                  }}
                  className="rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                />
                <span>Enable background auto-sync</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                <input
                  type="checkbox"
                  checked={autoCreateStatuses}
                  onChange={(e) => {
                    const nextAuto = e.target.checked;
                    setAutoCreateStatuses(nextAuto);
                    handleSettingChange({ autoCreateStatuses: nextAuto });
                  }}
                  className="rounded border-black/20 dark:border-white/25 text-[#0071E3] focus:ring-[#0071E3]"
                />
                <span>Auto-create new Status columns</span>
              </label>
            </div>
          </div>

          {/* Last Sync Meta & Actions */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 border border-black/[0.06] dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                <span className="truncate">
                  {config.formTitle || config.spreadsheetTitle}
                </span>
                {config.formUrl && (
                  <a
                    href={config.formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1 shrink-0 font-medium"
                  >
                    <span>Open Form</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {config.spreadsheetUrl && (
                  <a
                    href={config.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0071E3] dark:text-[#2997FF] hover:underline inline-flex items-center gap-1 shrink-0 font-medium"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {config.lastSyncedAt
                    ? `Last synced ${new Date(config.lastSyncedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'Not synced yet'}
                </span>
                {config.lastSyncedRowCount !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {config.lastSyncedRowCount} sheet rows
                    </span>
                  </>
                )}
                {config.lastSyncSummary && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{config.lastSyncSummary}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => void onSyncNow()}
                className="h-9 px-3.5 rounded-[10px] border border-black/[0.10] dark:border-white/[0.14] bg-white dark:bg-[#1C1C1E] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#E8E8ED] dark:hover:bg-[#3A3A3C] disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>

              {confirmingDisconnect ? (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSaveConfig(null);
                      setTabs([]);
                      setSelectedTab('');
                      setSpreadsheetTitle('');
                      setUrlInput('');
                      setConfirmingDisconnect(false);
                      setPanelSuccess('Disconnected linked Google Sheet.');
                    }}
                    className="h-9 px-3 rounded-[10px] bg-[#D70015] dark:bg-[#FF453A] text-white text-xs font-medium whitespace-nowrap"
                  >
                    Confirm Unlink
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDisconnect(false)}
                    className="h-9 px-2.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(true)}
                  className="h-9 px-3 rounded-[10px] text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-[#FF3B30]/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Unlink</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
