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
const GLOBAL_PROXY_RELAY = process.env.PROXY_RELAY_URL || 'https://pak-proxy.mubashirarham12.workers.dev/';

/**
 * Robust URL normalization to prevent 403/301 redirects and typos
 */
function normalizeProviderUrl(url) {
    if (!url) return DEFAULT_PROVIDER_URL;
    let clean = url.trim();
    
    // Enforce HTTPS
    if (clean.startsWith('http://')) {
        clean = 'https://' + clean.slice(7);
    } else if (!clean.startsWith('https://')) {
        clean = 'https://' + clean;
    }
    
    // Auto-fix domain typo if paksmmpanels was saved instead of paksmmpanals
    clean = clean.replace(/paksmmpanels\.com/g, 'paksmmpanals.com');
    
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, '');
    
    // Ensure /api/v2 is present if root or subpath without API endpoint
    if (!clean.includes('/api/')) {
        clean = clean + '/api/v2';
    }
    
    return clean;
}

/**
 * Generate real-world browser headers to bypass Cloudflare Bot Fight Mode & WAF
 */
function buildStealthHeaders(apiUrl) {
    let origin = 'https://paksmmpanals.com';
    try {
        const u = new URL(apiUrl);
        origin = u.origin;
    } catch (e) {}

    return {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': origin,
        'Referer': origin + '/',
        'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'no-cache'
    };
}

/**
 * Safely send an API request via Cloudflare Worker Relay (or Direct with Stealth headers).
 * Single execution guarantee: ensures action 'add' is never dispatched multiple times!
 */
