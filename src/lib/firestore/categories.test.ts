import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Firebase SDK mocks ───────────────────────────────────────────────────
// categories.ts reaches into firebase/firestore directly; we intercept the
// specific functions it uses so the tests stay offline and deterministic.

const addDocMock = vi.fn();
const updateDocMock = vi.fn();
const deleteDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: (..._args: unknown[]) => ({ _args }),
    doc: (..._args: unknown[]) => ({ _args }),
    query: (...args: unknown[]) => args,
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: (field: string) => ({ field }),
    limit: (n: number) => ({ n }),
    getDoc: vi.fn(),
    getDocs: (...args: unknown[]) => getDocsMock(...args),
    addDoc: (...args: unknown[]) => addDocMock(...args),
    updateDoc: (...args: unknown[]) => updateDocMock(...args),
    deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('./audit', () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

vi.mock('./events', () => ({ clearCategoryMapCache: vi.fn() }));

import {
  createCategory,
  updateCategory,
  deleteCategory,
  countEventsUsingCategory,
} from './categories';

beforeEach(() => {
  addDocMock.mockReset();
  updateDocMock.mockReset();
  deleteDocMock.mockReset();
  getDocsMock.mockReset();
});

describe('createCategory', () => {
  it('trims the name and defaults image_path to empty string', async () => {
    addDocMock.mockResolvedValue({ id: 'new-cat' });

    const id = await createCategory({ name: '   Music   ' });

    expect(id).toBe('new-cat');
    expect(addDocMock).toHaveBeenCalledTimes(1);
    const [, data] = addDocMock.mock.calls[0];
    expect(data).toEqual({ name: 'Music', image_path: '' });
  });

  it('rejects blank names', async () => {
    await expect(createCategory({ name: '   ' })).rejects.toThrow(/name is required/i);
    expect(addDocMock).not.toHaveBeenCalled();
  });
});

describe('updateCategory', () => {
  it('writes only the fields present in the patch', async () => {
    updateDocMock.mockResolvedValue(undefined);
    await updateCategory('abc', { name: 'Sports' });
    const [, data] = updateDocMock.mock.calls[0];
    expect(data).toEqual({ name: 'Sports' });
  });

  it('skips the write when the patch is empty', async () => {
    await updateCategory('abc', {});
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});

describe('countEventsUsingCategory', () => {
  it('adds both candidate formats (plain id + full path)', async () => {
    // First call returns one doc, second call returns one doc → total 2.
    getDocsMock
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'e2' }] });

    const n = await countEventsUsingCategory('cat-1');
    expect(n).toBe(2);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });
});

describe('deleteCategory', () => {
  it('refuses to delete when events still reference the category', async () => {
    getDocsMock
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ docs: [] });

    await expect(deleteCategory('cat-1')).rejects.toThrow(/event/i);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('deletes when no events reference the category', async () => {
    getDocsMock
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    deleteDocMock.mockResolvedValue(undefined);

    await deleteCategory('cat-1', { name: 'Music' });
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });
});
