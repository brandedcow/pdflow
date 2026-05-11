import React from 'react';
import { Book } from '../../types';
import NativePdfViewer from './NativePdfViewer';
import ExtractedReader from './ExtractedReader';

type Props = {
  book: Book | undefined;
  uri: string | undefined;
  activeView: 'pdf' | 'reader';
};

export default function ReaderContainer({ book, uri, activeView }: Props) {
  if (activeView === 'reader' && book?.extractionStatus === 'ready' && book.extractionResult) {
    return <ExtractedReader result={book.extractionResult} />;
  }
  return <NativePdfViewer uri={uri} />;
}
