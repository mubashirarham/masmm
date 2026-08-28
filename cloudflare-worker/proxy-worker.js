/**
 * Cloudflare Worker: SMM Provider API Relay Proxy
 * 
 * WHY USE THIS:
 * Cloudflare Workers run on Cloudflare's own internal global edge network IPs.
 * When a request to a Cloudflare-protected provider (like paksmmpanals.com) is made
 * from a Cloudflare Worker, Cloudflare NEVER triggers Bot Fight Mode or challenges the IP.
 * This guarantees 100% order delivery even if Netlify / AWS IPs are blocked.
 * 
 * Free Tier: 100,000 requests/day free on Cloudflare.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    try {
      const url = new URL(request.url);
      
      // Target endpoint can be specified via ?target= query parameter
      // Default: https://paksmmpanals.com/api/v2
      let targetUrl = url.searchParams.get("target") || "https://paksmmpanals.com/api/v2";
      
      // Normalize target URL
      if (!targetUrl.startsWith("http")) {
        targetUrl = "https://" + targetUrl;
      }
      targetUrl = targetUrl.replace(/paksmmpanels\.com/g, "paksmmpanals.com");

      const targetOrigin = new URL(targetUrl).origin;

      // Extract request body
      let bodyData = null;
      if (request.method === "POST" || request.method === "PUT") {
        bodyData = await request.text();
      }

      // Build clean stealth headers with target origin
      const proxyHeaders = {
        "Content-Type": request.headers.get("Content-Type") || "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": targetOrigin,
        "Referer": targetOrigin + "/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      };

      // Forward request to upstream provider from Cloudflare Edge IP
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: bodyData
      });

      const responseText = await upstreamResponse.text();

      // Return response with open CORS headers
      return new Response(responseText, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: `Relay proxy error: ${err.message}` }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};
