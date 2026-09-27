const VALID_KEYS = {
  "ABG-TEST-1234":       { tier: "TEST", expiry: "2026-12-31T23:59:59Z" },
  "ABG-PRO-2026-A1B2C3": { tier: "PRO",  expiry: "2026-12-31T23:59:59Z" },
  "ABG-VIP-2026-D4E5F6": { tier: "VIP",  expiry: "2026-12-31T23:59:59Z" }
};

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ========= LOGIN =========
    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const key = (body.key || "").trim().toUpperCase();
        const hwid = (body.hwid || "").trim();

        if (!key) return json({ status: false, msg: "Key kosong" }, corsHeaders);
        if (!hwid || hwid === "UNKNOWN") return json({ status: false, msg: "HWID tidak terbaca" }, corsHeaders);

        const keyData = VALID_KEYS[key];
        if (!keyData) return json({ status: false, msg: "Key tidak valid" }, corsHeaders);

        if (new Date() > new Date(keyData.expiry)) {
          return json({ status: false, msg: "Key sudah expired" }, corsHeaders);
        }

        const kvKey = "hwid:" + key;
        const existingHWID = await env.LICENSE_KV.get(kvKey);

        if (!existingHWID) {
          await env.LICENSE_KV.put(kvKey, hwid);
        } else if (existingHWID !== hwid) {
          return json({ status: false, msg: "Key sudah diikat ke device lain. Hubungi @ABGunnn." }, corsHeaders);
        }

        const token = btoa(key + ":" + hwid + ":" + Date.now());
        return json({
          status: true,
          msg: "Login berhasil",
          tier: keyData.tier,
          expiry: keyData.expiry,
          token: token
        }, corsHeaders);

      } catch (e) {
        return json({ status: false, msg: "Error: " + e.message }, corsHeaders);
      }
    }

    // ========= RESET HWID (admin) =========
    if (url.pathname === "/api/reset-hwid" && request.method === "POST") {
      try {
        const body = await request.json();
        const key = (body.key || "").trim().toUpperCase();
        const adminPass = (body.admin || "").trim();
        if (adminPass !== "ABG-ADMIN-2026") return json({ status: false, msg: "Unauthorized" }, corsHeaders);
        await env.LICENSE_KV.delete("hwid:" + key);
        return json({ status: true, msg: "HWID reset untuk " + key }, corsHeaders);
      } catch (e) {
        return json({ status: false, msg: "Error: " + e.message }, corsHeaders);
      }
    }

    return json({ status: false, msg: "Not found" }, corsHeaders);
  }
};

function json(data, headers) {
  return new Response(JSON.stringify(data), { headers: headers });
}
