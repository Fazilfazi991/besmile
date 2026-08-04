'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AddEmployeeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Add employee route error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="card p-6">
        <p className="eyebrow">People</p>
        <h1 className="text-2xl font-bold">Add employee could not load</h1>
        <p className="mt-2 text-sm text-slate-600">
          The employee creation page hit a recoverable problem. Please retry, or return to the employee list.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={reset}>
            Retry
          </button>
          <Link className="btn border" href="/admin/employees">
            Back to Employees
          </Link>
        </div>
      </div>
    </section>
  );
}
