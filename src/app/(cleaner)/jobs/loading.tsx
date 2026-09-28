// Shown while a cleaner page's server data loads, instead of a frozen screen.
export default function JobsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto flex max-w-lg flex-col gap-4 px-5 py-8">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-muted" />
      {[0, 1].map((i) => (
        <div className="h-44 animate-pulse rounded-2xl bg-muted/70" key={i} />
      ))}
    </main>
  );
}
