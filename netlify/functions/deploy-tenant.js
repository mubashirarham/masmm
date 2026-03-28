const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch(e) {
        console.error("Firebase Admin Init Error:", e);
    }
}

exports.handler = async (event) => {
    // Enable CORS
    const headers = { 
        'Access-Control-Allow-Origin': '*', 
        'Content-Type': 'application/json' 
    };
    
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // Secure Authentication Gate (Requires Firebase Logged In Context)
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Missing token' }) };
        }
        
        const idToken = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(idToken);

        const { domain } = JSON.parse(event.body);
        if (!domain) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing domain string' }) };
        }

        // Netlify Automated Binding Secrets
        const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;
        const siteId = process.env.NETLIFY_SITE_ID;

        if (!netlifyToken || !siteId) {
            console.warn("Netlify Auto-Deploy SKIPPED: Missing NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID env variables.");
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    success: false, 
                    skipped: true, 
                    message: 'Panel deployed to DB successfully. However, manual Netlify DNS binding is still required because admin API keys are not configured.' 
                }) 
            };
        }

        // --- Step 1: Fetch Existing Site Profile from Netlify ---
        const getRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
            headers: { 'Authorization': `Bearer ${netlifyToken}` }
        });
        
        if (!getRes.ok) {
            const err = await getRes.json();
            console.error("Netlify GET Config Error:", err);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to interface with Netlify configurations' }) };
        }

        const siteData = await getRes.json();
        const existingAliases = siteData.domain_aliases || [];

        // Escape immediately if domain is perfectly bound
        if (existingAliases.includes(domain)) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Domain alias already mounted online' }) };
        }

        // --- Step 2: Append & Re-upload Site Configuration to Netlify ---
        existingAliases.push(domain);

        const putRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${netlifyToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain_aliases: existingAliases })
        });

        if (!putRes.ok) {
            const putErr = await putRes.json();
            console.error("Netlify PUT Config Error:", putErr);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to mount domain alias over Netlify API' }) };
        }

        return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Domain successfully binded to Netlify infrastructure via API!' }) };

    } catch (error) {
        console.error("Tenant Auto-Deploy System Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error during deployment processing' }) };
    }
};
