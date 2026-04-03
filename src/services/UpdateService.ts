import { Platform, Alert, Linking } from 'react-native';

const APP_VERSION_CODE = 2;
const APP_VERSION_NAME = '1.1.0';
const VERSION_CHECK_URL = 'https://aireceptionist-orcin.vercel.app/api/app-version';

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
}

export function getCurrentVersion() {
  return { versionCode: APP_VERSION_CODE, versionName: APP_VERSION_NAME };
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(VERSION_CHECK_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data: UpdateInfo = await res.json();

    if (data.versionCode > APP_VERSION_CODE) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function promptUpdate(update: UpdateInfo) {
  const message = `Version ${update.versionName} is available!\n\n${update.releaseNotes}`;

  if (update.forceUpdate) {
    Alert.alert('Update Required', message, [
      { text: 'Update Now', onPress: () => downloadUpdate(update.downloadUrl) },
    ], { cancelable: false });
  } else {
    Alert.alert('Update Available', message, [
      { text: 'Later', style: 'cancel' },
      { text: 'Update Now', onPress: () => downloadUpdate(update.downloadUrl) },
    ]);
  }
}

function downloadUpdate(url: string) {
  // On Android, open the download URL in the browser which triggers APK download + install
  if (Platform.OS === 'android') {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open download link. Please update manually.');
    });
  } else {
    Linking.openURL(url);
  }
}
