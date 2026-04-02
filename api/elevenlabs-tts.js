module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, xi-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice_id, model_id, voice_settings, api_key } = req.body;
    const voiceId = voice_id || 'EXAVITQu4vr4xnSDxMaL';
    const apiKey = req.headers['xi-api-key'] || api_key || 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: model_id || 'eleven_multilingual_v2',
        voice_settings: voice_settings || { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    res
      .status(response.status)
      .setHeader('Content-Type', contentType)
      .end(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
