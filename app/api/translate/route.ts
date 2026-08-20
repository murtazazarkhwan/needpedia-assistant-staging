import { NextResponse } from 'next/server';
import axios from 'axios';
import http from 'http';
import https from 'https';

// Reuse connections to reduce handshake latency
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const openRouterClient = axios.create({
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  },
  httpAgent,
  httpsAgent,
  timeout: 12_000,
});

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  nb: 'Norwegian',
  uk: 'Ukrainian',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ur: 'Urdu'
};

const MARKER = ' §i§ ';
const MAX_CHUNK_SIZE = 5;
const MAX_CONCURRENCY = 6;
const TOTAL_BUDGET_MS = 45_000;
const FREE_MODEL_TTL_MS = 10 * 60 * 1000;

// Dynamically discovered free model (only ever free — never paid).
let freeModelCache: { model: string | null; at: number } | null = null;

interface FreeModelCandidate {
  id: string;
  context_length?: number | null;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { modality?: string };
}

function isFreeModel(m: FreeModelCandidate): boolean {
  const p = m.pricing || {};
  return String(p.prompt) === '0' && String(p.completion) === '0';
}

async function discoverFreeModel(): Promise<string | null> {
  if (freeModelCache && Date.now() - freeModelCache.at < FREE_MODEL_TTL_MS) {
    return freeModelCache.model;
  }
  try {
    const res = await openRouterClient.get('/models', { timeout: 15_000 });
    const models: FreeModelCandidate[] = res.data?.data || [];
    // Free-only: exclude everything with any nonzero price.
    const free = models.filter(isFreeModel);
    // Text-to-text only; skip reasoning/content-safety/audio/video/image models.
    const textOnly = free.filter((m: FreeModelCandidate) => {
      const mod = m.architecture?.modality;
      if (mod && mod !== 'text->text') return false;
      const id = String(m.id || '');
      if (/reasoning|content-safety|lyria|embed|speech|audio|image|whisper|tts|asr|rerank/i.test(id)) return false;
      return true;
    });
    // Lightest first — translation is light work, no heavy model.
    const sorted = textOnly.sort(
      (a: FreeModelCandidate, b: FreeModelCandidate) => (a.context_length || 0) - (b.context_length || 0),
    );
    for (const m of sorted) {
      try {
        await openRouterClient.post(
          '/chat/completions',
          {
            model: m.id,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5,
          },
          { timeout: 15_000 },
        );
        freeModelCache = { model: m.id, at: Date.now() };
        return m.id;
      } catch {
        // Provider not allowed / model unavailable for this key — try next.
      }
    }
    freeModelCache = { model: null, at: Date.now() };
    return null;
  } catch {
    return null;
  }
}

// In-process translation cache so repeated strings across requests skip the LLM.
const memoryCache = new Map<string, string>();

function cacheKey(text: string, source: string, target: string): string {
  return `${target}|${source}|${text}`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry(prompt: string, model: string, expectedSegments: number): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openRouterClient.post('/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        tool_choice: 'none',
        include_reasoning: false,
        // Generous headroom for long segments: ~4x the source length.
        max_tokens: Math.min(2000, 1200 + Math.ceil(prompt.length * 0.4)),
        extra_headers: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
          'X-Title': 'Needpedia Translate',
        },
        extra_body: {},
      });
      const raw = response.data?.choices?.[0]?.message?.content || '';
      if (raw) return raw;
    } catch (error: unknown) {
      lastError = error;
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429 || status === 503 || status === 500) {
        const delay = 1000 * (attempt + 1);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Empty translation from model');
}

function buildPrompt(sourceName: string, targetName: string): string {
  return `You are a professional translator. Translate each of the following text segments from ${sourceName} to ${targetName}.

The input has one segment per line, prefixed with its number in brackets like "[1] text".

Rules:
- Translate each segment independently, preserving its structure.
- Keep proper nouns, numbers, URLs, and punctuation intact.
- Match the tone of the source text.
- Do NOT add commentary, headers, notes or explanations.
- Output each translation on its OWN line, prefixed with the same bracket number: "[1] translated text" (one line per segment, in order).
- Do NOT include the original text in your output. Only the translations, numbered.

Text to translate:
`;
}

