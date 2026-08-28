# Cloudflare Worker Relay Proxy Setup (1-Minute Guide)

If Cloudflare on your upstream SMM provider (`paksmmpanals.com`) enables "Under Attack Mode" or "Super Bot Fight Mode" that blocks AWS/Netlify datacenter IPs with an HTTP 403 challenge, deploy this **free Cloudflare Worker** (100,000 free requests/day).

Because Cloudflare Workers execute on Cloudflare's own internal edge network IPs, Cloudflare **never blocks or challenges requests originating from Cloudflare Workers**.

---

## 🚀 How to Deploy (Takes 1 Minute)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and log in (or create a free account).
2. On the left sidebar, click **Workers & Pages** → **Create application** → **Create Worker**.
3. Name your worker (e.g. `smm-relay`) and click **Deploy**.
4. Click **Edit Code**, delete the sample code, and paste the entire contents of [`proxy-worker.js`](file:///d:/projects/masmm/cloudflare-worker/proxy-worker.js).
5. Click **Save and deploy**.
6. Copy your Worker URL (e.g., `https://smm-relay.<your-subdomain>.workers.dev`).

---

## 🔗 How to Connect it to Your Panel

Choose either of the two easy options:

### Option A: Global Environment Variable in Netlify (Recommended)
1. Go to your **Netlify Dashboard** → **Site Configuration** → **Environment variables**.
2. Add a new variable:
   - Key: `PROXY_RELAY_URL`
   - Value: `https://smm-relay.<your-subdomain>.workers.dev`
3. Trigger a redeploy (or save).

### Option B: Directly in Your Admin Portal
1. Open your panel's **Admin Dashboard** → **API Providers**.
2. Edit your provider (e.g., PakSMMPanels).
3. Paste your Worker URL in the **Proxy Relay URL** field and save!

---

## How It Works
- The system first attempts direct ultra-stealth requests.
- If Cloudflare blocks the Netlify IP (HTTP 403 challenge), the system **automatically and instantly retries via your Cloudflare Worker Relay**, delivering the order seamlessly.
