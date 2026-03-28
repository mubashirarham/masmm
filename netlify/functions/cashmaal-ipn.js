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
    // Only accept POST requests from CashMaal
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // CashMaal sends IPN data as URL-encoded form data
        const params = new URLSearchParams(event.body);
        
        const ipnKey = params.get('ipn_key');
        const status = params.get('status');
        const cmTid = params.get('CM_TID');
        const amount = params.get('Amount');
        const currency = params.get('currency');
        // We pass the user's UID in the order_id field from the frontend
        const userId = params.get('order_id'); 

        // 1. Verify the IPN Key to ensure the request is genuinely from CashMaal
        if (ipnKey !== process.env.CASHMAAL_IPN_KEY) {
            return { statusCode: 400, body: 'Invalid IPN Key' };
        }

        // 2. Process Successful Payments (Status == 1)
        if (status === '1') {
            const txRef = db.collection('artifacts').doc(APP_ID)
                            .collection('users').doc(userId)
                            .collection('transactions').doc(cmTid);

            const txSnap = await txRef.get();
            
            // Prevent duplicate processing if CashMaal retries the IPN
            if (txSnap.exists) {
                return { statusCode: 200, body: '**OK**' }; 
            }

            const statsRef = db.collection('artifacts').doc(APP_ID)
                               .collection('users').doc(userId)
                               .collection('account').doc('stats');

            // Use a transaction to safely add the transaction log and update balance
            await db.runTransaction(async (t) => {
                t.set(txRef, {
                    tid: cmTid,
                    amount: parseFloat(amount),
                    currency: currency,
                    method: 'CashMaal (Auto)',
                    type: 'Deposit',
                    status: 'Completed',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                t.set(statsRef, {
                    balance: admin.firestore.FieldValue.increment(parseFloat(amount))
                }, { merge: true });

                const notifRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('notifications').doc();
                t.set(notifRef, {
                    title: 'Deposit Successful',
                    message: `Rs ${amount} has been added to your balance via CashMaal.`,
                    isRead: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            // IMPORTANT: You MUST return **OK** so CashMaal stops sending retries
            return { statusCode: 200, body: '**OK**' };
        }

        // Acknowledge pending/failed statuses without processing balance
        return { statusCode: 200, body: 'Status ignored' };

    } catch (error) {
        console.error('IPN Error:', error);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};