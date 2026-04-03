import * as ExpoSpeech from 'expo-speech';
import { Audio } from 'expo-av';
import { Platform, NativeModules } from 'react-native';

import { getApiBase } from './ApiBase';

const DEFAULT_VOICE = 'fil-PH-BlessicaNeural'; // Natural female Filipino voice — Taglish/Tagalog/English
const ELEVENLABS_DEFAULT_KEY = 'sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b';
const ELEVENLABS_DIRECT_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Microsoft Edge TTS — free, no API key, excellent Filipino neural voices
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_WS = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TTS_TOKEN}`;

function getProxyBase(): string {
  return getApiBase();
}

function generateId(): string {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function escapeSSML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Direct Edge TTS via Microsoft WebSocket — works everywhere, no proxy needed
async function edgeTTSDirect(text: string, voice: string): Promise<Blob | null> {
  if (typeof WebSocket === 'undefined') return null;

  return new Promise((resolve) => {
    const connectionId = generateId();
    const requestId = generateId();
    const wsUrl = `${EDGE_TTS_WS}&ConnectionId=${connectionId}`;

    console.log('[EdgeTTS] Connecting to Microsoft WebSocket...');
    const ws = new WebSocket(wsUrl);
    if (ws.binaryType !== undefined) ws.binaryType = 'arraybuffer';

    const audioChunks: ArrayBuffer[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[EdgeTTS] Timeout after 15s');
        resolved = true;
        ws.close();
        resolve(null);
      }
    }, 15000);

    const done = (success: boolean) => {
      if (resolved) return;
      clearTimeout(timeout);
      resolved = true;
      ws.close();
      if (success && audioChunks.length > 0) {
        console.log('[EdgeTTS] Got', audioChunks.length, 'audio chunks');
        resolve(new Blob(audioChunks, { type: 'audio/mp3' }));
      } else {
        resolve(null);
      }
    };

    ws.onopen = () => {
      console.log('[EdgeTTS] Connected — sending SSML with voice:', voice);
      // Send output format config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );

      // Send SSML synthesis request
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeSSML(text)}</prosody>` +
        `</voice></speak>`;

      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    };

    ws.onmessage = (event: any) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          done(true);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary: 2-byte header length (big-endian) + text header + audio data
        const buf = event.data as ArrayBuffer;
        if (buf.byteLength < 2) return;
        const view = new DataView(buf);
        const headerLen = view.getUint16(0);
        const audioStart = 2 + headerLen;
        if (audioStart < buf.byteLength) {
          audioChunks.push(buf.slice(audioStart));
        }
      }
    };

    ws.onerror = (err: any) => {
      console.warn('[EdgeTTS] WebSocket error:', err?.message || err);
      done(false);
    };

    ws.onclose = () => {
      done(audioChunks.length > 0);
    };
  });
}

// Get the welcome message endpoint
function getWelcomeUrl(tenantId: string): string {
  return `${getProxyBase()}/api/welcome?tenantId=${tenantId}`;
}

// TTS provider configuration
export type TTSProvider = 'edge' | 'elevenlabs';

let currentTTSProvider: TTSProvider = 'elevenlabs'; // Default to ElevenLabs (Ate Jane — Filipino voice)
let currentElevenLabsVoiceId: string = 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah (premade, free, multilingual v2 speaks Tagalog)

export function setTTSProvider(provider: TTSProvider) {
  currentTTSProvider = provider;
}

export function getTTSProvider(): TTSProvider {
  return currentTTSProvider;
}

export function setElevenLabsVoiceId(voiceId: string) {
  currentElevenLabsVoiceId = voiceId;
}

// ==================== TTS (Text-to-Speech) ====================
// Supports two providers:
//   1. Edge TTS — free, good Filipino neural voices
//   2. ElevenLabs — premium quality, multilingual v2, API key rotation via proxy

let isSpeaking = false;
let currentSound: Audio.Sound | null = null;

