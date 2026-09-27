// ============================================================
// ABG License Manager — Cloudflare Worker
// Telegram: @ABGunnn
// ============================================================

const ADMIN_PASS = "ABG-ADMIN-2026";  // ⚠️ GANTI PASSWORD INI

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ═══════════════ LOGIN ═══════════════
      if (path === "/api/login" && request.method === "POST") {
        return await handleLogin(request, env, corsHeaders);
      }

      // ═══════════════ ADMIN ENDPOINTS ═══════════════
      if (path === "/api/create-key" && request.method === "POST") {
        return await handleCreateKey(request, env, corsHeaders);
      }

      if (path === "/api/list-keys" && request.method === "POST") {
        return await handleListKeys(request, env, corsHeaders);
      }

      if (path === "/api/reset-hwid" && request.method === "POST") {
        return await handleResetHwid(request, env, corsHeaders);
      }

      if (path === "/api/delete-key" && request.method === "POST") {
        return await handleDeleteKey(request, env, corsHeaders);
      }

      if (path === "/api/stats" && request.method === "POST") {
        return await handleStats(request, env, corsHeaders);
      }

      return json({ status: false, msg: "Not found" }, corsHeaders);

    } catch (e) {
      return json({ status: false, msg: "Server error: " + e.message }, corsHeaders);
    }
  }
};

// ═══════════════════════════════════════════════════════════
// LOGIN — Validasi key + HWID lock
// ═══════════════════════════════════════════════════════════
async function handleLogin(request, env, corsHeaders) {
  const body = await request.json();
  const key = (body.key || "").trim();           // ★ case-sensitive
  const hwid = (body.hwid || "").trim();

  if (!key) return json({ status: false, msg: "Key kosong" }, corsHeaders);
  if (!hwid || hwid === "UNKNOWN") return json({ status: false, msg: "HWID tidak terbaca" }, corsHeaders);

  const keyDataRaw = await env.LICENSE_KV.get("key:" + key);
  if (!keyDataRaw) return json({ status: false, msg: "Key tidak valid" }, corsHeaders);

  const keyData = JSON.parse(keyDataRaw);

  // Cek expiry
  if (new Date() > new Date(keyData.expiry)) {
    return json({ status: false, msg: "Key sudah expired" }, corsHeaders);
  }

  // HWID list
  const hwidList = keyData.hwids || [];
  const maxDevice = keyData.maxDevice || 1;

  // HWID udah terdaftar → login
  if (hwidList.includes(hwid)) {
    return json({
      status: true,
      msg: "Login berhasil",
      tier: keyData.tier,
      expiry: keyData.expiry,
      maxDevice: maxDevice,
      usedDevice: hwidList.length,
      token: btoa(key + ":" + hwid + ":" + Date.now())
    }, corsHeaders);
  }

  // Slot penuh
  if (hwidList.length >= maxDevice) {
    return json({
      status: false,
      msg: "Key sudah penuh (" + hwidList.length + "/" + maxDevice + " device). Hubungi @ABGunnn."
    }, corsHeaders);
  }

  // Daftarkan HWID baru
  hwidList.push(hwid);
  keyData.hwids = hwidList;
  await env.LICENSE_KV.put("key:" + key, JSON.stringify(keyData));

  return json({
    status: true,
    msg: "Login berhasil",
    tier: keyData.tier,
    expiry: keyData.expiry,
    maxDevice: maxDevice,
    usedDevice: hwidList.length,
    token: btoa(key + ":" + hwid + ":" + Date.now())
  }, corsHeaders);
}

// ═══════════════════════════════════════════════════════════
// CREATE KEY — Support custom key
// ═══════════════════════════════════════════════════════════
async function handleCreateKey(request, env, corsHeaders) {
  const body = await request.json();
  const admin = (body.admin || "").trim();

  if (admin !== ADMIN_PASS) {
    return json({ status: false, msg: "Unauthorized" }, corsHeaders);
  }

  const tier = (body.tier || "PRO").toUpperCase();
  const days = parseInt(body.days) || 30;
  const maxDevice = parseInt(body.maxDevice) || 1;

  // ★ CUSTOM KEY — case-sensitive, apa adanya
  let customKey = (body.key || "").trim();

  if (customKey) {
    if (customKey.length < 3) {
      return json({ status: false, msg: "Custom key minimal 3 karakter" }, corsHeaders);
    }
    if (customKey.length > 64) {
      return json({ status: false, msg: "Custom key maksimal 64 karakter" }, corsHeaders);
    }
    // Hanya huruf, angka, dash, underscore, dot
    if (!/^[A-Za-z0-9_\-\.]+$/.test(customKey)) {
      return json({
        status: false,
        msg: "Custom key hanya boleh: huruf, angka, _ - ."
      }, corsHeaders);
    }
  }

  const key = customKey || generateKey(tier);

  // Cek duplikat
  const existing = await env.LICENSE_KV.get("key:" + key);
  if (existing) {
    return json({ status: false, msg: "Key '" + key + "' sudah ada" }, corsHeaders);
  }

  const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const keyData = {
    key: key,
    tier: tier,
    expiry: expiry,
    maxDevice: maxDevice,
    hwids: [],
    createdAt: new Date().toISOString(),
    isCustom: customKey ? true : false
  };

  await env.LICENSE_KV.put("key:" + key, JSON.stringify(keyData));

  return json({
    status: true,
    msg: "Key berhasil dibuat",
    key: key,
    tier: tier,
    expiry: expiry,
    maxDevice: maxDevice,
    isCustom: keyData.isCustom
  }, corsHeaders);
}

