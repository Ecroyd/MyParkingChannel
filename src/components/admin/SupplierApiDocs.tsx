// components/admin/SupplierApiDocs.tsx

'use client';

import * as React from 'react';
import { supplierApiDocs, SupplierEndpointDoc } from '@/lib/supplier/apiDocs';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

type JsonEditorProps = {
  label: string;
  initialValue: unknown;
};

function JsonEditor({ label, initialValue }: JsonEditorProps) {
  const defaultText = React.useMemo(
    () => JSON.stringify(initialValue, null, 2),
    [initialValue]
  );

  const [value, setValue] = React.useState(defaultText);
  const [dirty, setDirty] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setDirty(e.target.value !== defaultText);
    setCopied(false);
  };

  const handleReset = () => {
    setValue(defaultText);
    setDirty(false);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!dirty}
            className="h-7 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </Button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        rows={10}
        spellCheck={false}
        className="w-full rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <p className="text-[11px] text-slate-500">
        This editor only affects how the example is shown here. To make this the
        real contract, copy it into your backend types / validation.
      </p>
    </div>
  );
}

function EndpointCard({ doc }: { doc: SupplierEndpointDoc }) {
  const [open, setOpen] = React.useState(false);

  const hasRequest = doc.requestExample !== undefined;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div
        className="flex cursor-pointer items-start justify-between gap-3"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                doc.method === 'GET'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-sky-50 text-sky-700'
              }`}
            >
              {doc.method}
            </span>
            <span className="font-mono text-xs text-slate-800">
              {doc.path}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              Scope: {doc.scope}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{doc.name}</h3>
          <p className="text-xs text-slate-600">{doc.description}</p>
        </div>
        <button
          type="button"
          className="mt-1 text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {hasRequest && (
            <JsonEditor label="Request JSON" initialValue={doc.requestExample} />
          )}
          <JsonEditor label="Response JSON" initialValue={doc.responseExample} />
        </div>
      )}
    </div>
  );
}

export function SupplierApiDocs() {
  return (
    <section className="mt-8 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">
          Supplier API Docs
        </h2>
        <p className="text-xs text-slate-600">
          These examples show exactly what our supplier API sends and expects
          for partner integrations like CAVU and Holiday Extras. You can tweak
          the JSON here for planning or to copy into external docs.
        </p>
        <p className="text-[11px] text-slate-500">
          Scopes: <span className="font-mono">products</span>,{' '}
          <span className="font-mono">availability</span> (pricing + availability),{' '}
          <span className="font-mono">bookings</span>.
        </p>
      </div>

      <div className="space-y-3">
        {supplierApiDocs.map((doc) => (
          <EndpointCard key={doc.key} doc={doc} />
        ))}
      </div>
    </section>
  );
}

