export const compactInr = (value: number | string | null | undefined) =>
  `INR ${new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))}`;

export const chartInr = (value: number | string | null | undefined) =>
  `INR ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0))}`;
