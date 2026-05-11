import Constants from 'expo-constants';
import type { ExtractionResult } from '../types';

// Production: set EXPO_PUBLIC_BACKEND_URL in .env (baked into bundle at build time).
// Dev on real device: fall back to Expo's dev server host so the app reaches the
// dev machine rather than resolving localhost to the device itself.
// Dev on simulator: localhost works fine as the final fallback.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (devHost ? `http://${devHost}:8000` : 'http://localhost:8000');


// React Native's fetch polyfill accepts this shape for file uploads.
// FormData in RN does not use the browser Blob API.
type RNFileObject = {
  uri: string;
  name: string;
  type: string;
};

export async function extractPdf(fileUri: string): Promise<ExtractionResult> {
  const formData = new FormData();
  const file: RNFileObject = { uri: fileUri, name: 'upload.pdf', type: 'application/pdf' };
  formData.append('pdf_file', file as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Extraction failed: ${response.status}`);
  }

  return response.json() as Promise<ExtractionResult>;
}
