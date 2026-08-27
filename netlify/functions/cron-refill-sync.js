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

function normalizeProviderUrl(url) {
    if (!url) return DEFAULT_PROVIDER_URL;
    if (url.includes('paksmmpanels.com')) {
        return url.replace(/paksmmpanels\.com/g, 'paksmmpanals.com');
    }
    return url;
}

/**
 * Safely send a POST request and parse JSON without crashing on HTML/Cloudflare responses.
 * Tries standard SMM API headers with automatic fallback.
 */
async function safeFetchJson(url, params) {
    const headerVariants = [
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SmartPanel/2.0 (compatible; SMM-API/1.0)',
            'Accept': 'application/json, text/plain, */*'
        },
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'curl/7.88.1',
            'Accept': '*/*'
        },
        {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    ];

    const body = new URLSearchParams(params);

    for (let i = 0; i < headerVariants.length; i++) {
        const headers = headerVariants[i];
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body
            });

            const rawText = await res.text();
            let data = null;

            try {
                data = JSON.parse(rawText);
                return {
                    ok: res.ok,
                    isHtml: false,
                    httpStatus: res.status,
                    data: data
                };
            } catch (jsonErr) {
                if (i === headerVariants.length - 1) {
                    const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 160);
                    return {
                        ok: false,
                        isHtml: true,
                        httpStatus: res.status,
                        raw: rawText,
                        error: `Provider returned non-JSON response (HTTP ${res.status}): ${preview}`
                    };
                }
            }
        } catch (networkErr) {
            if (i === headerVariants.length - 1) {
                return {
                    ok: false,
                    isHtml: false,
                    httpStatus: 0,
                    error: `Network error: ${networkErr.message}`
                };
            }
        }
    }
}

async function getProvidersMap() {
    const providersMap = new Map();
    try {
        const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
        providersSnap.forEach(doc => {
            const d = doc.data();
            if (d && d.url && d.apiKey) {
                providersMap.set(doc.id, {
                    url: d.url,
                    apiKey: d.apiKey,
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
        return { url: normalizeProviderUrl(p.url), apiKey: p.apiKey };
    }
    for (const [, p] of providersMap.entries()) {
        if (p.status === 'Active') {
            return { url: normalizeProviderUrl(p.url), apiKey: p.apiKey };
        }
    }
    return { url: DEFAULT_PROVIDER_URL, apiKey: DEFAULT_PROVIDER_KEY };
}

/**
 * Netlify Scheduled Cron: Runs Every 5 Minutes
 * Schedule: *\/5 * * * *
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
                    });

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
                    });

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
