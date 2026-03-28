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

        if (action === 'bulk_update_pricing') {
            const { markupPercentage } = payload;
            if (typeof markupPercentage !== 'number' || markupPercentage < 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid markup percentage' }) };
            }

            const targetMultiplier = 1 + (markupPercentage / 100); // 20% -> 1.2
            const servicesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services');
            const servicesSnap = await servicesRef.get();
            
            let updatedCount = 0;
            let currentBatch = db.batch();
            let batchTracker = 0;

            for (const sDoc of servicesSnap.docs) {
                const sData = sDoc.data();
                if (!sData.rate || sData.status !== 'Active') continue;
                
                // Extrapolate the exact upstream base cost dynamically
                const oldMarkup = parseFloat(sData.metadata_markup) || 1.2;
                const baseProviderCost = parseFloat(sData.rate) / oldMarkup;
                
                // Apply the new global markup and enforce 4 decimal precision
                const newMarkupRate = (baseProviderCost * targetMultiplier).toFixed(4);

                currentBatch.update(sDoc.ref, {
                    rate: newMarkupRate,
                    metadata_markup: targetMultiplier,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                updatedCount++;
                batchTracker++;

                // Firebase caps single batches at 500 operations
                if (batchTracker >= 450) {
                    await currentBatch.commit();
                    currentBatch = db.batch();
                    batchTracker = 0;
                }
            }

            // Commit trailing ops
            if (batchTracker > 0) {
                await currentBatch.commit();
            }

            return { statusCode: 200, headers, body: JSON.stringify({ success: true, updatedCount }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

    } catch (error) {
        console.error('Admin API Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
