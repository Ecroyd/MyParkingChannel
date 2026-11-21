// Where a visit came from, worked out from the landing URL and the referrer. Pure, so it is
// shared by the tracking endpoint and its tests.

export type VisitSource = {
  source: string; // Google, Facebook, Direct, a referring site, or utm_source as given
  medium: string; // organic, paid, social, referral, email, direct, or utm_medium as given
  campaign: string | null;
  referrerHost: string | null;
};

const SEARCH: Array<[RegExp, string]> = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
  [/(^|\.)search\.brave\.com$/, 'Brave Search'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
];

const SOCIAL: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)pinterest\./, 'Pinterest'],
  [/(^|\.)whatsapp\.com$/, 'WhatsApp'],
];

const MAIL = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/;

function clean(value: string | null | undefined, max = 100): string | null {
  const v = (value ?? '').trim();
  return v ? v.slice(0, max) : null;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h || null;
  } catch {
    return null;
  }
}

/** Friendly name for a utm_source like "google" or "facebook"; anything else is kept as given. */
function niceUtmSource(s: string): string {
  const k = s.toLowerCase();
  const known: Record<string, string> = {
    google: 'Google', bing: 'Bing', facebook: 'Facebook', fb: 'Facebook', instagram: 'Instagram',
    ig: 'Instagram', tiktok: 'TikTok', twitter: 'X', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube',
    newsletter: 'Newsletter', email: 'Email', chatgpt: 'ChatGPT', 'chatgpt.com': 'ChatGPT',
  };
  return known[k] ?? s;
}

/**
 * @param landingUrl full URL of the first page of the visit (query string included)
 * @param referrer   document.referrer, already known to be from another site (or empty)
 */
export function classifySource(landingUrl: string, referrer: string | null | undefined): VisitSource {
  let params = new URLSearchParams();
  try {
    params = new URL(landingUrl).searchParams;
  } catch {
    /* keep empty */
  }
  const referrerHost = hostOf(referrer);
  const utmSource = clean(params.get('utm_source'));
  const utmMedium = clean(params.get('utm_medium'));
  const campaign = clean(params.get('utm_campaign'));

  if (utmSource) {
    return {
      source: niceUtmSource(utmSource),
      medium: (utmMedium ?? (params.has('gclid') ? 'paid' : 'referral')).toLowerCase(),
      campaign,
      referrerHost,
    };
  }
  // Ad click ids without UTM tags.
  if (params.has('gclid') || params.has('gbraid') || params.has('wbraid')) {
    return { source: 'Google', medium: 'paid', campaign, referrerHost };
  }
  if (params.has('msclkid')) return { source: 'Bing', medium: 'paid', campaign, referrerHost };
  if (params.has('fbclid')) return { source: 'Facebook', medium: 'social', campaign, referrerHost };

  if (!referrerHost) return { source: 'Direct', medium: 'direct', campaign, referrerHost: null };

  for (const [re, name] of SEARCH) if (re.test(referrerHost)) return { source: name, medium: 'organic', campaign, referrerHost };
  for (const [re, name] of SOCIAL) if (re.test(referrerHost)) return { source: name, medium: 'social', campaign, referrerHost };
  if (MAIL.test(referrerHost)) return { source: 'Email', medium: 'email', campaign, referrerHost };
  return { source: referrerHost, medium: 'referral', campaign, referrerHost };
}

export function deviceFromUserAgent(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

export const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|vercel-screenshot/i;

/** Path to store: no query string or hash, at most 200 characters. */
export function cleanPath(path: string | null | undefined): string {
  const p = (path ?? '/').split(/[?#]/)[0] || '/';
  return (p.startsWith('/') ? p : `/${p}`).slice(0, 200);
}
