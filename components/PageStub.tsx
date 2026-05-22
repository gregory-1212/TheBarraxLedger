// Reusable "Coming Soon" placeholder for tabs that aren't built yet.

export default function PageStub({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-400 mt-1">{description}</p>
      </header>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 flex items-center justify-center">
        <div className="text-center">
          <div className="text-zinc-600 text-sm uppercase tracking-wide mb-2">Coming Soon</div>
          <p className="text-zinc-500 text-sm">This section isn&apos;t built yet.</p>
        </div>
      </div>
    </div>
  );
}
