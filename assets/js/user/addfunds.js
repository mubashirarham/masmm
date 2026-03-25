import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let activeGateways = [];

// Track the current user's auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// Listen for the custom routing event from user/index.html
window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'addfunds') return;

    renderAddFundsUI();
    fetchActiveGateways();
});

function renderAddFundsUI() {
    const contentArea = document.getElementById('user-content');
    
    // Inject HTML for a simplified, centered Add Funds View
    contentArea.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="mb-8 text-center sm:text-left">
                <h2 class="text-3xl font-bold text-gray-900">Add Funds</h2>
                <p class="text-gray-500 mt-2">Deposit money into your account instantly or manually.</p>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                <!-- Top Accent Line -->
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-brand-600"></div>

                <div class="p-6 sm:p-10">
                    <form id="add-funds-form" class="space-y-8">
                        
                        <!-- Core Input Row -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-100">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">Payment Method <span class="text-red-500">*</span></label>
                                <select id="fund-method" required class="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all text-sm font-bold text-gray-800 shadow-sm cursor-pointer hover:border-brand-300">
                                    <option value="cashmaal_auto" class="text-brand-600">⚡ CashMaal (Auto & Instant)</option>
                                    <!-- Manual gateways dynamically populated here -->
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">Amount (PKR) <span class="text-red-500">*</span></label>
                                <div class="relative shadow-sm rounded-xl">
                                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">Rs</span>
                                    <input type="number" id="fund-amount" min="1" step="1" required placeholder="100" class="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm font-bold text-gray-900 hover:border-brand-300">
                                </div>
                                <p class="text-xs text-gray-500 mt-2 font-medium"><i class="fa-solid fa-circle-info text-brand-500 mr-1"></i> Minimum deposit limit is Rs 1.</p>
                            </div>
                        </div>

                        <!-- Dynamic Gateway Info Box -->
                        <div id="dynamic-gateway-info" class="bg-brand-50 rounded-2xl p-6 border border-brand-100 transition-all">
                            <!-- Content updated dynamically by JS -->
                            <div class="flex items-center justify-center text-brand-500 gap-3 py-4">
                                <i class="fa-solid fa-spinner fa-spin text-xl"></i> 
                                <span class="font-semibold text-sm">Loading method details...</span>
                            </div>
                        </div>

                        <!-- Manual Proof Fields (Hidden when CashMaal is selected) -->
                        <div id="manual-proof-section" class="space-y-6 hidden pt-6 border-t border-gray-100">
                            <h4 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <i class="fa-solid fa-shield-check text-green-500"></i> Payment Verification
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Transaction ID (TID) <span class="text-red-500">*</span></label>
                                    <input type="text" id="fund-tid" placeholder="Enter the exact TID/Reference Number" class="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm shadow-sm hover:border-brand-300">
                                    <p class="text-xs text-gray-500 mt-2">Found in your payment confirmation SMS or app.</p>
                                </div>

                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Payment Screenshot <span class="text-red-500">*</span></label>
                                    <div class="relative border-2 border-dashed border-gray-300 rounded-xl p-5 hover:border-brand-500 hover:bg-brand-50 transition-colors text-center group cursor-pointer bg-gray-50 shadow-sm" id="screenshot-upload-area">
                                        <input type="file" id="fund-screenshot" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                        <div id="screenshot-preview-container" class="hidden">
                                            <img id="screenshot-preview" class="max-h-24 mx-auto rounded shadow-sm">
                                            <p class="text-xs text-brand-600 mt-2 font-medium">Click or drag to change image</p>
                                        </div>
                                        <div id="screenshot-placeholder">
                                            <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-200 group-hover:border-brand-300 group-hover:text-brand-500 text-gray-400 transition-colors">
                                                <i class="fa-solid fa-cloud-arrow-up text-xl"></i>
                                            </div>
                                            <p class="text-sm font-semibold text-gray-700">Upload Screenshot</p>
                                            <p class="text-xs text-gray-400 mt-1">JPEG or PNG (Max 5MB)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="fund-notification" class="hidden text-sm px-4 py-3 rounded-xl text-center font-semibold transition-all"></div>

                        <div class="pt-2">
                            <button type="submit" id="submit-fund-btn" class="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold text-lg transition-all flex justify-center items-center gap-2 shadow-lg shadow-brand-500/30">
                                <i class="fa-solid fa-bolt"></i> Pay securely with CashMaal
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const methodSelect = document.getElementById('fund-method');
    const screenshotInput = document.getElementById('fund-screenshot');

    // Dynamic UI toggling based on selected method
    methodSelect.addEventListener('change', (e) => {
        updateGatewayInfoBox(e.target.value);
    });

    document.getElementById('add-funds-form').addEventListener('submit', handleFundSubmit);
    
    // Image Preview Logic
    screenshotInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const previewImg = document.getElementById('screenshot-preview');
            previewImg.src = URL.createObjectURL(file);
            document.getElementById('screenshot-placeholder').classList.add('hidden');
            document.getElementById('screenshot-preview-container').classList.remove('hidden');
            document.getElementById('screenshot-upload-area').classList.remove('border-dashed', 'border-gray-300', 'bg-gray-50');
            document.getElementById('screenshot-upload-area').classList.add('border-solid', 'border-brand-200', 'bg-white');
        }
    });
}

