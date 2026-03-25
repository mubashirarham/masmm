const admin = require('firebase-admin');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';

exports.handler = async (event, context) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Standard SMM API parameters usually come as form-data or JSON
    let params = {};
    try {
        if (event.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
            params = Object.fromEntries(new URLSearchParams(event.body));
        } else {
            params = JSON.parse(event.body);
        }
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Request Format' }) };
    }

    const { key, action } = params;

    if (!key) return { statusCode: 401, body: JSON.stringify({ error: 'API Key is required' }) };

    try {
        // 1. Authenticate User by API Key
        // Note: In production, you'd ideally index this, but for simplicity we fetch by UID if key matches
        // For a true provider API, we search for the document where key == key.
        const apiQuery = await db.collectionGroup('api').where('key', '==', key).limit(1).get();
        
        if (apiQuery.empty) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
        }

        const apiDoc = apiQuery.docs[0];
        const pathSegments = apiDoc.ref.path.split('/');
        const userId = pathSegments[3]; // artifacts/{appId}/users/{userId}/...
        
        const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
        const statsSnap = await statsRef.get();
        const userData = statsSnap.exists ? statsSnap.data() : { balance: 0 };

        // 2. Handle Actions
        switch (action) {
            case 'balance':
                return { 
                    statusCode: 200, 
                    headers, 
                    body: JSON.stringify({ balance: userData.balance, currency: 'PKR' }) 
                };

            case 'services':
                const servicesSnap = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services').where('status', '==', 'Active').get();
                const services = servicesSnap.docs.map(d => {
                    const s = d.data();
                    return {
                        service: d.id,
                        name: s.name,
                        rate: s.rate,
                        min: s.min,
                        max: s.max,
                        category: s.categoryId
                    };
                });
                return { statusCode: 200, headers, body: JSON.stringify(services) };

            case 'add':
                const { service, link, quantity } = params;
                const srvRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services').doc(service);
                const srvSnap = await srvRef.get();

                if (!srvSnap.exists) return { statusCode: 400, body: JSON.stringify({ error: 'Service not found' }) };
                
                const srvData = srvSnap.data();
                const charge = (parseFloat(srvData.rate) / 1000) * parseInt(quantity);

                if (userData.balance < charge) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Insufficient balance' }) };
                }

                // Create Order
                const orderRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('orders').doc();
                await db.runTransaction(async (t) => {
                    t.set(orderRef, {
                        serviceId: service,
                        serviceName: srvData.name,
                        providerId: srvData.providerId || null,
                        upstreamServiceId: srvData.serviceId || null,
                        link: link,
                        quantity: parseInt(quantity),
                        charge: charge,
                        status: 'Pending',
                        source: 'API',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    t.update(statsRef, {
                        balance: admin.firestore.FieldValue.increment(-charge),
                        totalSpent: admin.firestore.FieldValue.increment(charge),
                        totalOrders: admin.firestore.FieldValue.increment(1)
                    });
                });

                return { statusCode: 200, headers, body: JSON.stringify({ order: orderRef.id }) };

            case 'status':
                const { order } = params;
                const orderRefCheck = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('orders').doc(order);
                const orderSnap = await orderRefCheck.get();

                if (!orderSnap.exists) return { statusCode: 400, body: JSON.stringify({ error: 'Order not found' }) };
                
                const oData = orderSnap.data();
                return { 
                    statusCode: 200, 
                    headers, 
                    body: JSON.stringify({
                        status: oData.status,
                        charge: oData.charge,
                        start_count: oData.startCount || 0,
                        remains: oData.remains || 0,
                        currency: 'PKR'
                    }) 
                };

            default:
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Action' }) };
        }

    } catch (error) {
        console.error('API Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};