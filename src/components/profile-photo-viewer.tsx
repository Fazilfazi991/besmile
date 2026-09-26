'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import './profile-photo-viewer.css';

export function ProfilePhotoViewer({ name, src, onClose }: { name: string; src: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const zoom = (value: number) => { const next = Math.max(1, Math.min(5, value)); scaleRef.current = next; setScale(next); };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  const distance = () => { const [a, b] = [...pointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };

  return <dialog ref={dialog} className="organization-photo-viewer" aria-label={`Photo of ${name}`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="organization-photo-toolbar"><strong>{name}</strong><div><button type="button" aria-label="Zoom out" onClick={() => zoom(scaleRef.current - .5)}>−</button><button type="button" aria-label="Zoom in" onClick={() => zoom(scaleRef.current + .5)}>+</button><button type="button" onClick={() => zoom(1)}>Reset</button><button type="button" onClick={onClose}>Close</button></div></div>
    <div className="organization-photo-stage" onPointerDown={event => { pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId); if (pointers.current.size === 2) pinch.current = { distance: distance(), scale: scaleRef.current }; }} onPointerMove={event => { if (!pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size === 2 && pinch.current?.distance) zoom(pinch.current.scale * distance() / pinch.current.distance); }} onPointerUp={event => { pointers.current.delete(event.pointerId); pinch.current = null; }} onPointerCancel={event => { pointers.current.delete(event.pointerId); pinch.current = null; }} onWheel={event => { if (event.ctrlKey) { event.preventDefault(); zoom(scaleRef.current + (event.deltaY < 0 ? .25 : -.25)); } }}>
      <Image src={src} alt={name} width={900} height={900} unoptimized draggable={false} onError={onClose} style={{ transform: `scale(${scale})` }} />
    </div>
  </dialog>;
}
