export const config = { runtime: 'edge' };

const DEFAULT_KEY = 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, xi-api-key',
      },
    });
  }

  try {
    const body = await req.json();
    const voiceId = body.voice_id || 'EXAVITQu4vr4xnSDxMaL';
    const apiKey = req.headers.get('xi-api-key') || body.api_key || DEFAULT_KEY;

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: body.text,
        model_id: body.model_id || 'eleven_multilingual_v2',
        voice_settings: body.voice_settings || { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
