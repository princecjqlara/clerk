export const config = { runtime: 'edge' };

export default function handler() {
  const voices = {
    recommended: [
      { id: 'fil-PH-BlessicaNeural', gender: 'Female', personality: 'Friendly Filipino' },
      { id: 'fil-PH-AngeloNeural', gender: 'Male', personality: 'Friendly Filipino' },
      { id: 'en-PH-RosaNeural', gender: 'Female', personality: 'Friendly English (PH)' },
      { id: 'en-PH-JamesNeural', gender: 'Male', personality: 'Friendly English (PH)' },
    ],
    all: [
      { id: 'fil-PH-BlessicaNeural', gender: 'Female', personality: 'Friendly Filipino' },
      { id: 'fil-PH-AngeloNeural', gender: 'Male', personality: 'Friendly Filipino' },
      { id: 'en-PH-RosaNeural', gender: 'Female', personality: 'Friendly English (PH)' },
      { id: 'en-PH-JamesNeural', gender: 'Male', personality: 'Friendly English (PH)' },
      { id: 'en-US-JennyNeural', gender: 'Female', personality: 'Conversational English' },
      { id: 'en-US-GuyNeural', gender: 'Male', personality: 'Conversational English' },
      { id: 'en-US-AriaNeural', gender: 'Female', personality: 'Professional English' },
    ],
  };

  return new Response(JSON.stringify(voices), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
