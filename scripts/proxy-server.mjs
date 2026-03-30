import express from 'express';
import { execFile } from 'child_process';
import { mkdtemp, readFile, unlink, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const PORT = 3456;

const DEEPGRAM_API_KEY = '7288b46b415eda427fab877bfd25ce6299bd5f6e';

// ==================== ElevenLabs Multi-Account Rotation ====================
// Default test key — available to all tenants for testing/preview
const DEFAULT_ELEVENLABS_KEY = 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';

// Admin adds API keys via POST /api/elevenlabs/keys — stored in memory (persists until restart)
// Default test key is always included
let elevenLabsKeys = [{ apiKey: DEFAULT_ELEVENLABS_KEY, label: 'Default (Testing)' }];
let elevenLabsKeyIndex = 0;
const disabledKeys = new Map(); // key -> re-enable timestamp

function getNextElevenLabsKey() {
  const now = Date.now();
  // Re-enable keys whose cooldown has expired
  for (const [key, until] of disabledKeys) {
    if (now >= until) disabledKeys.delete(key);
  }

  const activeKeys = elevenLabsKeys.filter(k => !disabledKeys.has(k.apiKey));
  if (activeKeys.length === 0) return null;

  elevenLabsKeyIndex = elevenLabsKeyIndex % activeKeys.length;
  const selected = activeKeys[elevenLabsKeyIndex];
  elevenLabsKeyIndex = (elevenLabsKeyIndex + 1) % activeKeys.length;
  return selected;
}

function disableElevenLabsKey(apiKey) {
  // Disable for 5 minutes on failure (rate limit / auth error)
  disabledKeys.set(apiKey, Date.now() + 5 * 60 * 1000);
  console.log(`[ElevenLabs] Key ...${apiKey.slice(-6)} disabled for 5 minutes`);
}

// JSON body parser — skip /api/stt to avoid consuming raw audio body
app.use((req, res, next) => {
  if (req.path === '/api/stt' || req.path === '/api/welcome/upload') return next();
  express.json({ limit: '10mb' })(req, res, next);
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ==================== AI-Assisted Transcription Correction ====================
const NVIDIA_API_KEY = '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';

const TRANSCRIPTION_FIX_PROMPT = `You are an expert Tagalog/Taglish/Filipino speech transcription corrector. A speech-to-text system produced the text below. Fix it.

COMMON ERRORS TO FIX:
- Misspelled Tagalog: "bucas"→"bukas", "cige"→"sige", "calamat"→"salamat", "poh"→"po"
- Split words: "sala mat"→"salamat", "kai langan"→"kailangan", "mag ka no"→"magkano"
- Wrong language: English words misheard as Tagalog nonsense, or Tagalog misheard as random English
- Missing "po/opo": If context suggests polite Filipino speech, ensure po/opo are kept
- Numbers: Fix misheard numbers, times, dates, prices (e.g. "doce"→"dose", "sinkwenta"→"singkwenta")
- Names: Filipino names like "Maria", "Juan", "Jose" — don't change these
- Business terms: "appointment", "booking", "order", "delivery", "pickup" should stay in English

STRICT RULES:
- Return ONLY the corrected text — no quotes, no explanation, no labels
- Do NOT add new words or change the meaning
- Do NOT translate — keep the Taglish mix as-is
- If already correct, return it unchanged`;

async function aiCorrectTranscript(rawTranscript, apiKey) {
  if (!rawTranscript || rawTranscript.length < 3) return rawTranscript;
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct', // Fast 8B model for quick corrections
        messages: [
          { role: 'system', content: TRANSCRIPTION_FIX_PROMPT },
          { role: 'user', content: rawTranscript },
        ],
        temperature: 0.1, // Low temp for consistent corrections
        max_tokens: 200,
      }),
    });
    if (!response.ok) return rawTranscript; // Fallback to raw on error
    const data = await response.json();
    const corrected = data?.choices?.[0]?.message?.content?.trim();
    // Sanity check: if AI returned something wildly different length, use raw
    if (!corrected || corrected.length > rawTranscript.length * 2.5 || corrected.length < rawTranscript.length * 0.3) {
      return rawTranscript;
    }
    return corrected;
  } catch {
    return rawTranscript; // Fallback on any error
  }
}

