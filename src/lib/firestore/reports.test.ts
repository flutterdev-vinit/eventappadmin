import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: () => ({}),
    doc: (..._args: unknown[]) => ({ _args }),
    query: (...args: unknown[]) => args,
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    limit: (n: number) => ({ n }),
    getDocs: (...args: unknown[]) => getDocsMock(...args),
    updateDoc: (...args: unknown[]) => updateDocMock(...args),
  };
});

vi.mock('../../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin-1', email: 'admin@example.com' } },
}));

vi.mock('./audit', () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

import { resolveReport, dismissReport, listReports, __INTERNAL__ } from './reports';

beforeEach(() => {
  updateDocMock.mockReset();
  getDocsMock.mockReset();
});

describe('resolveReport', () => {
  it('writes status=resolved with resolver identity', async () => {
    updateDocMock.mockResolvedValue(undefined);
    await resolveReport('r1');
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.status).toBe('resolved');
    expect(data.resolved_at).toBeDefined();
    expect(data.resolved_by).toEqual({ uid: 'admin-1', email: 'admin@example.com' });
  });
});

describe('dismissReport', () => {
  it('writes status=dismissed with resolver identity', async () => {
    updateDocMock.mockResolvedValue(undefined);
    await dismissReport('r2');
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.status).toBe('dismissed');
    expect(data.resolved_by).toEqual({ uid: 'admin-1', email: 'admin@example.com' });
  });
});

describe('listReports status=open', () => {
  it('includes legacy docs missing a status field', async () => {
    getDocsMock.mockResolvedValueOnce({
      empty: false,
      docs: [
        { id: 'r1', data: () => ({ message: 'legacy' }) },
        { id: 'r2', data: () => ({ message: 'open explicit', status: 'open' }) },
        { id: 'r3', data: () => ({ message: 'done', status: 'resolved' }) },
      ],
    });
    const items = await listReports({ status: 'open' });
    expect(items.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});

describe('sanitizeReport helper', () => {
  it('extracts ids from ref paths and defaults status=open', () => {
    const r = __INTERNAL__.sanitizeReport('x', {
      event_id: 'Event/evt-1',
      user_id: 'users/u-1',
      message: 'hi',
    });
    expect(r.event_id).toBe('evt-1');
    expect(r.user_id).toBe('u-1');
    expect(r.status).toBe('open');
  });
});
