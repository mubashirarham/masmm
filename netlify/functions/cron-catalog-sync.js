const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function getServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    try {
        if (raw.startsWith('{')) return JSON.parse(raw);
        return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (e) {
        try { return JSON.parse(raw); } catch (e2) { return null; }
    }
}

if (!admin.apps.length) {
    const sa = getServiceAccount();
    if (sa) {
        admin.initializeApp({ credential: admin.credential.cert(sa) });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';
const DEFAULT_PROVIDER_URL = process.env.PROVIDER_URL || 'https://paksmmpanals.com/api/v2';
const DEFAULT_PROVIDER_KEY = process.env.PROVIDER_KEY || '46b597a2aeb6cf28362dadc92c67b8544df49f33';
const GLOBAL_PROXY_RELAY = process.env.PROXY_RELAY_URL || 'https://pak-proxy.mubashirarham12.workers.dev/';
const DEFAULT_FX_RATE = 275.81;
const MARKUP_MULTIPLIER = 1.50; // 50% commission

function normalizeProviderUrl(url) {
    if (!url) return DEFAULT_PROVIDER_URL;
    let clean = url.trim();
    if (clean.startsWith('http://')) {
        clean = 'https://' + clean.slice(7);
    } else if (!clean.startsWith('https://')) {
        clean = 'https://' + clean;
    }
    clean = clean.replace(/paksmmpanels\.com/g, 'paksmmpanals.com');
    clean = clean.replace(/\/+$/, '');
    if (!clean.includes('/api/')) {
        clean = clean + '/api/v2';
    }
    return clean;
}

function buildStealthHeaders(apiUrl, variantIndex = 0) {
    let origin = 'https://paksmmpanals.com';
    try {
        const u = new URL(apiUrl);
        origin = u.origin;
    } catch (e) {}

    if (variantIndex === 0) {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': origin,
            'Referer': origin + '/',
            'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'no-cache'
        };
    } else if (variantIndex === 1) {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Origin': origin,
            'Referer': origin + '/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        };
    } else {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': origin,
            'Referer': origin + '/'
        };
    }
}

async function safeFetchJson(url, params, options = {}) {
    const normalizedUrl = normalizeProviderUrl(url);
    const body = new URLSearchParams(params);
    const proxyRelayUrl = (options.proxyUrl || GLOBAL_PROXY_RELAY || '').trim();
    const variantsCount = 3;
    let lastHtmlError = null;

    for (let i = 0; i < variantsCount; i++) {
        const headers = buildStealthHeaders(normalizedUrl, i);
        try {
            const res = await fetch(normalizedUrl, {
                method: 'POST',
                headers: headers,
                body: body
            });

            const rawText = await res.text();
            try {
                const data = JSON.parse(rawText);
                return {
                    ok: res.ok,
                    isHtml: false,
                    httpStatus: res.status,
                    data: data
                };
            } catch (jsonErr) {
                lastHtmlError = {
                    ok: false,
                    isHtml: true,
                    httpStatus: res.status,
                    raw: rawText,
                    error: `Provider returned non-JSON response (HTTP ${res.status}): ${rawText.replace(/\s+/g, ' ').trim().slice(0, 160)}`
                };
            }
        } catch (networkErr) {
            if (i === variantsCount - 1 && !proxyRelayUrl) {
                return {
                    ok: false,
                    isHtml: false,
                    httpStatus: 0,
                    error: `Network error: ${networkErr.message}`
                };
            }
        }
    }

    // Proxy Relay Fallback
    if (proxyRelayUrl && lastHtmlError) {
        try {
            const separator = proxyRelayUrl.includes('?') ? '&' : '?';
            const relayEndpoint = `${proxyRelayUrl}${separator}target=${encodeURIComponent(normalizedUrl)}`;

            const res = await fetch(relayEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                body: body
            });

            const rawText = await res.text();
            try {
                const data = JSON.parse(rawText);
                return {
                    ok: res.ok,
                    isHtml: false,
                    httpStatus: res.status,
                    data: data,
                    viaProxy: true
                };
            } catch (jsonErr) {
                return {
                    ok: false,
                    isHtml: true,
                    httpStatus: res.status,
                    raw: rawText,
                    error: `Proxy relay returned non-JSON response (HTTP ${res.status}): ${rawText.replace(/\s+/g, ' ').trim().slice(0, 160)}`
                };
            }
        } catch (proxyErr) {
            console.error(`[Cron Catalog Sync] Proxy relay error:`, proxyErr.message);
        }
    }

    return lastHtmlError || {
        ok: false,
        isHtml: false,
        httpStatus: 0,
        error: 'Failed to obtain JSON response from provider'
    };
}