function fetchActiveGateways() {
    const gatewaysRef = collection(db, 'artifacts', appId, 'public', 'data', 'gateways');
    
    onSnapshot(gatewaysRef, (snapshot) => {
        activeGateways = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status === 'Active') {
                activeGateways.push({ id: docSnap.id, ...data });
            }
        });

        activeGateways.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        populateMethodDropdown();
    }, (error) => {
        console.error("Error loading gateways: ", error);
    });
}

function populateMethodDropdown() {
    const select = document.getElementById('fund-method');
    if (!select) return;

    const currentVal = select.value;
    
    // Reset but keep CashMaal
    select.innerHTML = '<option value="cashmaal_auto" class="font-bold text-brand-600">⚡ CashMaal (Auto & Instant)</option>';
    
    activeGateways.forEach(gateway => {
        const option = document.createElement('option');
        option.value = gateway.name;
        option.textContent = `Manual: ${gateway.name}`;
        select.appendChild(option);
    });

    if (currentVal) {
        select.value = currentVal;
    }
    
    // Trigger initial render of the info box
    updateGatewayInfoBox(select.value);
}

// Function attached to window for inline onclick execution (clipboard)
window.copyToClipboard = (text) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert('Account number copied to clipboard!');
};

function updateGatewayInfoBox(methodValue) {
    const infoBox = document.getElementById('dynamic-gateway-info');
    const manualSection = document.getElementById('manual-proof-section');
    const submitBtn = document.getElementById('submit-fund-btn');
    const tidInput = document.getElementById('fund-tid');
    const screenshotInput = document.getElementById('fund-screenshot');

    if (!infoBox) return;

    if (methodValue === 'cashmaal_auto') {
        manualSection.classList.add('hidden');
        tidInput.required = false;
        screenshotInput.required = false;
        
        submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Pay securely with CashMaal';
        submitBtn.className = "w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold text-lg transition-all flex justify-center items-center gap-2 shadow-lg shadow-brand-500/30";
        
        infoBox.className = "bg-brand-50 rounded-2xl p-6 border border-brand-200 transition-all shadow-inner";
        infoBox.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-5">
                <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-brand-500 text-2xl shrink-0 shadow-sm border border-brand-200"><i class="fa-solid fa-bolt"></i></div>
                <div>
                    <h4 class="font-bold text-brand-900 text-xl mb-1">Instant Automated Deposit</h4>
                    <p class="text-sm text-brand-800 leading-relaxed max-w-xl">Pay directly through the secure CashMaal portal using EasyPaisa, JazzCash, or Bank Transfer. Your account balance will be credited automatically and instantly.</p>
                </div>
            </div>
        `;
    } else {
        const gateway = activeGateways.find(g => g.name === methodValue);
        if(!gateway) return;

        manualSection.classList.remove('hidden');
        tidInput.required = true;
        screenshotInput.required = true;
        
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Manual Proof';
        submitBtn.className = "w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg transition-all flex justify-center items-center gap-2 shadow-lg shadow-gray-900/30";
        
        infoBox.className = "bg-blue-50 rounded-2xl p-6 border border-blue-200 transition-all shadow-inner";
        infoBox.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start gap-6">
                ${gateway.logoUrl ? `<img src="${gateway.logoUrl}" class="w-16 h-16 object-contain rounded-xl bg-white p-2 border border-blue-200 shrink-0 shadow-sm">` : `<div class="w-16 h-16 rounded-xl bg-white flex items-center justify-center text-blue-500 text-3xl shrink-0 border border-blue-200 shadow-sm"><i class="fa-solid fa-building-columns"></i></div>`}
                <div class="flex-1 w-full min-w-0">
                    <h4 class="font-bold text-blue-900 text-xl mb-4">Send Funds to ${gateway.name}</h4>
                    
                    <div class="bg-white rounded-xl p-4 sm:p-5 border border-blue-200 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-sm relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-blue-500"></div>
                        <div>
                            <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Account Title</p>
                            <p class="font-bold text-gray-800 text-base truncate" title="${gateway.accountTitle || 'N/A'}">${gateway.accountTitle || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Account Number</p>
                            <div class="flex items-center gap-3">
                                <p class="font-mono font-black text-blue-700 text-lg select-all">${gateway.accountNumber || 'N/A'}</p>
                                <button type="button" onclick="window.copyToClipboard('${gateway.accountNumber || ''}')" class="text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border border-gray-100" title="Copy Account Number">
                                    <i class="fa-regular fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    ${gateway.instructions ? `<div class="text-sm text-blue-800 bg-white/60 p-4 rounded-xl border border-blue-100 flex gap-3"><i class="fa-solid fa-circle-info text-blue-500 mt-0.5"></i><p class="leading-relaxed font-medium">${gateway.instructions}</p></div>` : ''}
                </div>
            </div>
        `;
    }
}

