const admin = require('firebase-admin');

// Initialize Firebase Admin securely using environment variables in Netlify
// You must add FIREBASE_SERVICE_ACCOUNT in your Netlify Environment Variables
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error("Firebase Admin Init Error:", error);
    }
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';

exports.handler = async (event, context) => {
    // SMM APIs typically accept GET and POST urlencoded data
    const params = event.httpMethod === 'POST' ? 
        new URLSearchParams(event.body) : 
        new URLSearchParams(event.queryStringParameters);

    const key = params.get('key') || event.queryStringParameters.key;
    const action = params.get('action') || event.queryStringParameters.action;

    // 1. API Key Validation
    if (!key || !key.startsWith('MAsmm-')) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid API key" }) };
    }

    // Extract User ID directly from the API key format (MAsmm-{userId}-{random})
    const keyParts = key.split('-');
    if (keyParts.length < 3) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid API key format" }) };
    }
    const userId = keyParts[1];

    try {
        // Verify the key matches what's in the database
        const apiDoc = await db.collection('artifacts').doc(APP_ID)
                               .collection('users').doc(userId)
                               .collection('account').doc('api').get();

        if (!apiDoc.exists || apiDoc.data().key !== key) {
            return { statusCode: 401, body: JSON.stringify({ error: "Incorrect or revoked API key" }) };
        }

        // 2. Action Routing
        switch (action) {
            case 'balance':
                return await getBalance(userId);
            case 'services':
                return await getServices();
            case 'add':
                return await addOrder(userId, params);
            case 'status':
                return await getOrderStatus(userId, params.get('order'));
            default:
                return { statusCode: 400, body: JSON.stringify({ error: "Incorrect request" }) };
        }

    } catch (error) {
        console.error("API Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
    }
};

// ==============================================
// ACTION HANDLERS
// ==============================================

async function getBalance(userId) {
    const statsDoc = await db.collection('artifacts').doc(APP_ID)
                             .collection('users').doc(userId)
                             .collection('account').doc('stats').get();
    
    const balance = statsDoc.exists ? (statsDoc.data().balance || 0) : 0;
    
    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            balance: Number(balance).toFixed(4),
            currency: "PKR"
        })
    };
}

async function getServices() {
    const servicesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services');
    const categoriesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('categories');

    const [servicesSnap, categoriesSnap] = await Promise.all([servicesRef.get(), categoriesRef.get()]);
    
    // Map categories for easy lookup
    const categories = {};
    categoriesSnap.forEach(doc => { categories[doc.id] = doc.data().name; });

    const servicesList = [];
    servicesSnap.forEach(doc => {
        const s = doc.data();
        servicesList.push({
            service: s.serviceId || doc.id,
            name: s.name,
            type: "Default",
            category: categories[s.categoryId] || "Uncategorized",
            rate: Number(s.rate).toFixed(4),
            min: s.min ? s.min.toString() : "100",
            max: s.max ? s.max.toString() : "50000",
            refill: true,
            cancel: false
        });
    });

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(servicesList)
    };
}

async function addOrder(userId, params) {
    const serviceId = params.get('service');
    const link = params.get('link');
    const quantity = parseInt(params.get('quantity'));

    if (!serviceId || !link || !quantity || isNaN(quantity)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters (service, link, quantity)" }) };
    }

    // Find the service
    const servicesRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('services');
    const serviceQuery = await servicesRef.where('serviceId', '==', serviceId).limit(1).get();
    
    if (serviceQuery.empty) {
        return { statusCode: 400, body: JSON.stringify({ error: "Service not found" }) };
    }

    const serviceData = serviceQuery.docs[0].data();

    // Check limits
    if (quantity < (serviceData.min || 100) || quantity > (serviceData.max || 50000)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Quantity out of limits" }) };
    }

    const charge = (quantity / 1000) * (serviceData.rate || 0);

    // Process Transaction Transactionally
    const userStatsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('account').doc('stats');
    const ordersRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).collection('orders');

    try {
        const orderId = await db.runTransaction(async (t) => {
            const statsDoc = await t.get(userStatsRef);
            if (!statsDoc.exists) throw "Account not found";
            
            const currentBalance = statsDoc.data().balance || 0;
            if (currentBalance < charge) throw "Not enough funds on balance";

            // Deduct funds
            t.update(userStatsRef, {
                balance: admin.firestore.FieldValue.increment(-charge),
                totalSpent: admin.firestore.FieldValue.increment(charge),
                totalOrders: admin.firestore.FieldValue.increment(1)
            });

            // Create Order
            const newOrderRef = ordersRef.doc();
            t.set(newOrderRef, {
                serviceId: serviceId,
                serviceName: serviceData.name,
                link: link,
                quantity: quantity,
                charge: charge,
                status: 'Pending',
                apiProvider: 'API',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return newOrderRef.id;
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: orderId })
        };

    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ error: error.toString() }) };
    }
}

async function getOrderStatus(userId, orderId) {
    if (!orderId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing order ID" }) };
    }

    const orderDoc = await db.collection('artifacts').doc(APP_ID)
                             .collection('users').doc(userId)
                             .collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
        return { statusCode: 400, body: JSON.stringify({ error: "Order not found" }) };
    }

    const data = orderDoc.data();

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            charge: Number(data.charge || 0).toFixed(4),
            start_count: "0",
            status: data.status || "Pending",
            remains: data.quantity ? data.quantity.toString() : "0",
            currency: "PKR"
        })
    };
}