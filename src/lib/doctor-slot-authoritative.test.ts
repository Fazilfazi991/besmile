import { describe, expect, it, vi } from 'vitest';
import { verifyAvailableSlots } from './doctor-scheduling-repository';

describe('authoritative slot visibility', () => {
  const slots = [
    { startAt: '2026-11-12T04:30:00Z', endAt: '2026-11-12T05:00:00Z', label: '10 am' },
    { startAt: '2026-11-12T05:30:00Z', endAt: '2026-11-12T06:00:00Z', label: '11 am' },
  ];
  it('omits a conflict hidden by appointment RLS while retaining a valid slot', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect(await verifyAvailableSlots({ rpc }, 'doctor', slots)).toEqual([slots[1]]);
    expect(rpc).toHaveBeenCalledWith('doctor_slot_is_available', {
      target_doctor: 'doctor', proposed_start: slots[0].startAt, proposed_end: slots[0].endAt, ignored_appointment: null,
    });
  });
  it('fails closed on a database or permission error and passes the rescheduled appointment id', async () => {
    const error = new Error('access denied');
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(verifyAvailableSlots({ rpc }, 'doctor', [slots[0]], 'appointment')).rejects.toThrow('access denied');
    expect(rpc.mock.calls[0][1].ignored_appointment).toBe('appointment');
  });
});
