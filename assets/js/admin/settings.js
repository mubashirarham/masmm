import { 
    getFirestore, 
    doc, 
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'settings') return;

    renderSettingsUI();
    fetchSettings();
});

function renderSettingsUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the General Settings View
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">General Settings</h2>
            <p class="text-sm text-gray-500">Configure global platform preferences and system behaviors.</p>
        </div>

        <div class="max-w-4xl space-y-6">
            <form id="admin-settings-form" class="space-y-6">
                
                <!-- Basic Information Card -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    <h3 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6">Basic Information</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Panel Name</label>
                            <input type="text" id="setting-site-name" placeholder="e.g., MAsmmpanel" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Contact Email</label>
                            <input type="email" id="setting-contact-email" placeholder="support@masmmpanel.com" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Platform Description (SEO)</label>
                            <textarea id="setting-seo-desc" rows="3" placeholder="The cheapest SMM panel in Pakistan..." class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Preferences Card -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                    <h3 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6">System Preferences</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Default Currency</label>
                            <select id="setting-currency" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all bg-white">
                                <option value="PKR">PKR - Pakistani Rupee</option>
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="INR">INR - Indian Rupee</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Currency Symbol</label>
                            <input type="text" id="setting-currency-symbol" placeholder="e.g., Rs or $" value="Rs" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        
                        <div class="md:col-span-2 flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 mt-2">
                            <div>
                                <h4 class="font-bold text-gray-800">Maintenance Mode</h4>
                                <p class="text-xs text-gray-500 mt-1">When enabled, users will see a maintenance screen and cannot log in or place orders.</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="setting-maintenance-mode" class="sr-only peer">
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Inline Notification -->
                <div id="settings-notification" class="hidden text-sm px-4 py-3 rounded-lg font-semibold transition-all"></div>

                <!-- Action Buttons -->
                <div class="flex justify-end pt-2">
                    <button type="submit" id="save-settings-btn" class="px-8 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-brand-500/30">
                        <i class="fa-solid fa-floppy-disk"></i>
                        <span>Save Changes</span>
                    </button>
                </div>

            </form>
        </div>
    `;

    // Handle Form Submission
    const form = document.getElementById('admin-settings-form');
    form.addEventListener('submit', handleSaveSettings);
}

async function fetchSettings() {
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
    
    try {
        const docSnap = await getDoc(settingsRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Populate fields if they exist
            if (document.getElementById('setting-site-name')) document.getElementById('setting-site-name').value = data.siteName || '';
            if (document.getElementById('setting-contact-email')) document.getElementById('setting-contact-email').value = data.contactEmail || '';
            if (document.getElementById('setting-seo-desc')) document.getElementById('setting-seo-desc').value = data.seoDescription || '';
            if (document.getElementById('setting-currency')) document.getElementById('setting-currency').value = data.currency || 'PKR';
            if (document.getElementById('setting-currency-symbol')) document.getElementById('setting-currency-symbol').value = data.currencySymbol || 'Rs';
            if (document.getElementById('setting-maintenance-mode')) document.getElementById('setting-maintenance-mode').checked = data.maintenanceMode === true;
        }
    } catch (error) {
        console.error("Error fetching settings:", error);
        showNotification("Failed to load current settings. Please check your connection.", "error");
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const btn = document.getElementById('save-settings-btn');
    
    const settingsData = {
        siteName: document.getElementById('setting-site-name').value.trim(),
        contactEmail: document.getElementById('setting-contact-email').value.trim(),
        seoDescription: document.getElementById('setting-seo-desc').value.trim(),
        currency: document.getElementById('setting-currency').value,
        currencySymbol: document.getElementById('setting-currency-symbol').value.trim(),
        maintenanceMode: document.getElementById('setting-maintenance-mode').checked,
        updatedAt: serverTimestamp()
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>';

    try {
        // We use a specific document 'general' inside the settings collection
        // { merge: true } ensures we don't accidentally delete other setting fields if added later
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        
        await setDoc(settingsRef, settingsData, { merge: true });
        
        showNotification("Settings saved successfully!", "success");

    } catch (error) {
        console.error("Error saving settings: ", error);
        showNotification("Failed to save settings. Please try again.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Changes</span>';
        
        // Auto-hide success message after 3 seconds
        setTimeout(() => {
            document.getElementById('settings-notification').classList.add('hidden');
        }, 3000);
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('settings-notification');
    notif.innerText = message;
    notif.className = "text-sm px-4 py-3 rounded-lg font-semibold transition-all mb-4 block"; // Reset base classes
    
    if (type === 'success') {
        notif.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
        notif.innerHTML = `<i class="fa-solid fa-circle-check text-green-600 mr-2"></i> ${message}`;
    } else if (type === 'error') {
        notif.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
        notif.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-600 mr-2"></i> ${message}`;
    }
}