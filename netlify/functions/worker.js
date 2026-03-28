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
        await autoSyncCatalogIfNeeded(); // Daily Catalog Cleanup
        
        // Execute global SaaS tracking
        if (APP_ID === 'masmmpanel-default') {
            await processSubscriptions();
        }
        
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
                if (internalStatus === 'Completed' || internalStatus === 'Done') internalStatus = 'Completed';
                if (internalStatus === 'Canceled' || internalStatus === 'Cancelled') internalStatus = 'Canceled';

                const pathSegments = doc.ref.path.split('/');
                const userId = pathSegments[3];

                if (doc.data().status !== internalStatus) {
                    const notifRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('notifications').doc();
                    await notifRef.set({
                        title: `Order ${internalStatus}`,
                        message: `Your order for ${doc.data().serviceName || 'service'} is now ${internalStatus}.`,
                        isRead: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                await doc.ref.update({
                    status: internalStatus,
                    remains: result.remains || 0,
                    startCount: result.start_count || 0,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                
                // --- Refund Logic if Canceled ---
                if (internalStatus === 'Canceled' && doc.data().status !== 'Canceled') {
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

// --- Task 3: Auto-Sync Provider Catalog (Runs daily) ---
async function autoSyncCatalogIfNeeded() {
    // 1. Check if 24 hours have passed since last sync
    const systemRef = db.collection('artifacts').doc(APP_ID).collection('system').doc('cron');
    const systemSnap = await systemRef.get();
    
    let lastSync = 0;
    if (systemSnap.exists) {
        lastSync = systemSnap.data().lastCatalogSync || 0;
    }
    
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    // Only run once a day to avoid rate limits
    if (now - lastSync < ONE_DAY_MS) return;

    console.log("Running Daily Provider Catalog Auto-Sync...");

    const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').where('status', '==', 'Active').get();
    
    for (const pDoc of providersSnap.docs) {
        const provider = pDoc.data();
        
        try {
            // Fetch upstream services
            const response = await fetch(provider.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ key: provider.apiKey, action: 'services' })
            });
            const upstreamServices = await response.json();
            
            if (!Array.isArray(upstreamServices) || upstreamServices.error) continue;
            
            // --- Determine Provider Currency & Exchange Rate (Copied from sync-provider) ---
            let providerCurrency = 'USD';
            let exchangeRateToPKR = 1;
            try {
                const balRes = await fetch(provider.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ key: provider.apiKey, action: 'balance' })
                });
                const balData = await balRes.json();
                if (balData && balData.currency) providerCurrency = balData.currency.toUpperCase();
                
                if (providerCurrency !== 'PKR') {
                    const xrRes = await fetch(`https://economia.awesomeapi.com.br/json/last/${providerCurrency}-PKR`);
                    if (xrRes.ok) {
                        const xrData = await xrRes.json();
                        const pairKey = `${providerCurrency}PKR`;
                        if (xrData && xrData[pairKey] && xrData[pairKey].bid) {
                            exchangeRateToPKR = parseFloat(xrData[pairKey].bid);
                        }
                    } else {
                        const fbRes = await fetch(`https://open.er-api.com/v6/latest/${providerCurrency}`);
                        const fbData = await fbRes.json();
                        if (fbData && fbData.rates && fbData.rates.PKR) exchangeRateToPKR = fbData.rates.PKR;
                    }
                }
            } catch (e) {
                console.warn(`Worker Exchange Rate fallback for ${providerCurrency}`);
                if (providerCurrency === 'USD') exchangeRateToPKR = 278.0;
                if (providerCurrency === 'EUR') exchangeRateToPKR = 300.0;
                if (providerCurrency === 'INR') exchangeRateToPKR = 3.3;
            }
            
            // Map upstream service IDs to full service objects for price checking
            const upstreamMap = new Map();
            upstreamServices.forEach(s => upstreamMap.set(String(s.service), s));

            // Fetch local active services tied to this provider
            const localServicesSnap = await db.collection('artifacts').doc(APP_ID)
                .collection('public').doc('data').collection('services')
                .where('providerId', '==', pDoc.id)
                .where('status', '==', 'Active')
                .get();

            const batch = db.batch();
            let disabledCount = 0;
            let updatedPriceCount = 0;

            for (const sDoc of localServicesSnap.docs) {
                const localService = sDoc.data();
                const sid = String(localService.serviceId);
                
                if (localService.serviceId && !upstreamMap.has(sid)) {
                    // Service completely removed upstream -> Disable it
                    batch.update(sDoc.ref, { 
                        status: 'Disabled', 
                        disabledReason: 'Auto-sync: Removed by upstream provider',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    disabledCount++;
                } else if (localService.serviceId && upstreamMap.has(sid)) {
                    // Service exists. Check if price changed.
                    const upService = upstreamMap.get(sid);
                    const rawUpstreamRate = parseFloat(upService.rate) || 0;
                    const upstreamRateInPkr = rawUpstreamRate * exchangeRateToPKR;
                    
                    // Retrieve stored markup or fallback to 1.2x (20% margin) for old services
                    const markup = parseFloat(localService.metadata_markup) || 1.2;
                    const expectedLocalRateFormatted = (upstreamRateInPkr * markup).toFixed(4);
                    
                    // If the current local rate deviates, update it
                    if (localService.rate !== expectedLocalRateFormatted) {
                        batch.update(sDoc.ref, {
                            rate: expectedLocalRateFormatted,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        updatedPriceCount++;
                    }
                }
            }

            if (disabledCount > 0 || updatedPriceCount > 0) {
                await batch.commit();
                console.log(`Auto-Sync Result for ${pDoc.id}: Disabled ${disabledCount}, Updated Prices for ${updatedPriceCount}`);
            }

        } catch (e) {
            console.error(`Catalog Sync Error for ${pDoc.id}:`, e);
        }
    }

    // Update the last sync timestamp
    await systemRef.set({ lastCatalogSync: now }, { merge: true });
}

// --- Task 4: Process Child Panel Subscriptions (Runs daily) ---
async function processSubscriptions() {
    // Only the Master network orchestrates billing
    if (APP_ID !== 'masmmpanel-default') return;

    // Run this check once every 12 hours
    const systemRef = db.collection('artifacts').doc(APP_ID).collection('system').doc('cron');
    const systemSnap = await systemRef.get();
    let lastSubCheck = 0;
    if (systemSnap.exists) lastSubCheck = systemSnap.data().lastSubscriptionCheck || 0;
    
    const now = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    
    if (now - lastSubCheck < TWELVE_HOURS) return;
    
    console.log("Evaluating Tenant Monthly Subscriptions...");
    
    const panelsQuery = await db.collection('artifacts').doc(APP_ID).collection('child_panels').where('status', '==', 'Active').get();
    
    for (const doc of panelsQuery.docs) {
        const tenant = doc.data();
        if (!tenant.ownerUid) continue; // Bypasses administratively gifted panels

        const createdAt = tenant.createdAt ? tenant.createdAt.toMillis() : Date.now();
        const lastBilledAt = tenant.lastBilledAt || createdAt;
        
        // Has it been 30 days?
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (now - lastBilledAt >= THIRTY_DAYS) {
            try {
                const amountDue = 4999; // Standard monthly SaaS fee
                const ownerRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(tenant.ownerUid).collection('account').doc('stats');
                
                await db.runTransaction(async (t) => {
                    const ownerSnap = await t.get(ownerRef);
                    const bal = ownerSnap.exists ? (ownerSnap.data().balance || 0) : 0;

                    if (bal >= amountDue) {
                        t.update(ownerRef, { 
                            balance: admin.firestore.FieldValue.increment(-amountDue),
                            totalSpent: admin.firestore.FieldValue.increment(amountDue)
                        });
                        t.update(doc.ref, { lastBilledAt: now });
                        console.log(`Billed 4999 PKR successfully to ${tenant.ownerUid} for tenant ${doc.id}`);
                    } else {
                        // Suspend due to insufficient funds
                        t.update(doc.ref, { 
                            status: 'Suspended', 
                            suspendReason: 'Insufficient funds for monthly renewal' 
                        });
                        console.log(`Suspended tenant ${doc.id} due to insufficient funds.`);
                    }
                });
            } catch (e) {
                console.error(`Billing error for tenant ${doc.id}:`, e);
            }
        }
    }

    await systemRef.set({ lastSubscriptionCheck: now }, { merge: true });
}