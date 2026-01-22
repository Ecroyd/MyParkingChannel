// Cloudflare Worker: Extract attachments from emails using postal-mime
// 
// Setup:
// 1. Install postal-mime: npm install postal-mime
// 2. Add to wrangler.toml or deploy via Dashboard
// 3. Set environment variables: INGEST_URL, INGEST_SECRET, FALLBACK_FORWARD_TO

import PostalMime from 'postal-mime';

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
        console.log("Forward failed:", err);
      }
    };

    try {
      const subject = message.headers.get("subject") || "";
      const messageId = message.headers.get("message-id") || "";
      const now = new Date().toUTCString();

      // Step 1: Read the full raw email
      const rawStream = message.raw;
      const arrayBuffer = await new Response(rawStream).arrayBuffer();
      
      // Step 2: Parse the email with postal-mime
      const parsed = await PostalMime.parse(arrayBuffer);

      // Step 3: Extract attachments
      const attachments = [];
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const att of parsed.attachments) {
          try {
            // Convert attachment content to base64
            const contentBase64 = btoa(
              String.fromCharCode(...new Uint8Array(att.content))
            );
            
            attachments.push({
              filename: att.filename || "unnamed",
              content_type: att.contentType || "application/octet-stream",
              size: att.content.length,
              data_base64: contentBase64,
            });
          } catch (err) {
            console.log("Failed to process attachment:", att.filename, err);
          }
        }
      }

      // Step 4: Create RFC822 representation (full email as base64)
      const rawEmailBase64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const payload = {
        to: message.to,
        from: message.from,
        subject: subject || parsed.subject || "",
        message_id: messageId,
        received_at: new Date().toISOString(),
        raw_rfc822_base64: rawEmailBase64,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      // Step 5: Send to your API
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
        attachments: attachments.length,
        emailSize: arrayBuffer.byteLength,
      });

      if (env.LOG_VERBOSE === "true") {
        console.log("INGEST_BODY", bodyText);
      }

      if (!res.ok) {
        console.log("API call failed, forwarding email");
        await safeForward();
      }
    } catch (err) {
      console.log("EMAIL_EVENT_ERROR", err?.message || String(err));
      await safeForward();
    }
  },
};
