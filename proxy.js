/**
 * Simple CORS proxy for web testing.
 * Run: node proxy.js
 * Proxies NVIDIA, ElevenLabs, and Deepgram API calls to avoid browser CORS restrictions.
 */
const http = require('http');
const https = require('https');

const PORT = 3456;

const ROUTES = {
  '/api/nvidia/chat': {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    method: 'POST',
  },
  '/api/elevenlabs/tts': {
    // Voice ID is passed in the request body, we'll build the URL dynamically
    urlBase: 'https://api.elevenlabs.io/v1/text-to-speech/',
    method: 'POST',
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, xi-api-key',
  };
}

function proxyRequest(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers, host: parsed.hostname },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Welcome message status (no prerecorded messages available)
  if (req.url?.startsWith('/api/welcome/')) {
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ exists: false }));
    return;
  }

  // Read request body
  const bodyChunks = [];
  for await (const chunk of req) bodyChunks.push(chunk);
  const bodyStr = Buffer.concat(bodyChunks).toString();

  // NVIDIA chat proxy
  if (req.url === '/api/nvidia/chat') {
    try {
      const fwdHeaders = {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization || '',
      };
      const result = await proxyRequest(ROUTES['/api/nvidia/chat'].url, 'POST', fwdHeaders, bodyStr);
      res.writeHead(result.statusCode, {
        ...corsHeaders(),
        'Content-Type': result.headers['content-type'] || 'application/json',
      });
      res.end(result.body);
    } catch (err) {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ElevenLabs TTS proxy
  if (req.url === '/api/elevenlabs/tts') {
    try {
      const parsed = JSON.parse(bodyStr);
      const voiceId = parsed.voice_id || 'EXAVITQu4vr4xnSDxMaL';
      const targetUrl = `${ROUTES['/api/elevenlabs/tts'].urlBase}${voiceId}`;
      const fwdHeaders = {
        'Content-Type': 'application/json',
        'xi-api-key': req.headers['xi-api-key'] || parsed.api_key || '',
      };
      // Remove voice_id from body before forwarding
      const fwdBody = JSON.stringify({
        text: parsed.text,
        model_id: parsed.model_id || 'eleven_multilingual_v2',
        voice_settings: parsed.voice_settings || { stability: 0.5, similarity_boost: 0.75 },
      });
      const result = await proxyRequest(targetUrl, 'POST', fwdHeaders, fwdBody);
      res.writeHead(result.statusCode, {
        ...corsHeaders(),
        'Content-Type': result.headers['content-type'] || 'audio/mpeg',
      });
      res.end(result.body);
    } catch (err) {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // TTS voices list (stub)
  if (req.url === '/api/tts/voices') {
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ voices: [] }));
    return;
  }

  // ElevenLabs keys (stub)
  if (req.url === '/api/elevenlabs/keys') {
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [] }));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, corsHeaders());
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`CORS proxy running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  POST /api/nvidia/chat     -> NVIDIA NIM API');
  console.log('  POST /api/elevenlabs/tts  -> ElevenLabs TTS API');
  console.log('  GET  /api/welcome/:id     -> Welcome message (stub)');
});