// NVIDIA NIM proxy
app.post('/api/nvidia/chat', async (req, res) => {
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edge TTS via Python edge-tts CLI — natural Filipino neural voices
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const selectedVoice = voice || 'fil-PH-BlessicaNeural';

  let tmpDir;
  try {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'tts-'));
    const outFile = path.join(tmpDir, 'speech.mp3');

    await new Promise((resolve, reject) => {
      execFile('python', [
        '-m', 'edge_tts',
        '--voice', selectedVoice,
        '--text', text,
        '--write-media', outFile,
      ], { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });

    const audioBuffer = await readFile(outFile);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);

    // Cleanup
    unlink(outFile).catch(() => {});
    rmdir(tmpDir).catch(() => {});
  } catch (err) {
    console.error('TTS error:', err.message);
    if (tmpDir) rmdir(tmpDir, { recursive: true }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// Voice list — fetched from Python edge-tts
let cachedVoices = null;
app.get('/api/tts/voices', async (req, res) => {
  if (cachedVoices) return res.json(cachedVoices);

  try {
    const result = await new Promise((resolve, reject) => {
      execFile('python', ['-m', 'edge_tts', '--list-voices'], { timeout: 10000 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    const lines = result.split('\n').slice(2); // skip header
    const voices = lines
      .filter(l => l.trim())
      .map(l => {
        const parts = l.split(/\s{2,}/);
        return { id: parts[0]?.trim(), gender: parts[1]?.trim(), category: parts[2]?.trim(), personality: parts[3]?.trim() };
      })
      .filter(v => v.id);

    // Group recommended voices at top
    const recommended = voices.filter(v =>
      v.id.startsWith('fil-PH') || v.id.startsWith('en-PH') ||
      v.id.includes('Multilingual') ||
      ['en-US-AvaNeural','en-US-AndrewNeural','en-US-JennyNeural','en-US-BrianNeural','en-US-EmmaNeural','en-US-AriaNeural'].includes(v.id)
    );
    const others = voices.filter(v => !recommended.includes(v));

    cachedVoices = { recommended, all: others, total: voices.length };
    res.json(cachedVoices);
  } catch (err) {
    // Fallback
    res.json({
      recommended: [
        { id: 'fil-PH-BlessicaNeural', gender: 'Female', category: 'General', personality: 'Friendly, Positive' },
        { id: 'fil-PH-AngeloNeural', gender: 'Male', category: 'General', personality: 'Friendly, Positive' },
        { id: 'en-PH-RosaNeural', gender: 'Female', category: 'General', personality: 'Friendly, Positive' },
        { id: 'en-PH-JamesNeural', gender: 'Male', category: 'General', personality: 'Friendly, Positive' },
      ],
      all: [],
      total: 4,
    });
  }
});

// Preview a voice — generate a short sample
app.post('/api/tts/preview', async (req, res) => {
  const { voice } = req.body;
  if (!voice) return res.status(400).json({ error: 'voice required' });

  const sampleText = voice.startsWith('fil-PH')
    ? 'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?'
    : voice.startsWith('en-PH')
    ? 'Hello! Thank you for calling. How may I help you today?'
    : 'Hello! Thank you for calling. How can I assist you today?';

  try {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'tts-'));
    const outFile = path.join(tmpDir, 'preview.mp3');

    await new Promise((resolve, reject) => {
      execFile('python', ['-m', 'edge_tts', '--voice', voice, '--text', sampleText, '--write-media', outFile],
        { timeout: 15000 }, (err, stdout, stderr) => { if (err) reject(new Error(stderr || err.message)); else resolve(stdout); });
    });

    const audioBuffer = await readFile(outFile);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);
    unlink(outFile).catch(() => {});
    rmdir(tmpDir).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ElevenLabs Key Management ====================

// GET /api/elevenlabs/keys — list all keys (masked)
app.get('/api/elevenlabs/keys', (req, res) => {
  res.json({
    keys: elevenLabsKeys.map((k, i) => ({
      index: i,
      label: k.label,
      maskedKey: '...' + k.apiKey.slice(-6),
      disabled: disabledKeys.has(k.apiKey),
      disabledUntil: disabledKeys.get(k.apiKey) || null,
    })),
    activeCount: elevenLabsKeys.filter(k => !disabledKeys.has(k.apiKey)).length,
  });
});

// POST /api/elevenlabs/keys — add a key { apiKey, label? }
app.post('/api/elevenlabs/keys', (req, res) => {
  const { apiKey, label } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });

  // Don't add duplicates
  if (elevenLabsKeys.some(k => k.apiKey === apiKey)) {
    return res.status(409).json({ error: 'Key already exists' });
  }

  elevenLabsKeys.push({ apiKey, label: label || `Account ${elevenLabsKeys.length + 1}` });
  console.log(`[ElevenLabs] Added key "${label || 'Account ' + elevenLabsKeys.length}" (...${apiKey.slice(-6)})`);
  res.json({ success: true, totalKeys: elevenLabsKeys.length });
});

// DELETE /api/elevenlabs/keys/:index — remove a key
app.delete('/api/elevenlabs/keys/:index', (req, res) => {
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= elevenLabsKeys.length) return res.status(404).json({ error: 'Key not found' });

  const removed = elevenLabsKeys.splice(idx, 1)[0];
  disabledKeys.delete(removed.apiKey);
  console.log(`[ElevenLabs] Removed key "${removed.label}"`);
  res.json({ success: true, totalKeys: elevenLabsKeys.length });
});

// ==================== ElevenLabs TTS ====================

// GET /api/elevenlabs/voices — list available voices
app.get('/api/elevenlabs/voices', async (req, res) => {
  const keyObj = getNextElevenLabsKey();
  if (!keyObj) return res.status(503).json({ error: 'No ElevenLabs API keys configured. Add keys via admin settings.' });

  try {
    const elRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': keyObj.apiKey },
    });

    if (!elRes.ok) {
      if (elRes.status === 401 || elRes.status === 403) disableElevenLabsKey(keyObj.apiKey);
      return res.status(elRes.status).json({ error: 'ElevenLabs API error' });
    }

    const data = await elRes.json();
    const voices = (data.voices || []).map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      preview_url: v.preview_url,
      description: v.description,
    }));

    res.json({ voices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/elevenlabs/tts — generate speech { text, voice_id?, model_id? }
app.post('/api/elevenlabs/tts', async (req, res) => {
  const { text, voice_id, model_id, voice_settings } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const selectedVoiceId = voice_id || 'EXAVITQu4vr4xnSDxMaL'; // Default: Bella
  const selectedModel = model_id || 'eleven_multilingual_v2'; // Best for Taglish

  // Try up to 3 keys on failure
  const maxRetries = Math.min(3, elevenLabsKeys.length);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyObj = getNextElevenLabsKey();
    if (!keyObj) return res.status(503).json({ error: 'No active ElevenLabs API keys available' });

    try {
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': keyObj.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: selectedModel,
          voice_settings: voice_settings || {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      });

      if (elRes.ok) {
        const audioBuffer = Buffer.from(await elRes.arrayBuffer());
        res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
        return res.send(audioBuffer);
      }

      // Rate limited or auth error — rotate to next key
      if (elRes.status === 429 || elRes.status === 401 || elRes.status === 403) {
        disableElevenLabsKey(keyObj.apiKey);
        console.log(`[ElevenLabs] Key ...${keyObj.apiKey.slice(-6)} failed (${elRes.status}), trying next...`);
        continue;
      }

      const errData = await elRes.text();
      return res.status(elRes.status).json({ error: errData });
    } catch (err) {
      console.error(`[ElevenLabs] Request error:`, err.message);
      disableElevenLabsKey(keyObj.apiKey);
      continue;
    }
  }

  res.status(503).json({ error: 'All ElevenLabs keys exhausted or rate-limited. Try again later.' });
});

// POST /api/elevenlabs/preview — preview a voice
app.post('/api/elevenlabs/preview', async (req, res) => {
  const { voice_id } = req.body;
  if (!voice_id) return res.status(400).json({ error: 'voice_id required' });

  const keyObj = getNextElevenLabsKey();
  if (!keyObj) return res.status(503).json({ error: 'No ElevenLabs API keys configured' });

  try {
    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': keyObj.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: 'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?',
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    });

    if (!elRes.ok) {
      if (elRes.status === 401 || elRes.status === 403 || elRes.status === 429) disableElevenLabsKey(keyObj.apiKey);
      return res.status(elRes.status).json({ error: 'Preview failed' });
    }

    const audioBuffer = Buffer.from(await elRes.arrayBuffer());
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
    res.send(audioBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Prerecorded Welcome Messages ====================
// Tenants can upload or record a welcome greeting that plays instead of AI-generated TTS
// Stored in memory per tenant (keyed by tenant ID or 'default')
const welcomeMessages = new Map(); // tenantId -> { audio: Buffer, contentType: string, filename: string }

// POST /api/welcome/upload — upload a prerecorded welcome audio file
app.post('/api/welcome/upload', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || 'default';
  const contentType = req.headers['content-type'] || 'audio/mpeg';

  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'No audio data received' });
  }

  welcomeMessages.set(tenantId, {
    audio: Buffer.from(req.body),
    contentType,
    filename: `welcome-${tenantId}.${contentType.includes('webm') ? 'webm' : contentType.includes('wav') ? 'wav' : 'mp3'}`,
    uploadedAt: new Date().toISOString(),
  });

  console.log(`[Welcome] Saved welcome message for tenant "${tenantId}" (${req.body.length} bytes)`);
  res.json({ success: true, size: req.body.length, tenantId });
});

