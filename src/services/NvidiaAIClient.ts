import { Platform } from 'react-native';

const NVIDIA_NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_API_KEY = '';

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

// On web, use Vercel serverless API route to bypass CORS
// Detects if running on deployed Vercel or localhost
function getWebProxyEndpoint(): string {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    return `${origin}/api/nvidia-chat`;
  }
  return '/api/nvidia-chat';
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  // Native: call NVIDIA directly. Web: use our serverless proxy to avoid CORS.
  const endpoint = Platform.OS === 'web' ? getWebProxyEndpoint() : NVIDIA_NIM_ENDPOINT;

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
      throw new Error(`AI error ${response.status}: ${errorText}`);
    }

    const data: NIMResponse = await response.json();
    return data.choices[0]?.message?.content ?? 'I apologize, I could not process that.';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out after 45 seconds. Check your network connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
