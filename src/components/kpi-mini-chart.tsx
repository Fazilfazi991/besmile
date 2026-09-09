import { chartAriaLabel, chartTotal, type KpiChartModel } from '@/lib/dashboard-kpi-model';

export function KpiMiniChart({ model }: { model: KpiChartModel }) {
  const total = chartTotal(model);
  const label = chartAriaLabel(model);
  if (!total) return <div className="kpi-chart kpi-chart-empty" role="img" aria-label={`${model.label}. No comparison data`}><span>No comparison data</span></div>;
  if (model.type === 'donut') {
    const stops = model.data.map((item, index) => {
      const start = model.data.slice(0, index).reduce((sum, previous) => sum + previous.value, 0) / total * 100;
      const end = start + item.value / total * 100;
      return `${item.color} ${start}% ${end}%`;
    }).join(', ');
    const primary = Math.round((model.data[0]?.value || 0) / total * 100);
    return <div className="kpi-chart kpi-chart-donut" role="img" aria-label={label}><span style={{ background: `conic-gradient(${stops})` }}><i>{primary}%</i></span><KpiLegend data={model.data} /></div>;
  }
  if (model.type === 'segments') return <div className="kpi-chart kpi-chart-segments" role="img" aria-label={label}><div>{model.data.filter(item => item.value > 0).map(item => <i key={item.label} style={{ background: item.color, flexGrow: item.value }} />)}</div><KpiLegend data={model.data} /></div>;
  if (model.type === 'bars') {
    const maximum = Math.max(...model.data.map(item => item.value));
    return <div className="kpi-chart kpi-chart-bars" role="img" aria-label={label}>{model.data.map(item => <span key={item.label}><i style={{ width: `${maximum ? item.value / maximum * 100 : 0}%`, background: item.color }} /><small>{item.label}</small><b>{compact(item.value)}</b></span>)}</div>;
  }
  const maximum = Math.max(...model.data.map(item => item.value));
  const minimum = Math.min(...model.data.map(item => item.value));
  const range = Math.max(1, maximum - minimum);
  const points = model.data.map((item, index) => `${model.data.length === 1 ? 50 : index / (model.data.length - 1) * 100},${34 - (item.value - minimum) / range * 28}`).join(' ');
  return <div className="kpi-chart kpi-chart-sparkline" role="img" aria-label={label}><svg viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg><span><small>{model.data[0]?.label}</small><b>{model.data.at(-1)?.label}</b></span></div>;
}

function KpiLegend({ data }: { data: KpiChartModel['data'] }) {
  return <div className="kpi-chart-legend">{data.slice(0, 3).map(item => <span key={item.label}><i style={{ background: item.color }} /><small>{item.label}</small><b>{compact(item.value)}</b></span>)}</div>;
}

const compact = (value: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
