const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Firebase Admin Init Error:", e);
    }
}

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'masmmpanel-default';
const GEMINI_API_KEY = process.env.GEMINI;

exports.handler = async (event) => {
    const headers = { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    if (!GEMINI_API_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Gemini API constraint missing from environment' }) };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }) };
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const payload = JSON.parse(event.body);
        let { history, message } = payload;

        if (!message) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty message payload' }) };
        }

        const statsRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(uid).collection('account').doc('stats');
        const statsSnap = await statsRef.get();
        const userBalance = statsSnap.exists ? (statsSnap.data().balance || 0) : 0;

        const configRef = db.collection('artifacts').doc(APP_ID).collection('public').doc('settings').collection('mabot').doc('config');
        const configSnap = await configRef.get();
        const config = configSnap.exists ? configSnap.data() : {};

        let systemPrompt = config.systemPrompt || "You are MA Bot, a helpful customer support AI for an SMM panel.";
        systemPrompt = systemPrompt.replace('{{USER_BALANCE}}', `Rs ${userBalance.toFixed(4)}`);
        
        const tools = [];
        const functionDeclarations = [];

        if (config.permissions?.canCheckUpstream) {
            functionDeclarations.push({
                name: "check_upstream_order",
                description: "Checks the live upstream API status of an order if the user asks why their order is stuck or pending.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        orderId: {
                            type: "STRING",
                            description: "The unique ID of the order from the user's dashboard"
                        }
                    },
                    required: ["orderId"]
                }
            });
        }

        if (config.permissions?.canCreateTicket) {
            functionDeclarations.push({
                name: "create_support_ticket",
                description: "Creates an official support ticket for human agents to review if the user explicitly demands human assistance or a refund.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        subject: {
                            type: "STRING",
                            description: "A short, concise summary of the issue."
                        },
                        description: {
                            type: "STRING",
                            description: "Detailed context of what the user needs help with."
                        }
                    },
                    required: ["subject", "description"]
                }
            });
        }

        if (functionDeclarations.length > 0) {
            tools.push({ functionDeclarations });
        }

        const contents = history.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user', 
            parts: [{ text: msg.parts[0].text }]
        }));

        contents.push({ role: 'user', parts: [{ text: message }] });

        const requestBody = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents,
            generationConfig: {
                temperature: config.temperature || 0.7,
                maxOutputTokens: config.maxTokens || 800
            }
        };

        if (tools.length > 0) requestBody.tools = tools;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        let response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        let data = await response.json();

        if (data.error) {
            console.error("Gemini API Error:", data.error);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI processing failed' }) };
        }

        const candidate = data.candidates?.[0];
        
        if (candidate?.content?.parts?.[0]?.functionCall) {
            const funcCall = candidate.content.parts[0].functionCall;
            const funcName = funcCall.name;
            const args = funcCall.args;
            let functionResult = {};

            if (funcName === 'check_upstream_order') {
                const orderId = args.orderId;
                try {
                    const orderRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(uid).collection('orders').doc(orderId);
                    const orderSnap = await orderRef.get();
                    
                    if (!orderSnap.exists) {
                        functionResult = { error: "Order ID not found in user account." };
                    } else {
                        const oData = orderSnap.data();
                        if (oData.providerId && oData.upstreamServiceId) {
                            const provRef = db.collection('artifacts').doc(APP_ID).collection('admin').doc('core').collection('providers').doc(oData.providerId);
                            const provSnap = await provRef.get();
                            
                            if (provSnap.exists) {
                                const pData = provSnap.data();
                                const upstreamResp = await fetch(`${pData.apiUrl}?key=${pData.apiKey}&action=status&order=${oData.upstreamOrderId || orderId}`);
                                const upstreamData = await upstreamResp.json();
                                functionResult = { success: true, upstreamStatus: upstreamData };
                            } else {
                                functionResult = { error: "Provider configuration missing." };
                            }
                        } else {
                            functionResult = { error: "Order does not have a mapped upstream provider." };
                        }
                    }
                } catch(e) {
                    console.error("Upstream Function Error:", e);
                    functionResult = { error: "Failed to connect to provider API.", details: e.message };
                }
            } 
            else if (funcName === 'create_support_ticket') {
                try {
                    const ticketRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(uid).collection('tickets').doc();
                    await ticketRef.set({
                        subject: args.subject,
                        status: 'Pending',
                        messages: [{
                            sender: 'User',
                            message: args.description,
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        }],
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    functionResult = { success: true, ticketId: ticketRef.id, message: "Ticket created successfully for human intervention." };
                } catch(e) {
                    functionResult = { error: "Failed to create ticket in database." };
                }
            }

            contents.push(candidate.content);
            contents.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: funcName,
                        response: functionResult
                    }
                }]
            });

            const finalResp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const finalData = await finalResp.json();
            
            const finalReply = finalData.candidates?.[0]?.content?.parts?.[0]?.text || "I updated standard system statuses.";
            return { statusCode: 200, headers, body: JSON.stringify({ reply: finalReply }) };
        }

        const reply = candidate?.content?.parts?.[0]?.text || "Sorry, I am out of memory.";
        return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

    } catch (error) {
        console.error('Bot API Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
