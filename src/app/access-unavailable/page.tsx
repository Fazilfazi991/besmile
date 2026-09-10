import Link from 'next/link';
import { ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/authorization-transport';

export default function AccessUnavailablePage() {
  return <main className="min-h-screen p-6 grid place-items-center"><section className="max-w-md space-y-4">
    <h1 className="text-xl font-semibold">Access check temporarily unavailable</h1>
    <p>{ACCESS_UNAVAILABLE_MESSAGE}</p>
    <Link href="/" className="btn btn-primary">Try again</Link>
  </section></main>;
}