export async function speak(text: string, voice: string = DEFAULT_VOICE): Promise<void> {
  if (isSpeaking) {
    await stopSpeaking();
  }
  isSpeaking = true;

  const edgeVoice = voice || DEFAULT_VOICE;
  console.log('[TTS] speak() called — provider:', currentTTSProvider, '| edgeVoice:', edgeVoice, '| elevenLabsVoice:', currentElevenLabsVoiceId);

  // Try ElevenLabs if selected (requires paid plan)
  if (currentTTSProvider === 'elevenlabs') {
    const voiceId = currentElevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL';
    const directUrl = `${ELEVENLABS_DIRECT_URL}/${voiceId}`;
    console.log('[TTS] Trying ElevenLabs direct:', directUrl);
    try {
      const response = await fetch(directUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_DEFAULT_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      });

      if (response.ok) {
        console.log('[TTS] ElevenLabs OK — got audio, playing...');
        await playAudioFromResponse(response);
        isSpeaking = false;
        return;
      }
      console.warn('[TTS] ElevenLabs API failed:', response.status);
    } catch (err) {
      console.warn('[TTS] ElevenLabs error:', err);
    }
  }

  // Edge TTS — direct WebSocket to Microsoft (free, no proxy, neural Filipino voices)
  try {
    console.log('[TTS] Trying Edge TTS direct WebSocket — voice:', edgeVoice);
    const audioBlob = await edgeTTSDirect(text, edgeVoice);
    if (audioBlob && audioBlob.size > 0) {
      console.log('[TTS] Edge TTS OK — playing', audioBlob.size, 'bytes');
      // Convert blob to Response for playAudioFromResponse
      const audioBuffer = await new Response(audioBlob).arrayBuffer();
      const fakeResp = new Response(audioBuffer, { headers: { 'Content-Type': 'audio/mpeg' } });
      await playAudioFromResponse(fakeResp);
      isSpeaking = false;
      return;
    }
    console.warn('[TTS] Edge TTS returned no audio');
  } catch (err) {
    console.warn('[TTS] Edge TTS error:', err);
  }

  // Last fallback: expo-speech (robotic but always works)
  console.log('[TTS] Falling back to expo-speech');
  return new Promise((resolve) => {
    ExpoSpeech.speak(text, {
      language: 'fil-PH',
      pitch: 1.05,
      rate: 0.9,
      onDone: () => { isSpeaking = false; resolve(); },
      onError: () => {
        isSpeaking = false;
        ExpoSpeech.speak(text, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.95,
          onDone: () => resolve(),
          onError: () => resolve(),
        });
      },
      onStopped: () => { isSpeaking = false; resolve(); },
    });
  });
}

// Convert ArrayBuffer to base64 (works in all JS environments)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
}

// Play audio from a fetch Response — converts to base64 data URI to avoid Blob/URL issues
async function playAudioFromResponse(response: Response): Promise<void> {
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const dataUri = `data:audio/mpeg;base64,${base64}`;
  console.log('[TTS] Audio size:', buffer.byteLength, 'bytes, playing as data URI...');

  // Try window.Audio (works in browsers / Expo Web)
  if (typeof window !== 'undefined' && typeof window.Audio === 'function') {
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new window.Audio(dataUri);
        audio.onended = () => { isSpeaking = false; resolve(); };
        audio.onerror = () => { isSpeaking = false; reject(new Error('Web audio playback failed')); };
        audio.play().catch(reject);
      });
      console.log('[TTS] Played via window.Audio');
      return;
    } catch (err) {
      console.warn('[TTS] window.Audio failed:', err);
    }
  }

  // Try expo-av (native Android/iOS)
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: dataUri });
    currentSound = sound;
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          isSpeaking = false;
          sound.unloadAsync();
          currentSound = null;
          resolve();
        }
      });
      sound.playAsync();
    });
    console.log('[TTS] Played via expo-av');
    return;
  } catch (err) {
    console.warn('[TTS] expo-av failed:', err);
  }

  isSpeaking = false;
  throw new Error('No audio player available');
}

export async function stopSpeaking() {
  isSpeaking = false;
  ExpoSpeech.stop();
  if (currentSound) {
    try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch {}
    currentSound = null;
  }
}

export function getIsSpeaking() {
  return isSpeaking;
}

// ==================== Prerecorded Welcome Message ====================

export async function playWelcomeMessage(tenantId: string = 'default'): Promise<boolean> {
  try {
    // Check if a prerecorded welcome message exists (quick timeout — proxy may not be running)
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const welcomeUrl = getWelcomeUrl(tenantId);
    const statusRes = await fetch(welcomeUrl, { signal: controller.signal });
    clearTimeout(tid);
    if (!statusRes.ok) return false;
    const status = await statusRes.json();
    if (!status.exists) return false;

    // Fetch and play the prerecorded audio
    const audioRes = await fetch(`${getProxyBase()}/api/welcome?tenantId=${tenantId}&audio=true`);
    if (!audioRes.ok) return false;

    if (isSpeaking) await stopSpeaking();
    isSpeaking = true;

    await playAudioFromResponse(audioRes);
    return true;
  } catch {
    isSpeaking = false;
    return false;
  }
}

