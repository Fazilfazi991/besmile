import type { ReactNode } from 'react';

export type ModuleTab<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export function CompactPageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="compact-page-header">
    <div><h1>{title}</h1><p>{description}</p></div>
    {action ? <div className="compact-page-action">{action}</div> : null}
  </header>;
}

export function ModuleTabs<T extends string>({ tabs, value, onChange, label }: { tabs: ModuleTab<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="module-tabs" role="tablist" aria-label={label}>
    {tabs.map(tab => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} className={value === tab.value ? 'active' : ''} onClick={() => onChange(tab.value)}>
      {tab.label}{typeof tab.count === 'number' ? <span>{tab.count}</span> : null}
    </button>)}
  </div>;
}

export function ModuleToolbar({ children }: { children: ReactNode }) {
  return <div className="module-toolbar">{children}</div>;
}

export function DataTableShell({ children, label }: { children: ReactNode; label: string }) {
  return <div className="data-table-shell" aria-label={label}>{children}</div>;
}

export function CompactEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="compact-empty-state"><b>{title}</b><p>{description}</p></div>;
}

const statusLabels: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', withdrawn: 'Withdrawn' };

export function StatusBadge({ status }: { status?: string | null }) {
  const value = status || 'unknown';
  const token = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return <span className={`module-status module-status-${token}`}>{statusLabels[value] || value}</span>;
}

export function Pagination({ page, pageSize, total, pageSizeOptions = [6, 12, 24], onPageChange, onPageSizeChange }: { page: number; pageSize: number; total: number; pageSizeOptions?: number[]; onPageChange: (page: number) => void; onPageSizeChange?: (size: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(candidate => pageCount <= 5 || candidate === 1 || candidate === pageCount || Math.abs(candidate - page) <= 1);

  return <nav className="module-pagination" aria-label="Record pagination">
    <div className="pagination-copy">Showing <b>{start}–{end}</b> of <b>{total}</b></div>
    {onPageSizeChange ? <label>Rows <select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))}>{pageSizeOptions.map(size => <option value={size} key={size}>{size}</option>)}</select></label> : null}
    <div className="pagination-controls">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      {pages.map((candidate, index) => <span key={candidate} className="pagination-page-wrap">
        {index > 0 && candidate - pages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
        <button type="button" aria-label={`Page ${candidate}`} aria-current={candidate === page ? 'page' : undefined} onClick={() => onPageChange(candidate)}>{candidate}</button>
      </span>)}
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  </nav>;
}
