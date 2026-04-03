export const config = { runtime: 'edge' };

// Microsoft Edge TTS via the free speech synthesis endpoint
const SYNTH_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/token';
const TTS_URL = 'https://eastus.api.speech.microsoft.com/cognitiveservices/v1';

async function getToken() {
  const res = await fetch(SYNTH_URL, {
    headers: { 'Sec-MS-GEC-Version': '1-130.0.2849.68', 'Sec-MS-GEC': '' },
  });
  if (!res.ok) return null;
  return await res.text();
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const body = await req.json();
    const text = body.text || '';
    const voice = body.voice || 'fil-PH-BlessicaNeural';

    // Build SSML
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
      <voice name='${voice}'>
        <prosody rate='0%' pitch='0%'>${escapeXml(text)}</prosody>
      </voice>
    </speak>`;

    const token = await getToken();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Could not obtain TTS token' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const ttsRes = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0',
      },
      body: ssml,
    });

    if (!ttsRes.ok) {
      // Fallback: return empty error so client falls back to expo-speech
      return new Response(JSON.stringify({ error: 'Edge TTS synthesis failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const buffer = await ttsRes.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
