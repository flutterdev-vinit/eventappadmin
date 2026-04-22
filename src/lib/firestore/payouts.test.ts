import { describe, it, expect, vi, beforeEach } from 'vitest';

const addDocMock = vi.fn();
const updateDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: () => ({}),
    doc: (..._args: unknown[]) => ({ _type: 'docRef', _args }),
    query: (...args: unknown[]) => args,
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    limit: (n: number) => ({ n }),
    orderBy: (field: string, dir?: string) => ({ field, dir }),
    addDoc: (...args: unknown[]) => addDocMock(...args),
    updateDoc: (...args: unknown[]) => updateDocMock(...args),
    getDocs: (...args: unknown[]) => getDocsMock(...args),
  };
});

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('./audit', () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

import { createPayout, updatePayoutStatus, __INTERNAL__ } from './payouts';

beforeEach(() => {
  addDocMock.mockReset();
  updateDocMock.mockReset();
  getDocsMock.mockReset();
});

describe('createPayout', () => {
  it('writes orgnizer_id (misspelled as in Flutter schema) and event_id refs', async () => {
    addDocMock.mockResolvedValue({ id: 'po-1' });
    const id = await createPayout({
      eventId: 'evt-1',
      organizerUid: 'u-1',
      amount: 100,
      paymentMethod: 'bank',
      transactionId: 'tx-1',
      bankAccount: 'ba_xxx',
    });
    expect(id).toBe('po-1');
    const [, data] = addDocMock.mock.calls[0];
    expect(Object.keys(data)).toContain('orgnizer_id');
    expect(Object.keys(data)).not.toContain('organizer_id');
    expect(data.amount).toBe(100);
    expect(data.status).toBe('pending');
    expect(data.bankAccount).toBe('ba_xxx');
  });

  it('rejects non-positive amounts', async () => {
    await expect(
      createPayout({ eventId: 'e', organizerUid: 'u', amount: 0 }),
    ).rejects.toThrow(/amount/i);
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('requires eventId and organizerUid', async () => {
    await expect(createPayout({ eventId: '', organizerUid: 'u', amount: 1 })).rejects.toThrow(/eventId/);
    await expect(createPayout({ eventId: 'e', organizerUid: '', amount: 1 })).rejects.toThrow(/organizerUid/);
  });
});

describe('updatePayoutStatus', () => {
  it('writes status and updatedAt, and echoes optional tx fields', async () => {
    updateDocMock.mockResolvedValue(undefined);
    await updatePayoutStatus('po-1', { status: 'paid', transactionId: 'tx-2' });
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.status).toBe('paid');
    expect(data.transaction_id).toBe('tx-2');
    expect(data.updatedAt).toBeDefined();
  });
});

describe('sanitizePayout helper', () => {
  it('extracts organiser + event ids from sanitised refs', () => {
    const p = __INTERNAL__.sanitizePayout('po', {
      event_id: 'Event/evt-1',
      orgnizer_id: 'users/u-1',
      amount: 50,
      status: 'pending',
    });
    expect(p.event_id).toBe('evt-1');
    expect(p.orgnizer_id).toBe('u-1');
    expect(p.amount).toBe(50);
  });
});
