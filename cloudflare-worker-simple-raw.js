// Cloudflare Worker: Send full raw email (let server parse attachments)
// 
// This is the SIMPLEST version - just sends the full raw email
// Your server can parse it using a Node.js email parser

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
      
      // Read the FULL raw email
      const rawStream = message.raw;
      const arrayBuffer = await new Response(rawStream).arrayBuffer();
      
      console.log("EMAIL_RECEIVED", {
        from: message.from,
        to: message.to,
        subject: subject,
        rawSize: arrayBuffer.byteLength,
      });

      // Convert full email to base64
      const rawEmailBase64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const payload = {
        to: message.to,
        from: message.from,
        subject: subject,
        message_id: messageId,
        received_at: new Date().toISOString(),
        raw_rfc822_base64: rawEmailBase64,
        // No attachments here - server will parse them
      };

      console.log("SENDING_FULL_EMAIL", {
        rawEmailSize: rawEmailBase64.length,
        originalSize: arrayBuffer.byteLength,
      });

      // Send to your API
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
      console.log("EMAIL_EVENT_ERROR", {
        message: err?.message || String(err),
        stack: err?.stack,
      });
      await safeForward();
    }
  },
};
