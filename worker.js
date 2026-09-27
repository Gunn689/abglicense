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

    // DEBUG: return info apapun yang masuk
    return new Response(JSON.stringify({
      status: true,
      msg: "Debug Info",
      method: request.method,
      pathname: url.pathname,
      full_url: url.href,
      hasKV: env.LICENSE_KV ? true : false,
      matches_api_login: url.pathname === "/api/login",
      matches_post: request.method === "POST"
    }), { headers: corsHeaders });
  }
};
