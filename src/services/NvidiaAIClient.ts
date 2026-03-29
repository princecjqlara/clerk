const NVIDIA_NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'meta/llama-3.1-8b-instruct';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NIMResponse {
  choices: { message: { content: string } }[];
}

export async function chatCompletion(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(NVIDIA_NIM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA NIM API error ${response.status}: ${errorText}`);
  }

  const data: NIMResponse = await response.json();
  return data.choices[0]?.message?.content ?? 'I apologize, I could not process that.';
}
