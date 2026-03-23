const admin = require('firebase-admin');

// Initialize Firebase Admin securely
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
        // Parse the payload sent from the admin panel
        const payload = JSON.parse(event.body);
        const { providerId, action } = payload;
        
        if (!providerId || !action) {
            throw new Error("Provider ID and Action are required.");
        }

        // Fetch the Provider's URL and API Key from your database
        const providerDoc = await db.collection('artifacts').doc(APP_ID).collection('system').doc('api_providers').doc(providerId).get();
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

            const apiResponse = await fetch(apiUrl, {
                method: 'POST',
                body: params,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const upstreamServices = await apiResponse.json();

            if (upstreamServices.error) {
                throw new Error(`Upstream API Error: ${upstreamServices.error}`);
            }

            // Return the list to the Admin Panel so the Admin can choose what to import
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
                
                // Calculate new price based on the admin's chosen markup
                const originalRate = parseFloat(service.rate);
                const myRate = (originalRate * markupMultiplier).toFixed(4);

                batch.set(docRef, {
                    serviceId: service.service, // The original upstream ID
                    name: service.name,
                    categoryId: targetCategoryId, // Assigned to YOUR specific category
                    rate: myRate,
                    min: service.min,
                    max: service.max,
                    description: service.desc || 'Imported Service',
                    providerId: providerId, // Keep track of where this came from
                    status: 'Active',
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
                body: JSON.stringify({ success: true, message: `Successfully imported ${importedCount} services into your category.` })
            };
        }

        throw new Error("Invalid action specified.");

    } catch (error) {
        console.error("Sync Error:", error);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
    }
};