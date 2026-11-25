import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_ID = 'gemini-4-hydrogen';

interface GroundingSource {
  title: string;
  uri: string;
  domain: string;
}

interface GroundingPayload {
  answer: string;
  sources: GroundingSource[];
  searchQueries: string[];
  model: string;
  groundedAt: string;
}

interface CandidateRequestBody {
  candidate?: {
    fullName?: string;
    email?: string;
    portfolioUrl?: string;
    currentLocation?: string;
    yearsOfExperience?: string;
    designedAiProduct?: string;
    noticePeriod?: string;
    expectedSalary?: string;
    readyToRelocateIn?: string;
  };
  focus?: 'web_profile' | 'comp_benchmark' | 'custom';
  customQuestion?: string;
}

interface MarketRequestBody {
  query?: string;
  poolContext?: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Check your API key in Settings > Secrets.'
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractHostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./i, '');
  } catch {
    return 'web';
  }
}

function extractGroundingMetadata(response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>): {
  sources: GroundingSource[];
  searchQueries: string[];
} {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const rawChunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const rawQueries = Array.isArray(metadata?.webSearchQueries) ? metadata.webSearchQueries : [];

  const seenUris = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of rawChunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || !/^https?:\/\//i.test(uri) || seenUris.has(uri)) continue;
    seenUris.add(uri);
    const domain = extractHostname(uri);
    const title = (chunk?.web?.title ?? '').trim() || domain;
    sources.push({ title, uri, domain });
  }

  const seenQueries = new Set<string>();
  const searchQueries: string[] = [];
  for (const q of rawQueries) {
    const clean = typeof q === 'string' ? q.trim() : '';
    if (!clean || seenQueries.has(clean)) continue;
    seenQueries.add(clean);
    searchQueries.push(clean);
  }

  return { sources, searchQueries };
}

async function runWithTransientRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status =
        typeof (error as { status?: unknown })?.status === 'number'
          ? (error as { status: number }).status
          : 0;
      const isTransient = status === 502 || status === 503 || status === 504;
      if (!isTransient || attempt >= maxRetries) {
        throw error;
      }
      const delayMs = 450 * Math.pow(2, attempt);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const errObj = error as { status?: number; statusCode?: number; message?: string };
  const rawMessage = errObj?.message || 'Unable to complete Google Search grounding request.';
  const statusCode = errObj?.statusCode || errObj?.status || 500;

  if (statusCode === 400 || /API_KEY_INVALID/i.test(rawMessage)) {
    return {
      status: 400,
      message: 'Gemini request rejected or API key invalid. Verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (statusCode === 403 || /PERMISSION_DENIED/i.test(rawMessage)) {
    return {
      status: 403,
      message: 'Permission denied by Gemini API. Check your API key in Settings > Secrets.',
    };
  }
  if (statusCode === 429 || /RESOURCE_EXHAUSTED/i.test(rawMessage)) {
    return {
      status: 429,
      message:
        'Rate limit or quota reached for Google Search grounding. Please retry shortly or select a higher-quota API key in Settings > Secrets.',
    };
  }

  return {
    status: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    message: rawMessage,
  };
}

