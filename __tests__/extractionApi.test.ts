import { extractPdf } from '../src/api/extractionApi';
import { ExtractionResult } from '../src/types';

const mockResult: ExtractionResult = {
  book_id: 'backend-uuid-123',
  status: 'success',
  overall_confidence: 0.92,
  page_count: 5,
  blocks: [
    { type: 'text', content: 'Hello world', page: 1, confidence: 0.92 },
  ],
};

describe('extractPdf', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('POSTs the file and returns ExtractionResult on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    const result = await extractPdf('/documents/pdfs/test.pdf');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/extract',
      expect.objectContaining({ method: 'POST' })
    );
    expect(appendSpy).toHaveBeenCalledWith('pdf_file', expect.anything());
    expect(result.book_id).toBe('backend-uuid-123');
    expect(result.status).toBe('success');
    expect(result.blocks).toHaveLength(1);
    appendSpy.mockRestore();
  });

  it('throws when server returns non-200 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(extractPdf('/documents/pdfs/test.pdf')).rejects.toThrow('Extraction failed: 500');
  });

  it('throws when network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

    await expect(extractPdf('/documents/pdfs/test.pdf')).rejects.toThrow('Network request failed');
  });
});
