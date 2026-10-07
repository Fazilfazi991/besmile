import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewedQaProfileIds } from './reviewed-qa-profiles';

const fixture = vi.hoisted(() => ({
  rows: [] as any[],
  excluded: [] as string[],
  range: [0, 149],
  operationalOnly: false,
}));
vi.mock('./supabase', () => ({supabase: {
  from: () => {
    const query: any = {
      select: () => query, eq: () => query, neq: () => query, order: () => query,
      in: (field: string) => {if(field==='status')fixture.operationalOnly=true;return query;}, or: () => query,
      not: (_field: string,_operator: string,value: string) => {fixture.excluded=value.slice(1,-1).split(',');return query;},
      range: (start: number,end: number) => {fixture.range=[start,end];return query;},
      then: (resolve: (value: any)=>unknown) => {
        const matching=fixture.rows.filter(row=>!fixture.excluded.includes(row.id)&&(!fixture.operationalOnly||['active','intern','probation'].includes(row.status)));
        return Promise.resolve(resolve({data:matching.slice(fixture.range[0],fixture.range[1]+1),count:matching.length,error:null}));
      },
    };
    return query;
  },
}}));
import { adminRepository } from './admin-repository';

beforeEach(()=>{fixture.rows=[];fixture.excluded=[];fixture.range=[0,149];fixture.operationalOnly=false;});
describe('reviewed fixtures in the employee directory',()=>{
  it.each(['current','all'] as const)('excludes all reviewed fixtures before pagination and counting in %s',async view=>{
    fixture.rows=[...reviewedQaProfileIds.map(id=>({id,full_name:'QA fixture',status:'active'})),{id:'former-real-staff',full_name:'Ayisha Muneer',status:'inactive'},{id:'real-qa-name',full_name:'QA specialist',status:'active'}];
    const result=await adminRepository.employees('',0,1,view);
    expect(result.data.map(row=>row.id)).toEqual([view==='all'?'former-real-staff':'real-qa-name']);
    expect(result.count).toBe(view==='all'?2:1);
    expect(fixture.excluded).toHaveLength(14);
  });
  it('uses the same exclusions for employee autocomplete searches',async()=>{
    fixture.rows=[{id:reviewedQaProfileIds[8],full_name:'QA Employee Batch 1 Edited'},{id:'real-person',full_name:'QA researcher'}];
    const result=await adminRepository.employees('QA',0,8,'all');
    expect(result.data.map(row=>row.id)).toEqual(['real-person']);
  });
});
