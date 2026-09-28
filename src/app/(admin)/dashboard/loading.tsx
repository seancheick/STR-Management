// Shown while a dashboard page's server data loads, instead of a frozen screen.
export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10">
      <div className="h-9 w-56 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/70" key={i} />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[1.75rem] bg-muted/60" />
    </main>
  );
}
