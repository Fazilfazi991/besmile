'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

type TopbarProfileLinkProps = {
  href: string;
  name: string;
  subtitle: string;
  photoUrl?: string | null;
};

function TopbarAvatar({ name, photoUrl }: Pick<TopbarProfileLinkProps, 'name' | 'photoUrl'>) {
  const [failed, setFailed] = useState(false);
  return photoUrl && !failed
    ? <Image src={photoUrl} alt="" width={30} height={30} unoptimized onError={() => setFailed(true)} />
    : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

export function TopbarProfileLink({ href, name, subtitle, photoUrl }: TopbarProfileLinkProps) {
  return (
    <Link className="topbar-user" href={href} aria-label={`Open profile for ${name}`}>
      <TopbarAvatar key={photoUrl || 'initial'} name={name} photoUrl={photoUrl} />
      <div>
        <b>{name}</b>
        <small>{subtitle}</small>
      </div>
      <ChevronDown className="topbar-profile-chevron" aria-hidden="true" />
    </Link>
  );
}
