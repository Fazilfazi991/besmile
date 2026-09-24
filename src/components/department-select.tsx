'use client';

import { useState } from 'react';
import { organizationRepository } from '@/lib/organization-repository';

type Department = { id: string; name: string };
/** Native select retains keyboard and platform popup behavior; custom values are real lookup records. */
export function DepartmentSelect({ departments, value, onChange, required = false, disabled = false }: {
  departments: Department[]; value?: string; onChange?: (id: string) => void; required?: boolean; disabled?: boolean;
}) {
  const [selected, setSelected] = useState(value || '');
  const [added, setAdded] = useState<Department[]>([]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = (id: string) => { setSelected(id); onChange?.(id); setError(''); };
  const options = [...new Map([...departments, ...added].map(item => [item.id, item])).values()].sort((a,b) => a.name.localeCompare(b.name));
  const add = async () => {
    setBusy(true); setError('');
    try {
      const id = await organizationRepository.createDepartment(custom);
      setAdded(items => [...items, { id, name: custom.trim() }]);
      choose(id); setCustom('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : String((caught as {message?: string})?.message || 'Department could not be added.')); }
    finally { setBusy(false); }
  };
  return <div className="min-w-0 space-y-2">
    <select aria-label="Department" name="department_id" className="input w-full min-w-0 max-w-full" value={selected === '__custom' ? '' : selected} required={required || selected === '__custom'} disabled={disabled || busy} onChange={event => choose(event.target.value)}>
      <option value="">{selected === '__custom' ? 'Add your custom department below' : 'Select department'}</option>
      {options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      <option value="__custom">Other — add department</option>
    </select>
    {selected === '__custom' && <div className="space-y-2">
      <input aria-label="Custom department" className="input w-full min-w-0" value={custom} onChange={event => setCustom(event.target.value)} minLength={2} maxLength={100} placeholder="Enter department name" disabled={busy} />
      <button type="button" className="btn border" onClick={() => void add()} disabled={busy || custom.trim().length < 2}>{busy ? 'Adding…' : 'Add department'}</button>
      <p className="text-xs">Add the department, then save the employee.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
