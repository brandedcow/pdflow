import type { components } from './generated';

export type ExtractionBlock = components['schemas']['Block'];
export type ExtractionResult = components['schemas']['ExtractionResponse'];

// 'ready' covers both backend 'success' and 'partial' statuses.
// The confidence badge is driven by ExtractionResult.overall_confidence directly.
export type ExtractionStatus = 'pending' | 'ready' | 'failed';

export type Book = {
  id: string;
  filename: string;
  path: string;
  addedAt: string; // ISO 8601
  extractionStatus: ExtractionStatus;
  extractionResult?: ExtractionResult;
};
