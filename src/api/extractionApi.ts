import type { ExtractionResult } from '../types';

const BACKEND_URL = 'http://localhost:8000';

export async function extractPdf(fileUri: string): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('pdf_file', {
    uri: fileUri,
    name: 'upload.pdf',
    type: 'application/pdf',
  } as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Extraction failed: ${response.status}`);
  }

  return response.json() as Promise<ExtractionResult>;
}
