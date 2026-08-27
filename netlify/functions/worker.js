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

function getStealthHeaders(targetUrl) {
    try {
        const origin = new URL(targetUrl).origin;
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': origin,
            'Referer': origin + '/'
        };
    } catch (e) {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        };
    }
}

async function safeFetchJson(url, params) {
    const headers = getStealthHeaders(url);
    const body = new URLSearchParams(params);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        const rawText = await res.text();
        let data = null;

        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 160);
            return {
                ok: false,
                isHtml: true,
                httpStatus: res.status,
                raw: rawText,
                error: `Provider returned non-JSON response (HTTP ${res.status}): ${preview}`
            };
        }

        return {
            ok: res.ok,
            isHtml: false,
            httpStatus: res.status,
            data: data
        };
    } catch (networkErr) {
        return {
            ok: false,
            isHtml: false,
            httpStatus: 0,
            error: `Network error: ${networkErr.message}`
        };
    }
}

/**
 * Netlify Scheduled Function (Cron Engine)
 * This runs automatically every 5 minutes if configured in netlify.toml
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
    const ordersQuery = await db.collectionGroup('orders').where('status', '==', 'Pending').limit(50).get();
    
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
            const result = await safeFetchJson(provider.url, {
                key: provider.apiKey,
                action: 'add',
                service: order.upstreamServiceId || order.serviceId,
                link: order.link,
                quantity: order.quantity
            });

            if (result.data && result.data.order) {
                // Success: Move to In progress / Processing and save external Order ID
                await doc.ref.update({
                    status: 'In progress',
                    externalOrderId: String(result.data.order),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else if (result.data && result.data.error) {
                console.error(`Upstream Provider Error for Order ${doc.id}:`, result.data.error);
            } else if (result.isHtml) {
                console.warn(`Upstream Provider returned HTML for Order ${doc.id}`);
            }
        } catch (e) {
            console.error(`Network Error for Provider ${order.providerId}:`, e);
        }
    }
}

// --- Task 2: Sync Statuses from Upstream Providers ---
async function syncActiveStatuses() {
    const activeQuery = await db.collectionGroup('orders')
        .where('status', 'in', ['Processing', 'In progress', 'In Progress'])
        .limit(100)
        .get();

    if (activeQuery.empty) return;

    const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
    const providers = new Map();
    providersSnap.forEach(d => providers.set(d.id, d.data()));

    for (const doc of activeQuery.docs) {
        const order = doc.data();
        const provider = providers.get(order.providerId);

        if (!provider || !order.externalOrderId) continue;

        try {
            const result = await safeFetchJson(provider.url, {
                key: provider.apiKey,
                action: 'status',
                order: String(order.externalOrderId)
            });

            if (result.data && result.data.status) {
                let internalStatus = result.data.status;
                if (internalStatus === 'Completed' || internalStatus === 'Done') internalStatus = 'Completed';
                if (internalStatus === 'Canceled' || internalStatus === 'Cancelled') internalStatus = 'Canceled';
                if (internalStatus === 'Processing') internalStatus = 'In progress';

                const pathSegments = doc.ref.path.split('/');
                const userId = pathSegments[3];

                if (doc.data().status !== internalStatus && userId) {
                    try {
                        const notifRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('notifications').doc();
                        await notifRef.set({
                            title: `Order ${internalStatus}`,
                            message: `Your order for ${doc.data().serviceName || 'service'} is now ${internalStatus}.`,
                            isRead: false,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (nErr) {}
                }

                await doc.ref.update({
                    status: internalStatus,
                    remains: result.data.remains || 0,
                    startCount: result.data.start_count || 0,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                // --- Refund Logic if Canceled ---
                if (internalStatus === 'Canceled' && doc.data().status !== 'Canceled' && userId && order.charge > 0) {
                    try {
                        const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
                        await statsRef.update({
                            balance: admin.firestore.FieldValue.increment(parseFloat(order.charge)),
                            totalSpent: admin.firestore.FieldValue.increment(-parseFloat(order.charge))
                        });
                    } catch (rErr) {}
                }
            }
        } catch (e) {
            console.error(`Sync Status Error:`, e);
        }
    }
}

// --- Task 3: Auto-Sync Provider Catalog (Runs daily) ---
async function autoSyncCatalogIfNeeded() {
    const systemRef = db.collection('artifacts').doc(APP_ID).collection('system').doc('cron');
    const systemSnap = await systemRef.get();
    
    let lastSync = 0;
    if (systemSnap.exists) {
        lastSync = systemSnap.data().lastCatalogSync || 0;
    }
    
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    if (now - lastSync < ONE_DAY_MS) return;

    console.log("Running Daily Provider Catalog Auto-Sync...");

    const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').where('status', '==', 'Active').get();
    
    for (const pDoc of providersSnap.docs) {
        const provider = pDoc.data();
        
        try {
            const result = await safeFetchJson(provider.url, { key: provider.apiKey, action: 'services' });
            const upstreamServices = result.data;
            
            if (!Array.isArray(upstreamServices) || upstreamServices.error) continue;
            
            let providerCurrency = 'USD';
            let exchangeRateToPKR = 1;
            try {
                const balResult = await safeFetchJson(provider.url, { key: provider.apiKey, action: 'balance' });
                const balData = balResult.data;
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
            
            const upstreamMap = new Map();
            upstreamServices.forEach(s => upstreamMap.set(String(s.service), s));

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
                    batch.update(sDoc.ref, { 
                        status: 'Disabled', 
                        disabledReason: 'Auto-sync: Removed by upstream provider',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    disabledCount++;
                } else if (localService.serviceId && upstreamMap.has(sid)) {
                    const upService = upstreamMap.get(sid);
                    const rawUpstreamRate = parseFloat(upService.rate) || 0;
                    const upstreamRateInPkr = rawUpstreamRate * exchangeRateToPKR;
                    
                    const markup = parseFloat(localService.metadata_markup) || 1.2;
                    const expectedLocalRateFormatted = (upstreamRateInPkr * markup).toFixed(4);
                    
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

    await systemRef.set({ lastCatalogSync: now }, { merge: true });
}

// --- Task 4: Process Child Panel Subscriptions (Runs daily) ---
async function processSubscriptions() {
    if (APP_ID !== 'masmmpanel-default') return;

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
        if (!tenant.ownerUid) continue;

        const createdAt = tenant.createdAt ? tenant.createdAt.toMillis() : Date.now();
        const lastBilledAt = tenant.lastBilledAt || createdAt;
        
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (now - lastBilledAt >= THIRTY_DAYS) {
            try {
                const amountDue = 4999;
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