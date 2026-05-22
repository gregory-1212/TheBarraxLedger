import Link from "next/link";

// Settings index — links to sub-pages. As more areas land they get added here.

type Section = {
  href: string;
  title: string;
  description: string;
  enabled: boolean;
};

const SECTIONS: Section[] = [
  {
    href: "/settings/audit-log",
    title: "Audit log",
    description:
      "Every sensitive action (TIN reveal, document download, CSV export) logged with actor + timestamp.",
    enabled: true,
  },
  {
    href: "/settings/categories",
    title: "Expense categories",
    description: "Edit the categories used to tag bills + receipts.",
    enabled: false,
  },
  {
    href: "/settings/reminders",
    title: "Reminder preferences",
    description: "Which compliance + bill deadlines email you, and when.",
    enabled: false,
  },
  {
    href: "/settings/account",
    title: "Account",
    description: "Your sign-in email + which staff have access.",
    enabled: false,
  },
];

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Categories, audit log, reminder preferences, account.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) =>
          s.enabled ? (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
            >
              <h2 className="text-sm font-medium text-zinc-100">{s.title}</h2>
              <p className="text-xs text-zinc-400 mt-1">{s.description}</p>
            </Link>
          ) : (
            <div
              key={s.href}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 opacity-60"
            >
              <h2 className="text-sm font-medium text-zinc-300">
                {s.title}{" "}
                <span className="text-xs text-zinc-600 ml-1">(soon)</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-1">{s.description}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
