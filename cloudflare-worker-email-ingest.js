// Cloudflare Email Worker → POST /api/ingest/email
//
// CRITICAL: Persist raw RFC822 to the app FIRST.
// Do not call postal-mime / encode attachments before the ingest POST —
// CDN import hangs and String.fromCharCode(...largeBuffer) stack overflows
// both drop mail with no row in ingest_emails (looks like "email never arrived").
//
// Env: INGEST_URL, INGEST_SECRET, optional FALLBACK_FORWARD_TO, LOG_VERBOSE

/** Safe base64 — never spread/apply a large Uint8Array (causes "Maximum call stack size exceeded"). */
function bytesToBase64(bytes) {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let chunk = "";
    for (let j = 0; j < slice.length; j++) {
      chunk += String.fromCharCode(slice[j]);
    }
    binary += chunk;
  }
  return btoa(binary);
}

export default {
  async fetch() {
    return new Response("ok", { status: 200 });
  },

  async email(message, env, ctx) {
    const safeForward = async () => {
      if (!env.FALLBACK_FORWARD_TO) return;
      try {
        await message.forward(env.FALLBACK_FORWARD_TO);
      } catch (err) {
        console.log("Forward failed:", err?.message || String(err));
      }
    };

    let arrayBuffer;
    try {
      const subject = message.headers.get("subject") || "";
      const messageId = message.headers.get("message-id") || "";
      arrayBuffer = await new Response(message.raw).arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      console.log("EMAIL_RECEIVED", {
        from: message.from,
        to: message.to,
        subject,
        rawSize: bytes.byteLength,
      });

      if (!env.INGEST_URL || !env.INGEST_SECRET) {
        console.log("EMAIL_EVENT_ERROR", {
          message: "Missing INGEST_URL or INGEST_SECRET on worker",
        });
        await safeForward();
        return;
      }

      // 1) Always POST raw email first (server parses MIME + attachments)
      const rawEmailBase64 = bytesToBase64(bytes);
      const payload = {
        to: message.to,
        from: message.from,
        subject,
        message_id: messageId,
        received_at: new Date().toISOString(),
        raw_rfc822_base64: rawEmailBase64,
      };

      console.log("SENDING_PAYLOAD", {
        rawEmailSize: rawEmailBase64.length,
        to: message.to,
      });

      const res = await fetch(env.INGEST_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ingest-secret": env.INGEST_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await res.text().catch(() => "");
      console.log("INGEST_RESULT", {
        status: res.status,
        emailSize: bytes.byteLength,
        bodyPreview: bodyText.slice(0, 300),
      });

      if (env.LOG_VERBOSE === "true") {
        console.log("INGEST_BODY", bodyText);
      }

      if (!res.ok) {
        console.log("API call failed, forwarding email", { status: res.status });
        await safeForward();
      }
    } catch (err) {
      console.log("EMAIL_EVENT_ERROR", {
        message: err?.message || String(err),
        stack: err?.stack,
        rawSize: arrayBuffer?.byteLength ?? null,
      });
      await safeForward();
    }
  },
};
