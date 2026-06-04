import Sidebar from "@/components/Sidebar";
import AppShell from "@/components/AppShell";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell sidebar={<Sidebar />}>{children}</AppShell>;
}
