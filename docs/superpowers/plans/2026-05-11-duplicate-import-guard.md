# Duplicate Import Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate library entries by blocking import when a book with the same filename already exists.

**Architecture:** A single filename check in `importBook()` runs against the in-memory `books` state immediately after the document picker resolves — before any file system work. On match, an Alert informs the user and the function returns early.

**Tech Stack:** React Native `Alert`, existing `books` state in `LibraryProvider`, Jest + React Native Testing Library.

---

### Task 1: Guard in `importBook` with TDD

**Files:**
- Modify: `__tests__/LibraryContext.test.tsx`
- Modify: `src/context/LibraryContext.tsx`

- [ ] **Step 1: Write the failing test**

Add this test inside the top-level `describe('LibraryContext', ...)` block in `__tests__/LibraryContext.test.tsx`, after the existing `importBook` tests and before the `deleteBook` describe block:

```typescript
it('importBook shows alert and does not import when filename already exists', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const existingBook = {
    id: 'existing-id',
    filename: 'test.pdf',
    path: '/mock/documents/pdfs/existing-id-test.pdf',
    addedAt: '2026-05-11T00:00:00.000Z',
    extractionStatus: 'ready' as const,
  };
  await AsyncStorage.setItem('pdflow_books', JSON.stringify([existingBook]));

  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
  });

  const { result } = renderHook(() => useLibrary(), { wrapper });
  await act(async () => {});

  await act(async () => {
    await result.current.importBook();
  });

  expect(alertSpy).toHaveBeenCalledWith(
    'Already in library',
    '"test.pdf" is already in your library.'
  );
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  expect(result.current.books).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```

Expected: the new test fails — `copyAsync` is called and no alert fires.

- [ ] **Step 3: Implement the duplicate guard**

In `src/context/LibraryContext.tsx`, add the check immediately after `const asset = result.assets[0];` and before the `pendingId` line:

```typescript
const asset = result.assets[0];

const isDuplicate = books.some((b) => b.filename === asset.name);
if (isDuplicate) {
  Alert.alert('Already in library', `"${asset.name}" is already in your library.`);
  return;
}

const pendingId = Crypto.randomUUID();
```

- [ ] **Step 4: Run the full test suite to confirm all 52 tests pass**

```bash
npx jest --no-coverage
```

Expected output:
```
Tests: 52 passed, 52 total
```

- [ ] **Step 5: Commit**

```bash
git add src/context/LibraryContext.tsx __tests__/LibraryContext.test.tsx
git commit -m "feat: block duplicate import when filename already exists"
```
