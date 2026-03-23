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
const APP_ID = process.env.APP_ID || 'masmmpanel-default';

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
        const apiUrl = providerData.url;
        const apiKey = providerData.apiKey;

        // Extract origin for stealth headers
        const urlObj = new URL(apiUrl);
        const origin = urlObj.origin;

        // Comprehensive headers to bypass Cloudflare Bot Protection
        const stealthHeaders = { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': origin,
            'Referer': origin + '/'
        };

        // ==========================================
        // ACTION 1: Fetch Remote Services & Convert (Preview)
        // ==========================================
        if (action === 'fetch_remote') {
            
            // --- STEP 1: Detect Provider's Base Currency ---
            let providerCurrency = 'USD'; // Default fallback
            try {
                const balParams = new URLSearchParams();
                balParams.append('key', apiKey);
                balParams.append('action', 'balance');
                
                const balRes = await fetch(apiUrl, { method: 'POST', body: balParams, headers: stealthHeaders });
                const balData = JSON.parse(await balRes.text());
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
                            // Use the "bid" (selling price) for accurate real-time market rate
                            exchangeRateToPKR = parseFloat(xrData[pairKey].bid);
                        }
                    } else {
                        // Fallback: If real-time API is rate-limited, fall back to the 24h updated API
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
            const params = new URLSearchParams();
            params.append('key', apiKey);
            params.append('action', 'services');

            let apiResponse;
            try {
                apiResponse = await fetch(apiUrl, { method: 'POST', body: params, headers: stealthHeaders });
            } catch (fetchErr) {
                throw new Error(`Failed to reach provider server. Check the API URL. Details: ${fetchErr.message}`);
            }

            const rawText = await apiResponse.text();
            let upstreamServices;

            try {
                upstreamServices = JSON.parse(rawText);
            } catch (err) {
                console.error("Non-JSON API Response:", rawText);
                throw new Error(`Provider did not return JSON (Status: ${apiResponse.status}). It may be blocking the request via Cloudflare. Response snippet: ${rawText.substring(0, 150)}...`);
            }

            if (upstreamServices.error) {
                throw new Error(`Upstream API Error: ${upstreamServices.error}`);
            }

            // --- STEP 4: Convert all rates to PKR for the frontend preview ---
            const convertedServices = upstreamServices.map(service => {
                const originalRate = parseFloat(service.rate) || 0;
                // Override the rate with the converted PKR value
                service.rate = (originalRate * exchangeRateToPKR).toFixed(4);
                
                // Add tracking metadata (optional, just in case frontend wants it)
                service._original_currency = providerCurrency;
                service._original_rate = originalRate;
                service._pkr_exchange_rate = exchangeRateToPKR;
                
                return service;
            });

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
                // Use the upstream service ID as the document ID to prevent duplicates
                const docRef = servicesRef.doc(`imported_${providerId}_${service.service}`); 
                
                // Note: service.rate is ALREADY IN PKR here because we converted it during fetch_remote!
                const basePkrRate = parseFloat(service.rate);
                const finalSellingRate = (basePkrRate * markupMultiplier).toFixed(4);

                batch.set(docRef, {
                    serviceId: service.service,
                    name: service.name,
                    categoryId: targetCategoryId,
                    rate: finalSellingRate, // Saved securely in PKR
                    min: service.min,
                    max: service.max,
                    description: service.desc || 'Imported Service',
                    providerId: providerId,
                    status: 'Active',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                importedCount++;
                
                // Commit batches of 400 to respect Firestore transaction limits
                if (importedCount % 400 === 0) {
                    await batch.commit();
                }
            }

            // Commit any remaining items
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