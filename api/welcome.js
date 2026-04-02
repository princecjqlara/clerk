export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({ exists: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
