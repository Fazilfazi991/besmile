import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

type TopbarProfileLinkProps = {
  href: string;
  name: string;
  subtitle: string;
};

export function TopbarProfileLink({ href, name, subtitle }: TopbarProfileLinkProps) {
  return (
    <Link className="topbar-user" href={href} aria-label={`Open profile for ${name}`}>
      <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <div>
        <b>{name}</b>
        <small>{subtitle}</small>
      </div>
      <ChevronDown className="topbar-profile-chevron" aria-hidden="true" />
    </Link>
  );
}
