const admin = require('firebase-admin');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';

/**
 * Netlify Scheduled Function (Cron Engine)
 * This runs automatically every 1 minute if configured in netlify.toml
 */
exports.handler = async (event, context) => {
    console.log("Worker Pulse Started");
    
    try {
        await processPendingOrders();
        await syncActiveStatuses();
        
        return { statusCode: 200, body: "Worker Processed Successfully" };
    } catch (error) {
        console.error("Worker Error:", error);
        return { statusCode: 500, body: error.message };
    }
};

// --- Task 1: Forward Pending Orders to Upstream Providers ---
async function processPendingOrders() {
    const ordersQuery = await db.collectionGroup('orders').where('status', '==', 'Pending').get();
    
    if (ordersQuery.empty) return;

    // Fetch Providers into a Map for easy access
    const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
    const providers = new Map();
    providersSnap.forEach(d => providers.set(d.id, d.data()));

    for (const doc of ordersQuery.docs) {
        const order = doc.data();
        const provider = providers.get(order.providerId);

        if (!provider || provider.status !== 'Active') continue;

        try {
            // Send request to upstream API
            const response = await fetch(provider.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    key: provider.apiKey,
                    action: 'add',
                    service: order.upstreamServiceId,
                    link: order.link,
                    quantity: order.quantity
                })
            });

            const result = await response.json();

            if (result.order) {
                // Success: Move to Processing and save external Order ID
                await doc.ref.update({
                    status: 'Processing',
                    externalOrderId: result.order,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.error(`Upstream Provider Error for Order ${doc.id}:`, result.error);
            }
        } catch (e) {
            console.error(`Network Error for Provider ${order.providerId}:`, e);
        }
    }
}

// --- Task 2: Sync Statuses from Upstream Providers ---
async function syncActiveStatuses() {
    // Only check orders that are currently being processed
    const activeQuery = await db.collectionGroup('orders')
        .where('status', 'in', ['Processing', 'In Progress'])
        .get();

    if (activeQuery.empty) return;

    // Map active orders to their providers to batch requests if the provider supports multi-status
    // For simplicity here, we query one by one.
    const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
    const providers = new Map();
    providersSnap.forEach(d => providers.set(d.id, d.data()));

    for (const doc of activeQuery.docs) {
        const order = doc.data();
        const provider = providers.get(order.providerId);

        if (!provider || !order.externalOrderId) continue;

        try {
            const response = await fetch(provider.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    key: provider.apiKey,
                    action: 'status',
                    order: order.externalOrderId
                })
            });

            const result = await response.json();

            if (result.status) {
                // Map external status to internal status
                let internalStatus = result.status;
                if (internalStatus === 'Completed' || internalStatus === 'Done') internalStatus = 'Completed';
                if (internalStatus === 'Canceled' || internalStatus === 'Cancelled') internalStatus = 'Canceled';

                await doc.ref.update({
                    status: internalStatus,
                    remains: result.remains || 0,
                    startCount: result.start_count || 0,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                // --- Refund Logic if Canceled ---
                if (internalStatus === 'Canceled') {
                    const pathSegments = doc.ref.path.split('/');
                    const userId = pathSegments[3];
                    const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
                    
                    await statsRef.update({
                        balance: admin.firestore.FieldValue.increment(order.charge)
                    });
                }
            }
        } catch (e) {
            console.error(`Sync Status Error:`, e);
        }
    }
}