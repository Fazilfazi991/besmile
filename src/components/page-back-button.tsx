'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { contextualBackTarget } from '@/lib/contextual-back-navigation';

export function PageBackButton() {
  const target = contextualBackTarget(usePathname());

  if (!target) return null;

  return <nav className="page-back-navigation print:hidden" aria-label="Contextual navigation">
    <Link className="page-back-button" href={target.href}>
      <ChevronLeft aria-hidden="true" />
      <span>{target.label}</span>
    </Link>
  </nav>;
}