async function uploadScreenshotToCloudinary(file) {
    const cloudinaryUrl = 'https://api.cloudinary.com/v1_1/dis1ptaip/image/upload';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'mubashir'); 
    
    const response = await fetch(cloudinaryUrl, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Cloudinary upload failed');
    const data = await response.json();
    return data.secure_url; 
}

async function handleFundSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const method = document.getElementById('fund-method').value;
    const amount = parseFloat(document.getElementById('fund-amount').value);

    // --- 1. AUTOMATIC CASHMAAL ROUTING ---
    if (method === 'cashmaal_auto') {
        if (!amount || amount < 1) {
            showNotification("Minimum deposit is Rs 1", "error");
            return;
        }

        // Generate dynamic CashMaal Form and submit to their portal
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://cmaal.com/Pay/';
        
        // IMPORTANT: Add your actual CashMaal Web ID here!
        const CASHMAAL_WEB_ID = "11191"; 
        
        const currentUrl = window.location.origin + window.location.pathname;

        const fields = {
            'pay_method': '',
            'amount': amount,
            'currency': 'PKR',
            'succes_url': currentUrl + '#transactions',
            'cancel_url': currentUrl + '#addfunds',
            'client_email': currentUser.email,
            'web_id': CASHMAAL_WEB_ID,
            'order_id': currentUser.uid, // We pass the UID so the Webhook knows whose balance to increase
            'addi_info': 'Account Deposit'
        };

        for (const key in fields) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = fields[key];
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
        return;
    }

    // --- 2. MANUAL SUBMISSION ROUTING ---
    const tid = document.getElementById('fund-tid').value.trim();
    const fileInput = document.getElementById('fund-screenshot');
    const btn = document.getElementById('submit-fund-btn');
    
    if (!amount || amount < 1 || !tid || fileInput.files.length === 0) {
        showNotification("Please fill all required fields and ensure the minimum deposit is Rs 1.", "error");
        return;
    }

    btn.disabled = true;
    
    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Image...';
        const screenshotUrl = await uploadScreenshotToCloudinary(fileInput.files[0]);

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        
        const transactionData = {
            type: 'Deposit',
            method: method,
            amount: amount,
            tid: tid,
            screenshotUrl: screenshotUrl,
            status: 'Pending',
            createdAt: serverTimestamp()
        };

        const txRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'transactions');
        await addDoc(txRef, transactionData);

        e.target.reset();
        document.getElementById('screenshot-placeholder').classList.remove('hidden');
        document.getElementById('screenshot-preview-container').classList.add('hidden');
        document.getElementById('screenshot-upload-area').classList.remove('border-solid', 'border-brand-200', 'bg-white');
        document.getElementById('screenshot-upload-area').classList.add('border-dashed', 'border-gray-300', 'bg-gray-50');
        
        showNotification("Deposit submitted! Admin will review it shortly.", "success");
        
    } catch (error) {
        console.error("Deposit Error:", error);
        showNotification("An error occurred while submitting.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Manual Proof';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('fund-notification');
    notif.innerText = message;
    notif.className = "text-sm px-4 py-3 rounded-xl text-center font-bold mt-4 block border";
    
    if (type === 'success') {
        notif.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
    } else {
        notif.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
    }
    
    setTimeout(() => { notif.classList.add('hidden'); }, 5000);
}