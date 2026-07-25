exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const params = event.queryStringParameters || {};
        const action = params.action; // 'validate_account' or 'check_balance' or 'live_rates'

        // 1. Account Validation API
        if (action === 'validate_account') {
            const email = params.email;
            if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email required" }) };
            
            const mode = params.mode || 'live';
            const url = `https://api.cmaal.com/verify_accounts?mode=${encodeURIComponent(mode)}&email=${encodeURIComponent(email)}`;
            const res = await fetch(url);
            const data = await res.json();
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data)
            };
        }

        // 2. Check Balance & Live USD to PKR Market Rate API
        if (action === 'check_balance' || action === 'live_rates') {
            const email = params.email || process.env.CASHMAAL_ACCOUNT_EMAIL;
            const password = params.password || process.env.CASHMAAL_ACCOUNT_PASSWORD;
            const mode = params.mode || 'live';

            if (!email || !password) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "CashMaal Account Credentials required in environment variables or parameters." }) };
            }

            const url = `https://api.cmaal.com/check_balance?mode=${encodeURIComponent(mode)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
            const res = await fetch(url);
            const data = await res.json();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data)
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid action. Supported actions: validate_account, check_balance, live_rates" })
        };
    } catch (err) {
        console.error("CashMaal Utility Error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
