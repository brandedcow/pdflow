import { submitExtraction, pollJobStatus } from '../src/api/extractionApi';

describe('submitExtraction', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('POSTs the file and returns job_id on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'backend-uuid-123' }),
    });
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    const result = await submitExtraction('/documents/pdfs/test.pdf');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/extract',
      expect.objectContaining({ method: 'POST' })
    );
    expect(appendSpy).toHaveBeenCalledWith('pdf_file', expect.anything());
    expect(result.job_id).toBe('backend-uuid-123');
    appendSpy.mockRestore();
  });

  it('throws when server returns non-200 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(submitExtraction('/documents/pdfs/test.pdf')).rejects.toThrow('Submit failed: 500');
  });

  it('throws when network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

    await expect(submitExtraction('/documents/pdfs/test.pdf')).rejects.toThrow('Network request failed');
  });
});

describe('pollJobStatus', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('GETs the job status and returns the response', async () => {
    const mockResponse = {
      job_id: 'backend-uuid-123',
      status: 'success',
      overall_confidence: 0.92,
      page_count: 5,
      blocks: [{ type: 'text', content: 'Hello world', page: 1, confidence: 0.92 }],
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await pollJobStatus('backend-uuid-123');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs/backend-uuid-123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.job_id).toBe('backend-uuid-123');
    expect(result.status).toBe('success');
    expect(result.blocks).toHaveLength(1);
  });

  it('throws when server returns non-200 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(pollJobStatus('missing-id')).rejects.toThrow('Poll failed: 404');
  });

  it('throws when network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

    await expect(pollJobStatus('some-id')).rejects.toThrow('Network request failed');
  });
});
