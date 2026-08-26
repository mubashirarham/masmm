const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    // Set CORS and Browser + Edge Caching headers for instant results
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Multi-strategy path resolution for Netlify Lambda & Local dev
        const candidatePaths = [
            path.resolve(__dirname, '../../assets/data/paksmmpanels_services.json'),
            path.resolve(process.cwd(), 'assets/data/paksmmpanels_services.json'),
            path.resolve(__dirname, './assets/data/paksmmpanels_services.json'),
            path.join(__dirname, 'assets/data/paksmmpanels_services.json'),
            path.resolve('/var/task/assets/data/paksmmpanels_services.json')
        ];

        let targetPath = candidatePaths.find(p => fs.existsSync(p));

        if (targetPath) {
            const raw = fs.readFileSync(targetPath, 'utf8');
            const data = JSON.parse(raw);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    totalServices: data.services ? data.services.length : 0,
                    exchangeRateToPKR: data.exchangeRateToPKR || 275.81,
                    markupMultiplier: data.markupMultiplier || 1.50,
                    currency: 'PKR',
                    services: data.services || []
                })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, error: 'Catalog snapshot file not found in deployment container' })
        };
    } catch (e) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: e.message })
        };
    }
};
