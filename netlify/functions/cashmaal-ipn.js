const admin = require('firebase-admin');

// Initialize Firebase Admin
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

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: 'OK' };
    }

    // Accept POST requests from CashMaal
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        // Handle Netlify Base64 Encoding for URL-encoded POST bodies
        let rawBody = event.body || '';
        if (event.isBase64Encoded) {
            rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
        }

        console.log("CashMaal IPN Raw Body Received:", rawBody);
        
        const params = new URLSearchParams(rawBody);
        
        // Flexible Parameter Extraction with Fallbacks
        const ipnKey = params.get('ipn_key') || params.get('IPN_key') || params.get('ipn_Secret') || '';
        const status = String(params.get('status') || params.get('Status') || '');
        const cmTid = params.get('CM_TID') || params.get('cm_tid') || params.get('transaction_id') || params.get('tid') || `CM_${Date.now()}`;
        const amountStr = params.get('Amount') || params.get('amount') || params.get('pkr_amount') || '0';
        const amount = parseFloat(amountStr);
        const currency = params.get('currency') || params.get('Currency') || 'PKR';
        const userId = params.get('order_id') || params.get('user_id') || params.get('client_email'); 

        console.log("CashMaal IPN Parsed Data:", { ipnKey, status, cmTid, amount, currency, userId });

        // 1. Verify the IPN Key to ensure request is genuinely from CashMaal
        const EXPECTED_IPN_KEY = process.env.CASHMAAL_IPN_KEY || 'wfI7bTB39iCvy6a552nblq7tpXhHcYqKFi3';
        if (ipnKey && ipnKey !== EXPECTED_IPN_KEY) {
            console.error(`Invalid IPN Key mismatch! Received: ${ipnKey}, Expected: ${EXPECTED_IPN_KEY}`);
            return { statusCode: 400, headers, body: 'Invalid IPN Key' };
        }

        if (!userId) {
            console.error("IPN Warning: Missing userId/order_id in payload");
            return { statusCode: 400, headers, body: 'Missing order_id' };
        }

        // 2. Process Successful Payments (Status == "1")
        if (status === '1') {
            const txRef = db.collection('artifacts').doc(APP_ID)
                            .collection('users').doc(userId)
                            .collection('transactions').doc(cmTid);

            const txSnap = await txRef.get();
            
            // Prevent duplicate processing if CashMaal retries IPN
            if (txSnap.exists) {
                console.log(`Transaction ${cmTid} already processed.`);
                return { statusCode: 200, headers, body: '**OK**' }; 
            }

            const statsRef = db.collection('artifacts').doc(APP_ID)
                               .collection('users').doc(userId)
                               .collection('account').doc('stats');

            // Safely execute Firestore transaction to credit user balance
            await db.runTransaction(async (t) => {
                t.set(txRef, {
                    tid: cmTid,
                    amount: amount,
                    currency: currency,
                    method: 'CashMaal (Auto IPN)',
                    type: 'Deposit',
                    status: 'Completed',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                t.set(statsRef, {
                    balance: admin.firestore.FieldValue.increment(amount)
                }, { merge: true });

                const notifRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('notifications').doc();
                t.set(notifRef, {
                    title: 'Deposit Successful',
                    message: `Rs ${amount} has been added to your account balance via CashMaal.`,
                    isRead: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            console.log(`SUCCESS: Credited Rs ${amount} to user ${userId}`);

            // MUST return **OK** so CashMaal stops retrying
            return { statusCode: 200, headers, body: '**OK**' };
        }

        return { statusCode: 200, headers, body: 'Status ignored' };

    } catch (error) {
        console.error('IPN Webhook Error:', error);
        return { statusCode: 500, headers, body: 'Internal Server Error' };
    }
};