import Link from 'next/link';

export default function UnauthorizedPage() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="card max-w-lg p-8 text-center"><p className="eyebrow">Access restricted</p><h1 className="mt-2 text-2xl font-bold">You do not have permission to open this page.</h1><p className="mt-3 text-sm text-slate-600">Your account is active, but this section is outside your assigned access. Contact an administrator if your responsibilities have changed.</p><Link className="btn btn-primary mt-6" href="/">Return to my workspace</Link></section></main>;
}
