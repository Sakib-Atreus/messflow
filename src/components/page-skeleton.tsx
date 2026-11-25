/** Soft grey outline of a page, shown while the real page loads. */
export function PageSkeleton() {
  const bar = "rounded-lg bg-slate-200/80 dark:bg-slate-800";
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className={`${bar} h-7 w-48`} />
        <div className={`${bar} h-4 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} mt-3 h-6 w-28`} />
          </div>
        ))}
      </div>
      {[0, 1].map((k) => (
        <div key={k} className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className={`${bar} h-5 w-40`} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-slate-200/80 dark:bg-slate-800" />
              <div className={`${bar} h-4 flex-1`} />
              <div className={`${bar} h-4 w-16`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
