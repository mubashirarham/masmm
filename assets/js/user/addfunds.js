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

// Track the current user's auth state to save deposits accurately
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
    
    // Inject HTML for Add Funds View
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Add Funds</h2>
            <p class="text-sm text-gray-500">Choose a payment method below, send the amount, and submit your proof.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            
            <!-- Left Column: Payment Methods -->
            <div class="lg:col-span-3 space-y-4">
                <h3 class="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2">Available Payment Methods</h3>
                <div id="gateways-container" class="space-y-4">
                    <div class="text-center py-12 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100">
                        <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                        <p>Loading payment methods...</p>
                    </div>
                </div>
            </div>

            <!-- Right Column: Submit Proof Form -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-24">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Submit Payment Proof</h3>
                    
                    <form id="add-funds-form" class="space-y-5">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Method Used <span class="text-red-500">*</span></label>
                            <select id="fund-method" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all text-sm">
                                <option value="">-- Select Payment Method --</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Amount Sent (PKR) <span class="text-red-500">*</span></label>
                            <input type="number" id="fund-amount" min="1" step="0.01" required placeholder="e.g., 500" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Transaction ID (TID) <span class="text-red-500">*</span></label>
                            <input type="text" id="fund-tid" required placeholder="Enter the exact TID" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Payment Screenshot <span class="text-red-500">*</span></label>
                            <div class="relative border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-brand-500 transition-colors text-center group cursor-pointer" id="screenshot-upload-area">
                                <input type="file" id="fund-screenshot" accept="image/*" required class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                <div id="screenshot-preview-container" class="hidden">
                                    <img id="screenshot-preview" class="max-h-32 mx-auto rounded shadow-sm">
                                    <p class="text-xs text-brand-600 mt-2 font-medium">Click to change image</p>
                                </div>
                                <div id="screenshot-placeholder">
                                    <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-400 group-hover:text-brand-500 mb-2 transition-colors"></i>
                                    <p class="text-sm font-medium text-gray-600">Click or drag image to upload</p>
                                    <p class="text-xs text-gray-400 mt-1">JPEG, PNG, JPG (Max 5MB)</p>
                                </div>
                            </div>
                        </div>

                        <div id="fund-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold mt-2"></div>

                        <button type="submit" id="submit-fund-btn" class="w-full py-3.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold transition-colors flex justify-center items-center gap-2 shadow-lg shadow-brand-500/30">
                            <i class="fa-solid fa-paper-plane"></i> Submit for Approval
                        </button>
                    </form>
                </div>
            </div>
            
        </div>
    `;

    // Attach listeners
    document.getElementById('add-funds-form').addEventListener('submit', handleFundSubmit);
    
    // Image Preview Logic
    const fileInput = document.getElementById('fund-screenshot');
    fileInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const previewImg = document.getElementById('screenshot-preview');
            previewImg.src = URL.createObjectURL(file);
            document.getElementById('screenshot-placeholder').classList.add('hidden');
            document.getElementById('screenshot-preview-container').classList.remove('hidden');
            document.getElementById('screenshot-upload-area').classList.remove('border-dashed', 'border-gray-300');
            document.getElementById('screenshot-upload-area').classList.add('border-solid', 'border-brand-200', 'bg-brand-50');
        }
    });
}

function fetchActiveGateways() {
    const gatewaysRef = collection(db, 'artifacts', appId, 'public', 'data', 'gateways');
    
    onSnapshot(gatewaysRef, (snapshot) => {
        activeGateways = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Only pull Active gateways for the user
            if (data.status === 'Active') {
                activeGateways.push({ id: docSnap.id, ...data });
            }
        });

        // Sort alphabetically
        activeGateways.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        renderGatewaysList();
        populateMethodDropdown();
    }, (error) => {
        console.error("Error loading gateways: ", error);
    });
}

function renderGatewaysList() {
    const container = document.getElementById('gateways-container');
    if (!container) return;

    container.innerHTML = '';

    if (activeGateways.length === 0) {
        container.innerHTML = `
            <div class="bg-yellow-50 text-yellow-700 p-6 rounded-xl border border-yellow-200 text-center">
                <i class="fa-solid fa-triangle-exclamation mb-3 text-3xl"></i>
                <p class="font-bold text-lg">No payment methods available.</p>
                <p class="text-sm mt-1">Please contact support or open a ticket to request fund additions.</p>
            </div>
        `;
        return;
    }

    activeGateways.forEach(gateway => {
        const name = gateway.name || 'Unnamed Method';
        const title = gateway.accountTitle || 'N/A';
        const number = gateway.accountNumber || 'N/A';
        const instructions = gateway.instructions || '';
        const logoUrl = gateway.logoUrl || null;

        // Render logo or fallback icon
        const logoHtml = logoUrl 
            ? `<img src="${logoUrl}" alt="${name}" class="w-14 h-14 object-contain rounded-xl border border-gray-100 bg-white p-1 shadow-sm shrink-0">`
            : `<div class="w-14 h-14 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-brand-500 text-2xl shrink-0 shadow-sm"><i class="fa-solid fa-wallet"></i></div>`;

        // We use a hacky inline onclick here since we are injecting HTML dynamically
        // Note: For document.execCommand fallback, we create a temporary textarea.
        const copyHtml = `
            <button onclick="
                const el = document.createElement('textarea');
                el.value = '${number}';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                alert('Account number copied to clipboard!');
            " class="text-gray-400 hover:text-brand-500 transition-colors p-1" title="Copy Account Number">
                <i class="fa-regular fa-copy"></i>
            </button>
        `;

        container.innerHTML += `
            <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <!-- Decorative accent line -->
                <div class="absolute top-0 left-0 w-1 h-full bg-brand-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div class="flex items-start gap-5">
                    ${logoHtml}
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-gray-900 text-lg mb-3">${name}</h4>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div>
                                <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Account Title</p>
                                <p class="font-semibold text-gray-800 truncate" title="${title}">${title}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Account Number</p>
                                <div class="flex items-center gap-2">
                                    <p class="font-mono font-bold text-brand-600 text-lg">${number}</p>
                                    ${copyHtml}
                                </div>
                            </div>
                        </div>

                        ${instructions ? `
                            <div class="mt-4 text-sm text-gray-700 bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 items-start">
                                <i class="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
                                <p class="leading-relaxed">${instructions}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
}

function populateMethodDropdown() {
    const select = document.getElementById('fund-method');
    if (!select) return;

    // Preserve current selection if it exists
    const currentVal = select.value;
    
    select.innerHTML = '<option value="">-- Select Payment Method --</option>';
    activeGateways.forEach(gateway => {
        const option = document.createElement('option');
        option.value = gateway.name;
        option.textContent = gateway.name;
        select.appendChild(option);
    });

    if (currentVal && activeGateways.find(g => g.name === currentVal)) {
        select.value = currentVal;
    }
}

// Function to upload the image directly from browser to Cloudinary
async function uploadScreenshotToCloudinary(file) {
    const cloudinaryUrl = 'https://api.cloudinary.com/v1_1/dis1ptaip/image/upload';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'mubashir'); 
    
    const response = await fetch(cloudinaryUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Cloudinary upload failed');
    }

    const data = await response.json();
    return data.secure_url; 
}

async function handleFundSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification("Session error. Please refresh the page.", "error");
        return;
    }

    const btn = document.getElementById('submit-fund-btn');
    const method = document.getElementById('fund-method').value;
    const amount = parseFloat(document.getElementById('fund-amount').value);
    const tid = document.getElementById('fund-tid').value.trim();
    const fileInput = document.getElementById('fund-screenshot');
    
    if (!method || !amount || !tid || fileInput.files.length === 0) {
        showNotification("Please fill all required fields and attach a screenshot.", "error");
        return;
    }

    btn.disabled = true;
    
    try {
        // Step 1: Upload Screenshot to Cloudinary
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Image...';
        const screenshotUrl = await uploadScreenshotToCloudinary(fileInput.files[0]);

        // Step 2: Save Transaction Request to Firestore
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

        // Reset form UI
        e.target.reset();
        document.getElementById('screenshot-placeholder').classList.remove('hidden');
        document.getElementById('screenshot-preview-container').classList.add('hidden');
        document.getElementById('screenshot-upload-area').classList.remove('border-solid', 'border-brand-200', 'bg-brand-50');
        document.getElementById('screenshot-upload-area').classList.add('border-dashed', 'border-gray-300');
        
        showNotification("Deposit submitted! Admin will review it shortly.", "success");
        
    } catch (error) {
        console.error("Deposit Error:", error);
        showNotification("An error occurred while submitting. Please check your image size.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit for Approval';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('fund-notification');
    notif.innerText = message;
    notif.className = "text-sm px-3 py-3 rounded-lg text-center font-semibold mt-4 block border";
    
    if (type === 'success') {
        notif.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
    } else {
        notif.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
    }
    
    setTimeout(() => {
        notif.classList.add('hidden');
    }, 5000);
}