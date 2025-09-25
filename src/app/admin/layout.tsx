import { ReactNode } from "react";
import AdminShellServer from "@/components/admin-shell-server";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShellServer>{children}</AdminShellServer>;
}
