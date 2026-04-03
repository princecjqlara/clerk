// Global call state — extracted to break require cycle between App.tsx and TenantDashboardScreen.tsx

interface CallState {
  isOnCall: boolean;
  phoneNumber: string;
  callId: string;
  flowState: string;
  listeners: Set<() => void>;
  update: (patch: Partial<Pick<CallState, 'isOnCall' | 'phoneNumber' | 'callId' | 'flowState'>>) => void;
}

export const callState: CallState = {
  isOnCall: false,
  phoneNumber: '',
  callId: '',
  flowState: '',
  listeners: new Set<() => void>(),
  update(patch) {
    Object.assign(callState, patch);
    callState.listeners.forEach((fn: () => void) => fn());
  },
};
