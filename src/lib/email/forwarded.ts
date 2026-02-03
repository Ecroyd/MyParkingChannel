type ForwardExtractInput = {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
};

const FORWARD_SUBJECT_RE = /^\s*(fw|fwd)\s*:\s*/i;
const FLYPARKS_PAYMENT_SUBJECT_RE = /flyparks\s+payment\s+successful/i;

// Common markers used by Gmail/Outlook/clients when forwarding
const FORWARD_BODY_MARKERS = [
  "-------- Forwarded message --------",
  "---------- Forwarded message ----------",
  "Begin forwarded message:",
  "Forwarded message",
  "Original Message",
  "-----Original Message-----",
];

// Signature / footer / disclaimer markers (extend as needed)
const FOOTER_MARKERS = [
  "Sent from my iPhone",
  "Sent from my iPad",
  "Get Outlook for iOS",
  "This message (and any attachments)",
  "DISCLAIMER",
];

function normalize(s: string) {
  return s.replace(/\r\n/g, "\n");
}

function stripAfterFirstMarker(body: string, markers: string[]) {
  const lower = body.toLowerCase();
  let cutIndex = -1;

  for (const m of markers) {
    const idx = lower.indexOf(m.toLowerCase());
    if (idx !== -1) {
      cutIndex = cutIndex === -1 ? idx : Math.min(cutIndex, idx);
    }
  }

  return cutIndex === -1 ? body : body.slice(0, cutIndex);
}

/**
 * Attempt to extract the "forwarded content" region.
 * Strategy:
 *  1) If known forward marker exists: take content AFTER that marker.
 *  2) Else if we see typical forwarded headers: start at the first "From:" line.
 *  3) Else: return original body.
 */
function extractForwardedRegion(textBody: string) {
  const body = normalize(textBody);

  // (1) Marker-based
  for (const marker of FORWARD_BODY_MARKERS) {
    const idx = body.toLowerCase().indexOf(marker.toLowerCase());
    if (idx !== -1) {
      return body.slice(idx + marker.length).trim();
    }
  }

  // (2) Header-based
  // Many forwards include something like:
  // From:
  // Date:
  // Subject:
  // To:
  const lines = body.split("\n");
  const fromIdx = lines.findIndex((l) => /^from:\s*/i.test(l.trim()));
  if (fromIdx !== -1) return lines.slice(fromIdx).join("\n").trim();

  return body;
}

/**
 * Tries to remove signature/QR blocks even if they appear in the forwarded wrapper.
 * We remove common footers and also aggressively drop blocks that look like signature separators.
 */
function stripSignatureAndNoise(body: string) {
  let out = normalize(body);

  // Remove everything after known footer markers
  out = stripAfterFirstMarker(out, FOOTER_MARKERS);

  // Remove common signature separators
  // "-- " is a standard signature delimiter, also lots of clients use "—" lines
  out = out.split("\n-- \n")[0];
  out = out.split("\n--\n")[0];

  // Remove large runs of "image placeholder" style lines sometimes produced by HTML->text conversion
  // e.g. "[image: image001.png]" or "image001.png"
  out = out.replace(/^\s*\[image:.*\]\s*$/gim, "");
  out = out.replace(/^\s*image\d+\.(png|jpg|jpeg|gif)\s*$/gim, "");

  return out.trim();
}

export function getParsableBodyForDirectBooking(input: ForwardExtractInput) {
  const subject = input.subject ?? "";
  const rawText = input.text ?? "";

  // Only apply forward-extraction for the specific flow you described
  const isForward = FORWARD_SUBJECT_RE.test(subject);
  const isFlyparksPayment = FLYPARKS_PAYMENT_SUBJECT_RE.test(subject);

  if (!isForward || !isFlyparksPayment) {
    // still strip obvious noise
    return stripSignatureAndNoise(rawText);
  }

  const forwarded = extractForwardedRegion(rawText);
  return stripSignatureAndNoise(forwarded);
}
