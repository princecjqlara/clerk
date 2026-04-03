export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // In production, keys should be managed via environment variables.
  // This endpoint returns a stub so the UI doesn't error out.
  const defaultKey = process.env.ELEVENLABS_API_KEY || '';
  const keys = defaultKey ? [{ apiKey: defaultKey, label: 'Default' }] : [];

  return new Response(JSON.stringify({ keys }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
