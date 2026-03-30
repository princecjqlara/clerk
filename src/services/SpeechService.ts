import * as ExpoSpeech from 'expo-speech';
import { Audio } from 'expo-av';
import { Platform, NativeModules } from 'react-native';

const PROXY_BASE = 'http://localhost:3456';
const TTS_PROXY = `${PROXY_BASE}/api/tts`;
const ELEVENLABS_TTS_PROXY = `${PROXY_BASE}/api/elevenlabs/tts`;
const STT_PROXY = `${PROXY_BASE}/api/stt`;
const STT_WS = 'ws://localhost:3456/api/stt/stream';
const DEFAULT_VOICE = 'fil-PH-BlessicaNeural'; // Natural female Filipino voice

// TTS provider configuration
export type TTSProvider = 'edge' | 'elevenlabs';

let currentTTSProvider: TTSProvider = 'elevenlabs'; // Default to ElevenLabs for testing
let currentElevenLabsVoiceId: string = 'EXAVITQu4vr4xnSDxMaL'; // Default: Bella

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

  // Try ElevenLabs first if selected
  if (currentTTSProvider === 'elevenlabs') {
    try {
      const response = await fetch(ELEVENLABS_TTS_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: currentElevenLabsVoiceId,
          model_id: 'eleven_multilingual_v2',
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        if (Platform.OS === 'web') {
          await playAudioWeb(audioUrl);
        } else {
          await playAudioNative(audioUrl);
        }
        isSpeaking = false;
        return;
      }
      // ElevenLabs failed — fall through to Edge TTS
    } catch {
      // ElevenLabs proxy not available — fall through
    }
  }

  try {
    // Edge TTS via proxy (natural voice)
    const response = await fetch(TTS_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    if (response.ok) {
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (Platform.OS === 'web') {
        await playAudioWeb(audioUrl);
      } else {
        await playAudioNative(audioUrl);
      }
      isSpeaking = false;
      return;
    }
  } catch {
    // Edge TTS proxy not available — fall back to expo-speech
  }

  // Fallback: expo-speech (robotic but works without proxy)
  return new Promise((resolve) => {
    ExpoSpeech.speak(text, {
      language: 'fil-PH',
      pitch: 1.05,
      rate: 0.9,
      onDone: () => { isSpeaking = false; resolve(); },
      onError: () => {
        isSpeaking = false;
        // Last resort: English
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

function playAudioWeb(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new window.Audio(url);
    audio.onended = () => { isSpeaking = false; URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { isSpeaking = false; URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
    audio.play().catch(reject);
  });
}

async function playAudioNative(uri: string): Promise<void> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if ('didJustFinish' in status && status.didJustFinish) {
        isSpeaking = false;
        sound.unloadAsync();
        currentSound = null;
      }
    });
    await sound.playAsync();
  } catch {
    isSpeaking = false;
  }
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
    // Check if a prerecorded welcome message exists
    const statusRes = await fetch(`${PROXY_BASE}/api/welcome/${tenantId}/status`);
    if (!statusRes.ok) return false;
    const status = await statusRes.json();
    if (!status.exists) return false;

    // Fetch and play the prerecorded audio
    const audioRes = await fetch(`${PROXY_BASE}/api/welcome/${tenantId}`);
    if (!audioRes.ok) return false;

    const audioBlob = await audioRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    if (isSpeaking) await stopSpeaking();
    isSpeaking = true;

    if (Platform.OS === 'web') {
      await playAudioWeb(audioUrl);
    } else {
      await playAudioNative(audioUrl);
    }
    return true;
  } catch {
    isSpeaking = false;
    return false;
  }
}

export async function uploadWelcomeMessage(tenantId: string, audioBlob: Blob): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_BASE}/api/welcome/upload`, {
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
    const res = await fetch(`${PROXY_BASE}/api/welcome/${tenantId}`, { method: 'DELETE' });
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
        const response = await fetch(STT_PROXY, {
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

    sttWebSocket = new WebSocket(STT_WS);
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
