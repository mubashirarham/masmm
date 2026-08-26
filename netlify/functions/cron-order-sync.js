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
 * Netlify Scheduled Cron: Runs Every 1 Minute
 * Schedule: * * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Order Sync] Starting automated order cycle...");

    try {
        await forwardPendingOrders();
        await syncActiveOrderStatus();
        return { statusCode: 200, body: JSON.stringify({ success: true, timestamp: new Date().toISOString() }) };
    } catch (err) {
        console.error("[Cron Order Sync] Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};

// 1. Forward Pending Orders to Upstream API
async function forwardPendingOrders() {
    const pendingSnap = await db.collectionGroup('orders')
        .where('status', '==', 'Pending')
        .limit(50)
        .get();

    if (pendingSnap.empty) {
        console.log("[Cron Order Sync] No pending orders found.");
        return;
    }

    console.log(`[Cron Order Sync] Forwarding ${pendingSnap.size} pending orders...`);

    for (const orderDoc of pendingSnap.docs) {
        const order = orderDoc.data();
        const serviceId = order.upstreamServiceId || order.serviceId || order.service;

        if (!serviceId || !order.link || !order.quantity) {
            console.warn(`[Cron Order Sync] Skipping malformed order ${orderDoc.id}`);
            continue;
        }

        try {
            const bodyParams = new URLSearchParams({
                key: PROVIDER_KEY,
                action: 'add',
                service: String(serviceId),
                link: order.link,
                quantity: String(order.quantity)
            });

            if (order.comments) bodyParams.append('comments', order.comments);

            const res = await fetch(PROVIDER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: bodyParams
            });

            const data = await res.json();

            if (data && data.order) {
                await orderDoc.ref.update({
                    status: 'In progress',
                    externalOrderId: String(data.order),
                    forwardedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[Cron Order Sync] Order ${orderDoc.id} sent successfully. External ID: ${data.order}`);
            } else {
                console.error(`[Cron Order Sync] Provider rejected order ${orderDoc.id}:`, data ? data.error : 'Unknown error');
            }
        } catch (e) {
            console.error(`[Cron Order Sync] Network error for order ${orderDoc.id}:`, e);
        }
    }
}

// 2. Sync Active Orders & Handle Partial/Cancellation Refunds
async function syncActiveOrderStatus() {
    const activeSnap = await db.collectionGroup('orders')
        .where('status', 'in', ['In progress', 'Processing', 'Pending'])
        .limit(100)
        .get();

    if (activeSnap.empty) return;

    for (const orderDoc of activeSnap.docs) {
        const order = orderDoc.data();
        const externalId = order.externalOrderId;

        if (!externalId) continue;

        try {
            const res = await fetch(PROVIDER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    key: PROVIDER_KEY,
                    action: 'status',
                    order: String(externalId)
                })
            });

            const data = await res.json();

            if (data && data.status) {
                const upstreamStatus = data.status;
                let mappedStatus = upstreamStatus;

                if (upstreamStatus === 'Completed') mappedStatus = 'Completed';
                else if (upstreamStatus === 'In progress') mappedStatus = 'In progress';
                else if (upstreamStatus === 'Processing') mappedStatus = 'In progress';
                else if (upstreamStatus === 'Partial') mappedStatus = 'Partial';
                else if (upstreamStatus === 'Canceled') mappedStatus = 'Canceled';

                const updatePayload = {
                    status: mappedStatus,
                    startCount: data.start_count || order.startCount || 0,
                    remains: data.remains !== undefined ? parseInt(data.remains) : (order.remains || 0),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                // Automatic Partial Refund Calculation
                if (mappedStatus === 'Partial' && order.status !== 'Partial' && !order.partialRefunded) {
                    const remains = parseInt(data.remains) || 0;
                    const quantity = parseInt(order.quantity) || 1;
                    const charge = parseFloat(order.charge) || 0;

                    if (remains > 0 && quantity > 0 && charge > 0) {
                        const refundAmount = parseFloat(((remains / quantity) * charge).toFixed(2));
                        if (refundAmount > 0) {
                            const pathParts = orderDoc.ref.path.split('/');
                            const userId = pathParts[3]; // artifacts/{appId}/users/{userId}/orders/{orderId}
                            
                            if (userId) {
                                const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
                                await db.runTransaction(async (t) => {
                                    const sSnap = await t.get(statsRef);
                                    if (sSnap.exists) {
                                        t.update(statsRef, {
                                            balance: admin.firestore.FieldValue.increment(refundAmount),
                                            totalSpent: admin.firestore.FieldValue.increment(-refundAmount)
                                        });
                                    }
                                });
                                updatePayload.partialRefunded = true;
                                updatePayload.refundAmount = refundAmount;
                                console.log(`[Cron Order Sync] Refunded Rs. ${refundAmount} for Partial order ${orderDoc.id}`);
                            }
                        }
                    }
                }

                // Automatic Full Cancellation Refund
                if (mappedStatus === 'Canceled' && order.status !== 'Canceled' && !order.canceledRefunded) {
                    const charge = parseFloat(order.charge) || 0;
                    if (charge > 0) {
                        const pathParts = orderDoc.ref.path.split('/');
                        const userId = pathParts[3];
                        if (userId) {
                            const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
                            await db.runTransaction(async (t) => {
                                const sSnap = await t.get(statsRef);
                                if (sSnap.exists) {
                                    t.update(statsRef, {
                                        balance: admin.firestore.FieldValue.increment(charge),
                                        totalSpent: admin.firestore.FieldValue.increment(-charge)
                                    });
                                }
                            });
                            updatePayload.canceledRefunded = true;
                            console.log(`[Cron Order Sync] Full refund of Rs. ${charge} for Canceled order ${orderDoc.id}`);
                        }
                    }
                }

                await orderDoc.ref.update(updatePayload);
            }
        } catch (e) {
            console.error(`[Cron Order Sync] Status check error for order ${orderDoc.id}:`, e);
        }
    }
}
