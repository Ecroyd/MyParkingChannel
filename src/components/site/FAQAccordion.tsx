"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQ {
  q: string;
  a: string;
}

interface FAQAccordionProps {
  faqs: FAQ[];
}

export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div key={index}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              className="flex w-full items-center justify-between gap-4 py-4 text-left"
              aria-expanded={open}
            >
              <span className="font-medium text-slate-900">{faq.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>
            {open ? (
              <p className="pb-4 text-sm leading-relaxed text-slate-600">{faq.a}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
