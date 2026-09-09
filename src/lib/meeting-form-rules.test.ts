import {describe,it,expect} from 'vitest';import {meetingPayload,cancellationPayload} from './meeting-form-rules';
const form={title:'Planning',agenda:'Planning agenda',host:'host-1',date:'2026-08-11',start:'15:00',end:'16:00',type:'office',venue:'Room',url:'',notes:'',invitees:['a','a','b']};
describe('meeting form rules',()=>{it('keeps Kolkata times and de-duplicates invitees',()=>expect(meetingPayload(form)).toMatchObject({meeting_start:'2026-08-11T09:30:00.000Z',participant_ids:['a','b']}));it('includes the existing meeting ID and all metadata for trusted updates',()=>expect(meetingPayload({...form,title:'Updated',agenda:'Agenda',type:'zoom',venue:'',url:'https://zoom.us/j/1',notes:'Notes'},'meeting-1')).toMatchObject({target_meeting:'meeting-1',meeting_title:'Updated',meeting_agenda:'Agenda',meeting_start:'2026-08-11T09:30:00.000Z',meeting_end:'2026-08-11T10:30:00.000Z',meeting_type_value:'zoom',meeting_url_value:'https://zoom.us/j/1',meeting_description:'Notes'}));it('keeps create mode on the same contract with a null target',()=>expect(meetingPayload(form).target_meeting).toBeNull());it('rejects invalid intervals',()=>expect(()=>meetingPayload({...form,end:'15:00'})).toThrow('End time'));it('rejects unsafe meeting links',()=>expect(()=>meetingPayload({...form,url:'javascript:x'})).toThrow('Meeting link'));});
describe('canonical lifecycle requirements',()=>{
 it('requires agenda',()=>expect(()=>meetingPayload({...form,agenda:' '})).toThrow('Agenda'));
 it('requires authorized host selection',()=>expect(()=>meetingPayload({...form,host:''})).toThrow('host'));
 it('passes selected host to RPC',()=>expect(meetingPayload(form).host_profile_id).toBe('host-1'));
 it('rejects blank cancellation',()=>expect(()=>cancellationPayload('id','  ')).toThrow('Cancellation reason'));
 it('passes trimmed reason and meeting ID',()=>expect(cancellationPayload('id','  QA cancellation  ')).toEqual({target_meeting:'id',cancel_reason:'QA cancellation'}));
});
