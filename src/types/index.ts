import type { components } from './generated';

export type ExtractionBlock = components['schemas']['Block'];

export type ExtractionResult = {
  overall_confidence: number;
  page_count: number;
  blocks: ExtractionBlock[];
};

export type ExtractionStatus = 'pending' | 'ready' | 'failed';

export type Book = {
  id: string;
  filename: string;
  path: string;
  addedAt: string;
  extractionStatus: ExtractionStatus;
  extractionResult?: ExtractionResult;
};