export async function uploadWelcomeMessage(tenantId: string, audioBlob: Blob): Promise<boolean> {
  try {
    const res = await fetch(`${getProxyBase()}/api/welcome-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': audioBlob.type || 'audio/webm',
        'X-Tenant-Id': tenantId,
      },
      body: audioBlob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteWelcomeMessage(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getProxyBase()}/api/welcome?tenantId=${tenantId}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// ==================== STT (Speech-to-Text) ====================
// Web: Uses Deepgram nova-3 via proxy — supports Tagalog, English, Taglish
// Android: Uses native SpeechRecognizer via AICallModule

const { AICallModule } = NativeModules;

// ---- Auto-listening via Chrome Web Speech API ----
// Uses Google's speech recognition engine (same as Google Translate voice typing)
// Much more accurate for Filipino/Taglish than Deepgram
// Falls back to Deepgram file upload if Web Speech API unavailable

let speechRecognition: any = null;
let autoListenActive = false;
let autoListenCallbacks: {
  onInterim: (s: string) => void;
  onFinal: (text: string, lang?: string) => void;
  onError?: (e: string) => void;
} | null = null;

// Buffer finals — wait for user to fully stop speaking before sending
let finalBuffer = '';
let finalTimer: any = null;
const FINAL_DELAY = 2000; // Wait 2s of silence after last final before sending

export async function startAutoListening(
  onInterim: (status: string) => void,
  onFinal: (text: string, lang?: string) => void,
  onError?: (error: string) => void,
): Promise<void> {
  if (autoListenActive) stopAutoListening();

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError?.('Speech recognition not supported in this browser. Use Chrome.');
    return;
  }

  autoListenActive = true;
  autoListenCallbacks = { onInterim, onFinal, onError };
  finalBuffer = '';

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.lang = 'fil-PH'; // Filipino — better Tagalog accuracy, AI handles English errors

  speechRecognition.onresult = (event: any) => {
    let interimTranscript = '';
    let newFinal = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        newFinal += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    // Show interim text (what user is currently saying)
    if (interimTranscript) {
      onInterim(finalBuffer + interimTranscript);
    }

    if (newFinal) {
      // Append to buffer — user might still be speaking
      finalBuffer += (finalBuffer ? ' ' : '') + newFinal.trim();
      onInterim(finalBuffer + '...');

      // Reset the silence timer — wait for user to fully stop
      if (finalTimer) clearTimeout(finalTimer);
      finalTimer = setTimeout(() => {
        if (finalBuffer.trim() && autoListenActive) {
          const fullText = finalBuffer.trim();
          finalBuffer = '';
          onFinal(fullText, 'en-PH');
        }
      }, FINAL_DELAY);
    }
  };

  speechRecognition.onerror = (event: any) => {
    if (event.error === 'no-speech') {
      // Normal — just no speech detected, keep listening
      return;
    }
    if (event.error === 'aborted' || event.error === 'network') {
      // Restart if still active
      if (autoListenActive) {
        setTimeout(() => restartSpeechRecognition(), 500);
      }
      return;
    }
    onError?.(event.error || 'Speech recognition error');
  };

  speechRecognition.onend = () => {
    // Auto-restart if still active (Chrome stops after ~60s of silence)
    if (autoListenActive) {
      setTimeout(() => restartSpeechRecognition(), 200);
    }
  };

  try {
    speechRecognition.start();
    onInterim('Listening...');
  } catch (err: any) {
    onError?.(err.message || 'Failed to start speech recognition');
  }
}

function restartSpeechRecognition() {
  if (!autoListenActive || !autoListenCallbacks) return;
  try {
    if (speechRecognition) {
      speechRecognition.stop();
    }
  } catch {}

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 3;
  speechRecognition.lang = 'fil-PH';

  const { onInterim, onFinal, onError } = autoListenCallbacks;

  speechRecognition.onresult = (event: any) => {
    let interimTranscript = '';
    let newFinal = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        newFinal += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }
    if (interimTranscript) onInterim(finalBuffer + interimTranscript);
    if (newFinal) {
      finalBuffer += (finalBuffer ? ' ' : '') + newFinal.trim();
      onInterim(finalBuffer + '...');
      if (finalTimer) clearTimeout(finalTimer);
      finalTimer = setTimeout(() => {
        if (finalBuffer.trim() && autoListenActive) {
          const fullText = finalBuffer.trim();
          finalBuffer = '';
          onFinal(fullText, 'en-PH');
        }
      }, FINAL_DELAY);
    }
  };

  speechRecognition.onerror = (event: any) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (autoListenActive) setTimeout(() => restartSpeechRecognition(), 500);
  };

  speechRecognition.onend = () => {
    if (autoListenActive) setTimeout(() => restartSpeechRecognition(), 200);
  };

  try {
    speechRecognition.start();
    onInterim('Listening...');
  } catch {}
}

export function stopAutoListening() {
  autoListenActive = false;
  autoListenCallbacks = null;
  finalBuffer = '';
  if (finalTimer) { clearTimeout(finalTimer); finalTimer = null; }
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch {}
    speechRecognition = null;
  }
}

export function isAutoListening(): boolean {
  return autoListenActive;
}

// ---- Web STT: MediaRecorder → Deepgram (file upload) ----
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export async function startListeningWeb(
  onResult: (text: string, lang?: string) => void,
  onError?: (error: string) => void,
): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    onError?.('Microphone not available in this environment');
    return;
  }

  try {
    // Request high-quality audio optimized for speech recognition
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,      // Optimal for speech recognition
        channelCount: 1,        // Mono is better for STT
      },
    });
    audioChunks = [];

    // Prefer webm/opus for best quality, fall back to whatever is supported
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (audioChunks.length === 0) return;

      const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      audioChunks = [];

      try {
        const response = await fetch(`${getProxyBase()}/api/stt`, {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.transcript) {
            onResult(data.transcript, data.detectedLang);
          } else {
            onError?.('No speech detected');
          }
        } else {
          onError?.('Transcription failed');
        }
      } catch (err: any) {
        onError?.(err.message || 'Transcription error');
      }
    };

    mediaRecorder.start(250); // Capture data every 250ms for better short-utterance handling
  } catch (err: any) {
    onError?.(err.message || 'Microphone access denied');
  }
}

export function stopListeningWeb(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
}

export function isWebListening(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

// ---- Streaming Web STT via WebSocket ----
let sttWebSocket: WebSocket | null = null;

export function startStreamingSTT(
  onInterim: (text: string) => void,
  onFinal: (text: string, lang?: string) => void,
  onError?: (error: string) => void,
  onReady?: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === 'undefined') {
      reject(new Error('WebSocket not available'));
      return;
    }

    const wsBase = getProxyBase().replace(/^http/, 'ws');
    sttWebSocket = new WebSocket(`${wsBase}/api/stt/stream`);
    sttWebSocket.binaryType = 'arraybuffer';

    sttWebSocket.onopen = () => {};

    sttWebSocket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'ready') {
          onReady?.();
          // Start mic after Deepgram is ready
          await startMicStream(sttWebSocket!, onError);
          resolve();
        } else if (data.status === 'closed') {
          stopStreamingSTT();
        } else if (data.error) {
          onError?.(data.error);
        } else if (data.transcript) {
          if (data.isFinal) {
            onFinal(data.transcript, data.detectedLang);
          } else {
            onInterim(data.transcript);
          }
        }
      } catch {}
    };

    sttWebSocket.onerror = (e) => {
      onError?.('STT connection error');
      reject(new Error('WebSocket error'));
    };

    sttWebSocket.onclose = () => {
      stopMicStream();
    };
  });
}

let micStream: MediaStream | null = null;
let micProcessor: ScriptProcessorNode | null = null;
let audioContext: AudioContext | null = null;

async function startMicStream(ws: WebSocket, onError?: (e: string) => void) {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1,
      },
    });
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(micStream);

    // Use smaller buffer (2048) for lower latency in real-time streaming
    micProcessor = audioContext.createScriptProcessor(2048, 1, 1);

    micProcessor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Convert to 16-bit PCM linear (what Deepgram expects)
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      ws.send(int16.buffer);
    };

    source.connect(micProcessor);
    micProcessor.connect(audioContext.destination);
  } catch (err: any) {
    onError?.(err.message || 'Mic error');
  }
}

function stopMicStream() {
  micProcessor?.disconnect();
  micProcessor = null;
  audioContext?.close();
  audioContext = null;
  micStream?.getTracks().forEach(t => t.stop());
  micStream = null;
}

export function stopStreamingSTT() {
  stopMicStream();
  if (sttWebSocket && sttWebSocket.readyState === WebSocket.OPEN) {
    sttWebSocket.close();
  }
  sttWebSocket = null;
}

export function isStreamingSTT(): boolean {
  return sttWebSocket !== null && sttWebSocket.readyState === WebSocket.OPEN;
}

// ---- Android STT (native SpeechRecognizer) ----
// Use 'fil-PH' as primary with 'en-PH' fallback for Taglish speakers
export async function startListening(
  language: string = 'fil-PH',
  onResult?: (text: string) => void,
  onError?: (error: string) => void,
): Promise<void> {
  if (Platform.OS !== 'android' || !AICallModule?.startListening) {
    onError?.('Speech recognition only available on Android device');
    return;
  }
  try {
    // Try fil-PH first; if the native module supports extra languages, pass en-PH too
    // so Google SpeechRecognizer can handle code-switched Taglish
    if (AICallModule.startListeningMultiLang) {
      await AICallModule.startListeningMultiLang(['fil-PH', 'en-PH', 'en-US']);
    } else {
      await AICallModule.startListening(language);
    }
  } catch (err: any) {
    onError?.(err.message || 'Failed to start speech recognition');
  }
}

export async function stopListening(): Promise<void> {
  if (Platform.OS !== 'android' || !AICallModule?.stopListening) return;
  try { await AICallModule.stopListening(); } catch {}
}
