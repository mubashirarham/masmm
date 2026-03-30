// theme-loader.js - Dynamic Tailwind Configurator and SEO Injector
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const PALETTE_CONFIGS = {
    "green": { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 800: '#166534', 900: '#14532d' },
    "blue": { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 800: '#1e40af', 900: '#1e3a8a' },
    "indigo": { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 800: '#3730a3', 900: '#312e81' },
    "purple": { 50: '#faf5ff', 100: '#f3e8ff', 500: '#a855f7', 600: '#9333ea', 800: '#6b21a8', 900: '#581c87' },
    "pink": { 50: '#fdf2f8', 100: '#fce7f3', 500: '#ec4899', 600: '#db2777', 800: '#9d174d', 900: '#831843' },
    "rose": { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 600: '#e11d48', 800: '#9f1239', 900: '#881337' },
    "orange": { 50: '#fff7ed', 100: '#ffedd5', 500: '#f97316', 600: '#ea580c', 800: '#9a3412', 900: '#7c2d12' },
    "amber": { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 800: '#92400e', 900: '#78350f' },
    "yellow": { 50: '#fefce8', 100: '#fef9c3', 500: '#eab308', 600: '#ca8a04', 800: '#854d0e', 900: '#713f12' },
    "teal": { 50: '#f0fdfa', 100: '#ccfbf1', 500: '#14b8a6', 600: '#0d9488', 800: '#115e59', 900: '#134e4a' },
    "cyan": { 50: '#ecfeff', 100: '#cffafe', 500: '#06b6d4', 600: '#0891b2', 800: '#155e75', 900: '#164e63' },
    "sky": { 50: '#f0f9ff', 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 800: '#075985', 900: '#0c4a6e' },
    "slate": { 50: '#f8fafc', 100: '#f1f5f9', 500: '#64748b', 600: '#475569', 800: '#1e293b', 900: '#0f172a' },
    "zinc": { 50: '#fafafa', 100: '#f4f4f5', 500: '#71717a', 600: '#52525b', 800: '#27272a', 900: '#18181b' },
    "red": { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 800: '#991b1b', 900: '#7f1d1d' }
};

