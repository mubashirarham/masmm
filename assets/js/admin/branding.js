import { 
    getFirestore, 
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'branding') return;

    renderBrandingUI();
    fetchCurrentBranding();
});

function renderBrandingUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Branding & Appearance View
    contentArea.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Appearance & Branding</h2>
                <p class="text-sm text-gray-500">Customize the UI, typography, colors, and global SEO metadata.</p>
            </div>
            <button id="save-branding-btn" class="bg-brand-500 hover:bg-brand-600 px-6 py-2.5 rounded-lg text-white font-bold transition-all shadow-md shadow-brand-500/30 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Save Aesthetics
            </button>
        </div>

        <div id="branding-alerts" class="mb-6 hidden text-sm px-4 py-3 rounded-xl font-bold text-center"></div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <!-- Global Brand Card -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                    <h3 class="font-bold text-gray-800"><i class="fa-solid fa-palette text-brand-500 mr-2"></i> Theme Configuration</h3>
                </div>
                <div class="p-6 space-y-6">
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Platform Name</label>
                        <input type="text" id="site-name" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. PanelPeak">
                        <p class="text-xs text-gray-500 mt-1">Displayed in headers and automated emails.</p>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Dark Logo URL</label>
                        <input type="text" id="logo-url" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm font-mono text-brand-600" placeholder="https://example.com/logo.png">
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Global Color Palette Base</label>
                        <select id="palette-select" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm appearance-none bg-white">
                            <option value="green">Green (Default)</option>
                            <option value="blue">Blue</option>
                            <option value="indigo">Indigo</option>
                            <option value="purple">Purple</option>
                            <option value="pink">Pink</option>
                            <option value="rose">Rose</option>
                            <option value="orange">Orange</option>
                            <option value="amber">Amber</option>
                            <option value="yellow">Yellow</option>
                            <option value="teal">Teal</option>
                            <option value="cyan">Cyan</option>
                            <option value="sky">Sky</option>
                            <option value="slate">Slate</option>
                            <option value="zinc">Zinc</option>
                            <option value="red">Red</option>
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Changes all primary buttons, accents, and UI elements site-wide.</p>
                    </div>

                </div>
            </div>

            <!-- Typography & SEO -->
            <div class="space-y-8">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-800"><i class="fa-solid fa-font text-brand-500 mr-2"></i> Web Typography</h3>
                    </div>
                    <div class="p-6 space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Heading Font (Google Fonts)</label>
                            <input type="text" id="heading-font" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. Outfit, Poppins, Inter">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Body Font (Google Fonts)</label>
                            <input type="text" id="body-font" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. Inter, Roboto">
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-800"><i class="fa-brands fa-google text-brand-500 mr-2"></i> SEO Metadata</h3>
                    </div>
                    <div class="p-6 space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Title</label>
                            <input type="text" id="seo-title" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="Panel Title - Home">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Description</label>
                            <textarea id="seo-desc" rows="3" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm resize-none"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Keywords</label>
                            <input type="text" id="seo-keys" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm font-mono text-gray-500" placeholder="smm panel, cheap likes, instagram views">
                        </div>
                    </div>
                </div>
            </div>
            
        </div>
    `;

    document.getElementById('save-branding-btn').addEventListener('click', saveBrandingConfig);
}

// Fetch the existing document
async function fetchCurrentBranding() {
    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        const snap = await getDoc(ref);

        if (snap.exists()) {
            const data = snap.data();
            
            document.getElementById('site-name').value = data.siteName || '';
            document.getElementById('seo-title').value = data.seoTitle || '';
            document.getElementById('seo-desc').value = data.seoDescription || '';
            document.getElementById('seo-keys').value = data.seoKeywords || '';

            if (data.theme) {
                document.getElementById('logo-url').value = data.theme.logoUrl || '';
                document.getElementById('heading-font').value = data.theme.headingFont || '';
                document.getElementById('body-font').value = data.theme.bodyFont || '';
                if(data.theme.palette) document.getElementById('palette-select').value = data.theme.palette;
            }
        }
    } catch (e) {
        console.error("Failed to load branding preferences", e);
    }
}

// Save back to Firestore
async function saveBrandingConfig() {
    const btn = document.getElementById('save-branding-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const alertsBox = document.getElementById('branding-alerts');
    alertsBox.classList.add('hidden');
    alertsBox.className = "mb-6 hidden text-sm px-4 py-3 rounded-xl font-bold text-center";

    const payload = {
        siteName: document.getElementById('site-name').value.trim(),
        seoTitle: document.getElementById('seo-title').value.trim(),
        seoDescription: document.getElementById('seo-desc').value.trim(),
        seoKeywords: document.getElementById('seo-keys').value.trim(),
        theme: {
            logoUrl: document.getElementById('logo-url').value.trim(),
            palette: document.getElementById('palette-select').value,
            headingFont: document.getElementById('heading-font').value.trim() || 'Inter',
            bodyFont: document.getElementById('body-font').value.trim() || 'Inter'
        }
    };

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        await setDoc(ref, payload, { merge: true });

        alertsBox.classList.remove('hidden');
        alertsBox.classList.add('bg-green-100', 'text-green-700');
        alertsBox.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Configuration forcefully broadcasted globally! Refresh the page to apply new properties.';

    } catch (e) {
        console.error("Save failure", e);
        alertsBox.classList.remove('hidden');
        alertsBox.classList.add('bg-red-100', 'text-red-700');
        alertsBox.innerHTML = '<i class="fa-solid fa-times mr-2"></i> Failed to save. Ensure Firestore rules permit structural modification.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Aesthetics';
    }
}
