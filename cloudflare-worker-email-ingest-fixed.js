// Cloudflare Worker: Extract attachments from emails
// 
// This version works around postal-mime import issues by using a CDN import
// or manual MIME parsing fallback

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
      
      // Step 1: Read the full raw email
      const rawStream = message.raw;
      const arrayBuffer = await new Response(rawStream).arrayBuffer();
      
      console.log("EMAIL_RECEIVED", {
        from: message.from,
        to: message.to,
        subject: subject,
        rawSize: arrayBuffer.byteLength,
      });

      // Step 2: Try to parse with postal-mime (if available)
      let parsed = null;
      let attachments = [];
      
      try {
        // Try dynamic import from CDN (works in Workers)
        const PostalMime = await import('https://cdn.jsdelivr.net/npm/postal-mime@3.0.0/+esm');
        parsed = await PostalMime.default.parse(arrayBuffer);
        
        console.log("PARSED_EMAIL", {
          hasAttachments: parsed.attachments?.length > 0,
          attachmentCount: parsed.attachments?.length || 0,
        });

        // Step 3: Extract attachments
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
              
              console.log("ATTACHMENT_EXTRACTED", {
                filename: att.filename,
                size: att.content.length,
                contentType: att.contentType,
              });
            } catch (err) {
              console.log("Failed to process attachment:", att.filename, err);
            }
          }
        }
      } catch (parseErr) {
        console.log("POSTAL_MIME_PARSE_ERROR", parseErr.message);
        // Fallback: send full raw email, let server parse it
        console.log("Falling back to full raw email (server will parse)");
      }

      // Step 4: Create RFC822 representation (full email as base64)
      const rawEmailBase64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const payload = {
        to: message.to,
        from: message.from,
        subject: subject || (parsed?.subject) || "",
        message_id: messageId,
        received_at: new Date().toISOString(),
        raw_rfc822_base64: rawEmailBase64,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      console.log("SENDING_PAYLOAD", {
        attachmentsCount: attachments.length,
        rawEmailSize: rawEmailBase64.length,
      });

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
      console.log("EMAIL_EVENT_ERROR", {
        message: err?.message || String(err),
        stack: err?.stack,
      });
      await safeForward();
    }
  },
};
