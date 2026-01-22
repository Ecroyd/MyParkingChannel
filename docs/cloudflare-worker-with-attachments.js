// Cloudflare Worker: Extract attachments from emails
// Replace your current Worker code with this version

export default {
  async fetch() {
    return new Response("ok", { status: 200 });
  },

  async email(message, env, ctx) {
    const safeForward = async () => {
      if (!env.FALLBACK_FORWARD_TO) return;
      try { 
        await message.forward(env.FALLBACK_FORWARD_TO); 
      } catch (_) {}
    };

    try {
      const subject = message.headers.get("subject") || "";
      const messageId = message.headers.get("message-id") || "";
      const now = new Date().toUTCString();

      // Get the full raw email (if available)
      // Note: Cloudflare Email Routing may not provide full raw email
      // You may need to use message.raw or message.stream
      let rawEmail = "";
      let attachments = [];

      try {
        // Try to get full raw email
        // Method 1: If message.raw exists
        if (message.raw) {
          rawEmail = await message.raw.text();
        }
        // Method 2: If message.stream exists
        else if (message.stream) {
          const chunks = [];
          const reader = message.stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          rawEmail = new TextDecoder().decode(new Uint8Array(chunks.flat()));
        }
        // Method 3: Fallback to minimal stub
        else {
          rawEmail = 
            `From: ${message.from}\r\n` +
            `To: ${message.to}\r\n` +
            `Subject: ${subject}\r\n` +
            `Date: ${now}\r\n` +
            `Message-ID: ${messageId}\r\n` +
            `\r\n` +
            `Ingested by Cloudflare Worker (v1 with attachment extraction).\r\n`;
        }
      } catch (err) {
        console.log("Failed to get raw email:", err);
        // Fallback to stub
        rawEmail = 
          `From: ${message.from}\r\n` +
          `To: ${message.to}\r\n` +
          `Subject: ${subject}\r\n` +
          `Date: ${now}\r\n` +
          `Message-ID: ${messageId}\r\n` +
          `\r\n` +
          `Ingested by Cloudflare Worker (fallback stub).\r\n`;
      }

      // Extract attachments if available
      // Note: Cloudflare Email Routing API may not expose attachments directly
      // You may need to parse the raw email to extract attachments
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          try {
            const content = await attachment.arrayBuffer();
            attachments.push({
              filename: attachment.filename || "unknown",
              content_type: attachment.contentType || "application/octet-stream",
              size: content.byteLength,
              data_base64: btoa(String.fromCharCode(...new Uint8Array(content))),
            });
          } catch (err) {
            console.log("Failed to process attachment:", err);
          }
        }
      }

      const payload = {
        to: message.to,
        from: message.from,
        subject,
        message_id: messageId,
        received_at: new Date().toISOString(),
        raw_rfc822_base64: btoa(rawEmail),
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const res = await fetch(env.INGEST_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ingest-secret": env.INGEST_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await res.text().catch(() => "");

      console.log("INGEST_RESULT", res.status);

      if (env.LOG_VERBOSE === "true") {
        console.log("INGEST_BODY", bodyText);
      }

      if (!res.ok) {
        await safeForward();
      }
    } catch (err) {
      console.log("EMAIL_EVENT_ERROR", err?.message || String(err));
      await safeForward();
    }
  },
};
