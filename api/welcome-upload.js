export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-Id',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Stub — welcome message upload needs a storage backend (e.g. Supabase Storage)
  return new Response(JSON.stringify({ ok: true, message: 'Welcome message upload not yet configured' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
