/**
 * Resolve tenant from sender/subject/raw email via EMAIL_TENANT_MAP env or fallback map.
 * Prefer tenant_inbound_inboxes (to_address) in the ingest pipeline when possible.
 */
function getEmailTenantMap(): Record<string, string> {
  if (process.env.EMAIL_TENANT_MAP) {
    try {
      return JSON.parse(process.env.EMAIL_TENANT_MAP);
    } catch (e) {
      console.error("[detect-tenant] Invalid EMAIL_TENANT_MAP JSON:", e);
    }
  }
  return {};
}

export function detectTenantFromEmail(email: {
  from_address?: string | null;
  subject?: string | null;
  raw_rfc822_base64?: string | null;
}): string | null {
  const map = getEmailTenantMap();

  if (email.from_address) {
    const fromLower = email.from_address.toLowerCase().trim();
    if (map[fromLower]) return map[fromLower];
    const domain = fromLower.split("@")[1];
    if (domain && map[domain]) return map[domain];
  }

  if (email.subject) {
    const subjectLower = email.subject.toLowerCase();
    if (
      subjectLower.includes("flyparks") ||
      subjectLower.includes("payment successful") ||
      subjectLower.includes("booking confirmation")
    ) {
      if (email.raw_rfc822_base64) {
        try {
          const rawEmail = Buffer.from(email.raw_rfc822_base64, "base64").toString("utf-8");
          const originalFromMatch = rawEmail.match(
            /^(?:X-Original-From|Reply-To|Return-Path):\s*([^\s<>]+@[^\s<>]+)/im
          );
          if (originalFromMatch) {
            const originalFrom = originalFromMatch[1].toLowerCase().trim();
            if (map[originalFrom]) return map[originalFrom];
            const originalDomain = originalFrom.split("@")[1];
            if (originalDomain && map[originalDomain]) return map[originalDomain];
          }
          const flyparksEmailPatterns = [
            /noreply@flyparks\.com/i,
            /bookings@flyparks\.com/i,
            /info@flyparks\.com/i,
            /info@flyparksexeter\.co\.uk/i,
            /@flyparks\./i,
          ];
          for (const pattern of flyparksEmailPatterns) {
            if (pattern.test(rawEmail)) {
              const flyparksTenant =
                map["info@flyparksexeter.co.uk"] ||
                map["noreply@flyparks.com"] ||
                Object.values(map)[0];
              if (flyparksTenant) return flyparksTenant;
            }
          }
        } catch (err) {
          console.error("[detect-tenant] raw email parse error:", err);
        }
      }
      if (map["info@flyparksexeter.co.uk"]) return map["info@flyparksexeter.co.uk"];
    }
  }

  return null;
}
