"use client";

import { useEffect, useState } from "react";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  allowThirdPartyTags,
} from "@/lib/website-performance/consent";

function hasConsentFlag(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (v === "1" || v === "granted" || v === "true") return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${CONSENT_COOKIE_NAME}=([^;]*)`)
    );
    const c = match ? decodeURIComponent(match[1]) : null;
    return c === "1" || c === "granted" || c === "true";
  }
  return false;
}

/**
 * Loads GA4 / GTM / Clarity only when the site's consent mode allows it.
 */
export function ThirdPartyTags({
  cookieConsentMode,
  gtmId,
  ga4Id,
  clarityId,
}: {
  cookieConsentMode: string;
  gtmId?: string | null;
  ga4Id?: string | null;
  clarityId?: string | null;
}) {
  const [allowed, setAllowed] = useState(() =>
    allowThirdPartyTags(cookieConsentMode, false)
  );

  useEffect(() => {
    setAllowed(allowThirdPartyTags(cookieConsentMode, hasConsentFlag()));
  }, [cookieConsentMode]);

  useEffect(() => {
    if (!allowed) return;

    const gtm = gtmId?.trim();
    const ga4 = ga4Id?.trim();
    const clarity = clarityId?.trim();

    if (gtm) {
      const id = gtm.replace(/[^A-Z0-9-]/gi, "");
      if (!document.getElementById("pc-gtm")) {
        const s = document.createElement("script");
        s.id = "pc-gtm";
        s.async = true;
        s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
        document.head.appendChild(s);
      }
      return;
    }

    if (ga4) {
      const id = ga4.replace(/[^A-Z0-9-]/gi, "");
      if (!document.getElementById("pc-ga4-src")) {
        const src = document.createElement("script");
        src.id = "pc-ga4-src";
        src.async = true;
        src.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
        document.head.appendChild(src);
        const cfg = document.createElement("script");
        cfg.id = "pc-ga4-cfg";
        cfg.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
        document.head.appendChild(cfg);
      }
    }

    if (clarity) {
      const id = clarity.replace(/[^A-Za-z0-9]/g, "");
      if (!document.getElementById("pc-clarity")) {
        const s = document.createElement("script");
        s.id = "pc-clarity";
        s.innerHTML = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`;
        document.head.appendChild(s);
      }
    }
  }, [allowed, gtmId, ga4Id, clarityId]);

  return null;
}
