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

        // ==========================================
        // ACTION 1: Fetch Remote Services (Preview)
        // ==========================================
        if (action === 'fetch_remote') {
            const params = new URLSearchParams();
            params.append('key', apiKey);
            params.append('action', 'services');

            let apiResponse;
            try {
                // We add a User-Agent to prevent Cloudflare/Security from blocking the automated request
                apiResponse = await fetch(apiUrl, {
                    method: 'POST',
                    body: params,
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
            } catch (fetchErr) {
                throw new Error(`Failed to reach provider server. Check the API URL. Details: ${fetchErr.message}`);
            }

            // Read as text first to prevent JSON parse crashes on HTML error pages
            const rawText = await apiResponse.text();
            let upstreamServices;

            try {
                upstreamServices = JSON.parse(rawText);
            } catch (err) {
                console.error("Non-JSON API Response:", rawText);
                throw new Error(`Provider did not return JSON (Status: ${apiResponse.status}). It may be blocking the request. Response snippet: ${rawText.substring(0, 150)}...`);
            }

            if (upstreamServices.error) {
                throw new Error(`Upstream API Error: ${upstreamServices.error}`);
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, services: upstreamServices })
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
                
                // Calculate new rate
                const originalRate = parseFloat(service.rate);
                const myRate = (originalRate * markupMultiplier).toFixed(4);

                batch.set(docRef, {
                    serviceId: service.service,
                    name: service.name,
                    categoryId: targetCategoryId,
                    rate: myRate,
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
                body: JSON.stringify({ success: true, message: `Successfully imported ${importedCount} services into your category.` })
            };
        }

        throw new Error("Invalid action specified.");

    } catch (error) {
        console.error("Sync Error:", error);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
    }
};