import { Platform } from 'react-native';

const NVIDIA_NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_API_KEY = '';

// Available models — tenant can choose in AI Config
export const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', desc: 'Fastest — best for real-time calls', speed: 'fastest' },
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: 'Smart & fast — great quality', speed: 'fast' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', desc: 'Smartest — slower but highest quality', speed: 'slow' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', desc: 'NVIDIA-tuned — great at following instructions', speed: 'fast' },
] as const;

let currentModel = 'meta/llama-3.1-8b-instruct';

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

// Streaming chat — calls onToken for each chunk, returns full text
export async function chatCompletionStream(
  apiKey: string = DEFAULT_API_KEY,
  messages: ChatMessage[],
  onToken?: (partial: string) => void,
): Promise<string> {
  const key = apiKey || DEFAULT_API_KEY;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

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
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI error ${response.status}: ${errorText}`);
    }

    let full = '';

    // Try ReadableStream first (modern browsers), fall back to text parsing
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') break;
          try {
            const json = JSON.parse(payload);
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              full += token;
              onToken?.(full);
            }
          } catch {}
        }
      }
    } else {
      // Fallback: read entire response as text, parse SSE lines
      const text = await response.text();
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            full += token;
            onToken?.(full);
          }
        } catch {}
      }

      // If SSE parsing got nothing, try parsing as regular JSON response
      if (!full) {
        try {
          const json = JSON.parse(text);
          full = json.choices?.[0]?.message?.content || '';
        } catch {}
      }
    }

    return full || 'I apologize, I could not process that.';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out after 45 seconds. Check your network connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Non-streaming fallback
export async function chatCompletion(
  apiKey: string = DEFAULT_API_KEY,
  messages: ChatMessage[],
): Promise<string> {
  return chatCompletionStream(apiKey, messages);
}
