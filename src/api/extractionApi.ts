import Constants from 'expo-constants';

const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (devHost ? `http://${devHost}:8000` : 'http://localhost:8000');

export type JobStatusResponse = {
  job_id: string;
  status: 'queued' | 'processing' | 'success' | 'partial' | 'failed';
  overall_confidence?: number;
  page_count?: number;
  blocks?: Array<{
    type: 'heading' | 'text' | 'table';
    content: string;
    page: number;
    confidence: number;
  }>;
};

export async function submitExtraction(fileUri: string): Promise<{ job_id: string }> {
  console.log(`[ExtractionAPI] Submitting PDF: ${fileUri}`);
  const formData = new FormData();
  // @ts-ignore - FormData.append expects Blob/File but RN accepts this shape
  formData.append('pdf_file', {
    uri: fileUri,
    name: fileUri.split('/').pop() ?? 'upload.pdf',
    type: 'application/pdf',
  });

  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Submit failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
  console.log(`[ExtractionAPI] Polling job: ${jobId}`);
  const response = await fetch(`${BACKEND_URL}/jobs/${jobId}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Poll failed: ${response.status}`);
  }

  return response.json();
}
