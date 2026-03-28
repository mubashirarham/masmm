import { 
    getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

const PALETTES = {
    "green": { name: "Emerald Green", hex: "#22c55e" },
    "blue": { name: "Ocean Blue", hex: "#3b82f6" },
    "indigo": { name: "Deep Indigo", hex: "#6366f1" },
    "purple": { name: "Royal Purple", hex: "#a855f7" },
    "pink": { name: "Neon Pink", hex: "#ec4899" },
    "rose": { name: "Classic Rose", hex: "#f43f5e" },
    "orange": { name: "Sunset Orange", hex: "#f97316" },
    "amber": { name: "Premium Amber", hex: "#f59e0b" },
    "yellow": { name: "Bright Yellow", hex: "#eab308" },
    "teal": { name: "Teal Solid", hex: "#14b8a6" },
    "cyan": { name: "Electric Cyan", hex: "#06b6d4" },
    "sky": { name: "Sky Blue", hex: "#0ea5e9" },
    "slate": { name: "Professional Slate", hex: "#64748b" },
    "zinc": { name: "Dark Zinc", hex: "#52525b" },
    "red": { name: "Alert Red", hex: "#ef4444" }
};

const FONTS = [
    { id: "Inter", name: "Inter (Modern Sans)" },
    { id: "Roboto", name: "Roboto (Clean Sans)" },
    { id: "Poppins", name: "Poppins (Rounded Geometric)" },
    { id: "Outfit", name: "Outfit (Tech & Startup)" },
    { id: "Plus Jakarta Sans", name: "Plus Jakarta Sans (Premium UI)" },
    { id: "Space Grotesk", name: "Space Grotesk (Edgy & Gen-Z)" },
    { id: "Playfair Display", name: "Playfair Display (Elegant Serif)" }
];

window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'settings') return;
    renderSettingsUI();
    fetchSettings();
});

function renderSettingsUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Generate Palette Options
    let paletteHtml = '';
    for(let key in PALETTES) {
        paletteHtml += `<div class="p-3 border rounded-xl flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" onclick="document.getElementById('theme-palette').value='${key}'">
            <div class="flex items-center gap-3">
                <div class="w-6 h-6 rounded-full shadow-inner" style="background-color: ${PALETTES[key].hex}"></div>
                <span class="text-sm font-semibold text-gray-700">${PALETTES[key].name}</span>
            </div>
            <input type="radio" name="palette" value="${key}" id="palette-${key}" class="w-4 h-4 text-brand-600 focus:ring-brand-500 pointer-events-none" onchange="document.getElementById('theme-palette').value=this.value">
        </div>`;
    }

    // Generate Font Options
    let fontHtml = '';
    FONTS.forEach(font => {
        fontHtml += `<option value="${font.id}">${font.name}</option>`;
    });

    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Platform Settings</h2>
            <p class="text-sm text-gray-500">Configure global preferences, SEO, Branding themes, and Systems overrides.</p>
        </div>

        <div class="max-w-5xl space-y-8">
            <form id="admin-settings-form" class="space-y-8">
                
                <!-- SEO & Meta Card -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    <h3 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6"><i class="fa-brands fa-google text-brand-500 mr-2"></i> Search Engine Optimization (SEO)</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Landing Page Title</label>
                            <input type="text" id="setting-seo-title" placeholder="e.g., The Ultimate SMM Panel Provider" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Description</label>
                            <textarea id="setting-seo-desc" rows="3" placeholder="Provide social media marketing services globally..." class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none resize-none"></textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Search Keywords</label>
                            <input type="text" id="setting-seo-keywords" placeholder="e.g., smm panel, buy followers, cheap smm" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none">
                        </div>
                    </div>
                </div>

                <!-- Branding & Theme Card -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    <h3 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6"><i class="fa-solid fa-wand-magic-sparkles text-brand-500 mr-2"></i> Dynamic Aesthetics</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Primary Heading Font</label>
                            <select id="theme-font-heading" class="w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-brand-500 outline-none">
                                ${fontHtml}
                            </select>
                            <p class="text-xs text-gray-400 mt-2">Used for all H1, H2, H3 elements.</p>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Body Paragraph Font</label>
                            <select id="theme-font-body" class="w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-brand-500 outline-none">
                                ${fontHtml}
                            </select>
                            <p class="text-xs text-gray-400 mt-2">Used for all text, forms, and paragraphs.</p>
                        </div>
                    </div>

                    <div class="mb-8">
                        <label class="block text-sm font-semibold text-gray-700 mb-4">Core Color Palette (15+ Options)</label>
                        <input type="hidden" id="theme-palette" value="green">
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            ${paletteHtml}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Custom Logo URL</label>
                            <input type="url" id="theme-logo-url" placeholder="https://res.cloudinary.com/.../logo.png" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Platform Branding Name</label>
                            <input type="text" id="setting-site-name" placeholder="MAsmmpanel" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none">
                        </div>
                    </div>
                </div>

                <!-- Systems Overides -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    <h3 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6"><i class="fa-solid fa-server text-brand-500 mr-2"></i> System Overrides & Currencies</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div class="md:col-span-2 p-5 bg-brand-50 rounded-xl border border-brand-100 mt-2">
                            <h4 class="font-bold text-brand-800"><i class="fa-solid fa-money-bill-transfer"></i> Override Live Currency APIs</h4>
                            <p class="text-xs text-brand-600 mt-1 mb-4">By default, the system autonomously fetches globally accurate exchange rates perfectly every 60 minutes. Enter your own forced fixed rates here to bypass autonomy.</p>
                            <div class="grid grid-cols-3 gap-4">
                                 <div>
                                      <label class="block text-xs font-bold text-gray-700">1 USD to PKR</label>
                                      <input type="number" id="setting-fixed-usd" step="0.01" placeholder="e.g. 280" class="w-full mt-1 px-3 py-2 rounded-lg border outline-none bg-white">
                                 </div>
                                 <div>
                                      <label class="block text-xs font-bold text-gray-700">1 EUR to PKR</label>
                                      <input type="number" id="setting-fixed-eur" step="0.01" placeholder="e.g. 300" class="w-full mt-1 px-3 py-2 rounded-lg border outline-none bg-white">
                                 </div>
                                 <div class="flex items-end pb-1">
                                      <label class="text-xs font-bold text-gray-500 mr-2">Use Live Rates</label>
                                      <input type="checkbox" id="setting-use-live-rates" checked class="w-5 h-5 rounded text-brand-600 focus:ring-brand-500 border-2">
                                 </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Default Base Currency</label>
                            <select id="setting-currency" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none bg-white">
                                <option value="PKR">PKR - Pakistani Rupee</option>
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="INR">INR - Indian Rupee</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Currency Symbol</label>
                            <input type="text" id="setting-currency-symbol" placeholder="e.g., Rs or $" value="Rs" class="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-brand-500 outline-none">
                        </div>
                    </div>
                </div>

                <!-- Global Broadcast Actions -->
                <div class="bg-indigo-50 rounded-xl shadow-sm border border-indigo-100 p-6 sm:p-8">
                     <h3 class="text-lg font-bold text-indigo-900 border-b border-indigo-200 pb-3 mb-6"><i class="fa-solid fa-bullhorn mr-2"></i> PUSH Global Broadcast Notification</h3>
                     <p class="text-sm text-indigo-700 mb-4">Instantly ping the dashboard bell-icon of every single user on the platform with this broadcast message.</p>
                     <textarea id="admin-broadcast-msg" rows="3" placeholder="Write your broadcast text here..." class="w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none mb-4 resize-none transition-all focus:bg-white"></textarea>
                     <button type="button" id="push-broadcast-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-colors shadow-lg shadow-indigo-500/30">Send to Everyone</button>
                     <p id="broadcast-status-msg" class="text-sm mt-3 font-semibold"></p>
                </div>

                <!-- Action Buttons -->
                <div class="flex justify-end pt-2 pb-16">
                    <p id="settings-notification" class="hidden mr-4 py-3 font-semibold text-sm"></p>
                    <button type="submit" id="save-settings-btn" class="px-8 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-brand-500/30">
                        <i class="fa-solid fa-floppy-disk"></i>
                        <span>Save Core Configurations</span>
                    </button>
                </div>

            </form>
        </div>
    `;

    document.getElementById('admin-settings-form').addEventListener('submit', handleSaveSettings);
    document.getElementById('push-broadcast-btn').addEventListener('click', handlePushBroadcast);

    // Dynamic selection mapping for palettes
    setInterval(() => {
        let val = document.getElementById('theme-palette')?.value;
        if(val) {
            let r = document.getElementById('palette-'+val);
            if(r) r.checked = true;
        }
    }, 500);
}

async function fetchSettings() {
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
    
    try {
        const docSnap = await getDoc(settingsRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (document.getElementById('setting-site-name')) document.getElementById('setting-site-name').value = data.siteName || '';
            if (document.getElementById('setting-seo-title')) document.getElementById('setting-seo-title').value = data.seoTitle || '';
            if (document.getElementById('setting-seo-desc')) document.getElementById('setting-seo-desc').value = data.seoDescription || '';
            if (document.getElementById('setting-seo-keywords')) document.getElementById('setting-seo-keywords').value = data.seoKeywords || '';
            
            if(data.theme) {
                if (document.getElementById('theme-font-heading')) document.getElementById('theme-font-heading').value = data.theme.headingFont || 'Inter';
                if (document.getElementById('theme-font-body')) document.getElementById('theme-font-body').value = data.theme.bodyFont || 'Inter';
                if (document.getElementById('theme-palette')) document.getElementById('theme-palette').value = data.theme.palette || 'green';
                if (document.getElementById('theme-logo-url')) document.getElementById('theme-logo-url').value = data.theme.logoUrl || '';
            }

            if (document.getElementById('setting-currency')) document.getElementById('setting-currency').value = data.currency || 'PKR';
            if (document.getElementById('setting-currency-symbol')) document.getElementById('setting-currency-symbol').value = data.currencySymbol || 'Rs';
            
            // overrides
            if (document.getElementById('setting-use-live-rates') && data.useLiveRates !== undefined) {
                document.getElementById('setting-use-live-rates').checked = data.useLiveRates;
            }
            if (document.getElementById('setting-fixed-usd') && data.fixedUsdToPkr) document.getElementById('setting-fixed-usd').value = data.fixedUsdToPkr;
            if (document.getElementById('setting-fixed-eur') && data.fixedEurToPkr) document.getElementById('setting-fixed-eur').value = data.fixedEurToPkr;
        }
    } catch (error) {
        console.error("Error fetching settings:", error);
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('save-settings-btn');
    const notif = document.getElementById('settings-notification');
    
    const settingsData = {
        siteName: document.getElementById('setting-site-name').value.trim(),
        seoTitle: document.getElementById('setting-seo-title').value.trim(),
        seoDescription: document.getElementById('setting-seo-desc').value.trim(),
        seoKeywords: document.getElementById('setting-seo-keywords').value.trim(),
        theme: {
            headingFont: document.getElementById('theme-font-heading').value,
            bodyFont: document.getElementById('theme-font-body').value,
            palette: document.getElementById('theme-palette').value,
            logoUrl: document.getElementById('theme-logo-url').value.trim()
        },
        currency: document.getElementById('setting-currency').value,
        currencySymbol: document.getElementById('setting-currency-symbol').value.trim(),
        useLiveRates: document.getElementById('setting-use-live-rates').checked,
        fixedUsdToPkr: parseFloat(document.getElementById('setting-fixed-usd').value || '280'),
        fixedEurToPkr: parseFloat(document.getElementById('setting-fixed-eur').value || '300'),
        updatedAt: serverTimestamp()
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving Context...</span>';

    try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        await setDoc(settingsRef, settingsData, { merge: true });
        
        notif.innerText = "Configurations live! Refreshing app injection...";
        notif.className = "text-green-600 mr-4 py-3 font-semibold text-sm transition-all";
        
        // Dynamically apply locally so admin sees immediately
        setTimeout(() => { window.location.reload(); }, 1500);

    } catch (error) {
        notif.innerText = "Error saving settings.";
        notif.className = "text-red-500 mr-4 py-3 font-semibold text-sm transition-all";
    } finally {
        btn.disabled = false;
    }
}

async function handlePushBroadcast() {
    const msgInput = document.getElementById('admin-broadcast-msg');
    const msg = msgInput.value.trim();
    if(!msg) return;

    const btn = document.getElementById('push-broadcast-btn');
    const stat = document.getElementById('broadcast-status-msg');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Broadcasting...';
    stat.innerText = '';
    
    try {
        const usersRef = collection(db, 'artifacts', appId, 'users');
        const usersSnap = await getDocs(usersRef);
        
        let sent = 0;
        const batch = writeBatch(db);
        
        usersSnap.forEach(docSnap => {
            const notifRef = doc(db, 'artifacts', appId, 'users', docSnap.id, 'notifications', Date.now().toString() + Math.random().toString(36).substring(7));
            batch.set(notifRef, {
                title: "Platform Broadcast 📢",
                message: msg,
                isRead: false,
                createdAt: serverTimestamp()
            });
            sent++;
        });
        
        await batch.commit();
        
        stat.className = 'text-green-600 text-sm mt-3 font-semibold';
        stat.innerText = `Success! Broadcasted to ${sent} users simultaneously.`;
        msgInput.value = '';
    } catch(err) {
        stat.className = 'text-red-500 text-sm mt-3 font-semibold';
        stat.innerText = "Error broadcasting message.";
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send to Everyone';
    }
}