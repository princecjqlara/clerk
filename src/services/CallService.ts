import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AICallModule } = NativeModules;

type CallEvent =
  | 'incoming'
  | 'answered'
  | 'disconnected'
  | 'audioReady'
  | 'transcription'
  | 'aiResponse'
  | 'callFlowUpdate'
  | 'requestGreeting'
  | 'requestAIResponse';

interface CallInfo {
  phoneNumber: string;
  callId: string;
  duration?: string;
}

interface TranscriptionData {
  callId: string;
  phoneNumber: string;
  text: string;
}

interface AIResponseData {
  callId: string;
  phoneNumber: string;
  text: string;
}

interface CallFlowData {
  callId: string;
  phoneNumber: string;
  state: string;
  error?: string;
}

interface RequestAIData {
  callId: string;
  phoneNumber: string;
  text: string;
  type?: string;
}

class CallService {
  private emitter: NativeEventEmitter | null = null;
  private listeners: Map<CallEvent, Set<(data: any) => void>> = new Map();

  init() {
    if (Platform.OS !== 'android' || !AICallModule) {
      console.warn('CallService: Native module not available');
      return;
    }

    this.emitter = new NativeEventEmitter(AICallModule);

    // Existing call lifecycle events
    this.emitter.addListener('onIncomingCall', (data: CallInfo) => {
      this.emit('incoming', data);
    });

    this.emitter.addListener('onCallAnswered', (data: CallInfo) => {
      this.emit('answered', data);
    });

    this.emitter.addListener('onCallDisconnected', (data: CallInfo) => {
      this.emit('disconnected', data);
    });

    // New audio bridge events
    this.emitter.addListener('onTranscription', (data: TranscriptionData) => {
      this.emit('transcription', data);
    });

    this.emitter.addListener('onAIResponse', (data: AIResponseData) => {
      this.emit('aiResponse', data);
    });

    this.emitter.addListener('onCallFlowUpdate', (data: CallFlowData) => {
      this.emit('callFlowUpdate', data);
    });

    this.emitter.addListener('onRequestGreeting', (data: RequestAIData) => {
      this.emit('requestGreeting', data);
    });

    this.emitter.addListener('onRequestAIResponse', (data: RequestAIData) => {
      this.emit('requestAIResponse', data);
    });
  }

  on(event: CallEvent, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: CallEvent, data: any) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  // ==================== Call Control ====================

  async answerCall(callId: string): Promise<void> {
    if (AICallModule) {
      await AICallModule.answerCall(callId);
    }
  }

  async disconnectCall(callId: string): Promise<void> {
    if (AICallModule) {
      await AICallModule.disconnectCall(callId);
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (AICallModule) {
      await AICallModule.setReceptionistEnabled(enabled);
    }
  }

  async isEnabled(): Promise<boolean> {
    if (AICallModule) {
      return AICallModule.isReceptionistEnabled();
    }
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    if (AICallModule) {
      return AICallModule.requestPermissions();
    }
    return false;
  }

  async requestDefaultDialer(): Promise<boolean> {
    if (AICallModule) {
      return AICallModule.requestDefaultDialer();
    }
    return false;
  }

  // ==================== AI Conversation Control ====================

  /**
   * Supply an AI-generated response to the native AudioBridge.
   * The AudioBridge will generate TTS and play it to the caller.
   */
  async supplyAIResponse(response: string): Promise<void> {
    if (AICallModule?.supplyAIResponse) {
      await AICallModule.supplyAIResponse(response);
    }
  }

  /**
   * Stop the AI conversation loop (caller still on line, just stop AI).
   */
  async stopAI(): Promise<void> {
    if (AICallModule?.stopAI) {
      await AICallModule.stopAI();
    }
  }

  /**
   * Get the current call transcript from the native AudioBridge.
   */
  async getCallTranscript(): Promise<{ role: string; text: string }[]> {
    if (AICallModule?.getCallTranscript) {
      return AICallModule.getCallTranscript();
    }
    return [];
  }

  /**
   * Set the proxy base URL for the native AudioBridge.
   * Use this for real devices where localhost won't work.
   * E.g., "http://192.168.1.100:3456"
   */
  async setProxyBaseUrl(url: string): Promise<void> {
    if (AICallModule?.setProxyBaseUrl) {
      await AICallModule.setProxyBaseUrl(url);
    }
  }

  destroy() {
    this.emitter?.removeAllListeners('onIncomingCall');
    this.emitter?.removeAllListeners('onCallAnswered');
    this.emitter?.removeAllListeners('onCallDisconnected');
    this.emitter?.removeAllListeners('onTranscription');
    this.emitter?.removeAllListeners('onAIResponse');
    this.emitter?.removeAllListeners('onCallFlowUpdate');
    this.emitter?.removeAllListeners('onRequestGreeting');
    this.emitter?.removeAllListeners('onRequestAIResponse');
    this.listeners.clear();
  }
}

export const callService = new CallService();
