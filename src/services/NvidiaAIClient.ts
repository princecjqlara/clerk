import { Platform } from 'react-native';

const NVIDIA_NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const PROXY_ENDPOINT = 'http://localhost:3456/api/nvidia/chat';
const DEFAULT_API_KEY = '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';

// Available models — tenant can choose in AI Config
export const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: 'Fast & smart — best for real-time calls', speed: 'fast' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', desc: 'Smartest — slower but highest quality', speed: 'slow' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', desc: 'NVIDIA-tuned — great at following instructions', speed: 'fast' },
  { id: 'deepseek-ai/deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', desc: 'Reasoning model — best for complex conversations', speed: 'fast' },
] as const;

let currentModel = 'meta/llama-3.3-70b-instruct';

export function setModel(modelId: string) {
  currentModel = modelId;
}

export function getModel(): string {
  return currentModel;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NIMResponse {
  choices: { message: { content: string } }[];
}

async function fetchWithTimeout(
  url: string,
  key: string,
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: currentModel,
        messages,
        temperature: 0.7,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API error ${response.status}: ${errorText}`);
    }

    const data: NIMResponse = await response.json();
    return data.choices[0]?.message?.content ?? 'I apologize, I could not process that.';
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function chatCompletion(
  apiKey: string = DEFAULT_API_KEY,
  messages: ChatMessage[],
): Promise<string> {
  const key = apiKey || DEFAULT_API_KEY;

  if (Platform.OS !== 'web') {
    // Native: always use direct endpoint
    return fetchWithTimeout(NVIDIA_NIM_ENDPOINT, key, messages, 20000);
  }

  // Web: try direct NVIDIA API first, fall back to proxy if CORS blocks it
  try {
    return await fetchWithTimeout(NVIDIA_NIM_ENDPOINT, key, messages, 15000);
  } catch (directErr: any) {
    // If it was a real API error (not network/CORS), don't retry via proxy
    if (directErr.message?.includes('NVIDIA API error')) {
      throw directErr;
    }

    // CORS or network error — try proxy as fallback
    console.log('Direct NVIDIA API failed (likely CORS), trying proxy...', directErr.message);
    try {
      return await fetchWithTimeout(PROXY_ENDPOINT, key, messages, 15000);
    } catch (proxyErr: any) {
      // Both failed — give a helpful error
      throw new Error(
        'Could not reach AI service. Direct API blocked by CORS and proxy at localhost:3456 is not running. ' +
        'Run the proxy server or test on the Android app instead.'
      );
    }
  }
}
