export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    // Parse multipart form-data (Netlify provides event.body as base64 for file uploads)
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.includes("multipart/form-data")) {
      return { statusCode: 400, body: JSON.stringify({ error: "Expected multipart/form-data" }) };
    }

    // Use undici's FormData parser approach via a tiny manual boundary parse is messy.
    // So we handle "no-file" and "file" cases with a lightweight dependency-free parser:
    // We'll forward the raw multipart body directly to Telegram if proof file exists,
    // otherwise sendMessage.

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TARGET_CHAT_ID = process.env.TELEGRAM_TARGET_CHAT_ID; // could be a channel id like -100xxxx

    if (!BOT_TOKEN || !TARGET_CHAT_ID) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server config missing" }) };
    }

    const isBase64 = event.isBase64Encoded;
    const rawBody = isBase64 ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");

    // naive check if there's a file part (name="proof"; filename=)
    const bodyStrHead = rawBody.slice(0, 4000).toString("utf8");
    const hasFile = bodyStrHead.includes('name="proof"') && bodyStrHead.toLowerCase().includes("filename=");

    // Extract text fields safely (small helper)
    const getField = (name) => {
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) return "";
      const parts = rawBody.toString("utf8").split("--" + boundary);
      for (const p of parts) {
        if (p.includes(`name="${name}"`)) {
          const idx = p.indexOf("\r\n\r\n");
          if (idx >= 0) return p.slice(idx + 4).replace(/\r\n--$/,"").trim();
        }
      }
      return "";
    };

    const acc_name = getField("acc_name");
    const phone = getField("phone");
    const link = getField("link");

    const text =
`🧾 New Order (Wunna Kpay Wave Seller)
• Acc: ${acc_name}
• Phone: ${phone}
• Link: ${link}
• Payment: Kpay (09775767821 / Ma May Thet Oo)`;

    if (!hasFile) {
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: TARGET_CHAT_ID, text })
      });
      const out = await resp.json();
      if (!resp.ok) throw new Error(out?.description || "Telegram sendMessage failed");
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // If there is a file, forward multipart to Telegram sendPhoto with caption
    // Telegram expects fields: chat_id, caption, photo (file)
    // We'll rebuild a new multipart with same image bytes to be safe.
    const boundary = "----netlifytg" + Math.random().toString(16).slice(2);
    const chunks = [];

    const addField = (k, v) => {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    };

    addField("chat_id", TARGET_CHAT_ID);
    addField("caption", text);

    // Extract file bytes from incoming multipart (very basic; assumes single file)
    const ctBoundary = contentType.split("boundary=")[1];
    const partsBin = rawBody.toString("binary").split("--" + ctBoundary);
    let fileBuf = null;
    let filename = "proof.jpg";
    let mime = "image/jpeg";

    for (const pb of partsBin) {
      if (pb.includes('name="proof"') && pb.toLowerCase().includes("filename=")) {
        const headerEnd = pb.indexOf("\r\n\r\n");
        const header = pb.slice(0, headerEnd);
        const m1 = header.match(/filename="([^"]+)"/i);
        if (m1?.[1]) filename = m1[1];
        const m2 = header.match(/Content-Type:\s*([^\r\n]+)/i);
        if (m2?.[1]) mime = m2[1].trim();

        const bodyPart = pb.slice(headerEnd + 4);
        // remove trailing CRLF
        const trimmed = bodyPart.replace(/\r\n$/,"");
        fileBuf = Buffer.from(trimmed, "binary");
        break;
      }
    }

    if (!fileBuf) {
      // fallback: send text only
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: TARGET_CHAT_ID, text })
      });
      const out = await resp.json();
      if (!resp.ok) throw new Error(out?.description || "Telegram sendMessage failed");
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: "no file detected" }) };
    }

    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`));
    chunks.push(fileBuf);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(chunks),
    });

    const tgOut = await tgResp.json();
    if (!tgResp.ok) throw new Error(tgOut?.description || "Telegram sendPhoto failed");

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
};
