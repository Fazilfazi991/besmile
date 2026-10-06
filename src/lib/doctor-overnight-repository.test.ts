import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({supabase:mocks}));
import { doctorSchedulingRepository } from './doctor-scheduling-repository';
describe('overnight slot repository', () => {
  it('passes overnight ranges intact to the manager RPC', async () => {
    mocks.rpc.mockResolvedValue({data:[],error:null});
    const ranges=[{day_of_week:1,start_time:'13:30',end_time:'01:00'}];
    await doctorSchedulingRepository.replaceAvailability('doctor','actor',ranges,30);
    expect(mocks.rpc).toHaveBeenCalledWith('replace_clinician_availability',{target_doctor:'doctor',ranges});
  });
  it('queries appointment interval overlap in business time, including previous-day bookings', async () => {
    const builder: any = {};
    for (const name of ['select','eq','is','gt','lt']) builder[name]=vi.fn(()=>builder);
    builder.then=(callback:any)=>Promise.resolve({data:[{id:'booking',start_at:'2026-08-10T18:15:00Z',end_at:'2026-08-10T19:15:00Z',status:'scheduled'}],error:null}).then(callback);
    mocks.from.mockReturnValue(builder);
    const doctors=vi.spyOn(doctorSchedulingRepository,'doctors').mockResolvedValue([{id:'doctor',consultation_duration_minutes:30,availability:[{day_of_week:1,start_time:'13:30',end_time:'01:00'}],blocked:[]}]);
    expect(await doctorSchedulingRepository.slots('doctor','2026-08-11')).toEqual([]);
    expect(builder.gt).toHaveBeenCalledWith('end_at','2026-08-10T18:30:00.000Z');
    expect(builder.lt).toHaveBeenCalledWith('start_at','2026-08-12T18:30:00.000Z');
    doctors.mockRestore();
  });
});