export async function initDynamicTheme(app) {
    const db = getFirestore(app);
    let __currentHost = window.location.hostname;
    let appId = "masmmpanel-default";
    if (__currentHost !== 'localhost' && __currentHost !== '127.0.0.1' && !__currentHost.includes('masmmpanel') && !__currentHost.includes('netlify.app')) {
        appId = __currentHost.replace(/\./g, '-');
    }

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            
            // 1. INJECT SEO METADATA
            if (data.seoTitle) document.title = data.seoTitle;
            if (data.seoDescription) {
                let metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) metaDesc.setAttribute("content", data.seoDescription);
            }
            if (data.seoKeywords) {
                let metaKey = document.querySelector('meta[name="keywords"]');
                if (metaKey) metaKey.setAttribute("content", data.seoKeywords);
            }
            
            // 2. INJECT BRANDING LOGOS & NAMES
            if (data.siteName) {
                document.querySelectorAll('.site-title-text').forEach(el => {
                    el.innerText = data.siteName;
                    // For HTML elements using name naturally
                });
            }

            if (data.theme && data.theme.logoUrl && data.theme.logoUrl.trim() !== '') {
                document.querySelectorAll('.site-logo-container').forEach(el => {
                    if (el.tagName === 'IMG') {
                        el.src = data.theme.logoUrl;
                    } else {
                        el.innerHTML = `<img src="${data.theme.logoUrl}" class="h-10 object-contain drop-shadow-sm" style="max-height: 40px;" alt="Logo">`;
                    }
                });
            }

            // 3. INJECT TAILWIND COLORS & FONTS
            if (data.theme) {
                const activePalette = PALETTE_CONFIGS[data.theme.palette] || PALETTE_CONFIGS['green'];
                
                // Load Custom Google Fonts (Heading & Body)
                const gFontsList = new Set([data.theme.headingFont || 'Inter', data.theme.bodyFont || 'Inter']);
                let gFontQuery = Array.from(gFontsList).map(f => `family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700;800`).join('&');
                
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `https://fonts.googleapis.com/css2?${gFontQuery}&display=swap`;
                document.head.appendChild(link);
                
                // Construct styles based on selection
                const headStr = `'${data.theme.headingFont || 'Inter'}', sans-serif`;
                const bodyStr = `'${data.theme.bodyFont || 'Inter'}', sans-serif`;
                const b = activePalette; // Shortcut

                const style = document.createElement('style');
                style.innerHTML = `
                    body, p, input, select, textarea { font-family: ${bodyStr} !important; }
                    h1, h2, h3, h4, h5, h6, .brand-heading { font-family: ${headStr} !important; }
                    
                    /* Dynamic Tailwind Overrides */
                    .bg-brand-50, .hover\\:bg-brand-50:hover { background-color: ${b[50]} !important; }
                    .bg-brand-100, .hover\\:bg-brand-100:hover { background-color: ${b[100]} !important; }
                    .bg-brand-200, .hover\\:bg-brand-200:hover { background-color: ${b[200] || b[100]} !important; }
                    .bg-brand-500, .hover\\:bg-brand-500:hover { background-color: ${b[500]} !important; }
                    .bg-brand-600, .hover\\:bg-brand-600:hover { background-color: ${b[600]} !important; }
                    .bg-brand-800, .hover\\:bg-brand-800:hover { background-color: ${b[800]} !important; }
                    .bg-brand-900, .hover\\:bg-brand-900:hover { background-color: ${b[900]} !important; }

                    .text-brand-50, .hover\\:text-brand-50:hover { color: ${b[50]} !important; }
                    .text-brand-100, .hover\\:text-brand-100:hover { color: ${b[100]} !important; }
                    .text-brand-200, .hover\\:text-brand-200:hover { color: ${b[200] || b[100]} !important; }
                    .text-brand-400, .hover\\:text-brand-400:hover { color: ${b[400] || b[500]} !important; }
                    .text-brand-500, .hover\\:text-brand-500:hover { color: ${b[500]} !important; }
                    .text-brand-600, .hover\\:text-brand-600:hover { color: ${b[600]} !important; }
                    .text-brand-700, .hover\\:text-brand-700:hover { color: ${b[700] || b[800]} !important; }
                    .text-brand-800, .hover\\:text-brand-800:hover { color: ${b[800]} !important; }
                    .text-brand-900, .hover\\:text-brand-900:hover { color: ${b[900]} !important; }

                    .border-brand-50 { border-color: ${b[50]} !important; }
                    .border-brand-100 { border-color: ${b[100]} !important; }
                    .border-brand-200 { border-color: ${b[200] || b[100]} !important; }
                    .border-brand-500, .focus\\:border-brand-500:focus { border-color: ${b[500]} !important; }
                    .border-brand-600 { border-color: ${b[600]} !important; }
                    
                    .ring-brand-500, .focus\\:ring-brand-500:focus { --tw-ring-color: ${b[500]} !important; }

                    .shadow-brand-500\\/30 { 
                        --tw-shadow-color: ${b[500]}4D !important;
                        --tw-shadow: var(--tw-shadow-colored) !important;
                    }
                    
                    .from-brand-400 { --tw-gradient-from: ${b[400] || b[500]} !important; --tw-gradient-to: transparent !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
                    .from-brand-500 { --tw-gradient-from: ${b[500]} !important; --tw-gradient-to: transparent !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
                    .to-brand-600 { --tw-gradient-to: ${b[600]} !important; }
                `;
                document.head.appendChild(style);
            }
        }
    } catch (e) {
        console.warn("Dynamic Theme Initialization Error:", e);
    }
}
