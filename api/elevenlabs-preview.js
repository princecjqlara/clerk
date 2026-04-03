export const config = { runtime: 'edge' };

const DEFAULT_KEY = process.env.ELEVENLABS_API_KEY || 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, xi-api-key',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const body = await req.json();
    const voiceId = body.voice_id || 'EXAVITQu4vr4xnSDxMaL';
    const headerKey = req.headers.get('xi-api-key');
    const apiKey = (headerKey && headerKey.length > 5) ? headerKey : DEFAULT_KEY;
    const previewText = body.text || 'Kumusta! Magandang araw po. Paano ko po kayo matutulungan?';

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        ...cors,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
