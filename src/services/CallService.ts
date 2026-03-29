import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AICallModule } = NativeModules;

type CallEvent = 'incoming' | 'answered' | 'disconnected' | 'audioReady';

interface CallInfo {
  phoneNumber: string;
  callId: string;
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

    this.emitter.addListener('onIncomingCall', (data: CallInfo) => {
      this.emit('incoming', data);
    });

    this.emitter.addListener('onCallAnswered', (data: CallInfo) => {
      this.emit('answered', data);
    });

    this.emitter.addListener('onCallDisconnected', (data: CallInfo) => {
      this.emit('disconnected', data);
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

  destroy() {
    this.emitter?.removeAllListeners('onIncomingCall');
    this.emitter?.removeAllListeners('onCallAnswered');
    this.emitter?.removeAllListeners('onCallDisconnected');
    this.listeners.clear();
  }
}

export const callService = new CallService();