async function safeFetchJson(url, params, options = {}) {
    const normalizedUrl = normalizeProviderUrl(url);
    const body = new URLSearchParams(params);
    const proxyRelayUrl = (options.proxyUrl || GLOBAL_PROXY_RELAY || '').trim();

    // 1. Primary Route: If Cloudflare Proxy Relay is configured, route via Worker
    if (proxyRelayUrl) {
        try {
            const separator = proxyRelayUrl.includes('?') ? '&' : '?';
            const relayEndpoint = `${proxyRelayUrl}${separator}target=${encodeURIComponent(normalizedUrl)}`;

            const res = await fetch(relayEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                body: body
            });

            const rawText = await res.text();
            try {
                const data = JSON.parse(rawText);
                return {
                    ok: res.ok,
                    isHtml: false,
                    httpStatus: res.status,
                    data: data,
                    viaProxy: true
                };
            } catch (jsonErr) {
                console.warn(`[Cron Order Sync] Proxy returned non-JSON. Falling back to direct...`);
            }
        } catch (proxyErr) {
            console.warn(`[Cron Order Sync] Proxy error: ${proxyErr.message}. Falling back to direct...`);
        }
    }

    // 2. Direct Stealth Fetch (Single attempt)
    const headers = buildStealthHeaders(normalizedUrl);
    try {
        const res = await fetch(normalizedUrl, {
            method: 'POST',
            headers: headers,
            body: body
        });

        const rawText = await res.text();
        try {
            const data = JSON.parse(rawText);
            return {
                ok: res.ok,
                isHtml: false,
                httpStatus: res.status,
                data: data
            };
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
                    url: normalizeProviderUrl(d.url),
                    apiKey: d.apiKey.trim(),
                    proxyUrl: d.proxyUrl ? d.proxyUrl.trim() : '',
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
 * Resolve the API URL, Key, and optional Proxy Relay for a given order
 */
function resolveProviderForOrder(order, providersMap) {
    if (order.providerId && providersMap.has(order.providerId)) {
        const p = providersMap.get(order.providerId);
        return { url: p.url, apiKey: p.apiKey, proxyUrl: p.proxyUrl || '', providerId: order.providerId };
    }
    // Fallback to first active provider in map
    for (const [pId, p] of providersMap.entries()) {
        if (p.status === 'Active') {
            return { url: p.url, apiKey: p.apiKey, proxyUrl: p.proxyUrl || '', providerId: pId };
        }
    }
    // Final fallback to default credentials
    return { url: DEFAULT_PROVIDER_URL, apiKey: DEFAULT_PROVIDER_KEY, proxyUrl: '', providerId: 'default' };
}

/**
 * Auto-refund user balance for failed or canceled orders and create a user notification
 */
async function refundUserBalance(orderDoc, amount, reason) {
    if (!amount || amount <= 0) return;
    try {
        const pathParts = orderDoc.ref.path.split('/');
        const dynamicAppId = pathParts[1] || APP_ID;
        const userId = pathParts[3]; // artifacts/{appId}/users/{userId}/orders/{orderId}
        if (!userId) return;

        const statsRef = db.collection('artifacts').doc(dynamicAppId).collection('users').doc(userId).collection('account').doc('stats');
        await db.runTransaction(async (t) => {
            const sSnap = await t.get(statsRef);
            if (sSnap.exists) {
                t.update(statsRef, {
                    balance: admin.firestore.FieldValue.increment(parseFloat(amount)),
                    totalSpent: admin.firestore.FieldValue.increment(-parseFloat(amount))
                });
            }
        });

        // Send User In-App Notification
        try {
            const notifRef = db.collection('artifacts').doc(dynamicAppId).collection('users').doc(userId).collection('notifications').doc();
            await notifRef.set({
                title: 'Order Refunded',
                message: `Order #${orderDoc.id.substring(0, 8)} failed (${reason}). Rs. ${Number(amount).toFixed(2)} was refunded to your balance.`,
                isRead: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (nErr) {}

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

// 1. Forward Pending Orders to Upstream API with Idempotency Guard & Permanent Failure Resolution
async function forwardPendingOrders(providersMap) {
    const pendingSnap = await db.collectionGroup('orders')
        .where('status', '==', 'Pending')
        .limit(50)
        .get();

    if (pendingSnap.empty) {
        console.log("[Cron Order Sync] No pending orders found.");
        return;
    }

    const now = Date.now();
    let forwardedCount = 0;

    for (const orderDoc of pendingSnap.docs) {
        const order = orderDoc.data();

        // STRICT IDEMPOTENCY GUARD:
        // Skip orders already finalized OR already assigned an externalOrderId
        if (order.status === 'Failed' || order.status === 'Canceled' || order.status === 'Completed' || order.externalOrderId) {
            continue;
        }

        // Exponential Backoff Check: Skip orders if nextAttemptAt is in the future
        if (order.nextAttemptAt && typeof order.nextAttemptAt.toMillis === 'function') {
            if (order.nextAttemptAt.toMillis() > now) {
                continue;
            }
        }

        const serviceId = order.upstreamServiceId || order.serviceId || order.service;

        // Malformed order check: Fail immediately and refund
        if (!serviceId || !order.link || !order.quantity) {
            console.warn(`[Cron Order Sync] Failing malformed order ${orderDoc.id}: Missing service, link, or quantity.`);
            const updatePayload = {
                status: 'Failed',
                failReason: 'Missing required order parameters (serviceId, link, or quantity)',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (!order.refunded && order.charge > 0) {
                await refundUserBalance(orderDoc, order.charge, 'Malformed order parameters');
                updatePayload.refunded = true;
            }
            await orderDoc.ref.update(updatePayload);
            continue;
        }

        forwardedCount++;
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
        if (order.runs) bodyParams.runs = String(order.runs);
        if (order.interval) bodyParams.interval = String(order.interval);

        const result = await safeFetchJson(provider.url, bodyParams, { proxyUrl: provider.proxyUrl });

        // CASE 1: HTML Response / Cloudflare Block / 403 / 503
        if (!result.ok && result.isHtml) {
            console.warn(`[Cron Order Sync] Order ${orderDoc.id} received HTML from provider (Attempt ${attempts}): ${result.error}`);
            
            const updatePayload = {
                forwardAttempts: attempts,
                lastForwardError: result.error,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (attempts >= 3) {
                // Permanently fail and auto-refund after 3 attempts to prevent infinite retry loops
                updatePayload.status = 'Failed';
                updatePayload.failReason = 'Upstream provider connection refused (Cloudflare 403 / HTML response)';
                updatePayload.nextAttemptAt = null;
                console.warn(`[Cron Order Sync] Order ${orderDoc.id} marked Failed after ${attempts} failed attempts.`);
                
                if (!order.refunded && order.charge > 0) {
                    await refundUserBalance(orderDoc, order.charge, 'Upstream provider unavailable');
                    updatePayload.refunded = true;
                }
            } else {
                // Apply exponential backoff (Attempt 1: wait 2m, Attempt 2: wait 4m)
                const backoffDelayMinutes = attempts === 1 ? 2 : 4;
                const nextAttemptDate = new Date(now + backoffDelayMinutes * 60 * 1000);
                updatePayload.nextAttemptAt = admin.firestore.Timestamp.fromDate(nextAttemptDate);
            }

            await orderDoc.ref.update(updatePayload);
            continue;
        }

        // CASE 2: Network / Timeout Error
        if (result.error && !result.data) {
            console.warn(`[Cron Order Sync] Network error for order ${orderDoc.id} (Attempt ${attempts}): ${result.error}`);
            
            const updatePayload = {
                forwardAttempts: attempts,
                lastForwardError: result.error,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (attempts >= 3) {
                updatePayload.status = 'Failed';
                updatePayload.failReason = `Network timeout reaching provider: ${result.error}`;
                updatePayload.nextAttemptAt = null;

                if (!order.refunded && order.charge > 0) {
                    await refundUserBalance(orderDoc, order.charge, 'Provider network timeout');
                    updatePayload.refunded = true;
                }
            } else {
                const backoffDelayMinutes = attempts === 1 ? 2 : 4;
                const nextAttemptDate = new Date(now + backoffDelayMinutes * 60 * 1000);
                updatePayload.nextAttemptAt = admin.firestore.Timestamp.fromDate(nextAttemptDate);
            }

            await orderDoc.ref.update(updatePayload);
            continue;
        }

        const data = result.data;

        // CASE 3: SUCCESS - Provider Accepted the Order
        if (data && data.order) {
            await orderDoc.ref.update({
                status: 'In progress',
                externalOrderId: String(data.order),
                providerId: provider.providerId,
                forwardedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                forwardAttempts: attempts,
                lastForwardError: null,
                nextAttemptAt: null
            });
            console.log(`[Cron Order Sync] Order ${orderDoc.id} sent successfully${result.viaProxy ? ' (via Proxy Relay)' : ''}. External ID: ${data.order}`);
        } else {
            // CASE 4: Provider returned JSON rejection / error
            const providerErrMsg = data ? (data.error || JSON.stringify(data)) : 'Unknown provider error';
            console.warn(`[Cron Order Sync] Provider rejected order ${orderDoc.id}: ${providerErrMsg}`);

            // Detect non-recoverable fatal errors (immediately fail and refund without waiting)
            const isFatalError = /incorrect service type|service not found|bad link|invalid link|invalid quantity|incorrect api key|user disabled|not enough balance|minimum quantity|maximum quantity|disabled/i.test(providerErrMsg);

            const updatePayload = {
                forwardAttempts: attempts,
                lastForwardError: providerErrMsg,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isFatalError || attempts >= 3) {
                updatePayload.status = 'Failed';
                updatePayload.failReason = providerErrMsg;
                updatePayload.nextAttemptAt = null;
                console.warn(`[Cron Order Sync] Order ${orderDoc.id} permanently failed: ${providerErrMsg}`);

                if (!order.refunded && order.charge > 0) {
                    await refundUserBalance(orderDoc, order.charge, `Order Failed: ${providerErrMsg}`);
                    updatePayload.refunded = true;
                }
            } else {
                const backoffDelayMinutes = attempts === 1 ? 2 : 4;
                const nextAttemptDate = new Date(now + backoffDelayMinutes * 60 * 1000);
                updatePayload.nextAttemptAt = admin.firestore.Timestamp.fromDate(nextAttemptDate);
            }

            await orderDoc.ref.update(updatePayload);
        }
    }

    if (forwardedCount > 0) {
        console.log(`[Cron Order Sync] Processed ${forwardedCount} eligible pending orders.`);
    }
}

// 2. Sync Active Orders & Handle Partial/Cancellation Refunds
async function syncActiveOrderStatus(providersMap) {
    const activeSnap = await db.collectionGroup('orders')
        .where('status', 'in', ['In progress', 'Processing'])
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
        }, { proxyUrl: provider.proxyUrl });

        if (!result.data || result.isHtml) {
            continue;
        }

        const data = result.data;

        if (data && data.status) {
            const upstreamStatus = data.status;
            let mappedStatus = upstreamStatus;

            if (upstreamStatus === 'Completed' || upstreamStatus === 'Done') mappedStatus = 'Completed';
            else if (upstreamStatus === 'In progress' || upstreamStatus === 'Processing') mappedStatus = 'In progress';
            else if (upstreamStatus === 'Partial') mappedStatus = 'Partial';
            else if (upstreamStatus === 'Canceled' || upstreamStatus === 'Cancelled') mappedStatus = 'Canceled';
            else if (upstreamStatus === 'Pending') mappedStatus = 'In progress'; // Keep as 'In progress' locally to prevent re-forwarding loops!

            const updatePayload = {
                status: mappedStatus,
                startCount: data.start_count !== undefined ? data.start_count : (order.startCount || 0),
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
