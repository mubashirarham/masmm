const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error("Firebase Admin Init Error:", error);
    }
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';
const CASHMAAL_WEB_ID = process.env.CASHMAAL_WEB_ID || "11191";

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const params = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : event.queryStringParameters || {};
        const cmTid = params.CM_TID || params.cm_tid;
        const userId = params.userId || params.order_id;

        if (!cmTid) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing CM_TID parameter" }) };
        }

        // Call CashMaal API v2 Verification Endpoint
        const verifyUrl = `https://api.cmaal.com/verify_v2?CM_TID=${encodeURIComponent(cmTid)}&web_id=${encodeURIComponent(CASHMAAL_WEB_ID)}`;
        const response = await fetch(verifyUrl);
        const data = await response.json();

        if (String(data.status) === '1') {
            const amountPKR = parseFloat(data.PKR_amount || data.PKR_amount_with_fee || 0);
            const targetUserId = userId || data.order_id;

            if (targetUserId) {
                const txRef = db.collection('artifacts').doc(APP_ID)
                                .collection('users').doc(targetUserId)
                                .collection('transactions').doc(cmTid);

                const txSnap = await txRef.get();
                if (!txSnap.exists) {
                    const statsRef = db.collection('artifacts').doc(APP_ID)
                                       .collection('users').doc(targetUserId)
                                       .collection('account').doc('stats');

                    await db.runTransaction(async (t) => {
                        t.set(txRef, {
                            tid: cmTid,
                            amount: amountPKR,
                            currency: 'PKR',
                            method: 'CashMaal (Auto Verified)',
                            type: 'Deposit',
                            status: 'Completed',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        t.set(statsRef, {
                            balance: admin.firestore.FieldValue.increment(amountPKR)
                        }, { merge: true });

                        const notifRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(targetUserId).collection('notifications').doc();
                        t.set(notifRef, {
                            title: 'Deposit Verified',
                            message: `Rs ${amountPKR} has been added to your balance via CashMaal API Verification.`,
                            isRead: false,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    verified: true,
                    amount: amountPKR,
                    details: data
                })
            };
        } else {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    verified: false,
                    error: data.error || "Transaction pending or invalid status"
                })
            };
        }
    } catch (err) {
        console.error("CashMaal API Verification Error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
