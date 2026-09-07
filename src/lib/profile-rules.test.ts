import {describe,expect,it} from 'vitest';
import {profileCompletion,requiredProfileCompletionFields,validateProfile} from './profile-rules';

const completeProfile={full_name:'A',email:'a@bsmile.local',gender:'female',employee_code:'BS-001',department_id:'department-1',designation:'Therapist',role:'employee'};

describe('profile rules',()=>{
  it('gives a completely filled required profile 100% without optional details',()=>{expect(profileCompletion(completeProfile)).toEqual({percentage:100,missing:[]});});
  it('calculates deterministic completion for partial and minimal profiles',()=>{expect(profileCompletion({...completeProfile,department_id:'',designation:'',role:''}).percentage).toBe(57);expect(profileCompletion({full_name:'A'}).percentage).toBe(14);});
  it('does not let optional fields affect completion',()=>{const withoutOptional=profileCompletion(completeProfile);const withOptional=profileCompletion({...completeProfile,phone:'1234567',personal_email:'personal@example.com',date_of_birth:'2000-01-01',address:{line1:'Home'},emergency_contact:{name:'B',phone:'7654321',relationship:'Parent'}});expect(withOptional).toEqual(withoutOptional);});
  it.each(requiredProfileCompletionFields)('prevents 100%% when required %s is missing',(label,key)=>{const result=profileCompletion({...completeProfile,[key]:' '});expect(result.percentage).toBeLessThan(100);expect(result.missing).toContain(label);});
  it('validates email, phone, future dates, account number and IFSC',()=>{expect(validateProfile({personal_email:'bad'})).toContain('email');expect(validateProfile({phone:'123'})).toContain('phone');expect(validateProfile({date_of_birth:'2999-01-01'})).toContain('future');expect(validateProfile({bank_details:{account_number:'@@'}})).toContain('Account');expect(validateProfile({bank_details:{ifsc_code:'BAD'}})).toContain('IFSC');});
});
