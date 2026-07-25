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

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.email !== 'mubashirarham12@gmail.com') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required for CashMaal Payouts' }) };
        }

        const { recipientEmail, amount, currency, orderId, addiInfo } = JSON.parse(event.body || '{}');

        if (!recipientEmail || !amount) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Recipient Email and Amount required' }) };
        }

        const payoutSecretKey = process.env.CASHMAAL_PAYOUT_SECRET_KEY;
        if (!payoutSecretKey) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'CASHMAAL_PAYOUT_SECRET_KEY not configured in environment variables.' }) };
        }

        const params = new URLSearchParams();
        params.append('cmd', 'payout_v2');
        params.append('p_secretkey', payoutSecretKey);
        params.append('to_email', recipientEmail);
        params.append('currency_is', currency || 'PKR');
        params.append('sending_amount', amount);
        params.append('order_id', orderId || '');
        params.append('addi_info', addiInfo || 'Affiliate Payout');

        const cmRes = await fetch('https://api.cmaal.com/payout_v2', {
            method: 'POST',
            body: params
        });

        const data = await cmRes.json();

        if (String(data.status) === '1') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    transactionId: data.trx_id,
                    receiverName: data.receiver_name,
                    amount: data.amount,
                    fee: data.fee,
                    details: data.transaction_details
                })
            };
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: data.error || 'Payout failed'
                })
            };
        }
    } catch (err) {
        console.error("CashMaal Payout Error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
