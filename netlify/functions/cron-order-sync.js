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
const DEFAULT_PROVIDER_URL = process.env.PROVIDER_URL || 'https://paksmmpanals.com/api/v2';
const DEFAULT_PROVIDER_KEY = process.env.PROVIDER_KEY || '46b597a2aeb6cf28362dadc92c67b8544df49f33';

function normalizeProviderUrl(url) {
    if (!url) return DEFAULT_PROVIDER_URL;
    // Auto-fix typo if entered as paksmmpanels instead of paksmmpanals
    if (url.includes('paksmmpanels.com')) {
        return url.replace(/paksmmpanels\.com/g, 'paksmmpanals.com');
    }
    return url;
}

/**
 * Safely send a POST request and parse JSON without crashing on HTML/Cloudflare responses.
 * Tries standard SMM API headers with automatic fallback if Cloudflare blocks a specific header.
 */
async function safeFetchJson(url, params) {
    const headerVariants = [
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SmartPanel/2.0 (compatible; SMM-API/1.0)',
            'Accept': 'application/json, text/plain, */*'
        },
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'curl/7.88.1',
            'Accept': '*/*'
        },
        {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    ];

    const body = new URLSearchParams(params);

    for (let i = 0; i < headerVariants.length; i++) {
        const headers = headerVariants[i];
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
                return {
                    ok: res.ok,
                    isHtml: false,
                    httpStatus: res.status,
                    data: data
                };
            } catch (jsonErr) {
                if (i === headerVariants.length - 1) {
                    const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 160);
                    return {
                        ok: false,
                        isHtml: true,
                        httpStatus: res.status,
                        raw: rawText,
                        error: `Provider returned non-JSON response (HTTP ${res.status}): ${preview}`
                    };
                }
            }
        } catch (networkErr) {
            if (i === headerVariants.length - 1) {
                return {
                    ok: false,
                    isHtml: false,
                    httpStatus: 0,
                    error: `Network error: ${networkErr.message}`
                };
            }
        }
    }
}

/**
 * Fetch all registered API providers from Firestore
 */
async function getProvidersMap() {
    const providersMap = new Map();
    try {
        const providersSnap = await db.collection('artifacts').doc(APP_ID).collection('api_providers').get();
        providersSnap.forEach(doc => {
            const d = doc.data();
            if (d && d.url && d.apiKey) {
                providersMap.set(doc.id, {
                    url: d.url,
                    apiKey: d.apiKey,
                    status: d.status || 'Active',
                    name: d.name || doc.id
                });
            }
        });
    } catch (e) {
        console.warn("[Cron Order Sync] Could not load providers collection:", e.message);
    }
    return providersMap;
}

/**
 * Resolve the API URL and Key for a given order
 */
function resolveProviderForOrder(order, providersMap) {
    if (order.providerId && providersMap.has(order.providerId)) {
        const p = providersMap.get(order.providerId);
        return { url: normalizeProviderUrl(p.url), apiKey: p.apiKey, providerId: order.providerId };
    }
    // Fallback to first active provider in map
    for (const [pId, p] of providersMap.entries()) {
        if (p.status === 'Active') {
            return { url: normalizeProviderUrl(p.url), apiKey: p.apiKey, providerId: pId };
        }
    }
    // Final fallback to defaults
    return { url: DEFAULT_PROVIDER_URL, apiKey: DEFAULT_PROVIDER_KEY, providerId: 'default' };
}

/**
 * Auto-refund user balance for failed or canceled orders
 */
async function refundUserBalance(orderDoc, amount, reason) {
    if (!amount || amount <= 0) return;
    try {
        const pathParts = orderDoc.ref.path.split('/');
        const userId = pathParts[3]; // artifacts/{appId}/users/{userId}/orders/{orderId}
        if (!userId) return;

        const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
        await db.runTransaction(async (t) => {
            const sSnap = await t.get(statsRef);
            if (sSnap.exists) {
                t.update(statsRef, {
                    balance: admin.firestore.FieldValue.increment(parseFloat(amount)),
                    totalSpent: admin.firestore.FieldValue.increment(-parseFloat(amount))
                });
            }
        });
        console.log(`[Cron Order Sync] Refunded Rs. ${amount} to user ${userId} (${reason})`);
    } catch (err) {
        console.error(`[Cron Order Sync] Error refunding user for order ${orderDoc.id}:`, err.message);
    }
}

/**
 * Netlify Scheduled Cron: Runs Every 1 Minute
 * Schedule: * * * * *
 */
