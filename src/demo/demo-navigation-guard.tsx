'use client';

import { useEffect } from 'react';
import { useMobileNavigation } from '@/components/mobile-navigation';

/** Focus protection applies only to the synthetic public-demo shell. */
export function DemoNavigationGuard() {
  const { mobileOpen, setMobileOpen } = useMobileNavigation();
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
