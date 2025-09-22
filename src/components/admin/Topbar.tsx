// components/admin/Topbar.tsx
"use client";
import * as React from "react";

// ✅ shadcn: all **named** imports
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Props = {
  user?: { name?: string; image?: string };
  onSignOut?: () => Promise<void> | void;
};

export default function Topbar({ user, onSignOut }: Props) {
  const [busy, setBusy] = React.useState(false);

  async function handleSignOut() {
    if (!onSignOut) return;
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  }

  const initials =
    user?.name?.trim()?.split(/\s+/)?.map(s => s[0]?.toUpperCase())?.slice(0,2)?.join("") ||
    "US";

  return (
    <div className="flex items-center justify-end gap-3 px-4 py-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={user?.image || ""} alt={user?.name || "User"} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <Separator orientation="vertical" className="h-6" />

      <Button size="sm" variant="outline" onClick={handleSignOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}

