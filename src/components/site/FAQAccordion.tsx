"use client";

import { ChevronDown } from "lucide-react";

interface FAQ {
  q: string;
  a: string;
}

interface FAQAccordionProps {
  faqs: FAQ[];
}

/**
 * Accessible FAQ list. Answers are always present in the DOM (details/summary)
 * so crawlers and assistive tech see full Q&A without relying on JS open state.
 */
export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  if (!faqs.length) return null;

  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {faqs.map((faq, index) => (
        <details key={index} className="group py-4" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-slate-900 marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [&::-webkit-details-marker]:hidden">
            <span>{faq.q}</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{faq.a}</p>
        </details>
      ))}
    </div>
  );
}
