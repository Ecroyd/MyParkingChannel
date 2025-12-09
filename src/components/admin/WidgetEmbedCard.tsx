"use client";

import { useMemo, useState } from "react";

export default function WidgetEmbedCard({ slug, baseDomain }: { slug: string; baseDomain?: string }) {
  const base = baseDomain || (typeof window !== "undefined" ? window.location.origin : "");
  const snippet = useMemo(() => {
    return `<!-- Parking Channel Booking Widget -->
<iframe
  src="https://myparkingchannel.app/widget/${slug}"
  style="width: 100%; min-height: 700px; border: 0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
<!-- End Parking Channel -->`;
  }, [slug]);

  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const demoUrl = `${base.replace(/\/$/, "")}/widget/${slug}`;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold text-sm sm:text-base">Embed Booking Widget</h3>
        <button 
          onClick={copy} 
          className="text-xs sm:text-sm rounded-xl px-3 py-1.5 border border-slate-300 hover:bg-slate-50 transition-colors shrink-0"
        >
          {copied ? "Copied ?" : "Copy code"}
        </button>
      </div>
      <pre className="text-xs bg-slate-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
      <div className="mt-3 text-xs sm:text-sm">
        <span className="block sm:inline">Preview: </span>
        <a 
          className="text-sky-700 hover:underline break-all sm:break-normal" 
          href={demoUrl} 
          target="_blank" 
          rel="noreferrer"
        >
          {demoUrl}
        </a>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Paste the snippet into the customer's website where you want the booking form to appear.
      </p>
    </div>
  );
}



