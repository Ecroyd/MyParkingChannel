"use client";

// Top bar bug button: opens the request form as a Bug with the current page filled in as the link.
// The form says thanks itself.

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Bug } from "lucide-react";
import WishlistForm from "./WishlistForm";

export default function ReportProblemButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLink(typeof window !== "undefined" ? window.location.href : pathname);
          setOpen(true);
        }}
        className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        aria-label="Report a problem with this page"
        title="Report a problem with this page"
      >
        <Bug className="h-5 w-5" />
      </button>
      <WishlistForm
        open={open}
        onOpenChange={setOpen}
        initialKind="bug"
        initialLink={link}
      />
    </>
  );
}
