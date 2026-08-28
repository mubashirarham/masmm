const admin = require('firebase-admin');

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
            console.error(`[Cron Refill Sync] Proxy relay error:`, proxyErr.message);
        }
    }

    return lastHtmlError || {
        ok: false,
        isHtml: false,
        httpStatus: 0,
        error: 'Failed to obtain JSON response from provider'
    };
}

async function getProvidersMap() {
    const providersMap = new Map();
    try {
        const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
        providersSnap.forEach(doc => {
            const d = doc.data();
            if (d && d.url && d.apiKey) {
                providersMap.set(doc.id, {
                    url: normalizeProviderUrl(d.url),
                    apiKey: d.apiKey.trim(),
                    proxyUrl: d.proxyUrl ? d.proxyUrl.trim() : '',
                    status: d.status || 'Active',
                    name: d.name || doc.id
                });
            }
        });
    } catch (e) {
        console.warn("[Cron Refill Sync] Could not load providers collection:", e.message);
    }
    return providersMap;
}

function resolveProvider(providerId, providersMap) {
    if (providerId && providersMap.has(providerId)) {
        const p = providersMap.get(providerId);
        return { url: p.url, apiKey: p.apiKey, proxyUrl: p.proxyUrl || '' };
    }
    for (const [, p] of providersMap.entries()) {
        if (p.status === 'Active') {
            return { url: p.url, apiKey: p.apiKey, proxyUrl: p.proxyUrl || '' };
        }
    }
    return { url: DEFAULT_PROVIDER_URL, apiKey: DEFAULT_PROVIDER_KEY, proxyUrl: '' };
}

/**
 * Netlify Scheduled Cron: Runs Every 5 Minutes
 * Schedule: Every 5 Minutes (* / 5 * * * *)
 */
exports.handler = async (event, context) => {
    console.log("[Cron Refill Sync] Checking active refill requests...");

    try {
        const providersMap = await getProvidersMap();

        const refillSnap = await db.collectionGroup('refills')
            .where('status', 'in', ['Pending', 'In progress', 'Processing'])
            .limit(50)
            .get();

        if (refillSnap.empty) {
            console.log("[Cron Refill Sync] No pending refills.");
            return { statusCode: 200, body: JSON.stringify({ success: true, count: 0 }) };
        }

        for (const doc of refillSnap.docs) {
            const refill = doc.data();
            const provider = resolveProvider(refill.providerId, providersMap);
            
            // 1. If Refill not yet forwarded, forward to provider
            if (refill.status === 'Pending' && refill.externalOrderId && !refill.refillId) {
                try {
                    const result = await safeFetchJson(provider.url, {
                        key: provider.apiKey,
                        action: 'refill',
                        order: String(refill.externalOrderId)
                    }, { proxyUrl: provider.proxyUrl });

                    if (result.data && result.data.refill) {
                        await doc.ref.update({
                            refillId: String(result.data.refill),
                            status: 'In progress',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Cron Refill Sync] Refill initiated for order ${refill.orderId}. Refill ID: ${result.data.refill}`);
                    } else if (result.data && result.data.error) {
                        console.warn(`[Cron Refill Sync] Refill rejected for order ${refill.orderId}:`, result.data.error);
                    } else if (result.isHtml) {
                        console.warn(`[Cron Refill Sync] HTML response on refill forward for order ${refill.orderId}`);
                    }
                } catch(e) {
                    console.error(`[Cron Refill Sync] Forward error for refill ${doc.id}:`, e);
                }
            }

            // 2. If Refill has refillId, check its status
            if (refill.refillId) {
                try {
                    const result = await safeFetchJson(provider.url, {
                        key: provider.apiKey,
                        action: 'refill_status',
                        refill: String(refill.refillId)
                    }, { proxyUrl: provider.proxyUrl });

                    if (result.data && result.data.status) {
                        await doc.ref.update({
                            status: result.data.status,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Cron Refill Sync] Updated refill ${doc.id} status to ${result.data.status}`);
                    }
                } catch(e) {
                    console.error(`[Cron Refill Sync] Status error for refill ${doc.id}:`, e);
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify({ success: true, processed: refillSnap.size }) };
    } catch(err) {
        console.error("[Cron Refill Sync] Global Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};