// GET /api/welcome/:tenantId — serve the prerecorded welcome audio
app.get('/api/welcome/:tenantId', (req, res) => {
  const msg = welcomeMessages.get(req.params.tenantId);
  if (!msg) return res.status(404).json({ error: 'No welcome message found' });

  res.set({
    'Content-Type': msg.contentType,
    'Content-Length': msg.audio.length,
  });
  res.send(msg.audio);
});

// DELETE /api/welcome/:tenantId — remove welcome message (revert to AI-generated)
app.delete('/api/welcome/:tenantId', (req, res) => {
  const existed = welcomeMessages.delete(req.params.tenantId);
  res.json({ success: true, deleted: existed });
});

// GET /api/welcome/:tenantId/status — check if welcome message exists
app.get('/api/welcome/:tenantId/status', (req, res) => {
  const msg = welcomeMessages.get(req.params.tenantId);
  res.json({
    exists: !!msg,
    size: msg?.audio?.length || 0,
    contentType: msg?.contentType || null,
    uploadedAt: msg?.uploadedAt || null,
  });
});

// ==================== AI Transcription Correction (standalone) ====================
// POST /api/stt/correct — takes raw transcript text, returns AI-corrected version
app.post('/api/stt/correct', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.json({ corrected: '' });

  // Step 1: Regex corrections
  let corrected = postProcessTagalog(transcript);

  // Step 2: AI correction
  corrected = await aiCorrectTranscript(corrected);

  res.json({ corrected, original: transcript, aiCorrected: corrected !== transcript });
});

