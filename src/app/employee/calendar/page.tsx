'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { blockFieldsFromStored, blockPayloadFromFields, BlockTimeFields } from '@/lib/calendar-block-rules';
import { calendarMeetingRepository } from '@/lib/calendar-meeting-repository';
import { businessLocalToStored, formatBusinessDateTime, storedToBusinessParts } from '@/lib/calendar-meeting-rules';

type CalendarItem = { id: string; kind: 'blocked' | 'meeting'; start_at: string; end_at: string; title?: string | null; all_day?: boolean; status?: string };
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateKey = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const localToday = () => storedToBusinessParts(new Date().toISOString()).date;
const monthTitle = (year: number, month: number) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month, 1)));
const addDays = (date: string, amount: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); };
const formatTimeRange = (item: CalendarItem) => item.all_day ? 'All day' : `${storedToBusinessParts(item.start_at).time} – ${storedToBusinessParts(item.end_at).time}`;
const newBlockFields = (date: string): BlockTimeFields => ({ date, startTime: '09:00', endTime: '10:00', allDay: false, title: '' });

export default function MyCalendarPage() {
  const today = useMemo(() => localToday(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [displayMonth, setDisplayMonth] = useState(() => { const [year, month] = today.split('-').map(Number); return { year, month: month - 1 }; });
  const [profileId, setProfileId] = useState('');
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editingBlock, setEditingBlock] = useState<CalendarItem | null>(null);
  const [blockFields, setBlockFields] = useState<BlockTimeFields>(() => newBlockFields(today));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCalendar = useCallback(async (userId: string) => {
    const calendar = await calendarMeetingRepository.myCalendar(userId);
    setItems(calendar as CalendarItem[]);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const profile: any = await currentProfile();
        if (!profile) throw new Error('Your session has expired.');
        if (!active) return;
        setProfileId(profile.id);
        await loadCalendar(profile.id);
      } catch (cause: any) { if (active) setError(cause?.message || 'Unable to load your calendar.'); }
    })();
    return () => { active = false; };
  }, [loadCalendar]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(displayMonth.year, displayMonth.month, 1));
    const leadingDays = first.getUTCDay();
    const totalDays = new Date(Date.UTC(displayMonth.year, displayMonth.month + 1, 0)).getUTCDate();
    return Array.from({ length: Math.ceil((leadingDays + totalDays) / 7) * 7 }, (_, index) => index - leadingDays + 1).map(day => day < 1 || day > totalDays ? null : dateKey(displayMonth.year, displayMonth.month, day));
  }, [displayMonth]);
  const itemsForDate = (date: string) => {
    const dayStart = businessLocalToStored(date, '00:00');
    const nextStart = businessLocalToStored(addDays(date, 1), '00:00');
    return (items || []).filter(item => item.status !== 'cancelled' && new Date(item.start_at) < new Date(nextStart) && new Date(item.end_at) > new Date(dayStart));
  };
  const agenda = itemsForDate(selectedDate);
  const selectToday = () => { const [year, month] = today.split('-').map(Number); setDisplayMonth({ year, month: month - 1 }); setSelectedDate(today); };
  const shiftMonth = (amount: number) => setDisplayMonth(current => { const first = new Date(Date.UTC(current.year, current.month + amount, 1)); const next = { year: first.getUTCFullYear(), month: first.getUTCMonth() }; setSelectedDate(dateKey(next.year, next.month, 1)); return next; });
  const openCreate = () => { setEditingBlock(null); setBlockFields(newBlockFields(selectedDate)); setFormError(''); setDialog('create'); };
  const openEdit = (block: CalendarItem) => { setEditingBlock(block); setBlockFields(blockFieldsFromStored(block)); setFormError(''); setDialog('edit'); };
  const closeDialog = () => { if (!saving && !deleting) { setDialog(null); setEditingBlock(null); setFormError(''); } };
  const updateField = <K extends keyof BlockTimeFields>(field: K, value: BlockTimeFields[K]) => setBlockFields(current => ({ ...current, [field]: value }));
  const saveBlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileId || saving) return;
    setFormError(''); setSaving(true);
    try {
      const payload = blockPayloadFromFields(blockFields);
      if (editingBlock) await calendarMeetingRepository.updateMyBlock(profileId, editingBlock.id, payload);
      else await calendarMeetingRepository.createMyBlock(profileId, payload);
      await loadCalendar(profileId);
      setDialog(null); setEditingBlock(null);
    } catch (cause: any) { setFormError(cause?.message || 'Unable to save blocked time.'); }
    finally { setSaving(false); }
  };
  const removeBlock = async () => {
    if (!profileId || !editingBlock || deleting || !window.confirm('Remove this blocked time?')) return;
    setFormError(''); setDeleting(true);
    try { await calendarMeetingRepository.removeMyBlock(profileId, editingBlock.id); await loadCalendar(profileId); setDialog(null); setEditingBlock(null); }
    catch (cause: any) { setFormError(cause?.message || 'Unable to remove blocked time.'); }
    finally { setDeleting(false); }
  };

  return <section className="my-calendar">
    <header className="employee-page-header"><div><h1>My Calendar</h1><p>Your personal unavailable time and scheduled meetings in Asia/Kolkata.</p></div><div className="calendar-header-actions"><div className="calendar-key" aria-label="Calendar legend"><span className="calendar-key-block">Unavailable</span><span className="calendar-key-meeting">Meeting</span></div><button type="button" className="btn btn-primary" onClick={openCreate}>Block Time</button></div></header>
    {error ? <div className="employee-banner dashboard-error" role="alert">{error}</div> : null}
    {!items && !error ? <div className="employee-section calendar-state"><div className="employee-skeleton" /><p>Loading your calendar…</p></div> : null}
    {items ? <div className="calendar-layout">
      <section className="employee-section calendar-month" aria-label="Month calendar"><div className="calendar-toolbar"><div><button type="button" className="btn calendar-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button><button type="button" className="btn calendar-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button></div><h2>{monthTitle(displayMonth.year, displayMonth.month)}</h2><button type="button" className="btn btn-primary calendar-today" onClick={selectToday}>Today</button></div><div className="calendar-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((date, index) => date ? <button type="button" key={date} onClick={() => setSelectedDate(date)} className={`calendar-date${date === today ? ' is-today' : ''}${date === selectedDate ? ' is-selected' : ''}`} aria-pressed={date === selectedDate}><span className="calendar-date-number">{Number(date.slice(-2))}</span><span className="calendar-date-events">{itemsForDate(date).slice(0, 2).map(item => <span key={`${item.kind}-${item.id}`} className={`calendar-event calendar-event-${item.kind}`}>{item.kind === 'blocked' ? 'Unavailable' : item.title || 'Meeting'}</span>)}</span>{itemsForDate(date).length > 2 ? <small>+{itemsForDate(date).length - 2} more</small> : null}</button> : <div className="calendar-blank" aria-hidden="true" key={`blank-${index}`} />)}</div></section>
      <aside className="employee-section calendar-agenda" aria-label="Selected day agenda"><div className="employee-section-heading"><div><h2>{new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${selectedDate}T00:00:00Z`))}</h2><p>Selected-day agenda</p></div></div>{agenda.length ? <div className="calendar-agenda-list">{agenda.map(item => item.kind === 'blocked' ? <button type="button" key={`${item.kind}-${item.id}`} className="agenda-item agenda-item-blocked" onClick={() => openEdit(item)}><span>Unavailable</span><b>{item.title || 'Unavailable'}</b><time dateTime={item.start_at}>{formatTimeRange(item)} · {formatBusinessDateTime(item.start_at).slice(0, 10)}</time></button> : <article key={`${item.kind}-${item.id}`} className="agenda-item agenda-item-meeting"><span>Meeting</span><b>{item.title || 'Meeting'}</b><time dateTime={item.start_at}>{formatTimeRange(item)} · {formatBusinessDateTime(item.start_at).slice(0, 10)}</time></article>)}</div> : <div className="employee-empty"><span>○</span><b>No calendar items</b><p>You have no unavailable time or scheduled meetings on this date.</p></div>}</aside>
    </div> : null}
    {dialog ? <div className="block-dialog-backdrop" role="presentation"><section className="block-dialog" role="dialog" aria-modal="true" aria-labelledby="block-dialog-title"><header><div><h2 id="block-dialog-title">{dialog === 'edit' ? 'Edit Block Time' : 'Block Time'}</h2><p>Unavailable time is shown only on your personal calendar.</p></div><button type="button" onClick={closeDialog} aria-label="Close">×</button></header><form onSubmit={saveBlock}><label>Date<input type="date" value={blockFields.date} onChange={event => updateField('date', event.target.value)} required /></label><label className="all-day-field"><input type="checkbox" checked={blockFields.allDay} onChange={event => updateField('allDay', event.target.checked)} /> All day</label><div className="block-time-fields"><label>Start time<input type="time" value={blockFields.startTime} onChange={event => updateField('startTime', event.target.value)} disabled={blockFields.allDay} required /></label><label>End time<input type="time" value={blockFields.endTime} onChange={event => updateField('endTime', event.target.value)} disabled={blockFields.allDay} required /></label></div><label>Title / reason <small>Optional — visible only to you</small><input type="text" value={blockFields.title} onChange={event => updateField('title', event.target.value)} maxLength={160} placeholder="e.g. Personal appointment" /></label>{formError ? <p className="block-form-error" role="alert">{formError}</p> : null}<footer>{dialog === 'edit' ? <button type="button" className="btn block-remove" onClick={removeBlock} disabled={saving || deleting}>{deleting ? 'Removing…' : 'Remove'}</button> : <span />}<div><button type="button" className="btn" onClick={closeDialog} disabled={saving || deleting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || deleting}>{saving ? 'Saving…' : 'Save Block Time'}</button></div></footer></form></section></div> : null}
    <style jsx>{`
      .my-calendar{max-width:1080px;margin:0 auto;min-width:0}.calendar-header-actions,.calendar-key{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.calendar-key span,.agenda-item>span{border-radius:999px;padding:4px 7px;font-size:10px;font-weight:800}.calendar-key-block,.agenda-item-blocked>span{background:#fff1e8;color:#a94a16}.calendar-key-meeting,.agenda-item-meeting>span{background:#e3f4ff;color:#126389}.calendar-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(285px,.8fr);gap:14px;align-items:start}.calendar-month,.calendar-agenda{background:#fff;border:1px solid #dfe8e6;border-radius:10px}.calendar-toolbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;border-bottom:1px solid #edf1f0;padding:11px 13px}.calendar-toolbar>div{display:flex;gap:5px}.calendar-toolbar h2{margin:0;text-align:center;font-size:14px}.calendar-today{justify-self:end}.calendar-nav{min-width:32px;border:1px solid #d6e6e2;background:#fff;color:#006b64;font-size:20px;line-height:1}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-weekdays{border-bottom:1px solid #edf1f0;background:#f6faf9}.calendar-weekdays span{padding:8px 2px;text-align:center;color:#667773;font-size:10px;font-weight:800}.calendar-grid{gap:1px;background:#e7eeec}.calendar-date,.calendar-blank{min-width:0;min-height:105px;background:#fff}.calendar-date{display:grid;align-content:start;gap:5px;border:0;padding:7px;text-align:left;cursor:pointer;font:inherit}.calendar-date:hover{background:#f4fbfa}.calendar-date.is-selected{box-shadow:inset 0 0 0 2px #007d74;background:#f4fbfa}.calendar-date-number{display:grid;width:23px;height:23px;place-items:center;border-radius:50%;font-size:11px;font-weight:800}.calendar-date.is-today .calendar-date-number{background:#006b64;color:#fff}.calendar-date-events{display:grid;gap:3px;min-width:0}.calendar-event{overflow:hidden;border-radius:4px;padding:3px 4px;font-size:9px;font-weight:700;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}.calendar-event-blocked{background:#fff1e8;color:#9a4315}.calendar-event-meeting{background:#e3f4ff;color:#126389}.calendar-date small{color:#667773;font-size:9px}.calendar-agenda{overflow:hidden}.calendar-agenda-list{display:grid}.agenda-item{display:grid;width:100%;gap:5px;border:0;border-bottom:1px solid #edf1f0;background:#fff;padding:12px 14px;text-align:left;font:inherit}.agenda-item:last-child{border-bottom:0}.agenda-item-blocked{cursor:pointer}.agenda-item-blocked:hover{background:#fffaf7}.agenda-item>span{justify-self:start}.agenda-item b{font-size:12px}.agenda-item time{color:#667773;font-size:11px}.calendar-state{padding:15px}.calendar-state p{margin:11px 0 0;color:#667773;text-align:center;font-size:12px}.block-dialog-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:rgba(15,30,28,.42);padding:16px}.block-dialog{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:12px;background:#fff;box-shadow:0 18px 45px rgba(15,30,28,.24)}.block-dialog header{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf1f0;padding:15px}.block-dialog h2{margin:0;font-size:16px}.block-dialog header p{margin:4px 0 0;color:#667773;font-size:11px}.block-dialog header button{border:0;background:transparent;color:#006b64;font-size:23px;line-height:1;cursor:pointer}.block-dialog form{display:grid;gap:12px;padding:15px}.block-dialog label{display:grid;gap:5px;color:#38514d;font-size:11px;font-weight:800}.block-dialog label small{font-weight:400;color:#667773}.block-dialog input[type=date],.block-dialog input[type=time],.block-dialog input[type=text]{box-sizing:border-box;width:100%;min-width:0;border:1px solid #cbd9d6;border-radius:7px;background:#fff;padding:8px 9px;color:#1d3531;font:inherit;font-size:12px}.all-day-field{display:flex!important;align-items:center;grid-template-columns:auto 1fr;gap:7px!important}.block-time-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.block-form-error{margin:0;border-radius:7px;background:#fff0ee;padding:8px 9px;color:#a23b31;font-size:11px}.block-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #edf1f0;margin:2px -15px -15px;padding:12px 15px}.block-dialog footer>div{display:flex;gap:7px}.block-remove{border:1px solid #f0c8cc;background:#fff;color:#a23b31}.block-dialog button:disabled{cursor:wait;opacity:.65}@media(max-width:700px){.calendar-layout{grid-template-columns:minmax(0,1fr)}.calendar-date,.calendar-blank{min-height:82px}.calendar-date{padding:5px}.calendar-event{padding:2px 3px;font-size:8px}.calendar-toolbar{padding:10px}.calendar-toolbar h2{font-size:12px}}@media(max-width:420px){.calendar-header-actions{width:100%;justify-content:space-between}.calendar-weekdays span{font-size:9px}.calendar-date,.calendar-blank{min-height:68px}.calendar-date-events{gap:2px}.calendar-date .calendar-event:nth-child(n+2){display:none}.calendar-date small{font-size:8px}.calendar-today{padding:7px 8px;font-size:11px}.block-dialog-backdrop{align-items:end;padding:0}.block-dialog{width:100%;max-height:calc(100vh - 12px);border-radius:12px 12px 0 0}.block-time-fields{grid-template-columns:minmax(0,1fr)}.block-dialog footer{align-items:stretch;flex-direction:column}.block-dialog footer>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.block-dialog footer .btn{width:100%}}
    `}</style>
  </section>;
}
