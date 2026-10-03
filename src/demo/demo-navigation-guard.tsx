'use client';

import { useEffect } from 'react';
import { useMobileNavigation } from '@/components/mobile-navigation';

/** Focus protection applies only to the synthetic public-demo shell. */
export function DemoNavigationGuard() {
  const { mobileOpen, setMobileOpen } = useMobileNavigation();
  useEffect(()=>{
    let queued=false;
    const update=()=>{
      queued=false;
      document.querySelectorAll<HTMLElement>('.public-demo-shell .overflow-x-auto').forEach(region=>{
        const scrolls=region.scrollWidth>region.clientWidth+2;
        let hint=region.previousElementSibling as HTMLElement|null;
        if(scrolls&&!hint?.classList.contains('demo-scroll-cue')){hint=document.createElement('p');hint.className='demo-scroll-cue';hint.textContent='Swipe or scroll horizontally to see every column.';region.before(hint);}
        if(hint?.classList.contains('demo-scroll-cue'))hint.hidden=!scrolls;
        if(scrolls){region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Scrollable fictional records');}
      });
      document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('.public-demo-shell input,.public-demo-shell select').forEach(field=>{
        if(field.getAttribute('aria-label')||field.labels?.length)return;
        const text=field instanceof HTMLSelectElement?field.options[0]?.text:field.placeholder;
        if(text)field.setAttribute('aria-label',text);
      });
    };
    const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(update);}};
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);schedule();
    return()=>{observer.disconnect();window.removeEventListener('resize',schedule);};
  },[]);
  useEffect(()=>{
    if (!mobileOpen) return;
    const dialog=document.querySelector<HTMLElement>('.mobile-launcher-layer');
    if (!dialog) return;
    const previous=document.activeElement as HTMLElement | null;
    const backgrounds=[...document.querySelectorAll<HTMLElement>('.public-demo-shell .app-main,.public-demo-shell .mobile-bottom-nav')];
    const oldInert=backgrounds.map(element=>element.inert);
    backgrounds.forEach(element=>{element.inert=true;});
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const controls=()=>[...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,[tabindex="0"]')].filter(element=>element.getClientRects().length);
    const frame=requestAnimationFrame(()=>controls()[0]?.focus());
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);return;}
      if(event.key!=='Tab')return;
      const list=controls(),first=list[0],last=list.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);backgrounds.forEach((element,index)=>{element.inert=oldInert[index];});document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();};
  },[mobileOpen,setMobileOpen]);
  return null;
}
