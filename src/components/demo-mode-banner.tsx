import { isDemoMode } from '@/lib/demo-mode';

export function DemoModeBanner() {
  if (!isDemoMode()) return null;

  return (
    <aside
      aria-label="Public demo environment"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950"
      role="status"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
        <strong className="font-bold">Fusion Ventures Demo</strong>
        <span className="text-amber-900/80">Synthetic data • Changes reset when the page reloads</span>
      </div>
    </aside>
  );
}
