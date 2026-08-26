const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://digitalmarketplace.store';

function generateSitemap() {
    console.log('Generating Google Search Console compliant sitemap.xml...');
    const catalogPath = path.resolve(__dirname, '../assets/data/paksmmpanels_services.json');
    if (!fs.existsSync(catalogPath)) {
        console.error('Catalog JSON file not found at:', catalogPath);
        return;
    }

    const raw = fs.readFileSync(catalogPath, 'utf8');
    const data = JSON.parse(raw);
    const services = data.services || [];
    const today = new Date().toISOString().split('T')[0];

    // 1. Core Static Pages
    const staticPages = [
        { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily' },
        { loc: `${BASE_URL}/services.html`, priority: '0.95', changefreq: 'daily' },
        { loc: `${BASE_URL}/api.html`, priority: '0.85', changefreq: 'weekly' },
        { loc: `${BASE_URL}/about.html`, priority: '0.75', changefreq: 'monthly' },
        { loc: `${BASE_URL}/policies.html`, priority: '0.50', changefreq: 'monthly' }
    ];

    // 2. Extract unique categories (Clean query param for GSC indexation)
    const categories = [...new Set(services.map(s => s.category || 'Other Services'))];

    const categoryUrls = categories.map(cat => {
        const encodedCat = encodeURIComponent(cat);
        return {
            loc: `${BASE_URL}/services.html?category=${encodedCat}`,
            priority: '0.85',
            changefreq: 'daily'
        };
    });

    // 3. Individual Service URLs (Clean ?service= query param for GSC indexation)
    const serviceUrls = services.map(s => ({
        loc: `${BASE_URL}/services.html?service=${s.service}`,
        priority: '0.80',
        changefreq: 'daily'
    }));

    const allUrls = [...staticPages, ...categoryUrls, ...serviceUrls];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
    xml += `        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n`;
    xml += `        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n`;

    allUrls.forEach(u => {
        xml += `    <url>\n`;
        xml += `        <loc>${escapeXml(u.loc)}</loc>\n`;
        xml += `        <lastmod>${today}</lastmod>\n`;
        xml += `        <changefreq>${u.changefreq}</changefreq>\n`;
        xml += `        <priority>${u.priority}</priority>\n`;
        xml += `    </url>\n`;
    });

    xml += `</urlset>\n`;

    const sitemapTarget = path.resolve(__dirname, '../sitemap.xml');
    fs.writeFileSync(sitemapTarget, xml, 'utf8');
    console.log(`Successfully generated ${allUrls.length} Google Search Console compliant URLs in ${sitemapTarget}`);
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

generateSitemap();