// ═══════════════════════════════════════════════════════════
// LIST KEYS
// ═══════════════════════════════════════════════════════════
async function handleListKeys(request, env, corsHeaders) {
  const body = await request.json();
  const admin = (body.admin || "").trim();

  if (admin !== ADMIN_PASS) {
    return json({ status: false, msg: "Unauthorized" }, corsHeaders);
  }

  const list = await env.LICENSE_KV.list({ prefix: "key:" });
  const keys = [];

  for (const k of list.keys) {
    const dataRaw = await env.LICENSE_KV.get(k.name);
    if (dataRaw) {
      try {
        const data = JSON.parse(dataRaw);
        const hwids = data.hwids || [];
        keys.push({
          key: data.key,
          tier: data.tier,
          expiry: data.expiry,
          maxDevice: data.maxDevice || 1,
          usedDevice: hwids.length,
          hwids: hwids,
          isCustom: data.isCustom || false,
          createdAt: data.createdAt
        });
      } catch (e) {}
    }
  }

  // Sort by created date (terbaru dulu)
  keys.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return json({
    status: true,
    count: keys.length,
    keys: keys
  }, corsHeaders);
}

// ═══════════════════════════════════════════════════════════
// RESET HWID
// ═══════════════════════════════════════════════════════════
async function handleResetHwid(request, env, corsHeaders) {
  const body = await request.json();
  const admin = (body.admin || "").trim();
  const key = (body.key || "").trim();
  const hwid = (body.hwid || "").trim();

  if (admin !== ADMIN_PASS) {
    return json({ status: false, msg: "Unauthorized" }, corsHeaders);
  }

  if (!key) {
    return json({ status: false, msg: "Key kosong" }, corsHeaders);
  }

  const keyDataRaw = await env.LICENSE_KV.get("key:" + key);
  if (!keyDataRaw) {
    return json({ status: false, msg: "Key tidak ditemukan" }, corsHeaders);
  }

  const keyData = JSON.parse(keyDataRaw);

  if (hwid) {
    // Reset 1 HWID spesifik
    const idx = (keyData.hwids || []).indexOf(hwid);
    if (idx > -1) {
      keyData.hwids.splice(idx, 1);
    }
    await env.LICENSE_KV.put("key:" + key, JSON.stringify(keyData));
    return json({
      status: true,
      msg: "HWID direset",
      remaining: keyData.hwids.length
    }, corsHeaders);
  } else {
    // Reset semua HWID
    keyData.hwids = [];
    await env.LICENSE_KV.put("key:" + key, JSON.stringify(keyData));
    return json({
      status: true,
      msg: "Semua HWID direset untuk " + key,
      remaining: 0
    }, corsHeaders);
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE KEY
// ═══════════════════════════════════════════════════════════
async function handleDeleteKey(request, env, corsHeaders) {
  const body = await request.json();
  const admin = (body.admin || "").trim();
  const key = (body.key || "").trim();

  if (admin !== ADMIN_PASS) {
    return json({ status: false, msg: "Unauthorized" }, corsHeaders);
  }

  if (!key) {
    return json({ status: false, msg: "Key kosong" }, corsHeaders);
  }

  await env.LICENSE_KV.delete("key:" + key);

  return json({
    status: true,
    msg: "Key '" + key + "' dihapus"
  }, corsHeaders);
}

// ═══════════════════════════════════════════════════════════
// STATS — Statistik key
// ═══════════════════════════════════════════════════════════
async function handleStats(request, env, corsHeaders) {
  const body = await request.json();
  const admin = (body.admin || "").trim();

  if (admin !== ADMIN_PASS) {
    return json({ status: false, msg: "Unauthorized" }, corsHeaders);
  }

  const list = await env.LICENSE_KV.list({ prefix: "key:" });
  let totalKeys = 0;
  let activeKeys = 0;
  let expiredKeys = 0;
  let fullKeys = 0;
  let totalHwids = 0;

  const now = new Date();

  for (const k of list.keys) {
    const dataRaw = await env.LICENSE_KV.get(k.name);
    if (dataRaw) {
      try {
        const data = JSON.parse(dataRaw);
        totalKeys++;
        const hwids = data.hwids || [];
        totalHwids += hwids.length;

        if (new Date(data.expiry) < now) {
          expiredKeys++;
        } else if (hwids.length >= (data.maxDevice || 1)) {
          fullKeys++;
        } else {
          activeKeys++;
        }
      } catch (e) {}
    }
  }

  return json({
    status: true,
    stats: {
      totalKeys: totalKeys,
      activeKeys: activeKeys,
      expiredKeys: expiredKeys,
      fullKeys: fullKeys,
      totalHwids: totalHwids
    }
  }, corsHeaders);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function json(data, headers) {
  return new Response(JSON.stringify(data), { headers: headers });
}

function generateKey(tier) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = [];
  for (let s = 0; s < 3; s++) {
    let seg = "";
    for (let i = 0; i < 4; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return "ABG-" + tier + "-" + segments.join("-");
}