exports.handler = async (event, context) => {
    console.log("[Cron Order Sync] Starting automated order cycle...");

    try {
        const providersMap = await getProvidersMap();
        await forwardPendingOrders(providersMap);
        await syncActiveOrderStatus(providersMap);
        return { statusCode: 200, body: JSON.stringify({ success: true, timestamp: new Date().toISOString() }) };
    } catch (err) {
        console.error("[Cron Order Sync] Global Error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};

// 1. Forward Pending Orders to Upstream API
async function forwardPendingOrders(providersMap) {
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

        // Skip orders already marked with fatal permanent error
        if (order.status === 'Failed' || order.status === 'Canceled') {
            continue;
        }

        if (!serviceId || !order.link || !order.quantity) {
            console.warn(`[Cron Order Sync] Skipping malformed order ${orderDoc.id}: Missing service, link, or quantity.`);
            await orderDoc.ref.update({
                status: 'Failed',
                failReason: 'Missing required parameters (serviceId, link, or quantity)',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            continue;
        }

        const provider = resolveProviderForOrder(order, providersMap);
        const attempts = (order.forwardAttempts || 0) + 1;

        const bodyParams = {
            key: provider.apiKey,
            action: 'add',
            service: String(serviceId),
            link: order.link,
            quantity: String(order.quantity)
        };

        if (order.comments) bodyParams.comments = order.comments;

        const result = await safeFetchJson(provider.url, bodyParams);

        if (!result.ok && result.isHtml) {
            // HTML / Cloudflare response received
            console.error(`[Cron Order Sync] Order ${orderDoc.id} received HTML from provider (Attempt ${attempts}): ${result.error}`);
            
            const updatePayload = {
                forwardAttempts: attempts,
                lastForwardError: result.error,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // If it keeps failing after 5 attempts, fail order gracefully to stop blocking cron
            if (attempts >= 5) {
                updatePayload.status = 'Failed';
                updatePayload.failReason = 'Upstream provider unavailable (Cloudflare/HTML response)';
                console.warn(`[Cron Order Sync] Order ${orderDoc.id} marked Failed after ${attempts} failed attempts.`);
                
                if (!order.refunded && order.charge > 0) {
                    await refundUserBalance(orderDoc, order.charge, 'Provider Unavailable');
                    updatePayload.refunded = true;
                }
            }

            await orderDoc.ref.update(updatePayload);
            continue;
        }

        if (result.error && !result.data) {
            // Network error
            console.error(`[Cron Order Sync] Network error for order ${orderDoc.id} (Attempt ${attempts}): ${result.error}`);
            await orderDoc.ref.update({
                forwardAttempts: attempts,
                lastForwardError: result.error,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            });
            continue;
        }

        const data = result.data;

        if (data && data.order) {
            // SUCCESS: Provider accepted the order
            await orderDoc.ref.update({
                status: 'In progress',
                externalOrderId: String(data.order),
                providerId: provider.providerId,
                forwardedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                forwardAttempts: attempts,
                lastForwardError: null
            });
            console.log(`[Cron Order Sync] Order ${orderDoc.id} sent successfully. External ID: ${data.order}`);
        } else {
            // Upstream provider returned an error message in JSON
            const providerErrMsg = data ? (data.error || JSON.stringify(data)) : 'Unknown provider error';
            console.error(`[Cron Order Sync] Provider rejected order ${orderDoc.id}: ${providerErrMsg}`);

            const isFatalError = /incorrect api key|user disabled|not enough balance|service not found|bad link|invalid quantity/i.test(providerErrMsg);
            const updatePayload = {
                forwardAttempts: attempts,
                lastForwardError: providerErrMsg,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isFatalError || attempts >= 3) {
                updatePayload.status = 'Failed';
                updatePayload.failReason = providerErrMsg;
                console.warn(`[Cron Order Sync] Order ${orderDoc.id} permanently failed: ${providerErrMsg}`);

                if (!order.refunded && order.charge > 0) {
                    await refundUserBalance(orderDoc, order.charge, `Order Failed: ${providerErrMsg}`);
                    updatePayload.refunded = true;
                }
            }

            await orderDoc.ref.update(updatePayload);
        }
    }
}

// 2. Sync Active Orders & Handle Partial/Cancellation Refunds
async function syncActiveOrderStatus(providersMap) {
    const activeSnap = await db.collectionGroup('orders')
        .where('status', 'in', ['In progress', 'Processing', 'Pending'])
        .limit(100)
        .get();

    if (activeSnap.empty) return;

    for (const orderDoc of activeSnap.docs) {
        const order = orderDoc.data();
        const externalId = order.externalOrderId;

        if (!externalId) continue;

        const provider = resolveProviderForOrder(order, providersMap);
        const result = await safeFetchJson(provider.url, {
            key: provider.apiKey,
            action: 'status',
            order: String(externalId)
        });

        if (!result.data || result.isHtml) {
            if (result.isHtml) {
                console.warn(`[Cron Order Sync] Status check received HTML for order ${orderDoc.id} (External ID: ${externalId})`);
            }
            continue;
        }

        const data = result.data;

        if (data && data.status) {
            const upstreamStatus = data.status;
            let mappedStatus = upstreamStatus;

            if (upstreamStatus === 'Completed') mappedStatus = 'Completed';
            else if (upstreamStatus === 'In progress') mappedStatus = 'In progress';
            else if (upstreamStatus === 'Processing') mappedStatus = 'In progress';
            else if (upstreamStatus === 'Partial') mappedStatus = 'Partial';
            else if (upstreamStatus === 'Canceled' || upstreamStatus === 'Cancelled') mappedStatus = 'Canceled';

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
                        await refundUserBalance(orderDoc, refundAmount, `Partial Refund (${remains}/${quantity} remains)`);
                        updatePayload.partialRefunded = true;
                        updatePayload.refundAmount = refundAmount;
                    }
                }
            }

            // Automatic Full Cancellation Refund
            if (mappedStatus === 'Canceled' && order.status !== 'Canceled' && !order.canceledRefunded) {
                const charge = parseFloat(order.charge) || 0;
                if (charge > 0) {
                    await refundUserBalance(orderDoc, charge, 'Full Refund for Canceled Order');
                    updatePayload.canceledRefunded = true;
                }
            }

            await orderDoc.ref.update(updatePayload);
        }
    }
}
