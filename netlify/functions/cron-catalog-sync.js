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
const DEFAULT_PROVIDER_URL = process.env.PROVIDER_URL || 'https://paksmmpanels.com/api/v2';
const DEFAULT_PROVIDER_KEY = process.env.PROVIDER_KEY || '46b597a2aeb6cf28362dadc92c67b8544df49f33';
const DEFAULT_FX_RATE = 275.81;
const MARKUP_MULTIPLIER = 1.50; // 50% commission

function getStealthHeaders(targetUrl) {
    try {
        const origin = new URL(targetUrl).origin;
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': origin,
            'Referer': origin + '/'
        };
    } catch (e) {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        };
    }
}

async function safeFetchJson(url, params) {
    const headers = getStealthHeaders(url);
    const body = new URLSearchParams(params);

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
        } catch (jsonErr) {
            const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 160);
            return {
                ok: false,
                isHtml: true,
                httpStatus: res.status,
                raw: rawText,
                error: `Provider returned non-JSON response (HTTP ${res.status}): ${preview}`
            };
        }

        return {
            ok: res.ok,
            isHtml: false,
            httpStatus: res.status,
            data: data
        };
    } catch (networkErr) {
        return {
            ok: false,
            isHtml: false,
            httpStatus: 0,
            error: `Network error: ${networkErr.message}`
        };
    }
}

/**
 * Netlify Scheduled Cron: Runs Every 4 Hours
 * Schedule: 0 *\/4 * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Catalog Sync] Checking upstream catalog updates...");

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
            console.warn("[Cron Catalog Sync] Could not load providers from DB:", e.message);
        }

        const result = await safeFetchJson(apiUrl, {
            key: apiKey,
            action: 'services'
        });

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
