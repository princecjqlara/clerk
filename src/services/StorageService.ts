import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CallRecord } from './ConversationManager';

const KEYS = {
  API_KEY: 'nvidia_api_key',
  ENABLED: 'receptionist_enabled',
  CUSTOM_INSTRUCTIONS: 'custom_instructions',
  CALL_LOG: 'call_log',
  BUSINESS_NAME: 'business_name',
};

export async function getApiKey(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.API_KEY)) || '';
}

export async function setApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.API_KEY, key);
}

export async function getEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ENABLED);
  return val === 'true';
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.ENABLED, String(enabled));
}

export async function getCustomInstructions(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.CUSTOM_INSTRUCTIONS)) || '';
}

export async function setCustomInstructions(text: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.CUSTOM_INSTRUCTIONS, text);
}

export async function getBusinessName(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.BUSINESS_NAME)) || 'Our Company';
}

export async function setBusinessName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.BUSINESS_NAME, name);
}

export async function getCallLog(): Promise<CallRecord[]> {
  const json = await AsyncStorage.getItem(KEYS.CALL_LOG);
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export async function addCallRecord(record: CallRecord): Promise<void> {
  const log = await getCallLog();
  log.unshift(record);
  // Keep last 100 records
  if (log.length > 100) log.length = 100;
  await AsyncStorage.setItem(KEYS.CALL_LOG, JSON.stringify(log));
}

export async function clearCallLog(): Promise<void> {
  await AsyncStorage.setItem(KEYS.CALL_LOG, '[]');
}
