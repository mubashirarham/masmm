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
const PROVIDER_URL = 'https://paksmmpanels.com/api/v2';
const PROVIDER_KEY = '46b597a2aeb6cf28362dadc92c67b8544df49f33';
const DEFAULT_FX_RATE = 275.81;
const MARKUP_MULTIPLIER = 1.50; // 50% commission

/**
 * Netlify Scheduled Cron: Runs Every 4 Hours
 * Schedule: 0 *\/4 * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Catalog Sync] Checking upstream catalog updates...");

    try {
        const res = await fetch(PROVIDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                key: PROVIDER_KEY,
                action: 'services'
            })
        });

        const upstreamServices = await res.json();

        if (!Array.isArray(upstreamServices) || upstreamServices.length === 0) {
            console.warn("[Cron Catalog Sync] Upstream services returned empty or invalid.");
            return { statusCode: 200, body: JSON.stringify({ success: false, reason: "Empty upstream list" }) };
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
