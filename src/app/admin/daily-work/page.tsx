"use client";
/* Loading state intentionally resets when the selected review date changes. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { StaffReportResponses } from "@/components/staff-report-responses";
import { dateKey } from "@/lib/attendance-rules";
import { currentProfile } from "@/lib/auth";
import { employeeRepository } from "@/lib/employee-repository";
const today = () => dateKey(new Date(), "Asia/Kolkata");

export default function DailyWorkReviewPage() {
  const [profile, setProfile] = useState<any>();
  const [workDate, setWorkDate] = useState(today);
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => { const data = await employeeRepository.dailyWorkUpdates(workDate); setRows(data); setError(""); };
  useEffect(() => {
    let live = true; setLoading(true);
    void Promise.all([currentProfile(), employeeRepository.dailyWorkUpdates(workDate)])
      .then(([person, data]) => { if (live) { setProfile(person); setRows(data); setError(""); } })
      .catch(cause => { if (live) setError(cause.message || "Daily work updates could not be loaded."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [workDate]);
  const visible = useMemo(() => rows.filter(row => `${row.profile?.full_name || ""} ${row.profile?.employee_code || ""} ${row.summary}`.toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  return <section className="daily-work-workspace space-y-5">
    <header><p className="eyebrow">WORK MANAGEMENT</p><h1 className="text-2xl font-bold">Daily Work Updates</h1><p className="text-slate-600">Review updates visible within your workforce access.</p></header>
    <div className="card daily-work-filters"><label htmlFor="daily-work-date">Date<input id="daily-work-date" className="input" type="date" value={workDate} max={today()} onChange={event => setWorkDate(event.target.value)} /></label><label htmlFor="daily-work-search">Search<input id="daily-work-search" className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Employee or update" /></label></div>
    {error && <p className="text-rose-700">{error}</p>}
    <div className="daily-work-list">{loading ? <div className="card p-5 text-slate-500">Loading updates…</div> : visible.map(row => <article className="card daily-work-card" key={row.id}>
      <div className="daily-work-card-heading"><div className="daily-work-person"><b>{row.profile?.full_name || "Former or unavailable employee"}</b><p className="text-sm text-slate-500">{[row.profile?.employee_code, row.profile?.designation, row.profile?.department?.name].filter(Boolean).join(" · ") || "Employee"}</p></div><time className="text-sm text-slate-500" dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString()}</time></div>
      <p className="daily-work-summary text-sm leading-6 text-slate-700">{row.summary}</p>
      {profile && <StaffReportResponses reportId={row.id} source="daily_work_update" ownerId={row.profile_id} responses={row.staff_report_responses} viewer={profile} onChanged={refresh} />}
    </article>)}
    {!loading && !visible.length && <div className="card p-5 text-slate-500">No work updates match this date and search.</div>}</div>
  </section>;
}
