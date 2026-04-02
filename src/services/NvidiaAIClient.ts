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

// Use proxy on web to avoid CORS, direct on native
function getEndpoint(): string {
  if (Platform.OS === 'web') {
    return PROXY_ENDPOINT;
  }
  return NVIDIA_NIM_ENDPOINT;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NIMResponse {
  choices: { message: { content: string } }[];
}

export async function chatCompletion(
  apiKey: string = DEFAULT_API_KEY,
  messages: ChatMessage[],
): Promise<string> {
  const key = apiKey || DEFAULT_API_KEY;
  const endpoint = getEndpoint();

  // Add timeout so requests don't hang forever
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(endpoint, {
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
      throw new Error(`NVIDIA NIM API error ${response.status}: ${errorText}`);
    }

    const data: NIMResponse = await response.json();
    return data.choices[0]?.message?.content ?? 'I apologize, I could not process that.';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out after 20 seconds. Check your network connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