// ==================== Advanced Deepgram STT ====================

// Top priority keyterms for Tagalog/Taglish — kept under Deepgram's 500 token limit
const TAGALOG_KEYTERMS = [
  // Most commonly misheard Tagalog words (high boost)
  'po:3', 'opo:3', 'sige:3', 'salamat:3', 'paano:3',
  'gusto:3', 'kailangan:3', 'pwede:3', 'magkano:3', 'kailan:3',
  // Business terms
  'appointment:2', 'booking:2', 'order:2', 'schedule:2',
  'pakibook:2', 'mag-book:2', 'mag-order:2',
  // Common Tagalog
  'naman:2', 'lang:2', 'hindi:2', 'meron:2', 'wala:2',
  'saan:2', 'sino:2', 'bakit:2', 'talaga:2', 'kasi:2',
  'yung:2', 'ganun:2', 'dito:2', 'oo:2',
  // Honorifics
  'kuya:2', 'ate:2', 'sir:2', 'miss:2',
].map(k => encodeURIComponent(k)).join('&keyterm=');

// Advanced Tagalog post-processing corrections — expanded patterns
const TAGALOG_CORRECTIONS = [
  // Politeness markers
  [/\bpoh\b/gi, 'po'],
  [/\bpow\b/gi, 'po'],
  [/\bopoh\b/gi, 'opo'],
  [/\boh poh\b/gi, 'opo'],
  // Common words split by STT
  [/\bsee gay\b/gi, 'sige'],
  [/\bsee ge\b/gi, 'sige'],
  [/\bsee geh\b/gi, 'sige'],
  [/\bsala mat\b/gi, 'salamat'],
  [/\bsa la mat\b/gi, 'salamat'],
  [/\bpa ano\b/gi, 'paano'],
  [/\bpa a no\b/gi, 'paano'],
  [/\bmag kano\b/gi, 'magkano'],
  [/\bmag ka no\b/gi, 'magkano'],
  [/\bkai lan\b/gi, 'kailan'],
  [/\bka ilan\b/gi, 'kailan'],
  [/\bkai lan man\b/gi, 'kailanman'],
  [/\bgus to\b/gi, 'gusto'],
  [/\bgoos to\b/gi, 'gusto'],
  [/\bkai langan\b/gi, 'kailangan'],
  [/\bka i langan\b/gi, 'kailangan'],
  // Pwede variations
  [/\bpoo weh deh\b/gi, 'pwede'],
  [/\bpoo eh deh\b/gi, 'pwede'],
  [/\bpwe de\b/gi, 'pwede'],
  [/\bpoo wede\b/gi, 'pwede'],
  [/\bpuwede\b/gi, 'pwede'],
  [/\bpu weh deh\b/gi, 'pwede'],
  // More split words
  [/\bme ron\b/gi, 'meron'],
  [/\bhin di\b/gi, 'hindi'],
  [/\bheen dee\b/gi, 'hindi'],
  [/\bta la ga\b/gi, 'talaga'],
  [/\bta laga\b/gi, 'talaga'],
  [/\bna man\b/gi, 'naman'],
  [/\bka si\b/gi, 'kasi'],
  [/\bi to\b/gi, 'ito'],
  [/\bma am\b/gi, "ma'am"],
  [/\bmaam\b/gi, "ma'am"],
  [/\byong\b/gi, 'yung'],
  [/\byoong\b/gi, 'yung'],
  // Taglish compound words
  [/\bpaki\s+book\b/gi, 'pakibook'],
  [/\bpa\s+book\b/gi, 'pa-book'],
  [/\bpa\s+order\b/gi, 'pa-order'],
  [/\bpa\s+cancel\b/gi, 'pa-cancel'],
  [/\bpa\s+reschedule\b/gi, 'pa-reschedule'],
  [/\bmag\s+book\b/gi, 'mag-book'],
  [/\bmag\s+order\b/gi, 'mag-order'],
  [/\bi\s+book\b/gi, 'i-book'],
  [/\bi\s+order\b/gi, 'i-order'],
  [/\bi\s+cancel\b/gi, 'i-cancel'],
  // Common phonetic misrecognitions
  [/\bah no\b/gi, 'ano'],
  [/\bsah an\b/gi, 'saan'],
  [/\bsee no\b/gi, 'sino'],
  [/\boo oh\b/gi, 'oo'],
  [/\boo po\b/gi, 'oo po'],
  [/\bheen dee poh\b/gi, 'hindi po'],
  [/\bseh geh\b/gi, 'sige'],
  [/\beh wan\b/gi, 'ewan'],
  [/\bba kit\b/gi, 'bakit'],
  [/\bwa la\b/gi, 'wala'],
  // Numeric/time corrections
  [/\bdala wa\b/gi, 'dalawa'],
  [/\btat lo\b/gi, 'tatlo'],
  [/\bboo kas\b/gi, 'bukas'],
  [/\bma ma ya\b/gi, 'mamaya'],
  [/\bnga yon\b/gi, 'ngayon'],
];

