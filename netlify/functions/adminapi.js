const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Firebase Admin Init Error:", e);
    }
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';

exports.handler = async (event) => {
    // Enable CORS
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
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }) };
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // SECURE CHECK: Ensure only the hardcoded admin email can perform these actions
        if (decodedToken.email !== 'mubashirarham12@gmail.com') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: Admin access strictly required' }) };
        }

        const payload = JSON.parse(event.body);
        const { action, userId, amount } = payload;

        if (action === 'adjust_balance') {
            if (!userId || typeof amount !== 'number') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid parameters: userId and amount required' }) };
            }

            const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
            
            // Atomically increment using the Admin SDK
            await statsRef.set({
                balance: admin.firestore.FieldValue.increment(amount)
            }, { merge: true });

            return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Balance adjusted successfully' }) };
        }

        if (action === 'impersonate_user') {
            if (!userId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing userId parameter' }) };
            }

            try {
                // Generate secure Firebase Custom Token enabling the Admin to log in strictly as the target user.
                const customToken = await admin.auth().createCustomToken(userId);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, token: customToken }) };
            } catch (err) {
                console.error("Token Generation Error:", err);
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to generate impersonation token' }) };
            }
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

    } catch (error) {
        console.error('Admin API Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
