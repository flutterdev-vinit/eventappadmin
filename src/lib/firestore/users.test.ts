import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Firebase SDK mocks ───────────────────────────────────────────────────
// users.ts reaches into firebase/firestore directly; intercept the specific
// functions it uses so the tests stay offline and deterministic.

const updateDocMock = vi.fn();
const logAdminActionMock = vi.fn().mockResolvedValue(undefined);

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
    getDocs: vi.fn(),
    updateDoc: (...args: unknown[]) => updateDocMock(...args),
    getCountFromServer: vi.fn(),
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('./audit', () => ({
  logAdminAction: (...args: unknown[]) => logAdminActionMock(...args),
}));

import { toFirestoreUserPatch, updateUser } from './users';

beforeEach(() => {
  updateDocMock.mockReset();
  logAdminActionMock.mockClear();
});

describe('toFirestoreUserPatch', () => {
  it('maps displayName to first_name', () => {
    expect(toFirestoreUserPatch({ displayName: 'Jane' })).toEqual({
      first_name: 'Jane',
    });
  });

  it('maps createdAt to created_time', () => {
    const ts = { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp;
    expect(toFirestoreUserPatch({ createdAt: ts })).toEqual({ created_time: ts });
  });

  it('passes status / role / email / photoURL through unchanged', () => {
    expect(
      toFirestoreUserPatch({
        status: 'suspended',
        role: 'moderator',
        email: 'a@b.com',
        photoURL: 'https://example.com/avatar.png',
      }),
    ).toEqual({
      status: 'suspended',
      role: 'moderator',
      email: 'a@b.com',
      photoURL: 'https://example.com/avatar.png',
    });
  });

  it('drops undefined values rather than writing them to Firestore', () => {
    expect(
      toFirestoreUserPatch({ displayName: undefined, status: 'active' }),
    ).toEqual({ status: 'active' });
  });

  it('returns an empty object for an empty patch', () => {
    expect(toFirestoreUserPatch({})).toEqual({});
  });
});

describe('updateUser', () => {
  it('writes { status } straight through (current Users page call site)', async () => {
    updateDocMock.mockResolvedValue(undefined);

    await updateUser('user-1', { status: 'suspended' });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, data] = updateDocMock.mock.calls[0];
    expect(data).toEqual({ status: 'suspended' });
  });

  it('maps displayName to first_name on the wire', async () => {
    updateDocMock.mockResolvedValue(undefined);

    await updateUser('user-1', { displayName: 'Jane' });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, data] = updateDocMock.mock.calls[0];
    expect(data).toEqual({ first_name: 'Jane' });
    expect(data).not.toHaveProperty('displayName');
  });

  it('writes both fields correctly on a combined patch', async () => {
    updateDocMock.mockResolvedValue(undefined);

    await updateUser('user-1', { displayName: 'Jane', status: 'active' });

    const [, data] = updateDocMock.mock.calls[0];
    expect(data).toEqual({ first_name: 'Jane', status: 'active' });
  });

  it('skips the Firestore write for an empty patch but still logs the audit action', async () => {
    await updateUser('user-1', {});

    expect(updateDocMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    const [entry] = logAdminActionMock.mock.calls[0];
    expect(entry).toMatchObject({
      type: 'user.update',
      target: { kind: 'user', id: 'user-1', name: null },
      metadata: { changedFields: [] },
    });
  });
});
