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
const LOW_BALANCE_THRESHOLD_USD = 15.0; // Alert if balance < $15

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

/**
 * Netlify Scheduled Cron: Runs Every 1 Hour
 * Schedule: 0 * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Provider Balance] Checking upstream API balance...");

    try {
        let apiUrl = DEFAULT_PROVIDER_URL;
        let apiKey = DEFAULT_PROVIDER_KEY;

        // Try to fetch active provider from Firestore
        try {
            const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
            if (!providersSnap.empty) {
                const activeDoc = providersSnap.docs.find(d => d.data()?.status === 'Active') || providersSnap.docs[0];
                if (activeDoc && activeDoc.data()?.url && activeDoc.data()?.apiKey) {
                    apiUrl = activeDoc.data().url;
                    apiKey = activeDoc.data().apiKey;
                }
            }
        } catch (e) {
            console.warn("[Cron Provider Balance] Could not load providers from DB:", e.message);
        }

        const result = await safeFetchJson(normalizeProviderUrl(apiUrl), {
            key: apiKey,
            action: 'balance'
        });

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
        console.warn(`[Cron Provider Balance] Provider balance check failed: ${errMsg}`);

        return { statusCode: 200, body: JSON.stringify({ success: false, error: errMsg }) };
    } catch(err) {
        console.error("[Cron Provider Balance] Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};
