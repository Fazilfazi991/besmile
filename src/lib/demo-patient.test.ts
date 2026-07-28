import { describe, expect, it } from 'vitest';
import { DEMO_PATIENT_NUMBER, demoSeedAction, isDemoPatient, patientMatchesSearch } from './demo-patient';
const demo={is_demo:true,full_name:'Amina Rahman',patient_number:DEMO_PATIENT_NUMBER,phone:'+971 50 000 0001',email:'amina.demo@bsmile.test'};
describe('demo patient marker',()=>{
 it('derives the badge from the stored marker',()=>{expect(isDemoPatient(demo)).toBe(true);expect(isDemoPatient({...demo,is_demo:false})).toBe(false)});
 it('matches all supported patient search fields',()=>{for(const term of ['Amina',DEMO_PATIENT_NUMBER,demo.phone,demo.email])expect(patientMatchesSearch(demo,term)).toBe(true)});
 it('does not create a duplicate on a second seed run',()=>{expect(demoSeedAction()).toBe('create');expect(demoSeedAction('stored-demo-id')).toBe('already_exists')});
});
