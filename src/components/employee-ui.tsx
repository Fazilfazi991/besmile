import { ReactNode } from 'react';

type Tone = 'default' | 'pending' | 'success' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-50 text-amber-800',
  success: 'bg-emerald-50 text-emerald-800',
  danger: 'bg-rose-50 text-rose-800',
  info: 'bg-sky-50 text-sky-800',
};

export function EmployeePageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="employee-page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="employee-page-action">{action}</div>}</div>;
}

export function EmployeeMetricGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 | 6 }) {
  return <div className={`employee-metrics employee-metrics-${columns}`}>{children}</div>;
}

export function EmployeeMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: Tone }) {
  return <div className="employee-metric"><span>{label}</span><b className={tone === 'default' ? '' : `metric-${tone}`}>{value}</b></div>;
}

export function EmployeeSection({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`employee-section card ${className}`}>
    {(title || action) && <div className="employee-section-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}
    {children}
  </section>;
}

export function EmployeeStatusBadge({ children, tone = 'default' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`employee-status ${toneClasses[tone]}`}>{children}</span>;
}

export function EmployeeBanner({ children, tone = 'danger' }: { children: ReactNode; tone?: Exclude<Tone, 'default'> }) {
  const border = tone === 'danger' ? 'border-rose-200' : tone === 'success' ? 'border-emerald-200' : tone === 'pending' ? 'border-amber-200' : 'border-sky-200';
  return <p role={tone === 'danger' ? 'alert' : 'status'} className={`employee-banner border ${border} ${toneClasses[tone]}`}>{children}</p>;
}

export function EmployeeEmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="employee-empty"><span>+</span><b>{title}</b><p>{detail}</p></div>;
}

export function EmployeeLoading({ cards = 2 }: { cards?: number }) {
  return <div className="space-y-3">{Array.from({ length: cards }).map((_, index) => <div className="employee-skeleton" key={index} />)}</div>;
}
