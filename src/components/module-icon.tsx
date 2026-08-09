type ModuleIconProps = { label: string; className?: string };

const iconFor = (label: string) => {
  const key = label.toLowerCase();
  if (/dashboard|home/.test(key)) return <path d="M3 10.5 12 3l9 7.5V21H3v-10.5Zm6 10.5v-6h6v6" />;
  if (/employee|people|profile/.test(key)) return <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20m6-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-3v5m-2.5-2.5h5" />;
  if (/attendance|calendar|holiday|schedule/.test(key)) return <path d="M5 4h14v16H5V4Zm0 5h14M8 2v4m8-4v4m-7 7 2 2 4-4" />;
  if (/leave/.test(key)) return <path d="M20 4C11 4 5 8 4 18c7 1 14-3 16-14ZM4 18c3-4 7-7 12-9" />;
  if (/task|follow/.test(key)) return <path d="M7 4h10v16H7V4Zm3 4h4m-4 4h4m-4 4h3M5 8H4m1 4H4m1 4H4" />;
  if (/patient/.test(key)) return <path d="M12 21s7-3.7 7-10a7 7 0 1 0-14 0c0 6.3 7 10 7 10Zm-2.5-10h5m-2.5-2.5v5" />;
  if (/finance|payroll|invoice|income|expense|sales|revenue/.test(key)) return <path d="M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4M8 3v18" />;
  if (/report/.test(key)) return <path d="M4 20V4m0 16h17M8 17v-5m4 5V7m4 10v-8m4 8V5" />;
  if (/notification|announcement/.test(key)) return <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" />;
  if (/document/.test(key)) return <path d="M7 3h7l4 4v14H7V3Zm7 0v5h5M10 13h5m-5 4h5" />;
  if (/crm|lead|client/.test(key)) return <path d="m12 3 2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3Z" />;
  if (/access|role|permission/.test(key)) return <path d="M12 3 4 6v5c0 5 3.4 8.3 8 10 4.6-1.7 8-5 8-10V6l-8-3Zm-3 9 2 2 4-4" />;
  if (/setting/.test(key)) return <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M5 5l1.5 1.5m11 11L19 19M3 12h2m14 0h2M5 19l1.5-1.5m11-11L19 5" />;
  if (/search/.test(key)) return <path d="m20 20-4.5-4.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />;
  return <path d="M5 5h14v14H5V5Zm4 4h6m-6 4h6" />;
};

export function ModuleIcon({ label, className = '' }: ModuleIconProps) {
  return <span className={`module-icon module-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${className ? ` ${className}` : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{iconFor(label)}</svg></span>;
}
