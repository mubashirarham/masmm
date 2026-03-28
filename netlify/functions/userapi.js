const admin = require('firebase-admin');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Dynamic Tenant Resolution
    const currentHost = event.headers.host || event.headers.origin || '';
    let dynamicAppId = process.env.APP_ID || 'masmmpanel-default';
    if (currentHost && !currentHost.includes('netlify.app') && !currentHost.includes('localhost') && !currentHost.includes('127.0.0.1')) {
        dynamicAppId = currentHost.replace(/https?:\/\//, '').split(':')[0].replace(/\./g, '-');
    }

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
        const apiQuery = await db.collectionGroup('api').where('key', '==', key).limit(1).get();
        if (apiQuery.empty) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
        }

        const apiDoc = apiQuery.docs[0];
        const pathSegments = apiDoc.ref.path.split('/');
        // Make sure the API key actually belongs to the domain making the query
        if (pathSegments[1] !== dynamicAppId) {
            return { statusCode: 401, body: JSON.stringify({ error: 'API Key domain mismatch' }) };
        }
        
        const userId = pathSegments[3]; 
        const statsRef = db.collection('artifacts').doc(dynamicAppId).collection('users').doc(userId).collection('account').doc('stats');
        const statsSnap = await statsRef.get();
        const userData = statsSnap.exists ? statsSnap.data() : { balance: 0 };

        switch (action) {
            case 'balance':
                return { 
                    statusCode: 200, 
                    headers, 
                    body: JSON.stringify({ balance: userData.balance, currency: 'PKR' }) 
                };

            case 'services':
                const servicesSnap = await db.collection('artifacts').doc(dynamicAppId).collection('public').doc('data').collection('services').where('status', '==', 'Active').get();
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
                if (!service || !link || !quantity) return { statusCode: 400, body: JSON.stringify({ error: 'Missing parameters' }) };

                const srvRef = db.collection('artifacts').doc(dynamicAppId).collection('public').doc('data').collection('services').doc(service.toString());
                const srvSnap = await srvRef.get();
                if (!srvSnap.exists) return { statusCode: 400, body: JSON.stringify({ error: 'Service not found in catalog' }) };
                
                const srvData = srvSnap.data();
                const charge = (parseFloat(srvData.rate) / 1000) * parseInt(quantity);

                if (userData.balance < charge) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Insufficient balance' }) };
                }

                // Child Panel Order Routing & Wholesale Deduction Hook
                let wholesaleCost = 0;
                let childPanelOwnerRef = null;
                
                if (dynamicAppId !== 'masmmpanel-default') {
                    // Check if the service exists upstream in main panel
                    const masterSrvRef = db.collection('artifacts').doc('masmmpanel-default').collection('public').doc('data').collection('services').doc(service.toString());
                    const masterSrvSnap = await masterSrvRef.get();
                    if(!masterSrvSnap.exists) {
                       return { statusCode: 400, body: JSON.stringify({ error: 'Wholesale Partner Error: Service Unavailable.' }) };
                    }
                    wholesaleCost = (parseFloat(masterSrvSnap.data().rate) / 1000) * parseInt(quantity);
                    
                    // Retrieve Child Panel Owner Account
                    const formattedDomain = dynamicAppId.replace(/-/g, '.');
                    const cpLookup = await db.collection('artifacts').doc('masmmpanel-default').collection('child_panels').doc(formattedDomain).get();
                    
                    if(!cpLookup.exists || cpLookup.data().status !== 'Active') {
                        return { statusCode: 400, body: JSON.stringify({ error: 'Wholesale Partner Error: Panel Suspended' }) };
                    }
                    
                    const ownerUid = cpLookup.data().ownerUid;
                    childPanelOwnerRef = db.collection('artifacts').doc('masmmpanel-default').collection('users').doc(ownerUid).collection('account').doc('stats');
                    
                    const ownerStats = await childPanelOwnerRef.get();
                    if (!ownerStats.exists || (ownerStats.data().balance || 0) < wholesaleCost) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'Wholesale Partner Error: Insufficient Wholesale Funds' }) };
                    }
                }

                // Create Order
                const orderRef = db.collection('artifacts').doc(dynamicAppId).collection('users').doc(userId).collection('orders').doc();
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
                    
                    if (childPanelOwnerRef && wholesaleCost > 0) {
                        t.update(childPanelOwnerRef, {
                            balance: admin.firestore.FieldValue.increment(-wholesaleCost),
                            totalSpent: admin.firestore.FieldValue.increment(wholesaleCost)
                        });
                    }
                });

                return { statusCode: 200, headers, body: JSON.stringify({ order: orderRef.id }) };

            case 'status':
                const orderCheckId = params.order;
                const orderRefCheck = db.collection('artifacts').doc(dynamicAppId).collection('users').doc(userId).collection('orders').doc(orderCheckId.toString());
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