async function translateChunk(
  chunk: string[],
  sourceName: string,
  targetName: string,
  model: string,
): Promise<Record<string, string>> {
  const promptBase = buildPrompt(sourceName, targetName);
  const joined = chunk.map((t, i) => `[${i + 1}] ${t}`).join('\n');
  const prompt = `${promptBase}\n\nSegments (number each translation with the same [N] tag):\n${joined}`;
  try {
    const raw = await callWithRetry(prompt, model, chunk.length);
    const parsed = parseNumberedOutput(raw, chunk.length);
    const out: Record<string, string> = {};
    chunk.forEach((text, i) => {
      if (parsed && parsed[i]) out[text] = parsed[i];
    });
    return out;
  } catch (error: unknown) {
    return {};
  }
}

function parseNumberedOutput(raw: string, count: number): string[] | null {
  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\[(\d+)\]\s*(.+)$/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < count) {
        result[idx] = m[2].trim();
      }
    }
  }
  if (result.filter(v => v !== undefined).length !== count) {
    return null;
  }
  return result.map(v => v || '');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    runners.push(run());
  }
  await Promise.all(runners);
  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const texts: string[] = (body?.texts || []).map((t: unknown) => String(t ?? '')).filter(Boolean);
    const targetLang = String(body?.target_lang || 'es');
    const sourceLang = String(body?.source_lang || 'en');

    if (texts.length === 0) {
      return NextResponse.json({ translations: {} });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
    }

    const source = sourceLang === 'auto' ? 'en' : sourceLang;
    const unique = [...new Set(texts.map(t => t.trim()).filter(Boolean))];

    // Serve from memory cache where possible
    const miss: string[] = [];
    const translations: Record<string, string> = {};
    for (const text of unique) {
      const key = cacheKey(text, source, targetLang);
      const cached = memoryCache.get(key);
      if (cached) {
        translations[text] = cached;
      } else {
        miss.push(text);
      }
    }
    // Lazy eviction: cap the map so it never grows unbounded
    if (memoryCache.size > 2000) {
      const toDelete = [...memoryCache.keys()].slice(0, Math.floor(memoryCache.size / 2));
      for (const key of toDelete) memoryCache.delete(key);
    }

    if (miss.length > 0) {
      const sourceName = sourceLang === 'auto' ? 'the original language' : (LANGUAGE_NAMES[source] || source);
      const targetName = LANGUAGE_NAMES[targetLang] || targetLang;
      // Env override wins; otherwise use a dynamically discovered FREE model.
      const model =
        process.env.OPENROUTER_TRANSLATE_MODEL ||
        (await discoverFreeModel()) ||
        'openrouter/free';

      const chunks = chunkArray(miss, MAX_CHUNK_SIZE);

      // The Rails side exclusively depends on this endpoint for translations,
      // so we wait generously for every chunk instead of truncating early.
      // Each OpenRouter call can take up to ~12s (x2 retries), so 45s gives
      // enough room for all concurrent chunks to complete while still keeping
      // the request bounded.
      await Promise.race([
        mapWithConcurrency(chunks, MAX_CONCURRENCY, async (chunk) => {
          const out = await translateChunk(chunk, sourceName, targetName, model);
          for (const [k, v] of Object.entries(out)) {
            translations[k] = v;
            memoryCache.set(cacheKey(k, source, targetLang), v);
          }
        }),
        sleep(TOTAL_BUDGET_MS).then(() => {
          void chunks;
        }),
      ]);
    }

    const usedModel =
      process.env.OPENROUTER_TRANSLATE_MODEL ||
      (await discoverFreeModel()) ||
      'openrouter/free';

    return NextResponse.json({
      translations,
      model: usedModel,
      source: sourceLang,
      target: targetLang,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Translation failed: ${message}` }, { status: 500 });
  }
}