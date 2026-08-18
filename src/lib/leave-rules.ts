export type LeaveRequestPeriod={starts_on:string;ends_on:string;half_day?:boolean;status?:string};

const dateAtNoon=(key:string)=>new Date(`${key}T12:00:00Z`);
const keyFor=(date:Date)=>date.toISOString().slice(0,10);

export function leaveDays(startsOn:string,endsOn:string,workingDays:number[],holidays:Set<string>,halfDay=false){
  if(startsOn>endsOn) throw new Error('End date must be on or after the start date.');
  let total=0;
  for(let day=dateAtNoon(startsOn);keyFor(day)<=endsOn;day.setUTCDate(day.getUTCDate()+1)){
    const key=keyFor(day); const weekday=day.getUTCDay()||7;
    if(workingDays.includes(weekday)&&!holidays.has(key)) total++;
  }
  if(!total) throw new Error('Selected dates contain no working days.');
  return halfDay?0.5:total;
}

export function hasLeaveOverlap(candidate:LeaveRequestPeriod,existing:LeaveRequestPeriod[]){
  return existing.some(request=>!['cancelled','withdrawn','rejected'].includes(request.status??'pending')&&candidate.starts_on<=request.ends_on&&candidate.ends_on>=request.starts_on);
}

export function canCancelLeave(status:string,startsOn:string,today:string){return status==='pending'||(status==='approved'&&startsOn>today)}

export function canReviewLeaveRequest(input:{reviewerId?:string|null;requesterId?:string|null;reviewerRole?:string|null;requesterRole?:string|null;status?:string|null}){
  if(input.status!=='pending'||!input.reviewerId||input.reviewerId===input.requesterId)return false
  if(input.requesterRole==='general_manager')return ['chairman','director'].includes(input.reviewerRole||'')
  return true
}

export function hasSufficientBalance(allocated:number,used:number,requested:number){return allocated-used>=requested}
export function isRlsError(error:{code?:string;message?:string}){return error.code==='42501'||/row-level security|permission denied/i.test(error.message??'')}
