'use client';

import { useRef, useState } from 'react';
import type { AvailabilityRange } from '@/lib/doctor-scheduling-rules';
import {
  DAY_PRESETS, DISPLAY_DAYS, WEEKDAYS, expandAvailabilityGroups, formatAvailabilityTime,
  groupWeeklyRanges, parseAvailabilityText, validateAvailabilityGroups, type AvailabilityGroup,
} from '@/lib/weekly-availability-entry';

type EditorGroup = AvailabilityGroup & { id: number };
type Props = {
  initialRanges: AvailabilityRange[];
  consultationDurationMinutes: number;
  disabled?: boolean;
  onSave: (ranges: AvailabilityRange[]) => Promise<void>;
};
function ScheduleSummary({ ranges }: { ranges: AvailabilityRange[] }) {
  return <div className="weekly-summary">
    {DISPLAY_DAYS.map(day => {
      const slots = ranges.filter(row => row.day_of_week === day);
      return <div key={day}><h4>{WEEKDAYS[day]}</h4>{slots.length ? <ul>{slots.map(slot => <li key={slot.start_time + slot.end_time}>
        {formatAvailabilityTime(slot.start_time)} – {formatAvailabilityTime(slot.end_time)}
        {slot.end_time < slot.start_time && <small>Ends next day</small>}
      </li>)}</ul> : <p>No availability</p>}</div>;
    })}
  </div>;
}
export function WeeklyAvailabilityEditor({ initialRanges, consultationDurationMinutes, disabled = false, onSave }: Props) {
  const nextId = useRef(initialRanges.length);
  const identify = (groups: AvailabilityGroup[]) => groups.map(group => ({ ...group, id: nextId.current++ }));
  const [groups, setGroups] = useState<EditorGroup[]>(() => groupWeeklyRanges(initialRanges).map((group, id) => ({ ...group, id })));
  const [mode, setMode] = useState<'structured' | 'text'>('structured');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseAvailabilityText> | null>(null);
  const [review, setReview] = useState<AvailabilityRange[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const locked = disabled || saving;
  const summaryRef = useRef<HTMLDivElement>(null);

  function change(next: EditorGroup[]) { setGroups(next); setReview(null); setError(''); setNotice(''); }
  function update(id: number, patch: Partial<AvailabilityGroup>) { change(groups.map(group => group.id === id ? { ...group, ...patch } : group)); }
  function newGroup() { change([...groups, ...identify([{ days: [], slots: [{ start_time: '09:00', end_time: '10:00' }] }])]); }
  function preview() { const result = parseAvailabilityText(text, consultationDurationMinutes); setParsed(result); setError(result.error || ''); setNotice(''); }
  function useParsed() {
    if (!parsed || parsed.error) return;
    change(identify(parsed.groups));
    setParsed(null); setMode('structured');
    setNotice('Text schedule applied to the editor. Review or edit the groups, then review and save.');
  }
  function reviewSchedule() {
    const message = validateAvailabilityGroups(groups, consultationDurationMinutes);
    setError(message || ''); setNotice('');
    if (message) { setReview(null); return; }
    setReview(expandAvailabilityGroups(groups));
    // Focus the review heading after React renders it.
    requestAnimationFrame(() => summaryRef.current?.focus());
  }
  async function save() {
    if (review === null || locked) return;
    setSaving(true); setError(''); setNotice('');
    try { await onSave(review); setReview(null); setNotice('Availability saved.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save availability. Please try again.'); }
    finally { setSaving(false); }
  }
  return <section className="card weekly-entry" aria-label="Weekly availability">
    <header><h2>Weekly availability</h2><p>Times use Asia/Kolkata. Select days once and add all their time slots.</p><p>Each time slot must fit a {consultationDurationMinutes}-minute consultation.</p></header>
    {error && <p role="alert" className="weekly-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={locked} className="min-w-0 space-y-4">
      <legend className="sr-only">Availability entry</legend>
      <div className="weekly-controls" role="group" aria-label="Entry mode">
        <button type="button" className={mode === 'structured' ? 'btn btn-primary' : 'btn border'} aria-pressed={mode === 'structured'} onClick={() => { setMode('structured'); setError(''); }}>Structured entry</button>
        <button type="button" className={mode === 'text' ? 'btn btn-primary' : 'btn border'} aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setReview(null); setError(''); }}>Paste/text entry</button>
      </div>
      {mode === 'structured' ? <>
        {!groups.length && <p>No availability yet. Add a day group, or paste a schedule. Saving an empty schedule clears weekly availability.</p>}
        {groups.map((group, index) => <fieldset key={group.id} className="weekly-group" aria-label={`Day group ${index + 1}`}>
          <legend>Group {index + 1}</legend>
          <div className="weekly-controls">
            <button type="button" className="btn border" onClick={() => change([...groups, ...identify([{ days: [...group.days], slots: group.slots.map(slot => ({ ...slot })) }])])}>Duplicate group</button>
            <button type="button" className="btn border" onClick={() => change(groups.filter(row => row.id !== group.id))}>Remove group</button>
          </div>
          <p className="font-semibold">Days</p>
          <div className="weekly-days">{DISPLAY_DAYS.map(day => <label key={day}>
            <input type="checkbox" aria-label={WEEKDAYS[day]} checked={group.days.includes(day)} onChange={event => update(group.id, { days: event.target.checked ? [...group.days, day] : group.days.filter(value => value !== day) })} />
            <abbr title={WEEKDAYS[day]}>{WEEKDAYS[day].slice(0, 3)}</abbr>
          </label>)}</div>
          <div className="weekly-controls" role="group" aria-label="Quick select days">
            {DAY_PRESETS.map(preset => <button type="button" className="btn border" key={preset.label} onClick={() => update(group.id, { days: [...preset.days] })}>{preset.label}</button>)}
            <button type="button" className="btn border" onClick={() => update(group.id, { days: [] })}>Custom days</button>
          </div>
          <p className="font-semibold">Time slots</p>
          {group.slots.map((slot, slotIndex) => {
            const edit = (field: 'start_time' | 'end_time', value: string) => update(group.id, { slots: group.slots.map((row, i) => i === slotIndex ? { ...row, [field]: value } : row) });
            return <div className="weekly-slot" key={slotIndex}>
              <label>From<input type="time" className="input" step="60" value={slot.start_time} onChange={event => edit('start_time', event.target.value)} /></label>
              <label>To<input type="time" className="input" step="60" value={slot.end_time === '24:00' ? '00:00' : slot.end_time} onChange={event => edit('end_time', event.target.value)} /></label>
              <button type="button" className="btn border" aria-label={`Remove time ${slotIndex + 1} from group ${index + 1}`} onClick={() => update(group.id, { slots: group.slots.filter((_, i) => i !== slotIndex) })}>Remove time</button>
              {slot.start_time && slot.end_time && slot.end_time < slot.start_time && <small className="weekly-slot-note">Ends next day</small>}
              {(slot.end_time === '00:00' || slot.end_time === '24:00') && <label className="weekly-slot-note weekly-midnight"><input type="checkbox" checked={slot.end_time === '24:00'} onChange={event => edit('end_time', event.target.checked ? '24:00' : '00:00')} /> Midnight at end of day (24:00)</label>}
            </div>;
          })}
          <div className="weekly-controls">
            <button type="button" className="btn border" onClick={() => update(group.id, { slots: [...group.slots, { start_time: '', end_time: '' }] })}>+ Add another time</button>
            <button type="button" className="btn border" onClick={() => {
              const message = validateAvailabilityGroups([group], consultationDurationMinutes);
              setError(message || ''); setNotice(message ? '' : `Applied ${group.slots.length} time slot(s) to ${group.days.length} selected day(s). Review and save the whole week below.`);
            }}>Apply to selected days</button>
          </div>
        </fieldset>)}
        <div className="weekly-controls"><button type="button" className="btn border" onClick={newGroup}>+ Add another day group</button><button type="button" className="btn btn-primary" onClick={reviewSchedule}>Review weekly schedule</button></div>
        {review !== null && <div ref={summaryRef} tabIndex={-1} className="weekly-review" aria-label="Final schedule review">
          <h3>Final weekly schedule</h3><p>{review.length} weekday range(s). Exact duplicates are removed. This replaces the current weekly schedule.</p>
          {!review.length && <p className="weekly-error">This will clear all weekly availability for this psychologist.</p>}
          <ScheduleSummary ranges={review} />
          <div className="weekly-controls"><button type="button" className="btn border" onClick={() => setReview(null)}>Edit schedule</button><button type="button" className="btn btn-primary" onClick={() => void save()}>Save availability</button></div>
        </div>}
      </> : <div className="space-y-4">
        <label className="block">Paste availability<textarea aria-label="Paste availability" className="input mt-1" rows={6} value={text} placeholder={'Mon-Sat: 9-10 AM, 2-3 PM, 6-7 PM\nSun: 10 AM-1 PM'} onChange={event => { setText(event.target.value); setParsed(null); setError(''); }} /></label>
        <p>Use one day group per line. Include an end time for every slot. Bare times such as 9–10 need AM/PM; 24-hour times use HH:MM.</p>
        <button type="button" className="btn border" onClick={preview}>Preview schedule</button>
        {parsed && !parsed.error && <div className="weekly-review" aria-label="Interpreted schedule">
          <h3>Interpreted schedule</h3><p>{parsed.ranges.length} weekday range(s). Confirming replaces the groups in this editor. Save after reviewing the week.</p>
          <ScheduleSummary ranges={parsed.ranges} />
          <div className="weekly-controls"><button type="button" className="btn border" onClick={() => setParsed(null)}>Edit text</button><button type="button" className="btn btn-primary" onClick={useParsed}>Confirm &amp; use schedule</button></div>
        </div>}
      </div>}
    </fieldset>
    {saving && <p role="status">Saving availability…</p>}
  </section>;
}