function clampField(value: unknown, maxLen: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parseRfc4180Csv(csvText: string): string[][] {
  const input = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_ID, searchGrounding: true });
  });

  app.post('/api/search-grounding/candidate', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as CandidateRequestBody;
      const candidate = body.candidate;
      const fullName = clampField(candidate?.fullName, 160);
      if (!fullName) {
        res.status(400).json({ error: 'Candidate full name is required.' });
        return;
      }

      const focus = body.focus ?? 'web_profile';
      const portfolioUrl = clampField(candidate?.portfolioUrl, 400);
      const currentLocation = clampField(candidate?.currentLocation, 140) || 'India';
      const yearsOfExperience = clampField(candidate?.yearsOfExperience, 80) || 'Unspecified';
      const designedAiProduct = clampField(candidate?.designedAiProduct, 120) || 'Unspecified';
      const noticePeriod = clampField(candidate?.noticePeriod, 80) || 'Unspecified';
      const expectedSalary = clampField(candidate?.expectedSalary, 100) || 'Not provided';
      const readyToRelocateIn = clampField(candidate?.readyToRelocateIn, 180) || 'Not specified';
      const customQuestion = clampField(body.customQuestion, 500);

      let prompt = '';
      if (focus === 'comp_benchmark') {
        prompt = [
          `Use Google Search to research up-to-date 2026 compensation benchmarks and hiring market availability for this UX / Product Designer profile:`,
          `- Candidate Location: ${currentLocation}`,
          `- Experience Band: ${yearsOfExperience}`,
          `- AI Product Experience: ${designedAiProduct}`,
          `- Candidate Expected Salary: ${expectedSalary}`,
          `- Notice Period: ${noticePeriod}`,
          `- Open to Relocate To: ${readyToRelocateIn}`,
          ``,
          `Provide a crisp, structured recruiter brief covering:`,
          `1. Current 2026 market salary range in ${currentLocation} (and in target relocation hubs if specified, e.g. Dubai/UAE or Bengaluru/NCR) for a UX/Product Designer at ${yearsOfExperience}.`,
          `2. How the candidate's expected salary (${expectedSalary}) compares against market percentiles.`,
          `3. Practical interview & offer calibration notes (AI design premium, notice period norms).`,
        ].join('\n');
      } else if (focus === 'custom' && customQuestion) {
        prompt = [
          `Recruiter question regarding candidate "${fullName}" (Location: ${currentLocation}, Experience: ${yearsOfExperience}, AI Product: ${designedAiProduct}, Portfolio: ${portfolioUrl || 'none'}, Expected Salary: ${expectedSalary}, Relocation: ${readyToRelocateIn}):`,
          ``,
          customQuestion,
          ``,
          `Use Google Search to verify live web details, market benchmarks, or public portfolio/company context. Clearly separate verified search findings from gaps where no public web match exists.`,
        ].join('\n');
      } else {
        prompt = [
          `Use Google Search to check the public web presence and design footprint for UX / Product Designer candidate "${fullName}":`,
          `- Stated Location: ${currentLocation}`,
          `- Experience: ${yearsOfExperience}`,
          `- Stated Portfolio URL: ${portfolioUrl || 'Not provided'}`,
          `- AI Product Experience: ${designedAiProduct}`,
          ``,
          `Search for their portfolio domain, Behance, Dribbble, Framer, LinkedIn, Medium, or shipped AI/SaaS product mentions.`,
          `Return a factual, recruiter-ready summary covering:`,
          `1. Verified Public Links & Portfolio Signals found via Google Search (only report what appears in search results; if the person/domain is not indexed publicly, state that clearly).`,
          `2. Relevant Design Domain / Shipped Product Signals or Location Context.`,
          `3. Suggested Portfolio Verification Questions for the screening call.`,
        ].join('\n');
      }

      const ai = getGeminiClient();
      const response = await runWithTransientRetry(() =>
        ai.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a factual recruiting research assistant for UXD Vault. Ground every claim in Google Search results. Keep responses concise (under 240 words), structured with short bullet points, and never fabricate links, employers, or facts if search returns no match.',
            tools: [{ googleSearch: {} }],
          },
        })
      );

      const { sources, searchQueries } = extractGroundingMetadata(response);
      const payload: GroundingPayload = {
        answer: (response.text ?? '').trim() || 'No grounded summary was returned for this query.',
        sources,
        searchQueries,
        model: MODEL_ID,
        groundedAt: new Date().toISOString(),
      };

      res.json(payload);
    } catch (error) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/search-grounding/market', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as MarketRequestBody;
      const query = clampField(body.query, 500);
      const poolContext = clampField(body.poolContext, 1200);

      if (!query) {
        res.status(400).json({ error: 'Please enter a market research query.' });
        return;
      }

      const prompt = [
        `Recruiting market research query from UXD Vault:`,
        query,
        poolContext ? `\nCurrent Workspace Candidate Pool Context:\n${poolContext}` : '',
        `\nUse Google Search to retrieve current 2026 hiring market data, salary bands, skill demand, or relocation benchmarks relevant to UX & AI Product Design recruiting. Provide concise, actionable takeaways with clear numbers where available.`,
      ]
        .filter(Boolean)
        .join('\n');

      const ai = getGeminiClient();
      const response = await runWithTransientRetry(() =>
        ai.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a UX & Product Design talent market analyst inside UXD Vault. Always ground market figures, salary ranges, and industry trends in live Google Search results. Keep output crisp, scannable, and under 280 words using short headings or bullet points.',
            tools: [{ googleSearch: {} }],
          },
        })
      );

      const { sources, searchQueries } = extractGroundingMetadata(response);
      const payload: GroundingPayload = {
        answer: (response.text ?? '').trim() || 'No grounded market insights were returned.',
        sources,
        searchQueries,
        model: MODEL_ID,
        groundedAt: new Date().toISOString(),
      };

      res.json(payload);
    } catch (error) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/google-sheets/public', async (req: Request, res: Response) => {
    try {
      const rawInput = clampField((req.body as { urlOrId?: unknown })?.urlOrId, 800);
      const requestedGid = clampField((req.body as { gid?: unknown })?.gid, 32);

      if (!rawInput) {
        res.status(400).json({ error: 'Please paste a Google Sheets URL or Spreadsheet ID.' });
        return;
      }

      let exportUrl = '';
      let spreadsheetId = '';
      let gid = /^\d+$/.test(requestedGid) ? requestedGid : '';

      const pubMatch = rawInput.match(
        /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/(2PACX-[a-zA-Z0-9_-]{10,180})(?:\/[^\s?#]*)?(?:\?([^\s#]*))?(?:#([^\s]*))?$/i
      );
      if (pubMatch) {
        const pubId = pubMatch[1];
        const qParams = new URLSearchParams(pubMatch[2] || '');
        if (!gid && qParams.get('gid') && /^\d+$/.test(qParams.get('gid')!)) {
          gid = qParams.get('gid')!;
        }
        spreadsheetId = `pub:${pubId}`;
        exportUrl = gid
          ? `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(pubId)}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`
          : `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(pubId)}/pub?output=csv`;
      } else {
        const docMatch = rawInput.match(
          /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{12,128})(?:\/[^\s?#]*)?(?:\?([^\s#]*))?(?:#([^\s]*))?$/i
        );
        if (docMatch) {
          spreadsheetId = docMatch[1];
          const qParams = new URLSearchParams(docMatch[2] || '');
          const hashStr = docMatch[3] || '';
          const hashGid = hashStr.match(/gid=(\d+)/i)?.[1];
          const queryGid = qParams.get('gid');
          if (!gid) {
            if (hashGid && /^\d+$/.test(hashGid)) gid = hashGid;
            else if (queryGid && /^\d+$/.test(queryGid)) gid = queryGid;
          }
        } else if (/^[a-zA-Z0-9_-]{16,128}$/.test(rawInput)) {
          spreadsheetId = rawInput;
        } else {
          res.status(400).json({
            error:
              'Please enter a valid https://docs.google.com/spreadsheets/d/... URL or Spreadsheet ID.',
          });
          return;
        }

        exportUrl = gid
          ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`
          : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv`;
      }

      const fetchSheetText = async (targetUrl: string): Promise<globalThis.Response> => {
        return fetch(targetUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
            'User-Agent': 'UXD-Vault-Sheet-Sync/1.0',
          },
          redirect: 'follow',
        });
      };

      const sheetResp = await fetchSheetText(exportUrl);
      const finalUrl = sheetResp.url || exportUrl;
      let finalHost = '';
      try {
        finalHost = new URL(finalUrl).hostname.toLowerCase();
      } catch {
        finalHost = '';
      }

      const contentType = (sheetResp.headers.get('content-type') || '').toLowerCase();
      if (
        sheetResp.status === 401 ||
        sheetResp.status === 403 ||
        finalHost.includes('accounts.google.com') ||
        contentType.includes('text/html')
      ) {
        res.status(403).json({
          error:
            'This Google Sheet is private or requires sign-in. Click "Sign in with Google" above to connect Google Sheets, or enable "Anyone with the link can view".',
          requiresGoogleAuth: true,
        });
        return;
      }

      if (!sheetResp.ok) {
        res.status(sheetResp.status).json({
          error: `Google Sheets returned HTTP ${sheetResp.status}. Verify the spreadsheet URL and sharing permissions.`,
        });
        return;
      }

      const csvText = await sheetResp.text();
      const matrix = parseRfc4180Csv(csvText).filter((row) =>
        row.some((cell) => cell.trim() !== '')
      );

      if (matrix.length === 0) {
        res.status(422).json({
          error: 'No header or data rows were found in this Google Sheet tab.',
        });
        return;
      }

      const seenHeaders = new Map<string, number>();
      const headers = matrix[0].map((cell, idx) => {
        const base = cell.trim() || `Column ${idx + 1}`;
        const count = seenHeaders.get(base) ?? 0;
        seenHeaders.set(base, count + 1);
        return count === 0 ? base : `${base} (${count + 1})`;
      });

      const rows: Record<string, string>[] = [];
      for (let r = 1; r < matrix.length; r += 1) {
        const arr = matrix[r];
        const record: Record<string, string> = {};
        let hasValue = false;
        headers.forEach((h, idx) => {
          const val = (arr[idx] ?? '').trim();
          if (val !== '') hasValue = true;
          record[h] = val;
        });
        if (hasValue) rows.push(record);
      }

      const disp = sheetResp.headers.get('content-disposition') || '';
      const fnMatch =
        disp.match(/filename\*=UTF-8''([^;\n]+)/i) ??
        disp.match(/filename="?([^";\n]+)"?/i);
      const rawTitle = fnMatch?.[1] ? decodeURIComponent(fnMatch[1]) : 'Google Form Responses';
      const cleanTitle = rawTitle.replace(/\.(csv|xlsx|tsv)$/i, '').trim() || 'Google Form Responses';

      res.json({
        spreadsheetId,
        gid: gid || null,
        title: cleanTitle,
        headers,
        rows,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fetch Google Sheet.';
      res.status(502).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UXD Vault full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
