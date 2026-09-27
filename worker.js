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

    // Test route
    if (url.pathname === "/test") {
      return new Response(JSON.stringify({
        status: true,
        msg: "Worker active",
        hasKV: env.LICENSE_KV ? true : false
      }), { headers: corsHeaders });
    }

    // Login route
    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const key = (body.key || "").trim().toUpperCase();
        const hwid = (body.hwid || "").trim();

        return new Response(JSON.stringify({
          status: true,
          msg: "Debug OK - Worker running",
          key: key,
          hwid: hwid,
          hasKV: env.LICENSE_KV ? true : false
        }), { headers: corsHeaders });

      } catch (e) {
        return new Response(JSON.stringify({
          status: false,
          msg: "Error: " + e.message
        }), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ status: false, msg: "Not found" }), { headers: corsHeaders });
  }
};
