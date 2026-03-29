import * as Speech from 'expo-speech';

let isSpeaking = false;

export function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isSpeaking) {
      Speech.stop();
    }
    isSpeaking = true;
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.95,
      onDone: () => {
        isSpeaking = false;
        resolve();
      },
      onError: (error) => {
        isSpeaking = false;
        reject(error);
      },
      onStopped: () => {
        isSpeaking = false;
        resolve();
      },
    });
  });
}

export function stopSpeaking() {
  if (isSpeaking) {
    Speech.stop();
    isSpeaking = false;
  }
}

export function getIsSpeaking() {
  return isSpeaking;
}
