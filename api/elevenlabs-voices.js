export const config = { runtime: 'edge' };

const DEFAULT_KEY = process.env.ELEVENLABS_API_KEY || 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, xi-api-key',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const headerKey = req.headers.get('xi-api-key');
    const apiKey = (headerKey && headerKey.length > 5) ? headerKey : DEFAULT_KEY;

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });

    const data = await response.json();
    return new Response(JSON.stringify({ voices: data.voices || [] }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
