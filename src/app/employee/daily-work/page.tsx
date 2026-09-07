"use client";
/* Loading state intentionally resets when the selected work date changes. */
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from "react";
import { currentProfile } from "@/lib/auth";
import { dateKey } from "@/lib/attendance-rules";
import { DAILY_WORK_MAX_LENGTH, dailyWorkValidationMessage } from "@/lib/daily-work-rules";
import { employeeRepository } from "@/lib/employee-repository";
const today = () => dateKey(new Date(), "Asia/Kolkata");
export default function DailyWorkPage() {
  const [profile,setProfile]=useState<any>(); const [workDate,setWorkDate]=useState(today); const [summary,setSummary]=useState(""); const [saved,setSaved]=useState<any>(); const [busy,setBusy]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{let live=true;setBusy(true);void currentProfile().then(async person=>{if(!person)throw new Error("Your session has expired.");const row=await employeeRepository.myDailyWorkUpdate(person.id,workDate);if(live){setProfile(person);setSaved(row);setSummary(row?.summary||"");setError("");}}).catch(cause=>{if(live)setError(cause.message||"Daily work update could not be loaded.");}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[workDate]);
  const submit=async(event:FormEvent)=>{event.preventDefault();const message=dailyWorkValidationMessage(summary);if(message){setError(message);return;}setBusy(true);try{const row=await employeeRepository.saveDailyWorkUpdate(profile.id,workDate,summary);setSaved(row);setSummary(row.summary);setError("");}catch(cause:any){setError(cause.message||"Daily work update could not be saved.");}finally{setBusy(false);}};
  return <section className="space-y-5"><header><p className="eyebrow">MY WORK</p><h1 className="text-2xl font-bold">Daily Work Update</h1><p className="text-slate-600">Record a concise summary of the work you completed.</p></header><form className="card space-y-4 p-4 sm:p-5" onSubmit={submit}><label className="block font-semibold">Work date<input className="input mt-1 w-full sm:max-w-xs" type="date" value={workDate} max={today()} onChange={event=>setWorkDate(event.target.value)}/></label><label className="block font-semibold">Work summary<textarea className="input mt-1 min-h-40 w-full resize-y" maxLength={DAILY_WORK_MAX_LENGTH} value={summary} onChange={event=>setSummary(event.target.value)} placeholder="What did you complete today?"/></label><div className="flex flex-wrap items-center justify-between gap-3"><small className="text-slate-500">{summary.length.toLocaleString()} / {DAILY_WORK_MAX_LENGTH.toLocaleString()}</small><button className="btn btn-primary min-h-11" disabled={busy}>{busy?"Saving…":saved?"Update summary":"Save summary"}</button></div>{error&&<p className="text-sm text-rose-700">{error}</p>}{saved&&!error&&<p className="text-sm text-emerald-700">Saved {new Date(saved.updated_at).toLocaleString()}.</p>}</form></section>;
}