/**
 * Netlify Scheduled Cron: Runs Every 4 Hours
 * Schedule: 0 Every 4 Hours (0 * / 4 * * *)
 */
exports.handler = async (event, context) => {
    console.log("[Cron Catalog Sync] Checking upstream catalog updates...");

    try {
        let apiUrl = DEFAULT_PROVIDER_URL;
        let apiKey = DEFAULT_PROVIDER_KEY;
        let proxyUrl = '';

        // Try to fetch active provider from Firestore
        try {
            const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
            if (!providersSnap.empty) {
                const activeDoc = providersSnap.docs.find(d => d.data()?.status === 'Active') || providersSnap.docs[0];
                if (activeDoc && activeDoc.data()?.url && activeDoc.data()?.apiKey) {
                    apiUrl = activeDoc.data().url;
                    apiKey = activeDoc.data().apiKey.trim();
                    proxyUrl = activeDoc.data().proxyUrl || '';
                }
            }
        } catch (e) {
            console.warn("[Cron Catalog Sync] Could not load providers from DB:", e.message);
        }

        const result = await safeFetchJson(apiUrl, {
            key: apiKey,
            action: 'services'
        }, { proxyUrl });

        const upstreamServices = result.data;

        if (!Array.isArray(upstreamServices) || upstreamServices.length === 0) {
            const reason = result.isHtml ? "Provider returned Cloudflare/HTML response" : (upstreamServices?.error || result.error || "Empty upstream list");
            console.warn("[Cron Catalog Sync] Upstream services returned empty or invalid:", reason);
            return { statusCode: 200, body: JSON.stringify({ success: false, reason }) };
        }

        console.log(`[Cron Catalog Sync] Fetched ${upstreamServices.length} services from provider.`);

        // Fetch system settings for exchange rate if configured
        let fxRate = DEFAULT_FX_RATE;
        try {
            const settingsDoc = await db.collection('artifacts').doc(APP_ID).collection('settings').doc('general').get();
            if (settingsDoc.exists && settingsDoc.data().exchangeRateToPKR) {
                fxRate = parseFloat(settingsDoc.data().exchangeRateToPKR);
            }
        } catch(e) {}

        const mappedCatalog = upstreamServices.map(s => {
            const usdRate = parseFloat(s.rate) || 0;
            const pkrRate = (usdRate * fxRate * MARKUP_MULTIPLIER).toFixed(4);

            return {
                service: parseInt(s.service) || s.service,
                name: s.name,
                category: s.category || 'Other Services',
                type: s.type || 'Default',
                rate: parseFloat(s.rate),
                pkrRate: parseFloat(pkrRate),
                min: parseInt(s.min) || 1,
                max: parseInt(s.max) || 10000000,
                refill: !!s.refill || s.refill === '1',
                cancel: !!s.cancel || s.cancel === '1',
                average_time: s.average_time != null ? s.average_time : null,
                description: s.description || s.desc || ''
            };
        });

        // Update Snapshot Cache file if filesystem writable
        try {
            const candidatePaths = [
                path.resolve(__dirname, '../../assets/data/paksmmpanels_services.json'),
                path.resolve(process.cwd(), 'assets/data/paksmmpanels_services.json')
            ];
            const targetPath = candidatePaths.find(p => fs.existsSync(path.dirname(p)));
            if (targetPath) {
                fs.writeFileSync(targetPath, JSON.stringify({
                    lastSync: new Date().toISOString(),
                    exchangeRateToPKR: fxRate,
                    markupMultiplier: MARKUP_MULTIPLIER,
                    currency: 'PKR',
                    total: mappedCatalog.length,
                    services: mappedCatalog
                }, null, 2), 'utf8');
                console.log("[Cron Catalog Sync] Updated snapshot file.");
            }
        } catch(e) {
            console.warn("[Cron Catalog Sync] Snapshot file write bypassed (serverless environment):", e.message);
        }

        // Record Last Sync Log in Firestore
        await db.collection('artifacts').doc(APP_ID).collection('system').doc('catalog_sync').set({
            lastSync: admin.firestore.FieldValue.serverTimestamp(),
            totalServices: mappedCatalog.length,
            fxRate: fxRate,
            markup: MARKUP_MULTIPLIER
        }, { merge: true });

        return { statusCode: 200, body: JSON.stringify({ success: true, count: mappedCatalog.length }) };
    } catch (err) {
        console.error("[Cron Catalog Sync] Global Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};
