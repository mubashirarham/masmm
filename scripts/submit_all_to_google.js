const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_PATHS = [
    path.resolve(__dirname, '../../Kaghan Stay/formal-folder-476209-h0-6ddebc22f141.json'),
    path.resolve(__dirname, '../formal-folder-476209-h0-6ddebc22f141.json'),
    path.resolve('d:/Kaghan Stay/formal-folder-476209-h0-6ddebc22f141.json')
];

function base64url(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function loadServiceAccount() {
    for (const p of KEY_PATHS) {
        if (fs.existsSync(p)) {
            console.log(`Loaded service account key from: ${p}`);
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    }
    throw new Error('Service account JSON key file not found');
}

async function getAccessToken(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedClaimSet = base64url(JSON.stringify(claimSet));
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = base64url(signer.sign(sa.private_key));

    const jwt = `${signatureInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    const tokenData = await res.json();
    if (!tokenData.access_token) {
        throw new Error(`Token generation failed: ${JSON.stringify(tokenData)}`);
    }
    return tokenData.access_token;
}

async function submitSitemap(accessToken, siteUrl, sitemapUrl) {
    console.log(`Submitting sitemap ${sitemapUrl} for property ${siteUrl}...`);
    const encodedSite = encodeURIComponent(siteUrl);
    const encodedSitemap = encodeURIComponent(sitemapUrl);
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedSitemap}`;

    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Length': '0'
            }
        });

        if (res.status === 204 || res.status === 200) {
            console.log(`✅ Sitemap successfully submitted to Google Search Console for ${siteUrl}`);
            return { success: true, status: res.status };
        } else {
            const err = await res.text();
            console.warn(`⚠️ Sitemap submission response (${res.status}):`, err);
            return { success: false, status: res.status, error: err };
        }
    } catch (e) {
        console.error(`❌ Sitemap error:`, e.message);
        return { success: false, error: e.message };
    }
}

async function submitUrlToIndexingApi(accessToken, targetUrl) {
    const url = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: targetUrl,
                type: 'URL_UPDATED'
            })
        });

        const data = await res.json();
        return {
            statusCode: res.status,
            data: data
        };
    } catch (e) {
        return {
            statusCode: 500,
            error: e.message
        };
    }
}

async function main() {
    console.log('=== Google Search Console & Indexing API Submission ===');
    const sa = loadServiceAccount();
    console.log(`Using Service Account: ${sa.client_email}`);

    const accessToken = await getAccessToken(sa);
    console.log('Successfully acquired OAuth2 Google Access Token.');

    const siteUrls = [
        'https://digitalmarketplace.store/',
        'https://digitalmarketplace.store',
        'sc-domain:digitalmarketplace.store'
    ];
    const sitemapUrl = 'https://digitalmarketplace.store/sitemap.xml';

    // 1. Submit Sitemap across property variations
    console.log('\n--- Step 1: Submitting Sitemap to GSC Webmasters API ---');
    const sitemapResults = [];
    for (const site of siteUrls) {
        const r = await submitSitemap(accessToken, site, sitemapUrl);
        sitemapResults.push({ site, ...r });
    }

    // 2. Load all URLs from sitemap or catalog
    console.log('\n--- Step 2: Preparing URLs for Google Indexing API ---');
    const catalogPath = path.resolve(__dirname, '../assets/data/paksmmpanels_services.json');
    let urlsToSubmit = [
        'https://digitalmarketplace.store/',
        'https://digitalmarketplace.store/services.html',
        'https://digitalmarketplace.store/api.html',
        'https://digitalmarketplace.store/about.html',
        'https://digitalmarketplace.store/policies.html'
    ];

    if (fs.existsSync(catalogPath)) {
        const raw = fs.readFileSync(catalogPath, 'utf8');
        const catalog = JSON.parse(raw);
        const services = catalog.services || [];
        const categories = [...new Set(services.map(s => s.category || 'Other Services'))];

        // Top Category Landing URLs
        categories.forEach(cat => {
            urlsToSubmit.push(`https://digitalmarketplace.store/services.html?category=${encodeURIComponent(cat)}`);
        });

        // Individual Services URLs
        services.forEach(s => {
            urlsToSubmit.push(`https://digitalmarketplace.store/services.html?service=${s.service}`);
        });
    }

    console.log(`Total URLs to submit: ${urlsToSubmit.length}`);

    // 3. Batch Submit to Indexing API with rate control
    console.log('\n--- Step 3: Submitting URLs to Google Indexing API (URL_UPDATED) ---');
    const results = [];
    let successCount = 0;
    let quotaHit = false;

    for (let i = 0; i < urlsToSubmit.length; i++) {
        const u = urlsToSubmit[i];
        if (quotaHit) {
            results.push({ url: u, status: 'Quota Exceeded', details: 'Google Indexing API daily quota reached (200/day limit). URLs queued via sitemap.' });
            continue;
        }

        const res = await submitUrlToIndexingApi(accessToken, u);
        
        if (res.statusCode === 200) {
            successCount++;
            results.push({
                url: u,
                status: 'Submitted',
                notifyTime: res.data.urlNotificationMetadata?.latestUpdate?.notifyTime || new Date().toISOString(),
                response: res.data
            });
            console.log(`[${i + 1}/${urlsToSubmit.length}] ✅ 200 OK: ${u}`);
        } else if (res.statusCode === 429) {
            quotaHit = true;
            console.warn(`[${i + 1}/${urlsToSubmit.length}] ⚠️ 429 Quota Limit Exceeded: Google Indexing API per-day quota reached.`);
            results.push({
                url: u,
                status: 'Quota Exceeded (429)',
                error: res.data?.error?.message || 'Rate/Quota limit'
            });
        } else {
            console.warn(`[${i + 1}/${urlsToSubmit.length}] Status ${res.statusCode}: ${u}`, res.data || res.error);
            results.push({
                url: u,
                status: `Error (${res.statusCode})`,
                error: res.data?.error?.message || res.error || 'Unknown error'
            });
        }

        // Slight delay to respect Google rate limits (10 req/sec)
        await new Promise(r => setTimeout(r, 120));
    }

    // 4. Save detailed report
    const reportPath = path.resolve(__dirname, '../google_indexing_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        serviceAccount: sa.client_email,
        totalUrls: urlsToSubmit.length,
        submittedCount: successCount,
        quotaHit: quotaHit,
        sitemapResults: sitemapResults,
        results: results
    }, null, 2), 'utf8');

    console.log(`\n=== Execution Summary ===`);
    console.log(`Total URLs: ${urlsToSubmit.length}`);
    console.log(`Directly Submitted to Indexing API: ${successCount}`);
    console.log(`Sitemap Submissions: ${JSON.stringify(sitemapResults)}`);
    console.log(`Detailed report saved to: ${reportPath}`);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
