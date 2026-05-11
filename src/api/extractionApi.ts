import type { ExtractionResult } from '../types';

const BACKEND_URL = 'http://localhost:8000';

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
