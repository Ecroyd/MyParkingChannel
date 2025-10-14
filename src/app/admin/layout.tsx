import { ReactNode } from "react";
import AdminShellServer from "@/components/admin-shell-server";

export const runtime = 'nodejs';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShellServer>{children}</AdminShellServer>;
}
