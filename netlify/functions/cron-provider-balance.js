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
const LOW_BALANCE_THRESHOLD_USD = 15.0; // Alert if balance < $15

/**
 * Netlify Scheduled Cron: Runs Every 1 Hour
 * Schedule: 0 * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Provider Balance] Checking upstream API balance...");

    try {
        const res = await fetch(PROVIDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                key: PROVIDER_KEY,
                action: 'balance'
            })
        });

        const data = await res.json();

        if (data && data.balance !== undefined) {
            const balanceUSD = parseFloat(data.balance) || 0;
            const currency = data.currency || 'USD';
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

        return { statusCode: 500, body: JSON.stringify({ success: false, error: 'Invalid response from provider' }) };
    } catch(err) {
        console.error("[Cron Provider Balance] Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};
