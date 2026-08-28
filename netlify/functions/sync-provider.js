const admin = require('firebase-admin');

// Initialize Firebase Admin securely using environment variables
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (error) {
        console.error("Firebase Admin Init Error:", error);
    }
}

const db = admin.firestore();
const GLOBAL_PROXY_RELAY = process.env.PROXY_RELAY_URL || 'https://pak-proxy.mubashirarham12.workers.dev/';

function buildStealthHeaders(origin) {
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
        'Sec-Fetch-Site': 'same-origin'
    };
}

async function safeFetchWithRelay(apiUrl, params, proxyRelayUrl) {
    const body = new URLSearchParams(params);
    let origin = 'https://paksmmpanals.com';
    try {
        origin = new URL(apiUrl).origin;
    } catch(e) {}

    const headers = buildStealthHeaders(origin);
    const relay = (proxyRelayUrl || GLOBAL_PROXY_RELAY || '').trim();

    // 1. Try Direct Stealth Request
    try {
        const res = await fetch(apiUrl, { method: 'POST', body: body, headers: headers });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            return { ok: res.ok, status: res.status, data };
        } catch(jsonErr) {
            // Non-JSON / HTML returned - try relay if configured
            if (relay) {
                console.log(`[SyncProvider] Direct fetch returned HTML (Status ${res.status}). Retrying via Proxy Relay...`);
                const separator = relay.includes('?') ? '&' : '?';
                const relayEndpoint = `${relay}${separator}target=${encodeURIComponent(apiUrl)}`;
                const proxyRes = await fetch(relayEndpoint, { method: 'POST', body: body, headers: headers });
                const proxyText = await proxyRes.text();
                const proxyData = JSON.parse(proxyText);
                return { ok: proxyRes.ok, status: proxyRes.status, data: proxyData, viaProxy: true };
            }
            throw new Error(`Provider did not return JSON (Status: ${res.status}). Response snippet: ${text.substring(0, 150)}...`);
        }
    } catch(err) {
        if (relay && !err.message.includes('viaProxy')) {
            console.log(`[SyncProvider] Network error on direct fetch: ${err.message}. Retrying via Proxy Relay...`);
            const separator = relay.includes('?') ? '&' : '?';
            const relayEndpoint = `${relay}${separator}target=${encodeURIComponent(apiUrl)}`;
            const proxyRes = await fetch(relayEndpoint, { method: 'POST', body: body, headers: headers });
            const proxyText = await proxyRes.text();
            const proxyData = JSON.parse(proxyText);
            return { ok: proxyRes.ok, status: proxyRes.status, data: proxyData, viaProxy: true };
        }
        throw err;
    }
}

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const payload = JSON.parse(event.body);
        const { providerId, action } = payload;
        
        if (!providerId || !action) {
            throw new Error("Provider ID and Action are required.");
        }

        // Fetch the Provider's URL and API Key from the database
        const providerDoc = await db.collection('artifacts').doc(APP_ID).collection('api_providers').doc(providerId).get();
        if (!providerDoc.exists) throw new Error("Provider not found.");
        
        const providerData = providerDoc.data();
        
        // Normalize URL to enforce HTTPS and fix typos/missing endpoints
        let rawUrl = (providerData.url || '').trim();
        if (rawUrl.startsWith('http://')) rawUrl = 'https://' + rawUrl.slice(7);
        else if (!rawUrl.startsWith('https://')) rawUrl = 'https://' + rawUrl;
        rawUrl = rawUrl.replace(/paksmmpanels\.com/g, 'paksmmpanals.com').replace(/\/+$/, '');
        if (!rawUrl.includes('/api/')) rawUrl = rawUrl + '/api/v2';
        
        const apiUrl = rawUrl;
        const apiKey = (providerData.apiKey || '').trim();
        const proxyUrl = (providerData.proxyUrl || '').trim();

        // ==========================================
        // ACTION 1: Fetch Remote Services & Convert (Preview / Auto Import)
        // ==========================================
        if (action === 'fetch_remote' || action === 'import_all_categories') {
            
            // --- STEP 1: Detect Provider's Base Currency ---
            let providerCurrency = 'USD'; // Default fallback
            try {
                const balResult = await safeFetchWithRelay(apiUrl, { key: apiKey, action: 'balance' }, proxyUrl);
                const balData = balResult.data;
                if (balData && balData.currency) {
                    providerCurrency = balData.currency.toUpperCase();
                }
            } catch(err) {
                console.warn("Could not fetch balance for currency detection. Defaulting to USD.");
            }

            // --- STEP 2: Fetch Live Exchange Rate to PKR ---
            let exchangeRateToPKR = 1;
            if (providerCurrency !== 'PKR') {
                try {
                    // Primary: AwesomeAPI for real-time market rates (Updates every 30 seconds)
                    const xrRes = await fetch(`https://economia.awesomeapi.com.br/json/last/${providerCurrency}-PKR`);
                    
                    if (xrRes.ok) {
                        const xrData = await xrRes.json();
                        const pairKey = `${providerCurrency}PKR`; // e.g., USDPKR
                        
                        if (xrData && xrData[pairKey] && xrData[pairKey].bid) {
                            exchangeRateToPKR = parseFloat(xrData[pairKey].bid);
                        }
                    } else {
                        const fallbackRes = await fetch(`https://open.er-api.com/v6/latest/${providerCurrency}`);
                        if (fallbackRes.ok) {
                            const fallbackData = await fallbackRes.json();
                            if (fallbackData && fallbackData.rates && fallbackData.rates.PKR) {
                                exchangeRateToPKR = fallbackData.rates.PKR;
                            }
                        }
                    }
                } catch(err) {
                    console.warn(`Could not fetch live exchange rate for ${providerCurrency}. Using static fallbacks.`);
                    if (providerCurrency === 'USD') exchangeRateToPKR = 278.0; // Static fallback
                    if (providerCurrency === 'EUR') exchangeRateToPKR = 300.0;
                    if (providerCurrency === 'INR') exchangeRateToPKR = 3.3;
                }
            }

            // --- STEP 3: Fetch the actual services list ---
            const servicesResult = await safeFetchWithRelay(apiUrl, { key: apiKey, action: 'services' }, proxyUrl);
            const upstreamServices = servicesResult.data;

            if (!upstreamServices || upstreamServices.error) {
                throw new Error(`Upstream API Error: ${upstreamServices ? upstreamServices.error : 'Invalid response'}`);
            }

            // --- STEP 4: Convert all rates to PKR for the frontend preview ---
            const convertedServices = upstreamServices.map(service => {
                const originalRate = parseFloat(service.rate) || 0;
                service.rate = (originalRate * exchangeRateToPKR).toFixed(4);
                service._original_currency = providerCurrency;
                service._original_rate = originalRate;
                service._pkr_exchange_rate = exchangeRateToPKR;
                return service;
            });

            if (action === 'fetch_remote') {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        success: true, 
                        currency_detected: providerCurrency,
                        exchange_rate_used: exchangeRateToPKR,
                        services: convertedServices 
                    })
                };
            }

            if (action === 'wipe_and_import_all' || action === 'import_all_categories') {
                const markupPercentage = parseFloat(payload.markupPercentage) || 150;
                const markupMultiplier = markupPercentage / 100;
                
                const catsRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('categories');
                const servicesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services');

                // If wipe requested, clean out all old services and categories first
                if (action === 'wipe_and_import_all') {
                    const oldServices = await servicesRef.get();
                    let wipeBatch = db.batch();
                    let wipeOps = 0;
                    for (const sDoc of oldServices.docs) {
                        wipeBatch.delete(sDoc.ref);
                        wipeOps++;
                        if (wipeOps >= 400) {
                            await wipeBatch.commit();
                            wipeBatch = db.batch();
                            wipeOps = 0;
                        }
                    }
                    if (wipeOps > 0) await wipeBatch.commit();

                    const oldCats = await catsRef.get();
                    wipeBatch = db.batch();
                    wipeOps = 0;
                    for (const cDoc of oldCats.docs) {
                        wipeBatch.delete(cDoc.ref);
                        wipeOps++;
                        if (wipeOps >= 400) {
                            await wipeBatch.commit();
                            wipeBatch = db.batch();
                            wipeOps = 0;
                        }
                    }
                    if (wipeOps > 0) await wipeBatch.commit();
                }

                // 1. Fetch existing local categories to avoid duplicates
                const localCatsSnap = await catsRef.get();
                const categoryNameToId = {};
                localCatsSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.name) categoryNameToId[data.name.toLowerCase().trim()] = doc.id;
                });

                // 2. Identify Unique Remote Categories and Create Missing Ones
                const uniqueRemoteCats = [...new Set(convertedServices.map(s => (s.category || 'Other Services')).filter(Boolean))];
                let createdCatsCount = 0;
                let sortIndex = 1;
                for (const catName of uniqueRemoteCats) {
                    const normalized = catName.toLowerCase().trim();
                    if (!categoryNameToId[normalized]) {
                        const newCatRef = await catsRef.add({
                            name: catName,
                            sort: sortIndex++,
                            status: 'Active',
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        categoryNameToId[normalized] = newCatRef.id;
                        createdCatsCount++;
                    }
                }

                // 3. Batch insert all services
                let importedCount = 0;
                let currentBatch = db.batch();
                let batchOpsCount = 0;
                let batchPromises = [];

                for (const service of convertedServices) {
                    const catName = (service.category || 'Other Services').trim();
                    const targetCategoryId = categoryNameToId[catName.toLowerCase().trim()];
                    if (!targetCategoryId) continue;
                    
                    const docId = `imported_${providerId}_${service.service}`;
                    const docRef = servicesRef.doc(docId);
                    
                    const basePkrRate = parseFloat(service.rate);
                    const finalSellingRate = (basePkrRate * markupMultiplier).toFixed(4);

                    currentBatch.set(docRef, {
                        serviceId: String(service.service),
                        name: service.name,
                        categoryId: targetCategoryId,
                        categoryName: catName,
                        rate: finalSellingRate,
                        originalRate: service._original_rate || 0,
                        providerRate: Number(basePkrRate.toFixed(4)),
                        min: parseInt(service.min) || 1,
                        max: parseInt(service.max) || 10000000,
                        description: service.description || service.desc || '',
                        desc: service.description || service.desc || '',
                        average_time: service.average_time != null ? service.average_time : null,
                        type: service.type || 'Default',
                        providerId: providerId,
                        providerName: 'PakSMMPanels',
                        status: 'Active',
                        metadata_markup: markupMultiplier,
                        dripfeed: !!service.dripfeed,
                        refill: !!service.refill || service.refill === '1' || service.refill === true,
                        cancel: !!service.cancel || service.cancel === '1' || service.cancel === true,
                        _original_currency: service._original_currency || 'USD',
                        _pkr_exchange_rate: exchangeRateToPKR,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    batchOpsCount++;
                    importedCount++;
                    
                    if (batchOpsCount >= 400) {
                        batchPromises.push(currentBatch.commit());
                        currentBatch = db.batch();
                        batchOpsCount = 0;
                    }
                }
                
                if (batchOpsCount > 0) {
                    batchPromises.push(currentBatch.commit());
                }
                
                await Promise.all(batchPromises);

                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        success: true, 
                        message: `Successfully processed ${importedCount} services across ${uniqueRemoteCats.length} categories (${createdCatsCount} created).` 
                    })
                };
            }
        }

        // ==========================================
        // ACTION 2: Import Specific Selections
        // ==========================================
        if (action === 'import_selected') {
            const { selectedServices, targetCategoryId, markupPercentage } = payload;

            if (!selectedServices || !Array.isArray(selectedServices) || selectedServices.length === 0) {
                throw new Error("No services selected for import.");
            }
            if (!targetCategoryId) {
                throw new Error("Target local category ID is required.");
            }

            const servicesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services');
            const batch = db.batch();
            let importedCount = 0;

            const markupMultiplier = (parseFloat(markupPercentage) || 100) / 100;

            for (const service of selectedServices) {
                const docRef = servicesRef.doc(`imported_${providerId}_${service.service}`); 
                const basePkrRate = parseFloat(service.rate);
                const finalSellingRate = (basePkrRate * markupMultiplier).toFixed(4);

                batch.set(docRef, {
                    serviceId: service.service,
                    name: service.name,
                    categoryId: targetCategoryId,
                    rate: finalSellingRate,
                    min: service.min,
                    max: service.max,
                    description: service.desc || 'Imported Service',
                    providerId: providerId,
                    status: 'Active',
                    metadata_markup: markupMultiplier,
                    refill: !!service.refill || service.refill === '1' || service.refill === true,
                    cancel: !!service.cancel || service.cancel === '1' || service.cancel === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                importedCount++;
                
                if (importedCount % 400 === 0) {
                    await batch.commit();
                }
            }

            await batch.commit();

            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, message: `Successfully imported ${importedCount} services (Converted to PKR) into your category.` })
            };
        }

        throw new Error("Invalid action specified.");

    } catch (error) {
        console.error("Sync Error:", error);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
    }
};