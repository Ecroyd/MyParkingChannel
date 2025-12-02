import { ReactNode } from "react";
import AdminShellServer from "@/components/admin-shell-server";

export const runtime = 'nodejs';

export default function AdminLayout({ children }: { children: ReactNode }) {
  // Note: Setup page at /admin/setup has its own layout.tsx that handles
  // rendering without tenant context. However, since layouts are nested,
  // this parent layout still wraps it. The setup layout will handle
  // the redirect logic, and AdminShellServer will redirect to /admin/setup
  // if no tenant is found, which is what we want.
  return <AdminShellServer>{children}</AdminShellServer>;
}
