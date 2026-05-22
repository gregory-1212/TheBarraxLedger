import type { ReactNode } from "react";
import Link from "next/link";

// Shared layout primitive for dashboard cards. Server-component friendly.
//
// Usage:
//   <DashboardWidget title="Compliance" href="/compliance">
//     {data.length === 0 ? <WidgetEmptyState>...</WidgetEmptyState> : ...}
//   </DashboardWidget>
//
// Each widget is responsible for fetching its own data + rendering its
// empty/data states. The framework handles the card chrome + optional
// click-through link.

type DashboardWidgetProps = {
  title: string;
  subtitle?: string;
  href?: string;
  children: ReactNode;
};

export function DashboardWidget({
  title,
  subtitle,
  href,
  children,
}: DashboardWidgetProps) {
  const card = (
    <div
      className={
        "bg-zinc-900 border border-zinc-800 rounded-lg p-5 h-full " +
        (href ? "hover:border-zinc-700 transition-colors" : "")
      }
    >
      <header className="mb-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </header>
      <div className="text-sm">{children}</div>
    </div>
  );

  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

export function WidgetEmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-600">{children}</p>;
}

export function WidgetBigNumber({
  value,
  hint,
}: {
  value: string;
  hint?: string;
}) {
  return (
    <>
      <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
        {value}
      </div>
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 bg-zinc-800 rounded w-3/4 animate-pulse" />
      <div className="h-3 bg-zinc-800 rounded w-1/2 animate-pulse" />
      <div className="h-3 bg-zinc-800 rounded w-2/3 animate-pulse" />
    </div>
  );
}

export function WidgetErrorState({ message }: { message?: string }) {
  return (
    <p className="text-sm text-red-400">
      {message ?? "Couldn't load. Refresh to try again."}
    </p>
  );
}