function postProcessTagalog(transcript) {
  let result = transcript;
  for (const [pattern, replacement] of TAGALOG_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  // Normalize multiple spaces
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}

// Deepgram STT — dual-pass: Tagalog-first, then English fallback if low confidence
const DG_COMMON_PARAMS = `model=nova-3&punctuate=true&smart_format=true&numerals=true&utterances=true&filler_words=false&keyterm=${TAGALOG_KEYTERMS}`;

async function deepgramTranscribe(audioBody, contentType, lang) {
  const url = `https://api.deepgram.com/v1/listen?${DG_COMMON_PARAMS}&language=${lang}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': contentType,
    },
    body: audioBody,
  });
  const data = await res.json();
  if (!res.ok) return { error: data, status: res.status };
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  const confidence = data?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0;
  const detectedLang = data?.results?.channels?.[0]?.detected_language ?? lang;
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  return { transcript, confidence, detectedLang, words };
}

// POST /api/stt — advanced dual-pass transcription
app.post('/api/stt', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || 'audio/webm';
    const audioBuffer = Buffer.from(req.body);

    // Pass 1: Try with Tagalog (tl) — best for pure Tagalog and Taglish
    const tlResult = await deepgramTranscribe(audioBuffer, contentType, 'tl');
    if (tlResult.error) return res.status(tlResult.status).json(tlResult.error);

    let bestResult = tlResult;
    let usedLang = 'tl';

    // Pass 2: If Tagalog confidence is low, also try English and pick the best
    if (tlResult.confidence < 0.7 && tlResult.transcript.length > 0) {
      const enResult = await deepgramTranscribe(audioBuffer, contentType, 'en');
      if (!enResult.error && enResult.confidence > tlResult.confidence + 0.1) {
        bestResult = enResult;
        usedLang = 'en';
      }
    }

    // Pass 3: If both are low confidence, try multi as tiebreaker
    if (bestResult.confidence < 0.5 && bestResult.transcript.length > 0) {
      const multiResult = await deepgramTranscribe(audioBuffer, contentType, 'multi');
      if (!multiResult.error && multiResult.confidence > bestResult.confidence) {
        bestResult = multiResult;
        usedLang = 'multi';
      }
    }

    let transcript = bestResult.transcript;

    // Step 1: Regex post-processing
    transcript = postProcessTagalog(transcript);

    // Step 2: AI-assisted correction
    const aiCorrected = await aiCorrectTranscript(transcript, req.headers['x-api-key']);

    res.json({
      transcript: aiCorrected,
      rawTranscript: bestResult.transcript,
      detectedLang: bestResult.detectedLang,
      confidence: bestResult.confidence,
      wordCount: bestResult.words.length,
      aiCorrected: aiCorrected !== transcript,
      passUsed: usedLang,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== HTTP + WebSocket server ====================
const httpServer = createServer(app);

// WebSocket /api/stt/stream — real-time streaming Taglish transcription via Deepgram
const wss = new WebSocketServer({ server: httpServer, path: '/api/stt/stream' });

// Streaming Deepgram URL — Tagalog-first for best Taglish accuracy
const DG_STREAM_URL = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=tl&punctuate=true&smart_format=true&numerals=true&interim_results=true&endpointing=400&utterance_end_ms=2000&encoding=linear16&sample_rate=16000&channels=1';

wss.on('connection', (clientWs) => {
  console.log('[Deepgram] Streaming STT client connected');

  const dgWs = new WebSocket(DG_STREAM_URL, {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
  });

  dgWs.on('open', () => {
    console.log('[Deepgram] Connected to Deepgram streaming (multilingual mode)');
    clientWs.send(JSON.stringify({ status: 'ready' }));
  });

  dgWs.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      let transcript = parsed?.channel?.alternatives?.[0]?.transcript ?? '';
      const isFinal = parsed?.is_final ?? false;
      const detectedLang = parsed?.channel?.detected_language ?? null;
      if (transcript) {
        if (isFinal) {
          // Apply regex corrections + AI correction on final results
          transcript = postProcessTagalog(transcript);
          transcript = await aiCorrectTranscript(transcript);
        }
        clientWs.send(JSON.stringify({ transcript, isFinal, detectedLang }));
      }
    } catch {}
  });

  dgWs.on('close', () => {
    console.log('[Deepgram] Deepgram connection closed');
    try { clientWs.send(JSON.stringify({ status: 'closed' })); } catch {}
  });

  dgWs.on('error', (err) => {
    console.error('[Deepgram] Error:', err.message);
    try { clientWs.send(JSON.stringify({ error: err.message })); } catch {}
  });

  // Forward audio chunks from client to Deepgram
  clientWs.on('message', (data) => {
    if (dgWs.readyState === WebSocket.OPEN) dgWs.send(data);
  });

  clientWs.on('close', () => {
    console.log('[Deepgram] Client disconnected');
    if (dgWs.readyState === WebSocket.OPEN) dgWs.close();
  });
});

httpServer.listen(PORT, async () => {
  console.log(`\nAPI proxy + Edge TTS + ElevenLabs + Deepgram STT running on http://localhost:${PORT}`);
  console.log('TTS:  Edge TTS (free) + ElevenLabs (premium, multi-key rotation)');
  console.log('STT:  Deepgram nova-3 + AI correction');
  console.log('      File upload: POST /api/stt');
  console.log('      Streaming:   ws://localhost:' + PORT + '/api/stt/stream\n');

  // Auto-generate default welcome message on startup using ElevenLabs
  if (!welcomeMessages.has('default')) {
    console.log('[Welcome] Generating default welcome message...');
    try {
      const keyObj = getNextElevenLabsKey();
      if (keyObj) {
        const elRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL', {
          method: 'POST',
          headers: {
            'xi-api-key': keyObj.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: 'Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?',
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
          }),
        });
        if (elRes.ok) {
          const audioBuffer = Buffer.from(await elRes.arrayBuffer());
          welcomeMessages.set('default', {
            audio: audioBuffer,
            contentType: 'audio/mpeg',
            filename: 'welcome-default.mp3',
            uploadedAt: new Date().toISOString(),
          });
          console.log(`[Welcome] Default welcome message ready (${audioBuffer.length} bytes)`);
        }
      }
    } catch (err) {
      console.log('[Welcome] Could not generate default welcome:', err.message);
    }
  }
});
