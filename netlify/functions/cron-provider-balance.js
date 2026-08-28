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
const LOW_BALANCE_THRESHOLD_USD = 15.0; // Alert if balance < $15

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
                data = JSON.parse(rawText);
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
            console.error(`[Cron Provider Balance] Proxy relay error:`, proxyErr.message);
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
 * Netlify Scheduled Cron: Runs Every 1 Hour
 * Schedule: 0 * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Provider Balance] Checking upstream API balance...");

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
            console.warn("[Cron Provider Balance] Could not load providers from DB:", e.message);
        }

        const result = await safeFetchJson(apiUrl, {
            key: apiKey,
            action: 'balance'
        }, { proxyUrl });

        if (result.data && result.data.balance !== undefined) {
            const balanceUSD = parseFloat(result.data.balance) || 0;
            const currency = result.data.currency || 'USD';
            const isLowBalance = balanceUSD < LOW_BALANCE_THRESHOLD_USD;

            console.log(`[Cron Provider Balance] Current upstream balance: ${balanceUSD} ${currency}`);

            await db.collection('artifacts').doc(APP_ID).collection('system').doc('provider_balance').set({
                balance: balanceUSD,
                currency: currency,
                isLowBalance: isLowBalance,
                lastChecked: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return { 
                statusCode: 200, 
                body: JSON.stringify({ success: true, balance: balanceUSD, currency: currency, isLowBalance: isLowBalance }) 
            };
        }

        const errMsg = result.data?.error || result.error || 'Invalid response from provider';
        console.warn(`[Cron Provider Balance] Provider balance check warning: ${errMsg}`);

        return { statusCode: 200, body: JSON.stringify({ success: false, error: errMsg }) };
    } catch(err) {
        console.error("[Cron Provider Balance] Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};
