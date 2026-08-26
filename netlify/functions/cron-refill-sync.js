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
const PROVIDER_URL = 'https://paksmmpanels.com/api/v2';
const PROVIDER_KEY = '46b597a2aeb6cf28362dadc92c67b8544df49f33';

/**
 * Netlify Scheduled Cron: Runs Every 5 Minutes
 * Schedule: *\/5 * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Refill Sync] Checking active refill requests...");

    try {
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
            
            // 1. If Refill not yet forwarded, forward to provider
            if (refill.status === 'Pending' && refill.externalOrderId && !refill.refillId) {
                try {
                    const res = await fetch(PROVIDER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            key: PROVIDER_KEY,
                            action: 'refill',
                            order: String(refill.externalOrderId)
                        })
                    });
                    const data = await res.json();
                    if (data && data.refill) {
                        await doc.ref.update({
                            refillId: String(data.refill),
                            status: 'In progress',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Cron Refill Sync] Refill initiated for order ${refill.orderId}. Refill ID: ${data.refill}`);
                    }
                } catch(e) {
                    console.error(`[Cron Refill Sync] Forward error for refill ${doc.id}:`, e);
                }
            }

            // 2. If Refill has refillId, check its status
            if (refill.refillId) {
                try {
                    const res = await fetch(PROVIDER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            key: PROVIDER_KEY,
                            action: 'refill_status',
                            refill: String(refill.refillId)
                        })
                    });
                    const data = await res.json();
                    if (data && data.status) {
                        await doc.ref.update({
                            status: data.status,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Cron Refill Sync] Updated refill ${doc.id} status to ${data.status}`);
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
