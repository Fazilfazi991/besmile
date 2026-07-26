import {ReactNode} from 'react';
export const inr=(value:number|string|null|undefined)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2}).format(Number(value||0));
export function FinanceEmpty({children}:{children:ReactNode}){return <p className="p-8 text-center text-sm text-slate-500">{children}</p>}
export function FinanceStatus({value}:{value:string}){const tone=value.includes('paid')?'bg-emerald-50 text-emerald-800':value==='overdue'||value==='cancelled'?'bg-rose-50 text-rose-800':value==='draft'?'bg-slate-100 text-slate-700':'bg-amber-50 text-amber-800';return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{value.replaceAll('_',' ')}</span>}
