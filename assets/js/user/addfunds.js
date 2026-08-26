import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    query,
    orderBy,
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
let selectedGateway = null;

// Track current user auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('deposit-history-tbody')) {
        listenDepositHistory();
    }
});

// Listen for custom routing event from user/index.html
window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'addfunds') return;

    renderAddFundsUI();
    fetchActiveGateways();
    if (currentUser) listenDepositHistory();
});

function renderAddFundsUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-8">
            
            <!-- Page Header -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-2xl border border-slate-300 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 left-0 w-2 h-full bg-brand-500"></div>
                <div>
                    <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Manual Payment Deposit</h2>
                    <p class="text-slate-600 text-sm mt-1 font-medium">Transfer funds directly via EasyPaisa, JazzCash, or Bank Transfer and submit your verification receipt.</p>
                </div>
                <div class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-300 shrink-0">
                    <i class="fa-solid fa-shield-check text-base"></i> 100% Safe & Verified
                </div>
            </div>

            <!-- Main Form Card -->
            <div class="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden p-6 sm:p-8 relative">
                <form id="add-funds-form" class="space-y-8">
                    
                    <!-- Step 1: Select Payment Gateway -->
                    <div>
                        <label class="block text-xs font-black tracking-wider uppercase text-slate-800 mb-3 flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-black">1</span>
                            Select Payment Method <span class="text-red-500">*</span>
                        </label>

                        <!-- Gateways Grid / Selector -->
                        <div id="gateways-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                            <div class="col-span-full py-8 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-brand-500"></i>
                                <p class="text-sm font-bold">Loading active payment gateways...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: Gateway Account Details Box -->
                    <div id="dynamic-gateway-info" class="hidden transition-all duration-300">
                        <!-- Populated by JS -->
                    </div>

                    <!-- Step 3: Amount & Quick Chips -->
                    <div class="space-y-4 pt-4 border-t border-slate-200">
                        <label class="block text-xs font-black tracking-wider uppercase text-slate-800 flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-black">2</span>
                            Enter Deposit Amount (PKR) <span class="text-red-500">*</span>
                        </label>

                        <div class="relative max-w-md">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-extrabold text-base">Rs</span>
                            <input type="number" id="fund-amount" min="10" step="1" required placeholder="1000" class="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-xl font-black shadow-sm">
                        </div>

                        <!-- Quick Presets -->
                        <div class="flex flex-wrap gap-2 pt-1">
                            <button type="button" onclick="window.setPresetAmount(500)" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-800 text-xs font-bold transition-all border border-slate-300 hover:border-brand-600 shadow-sm cursor-pointer">+ Rs 500</button>
                            <button type="button" onclick="window.setPresetAmount(1000)" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-800 text-xs font-bold transition-all border border-slate-300 hover:border-brand-600 shadow-sm cursor-pointer">+ Rs 1,000</button>
                            <button type="button" onclick="window.setPresetAmount(2500)" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-800 text-xs font-bold transition-all border border-slate-300 hover:border-brand-600 shadow-sm cursor-pointer">+ Rs 2,500</button>
                            <button type="button" onclick="window.setPresetAmount(5000)" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-800 text-xs font-bold transition-all border border-slate-300 hover:border-brand-600 shadow-sm cursor-pointer">+ Rs 5,000</button>
                            <button type="button" onclick="window.setPresetAmount(10000)" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-800 text-xs font-bold transition-all border border-slate-300 hover:border-brand-600 shadow-sm cursor-pointer">+ Rs 10,000</button>
                        </div>
                    </div>

                    <!-- Step 4: Verification Details (TID & Screenshot) -->
                    <div id="manual-proof-section" class="space-y-6 pt-4 border-t border-slate-200">
                        <label class="block text-xs font-black tracking-wider uppercase text-slate-800 flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-black">3</span>
                            Payment Receipt & Proof <span class="text-red-500">*</span>
                        </label>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-xs font-bold text-slate-800 mb-2">Transaction ID (TID / Ref #) <span class="text-red-500">*</span></label>
                                <div class="relative">
                                    <i class="fa-solid fa-receipt absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                    <input type="text" id="fund-tid" required placeholder="e.g. 034591823901" class="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-sm font-mono font-bold shadow-sm">
                                </div>
                                <p class="text-[11px] text-slate-500 mt-2 font-medium">Find the Transaction ID in your banking app or confirmation SMS.</p>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-slate-800 mb-2">Upload Payment Screenshot <span class="text-red-500">*</span></label>
                                <div class="relative border-2 border-dashed border-slate-300 rounded-xl p-5 hover:border-brand-500 hover:bg-brand-50/40 transition-all text-center group cursor-pointer bg-slate-50 shadow-sm" id="screenshot-upload-area">
                                    <input type="file" id="fund-screenshot" accept="image/*" required class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                    
                                    <div id="screenshot-preview-container" class="hidden relative z-20">
                                        <img id="screenshot-preview" class="max-h-28 mx-auto rounded-lg shadow border border-slate-300">
                                        <p class="text-xs text-brand-600 mt-2 font-bold flex items-center justify-center gap-1">
                                            <i class="fa-solid fa-arrows-rotate"></i> Click or drag to replace image
                                        </p>
                                    </div>
                                    
                                    <div id="screenshot-placeholder">
                                        <div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm border border-slate-300 group-hover:border-brand-300 group-hover:text-brand-500 text-slate-500 transition-colors">
                                            <i class="fa-solid fa-cloud-arrow-up text-xl"></i>
                                        </div>
                                        <p class="text-xs font-extrabold text-slate-800">Upload Receipt Screenshot</p>
                                        <p class="text-[11px] text-slate-500 mt-0.5">JPEG, PNG or WEBP (Max 5MB)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="fund-notification" class="hidden text-sm px-4 py-3.5 rounded-xl text-center font-bold transition-all border"></div>

                    <div>
                        <button type="submit" id="submit-fund-btn" class="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex justify-center items-center gap-2 shadow-md border border-brand-600 cursor-pointer">
                            <i class="fa-solid fa-paper-plane"></i> Submit Deposit Proof
                        </button>
                    </div>
                </form>
            </div>

            <!-- Deposit History Table Card -->
            <div class="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden p-6 sm:p-8 space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-slate-200">
                    <h3 class="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <i class="fa-solid fa-clock-rotate-left text-brand-500"></i> Deposit Verification History
                    </h3>
                    <span class="text-xs font-bold text-slate-500">Live Updates</span>
                </div>

                <div class="overflow-x-auto rounded-xl border border-slate-300">
                    <table class="w-full text-left text-xs text-slate-700">
                        <thead class="bg-slate-100 text-slate-800 uppercase font-bold text-[11px] tracking-wider border-b-2 border-slate-300 sticky top-0">
                            <tr>
                                <th class="py-3.5 px-4">Date</th>
                                <th class="py-3.5 px-4">Method</th>
                                <th class="py-3.5 px-4">TID / Ref #</th>
                                <th class="py-3.5 px-4">Amount</th>
                                <th class="py-3.5 px-4">Proof</th>
                                <th class="py-3.5 px-4">Status</th>
                            </tr>
                        </thead>
                        <tbody id="deposit-history-tbody" class="divide-y divide-slate-200 font-medium bg-white">
                            <tr>
                                <td colspan="6" class="py-8 text-center text-slate-500 font-bold">
                                    <i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading transaction history...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Image Modal Preview -->
        <div id="image-modal" class="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-md hidden items-center justify-center p-4">
            <div class="relative bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 border border-slate-300">
                <div class="flex justify-between items-center pb-2 border-b border-slate-200">
                    <h4 class="font-black text-slate-900 text-sm">Receipt Screenshot Preview</h4>
                    <button type="button" onclick="document.getElementById('image-modal').classList.add('hidden')" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer">
                        <i class="fa-solid fa-xmark text-base"></i>
                    </button>
                </div>
                <img id="modal-image-target" class="w-full max-h-[70vh] object-contain rounded-xl border border-slate-300">
            </div>
        </div>
    `;

    const screenshotInput = document.getElementById('fund-screenshot');
    document.getElementById('add-funds-form').addEventListener('submit', handleFundSubmit);
    
    // Screenshot Image Preview logic
    screenshotInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const previewImg = document.getElementById('screenshot-preview');
            previewImg.src = URL.createObjectURL(file);
            document.getElementById('screenshot-placeholder').classList.add('hidden');
            document.getElementById('screenshot-preview-container').classList.remove('hidden');
            document.getElementById('screenshot-upload-area').classList.remove('border-dashed', 'border-slate-200', 'bg-slate-50/60');
            document.getElementById('screenshot-upload-area').classList.add('border-solid', 'border-brand-300', 'bg-emerald-50/30');
        }
    });
}

window.setPresetAmount = (val) => {
    const input = document.getElementById('fund-amount');
    if (input) input.value = val;
};

window.copyToClipboard = (text) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    const notif = document.getElementById('fund-notification');
    if (notif) {
        notif.className = "text-sm px-4 py-3 rounded-xl text-center font-bold mt-4 block bg-emerald-50 text-emerald-800 border border-emerald-200";
        notif.innerText = `Account number copied to clipboard: ${text}`;
        notif.classList.remove('hidden');
        setTimeout(() => notif.classList.add('hidden'), 3500);
    }
};

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
        renderGatewaysGrid();
    }, (error) => {
        console.error("Error loading gateways:", error);
    });
}

function renderGatewaysGrid() {
    const grid = document.getElementById('gateways-grid');
    if (!grid) return;

    if (activeGateways.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-8 text-center text-slate-500 bg-amber-50 rounded-2xl border border-amber-200">
                <i class="fa-solid fa-triangle-exclamation text-amber-500 text-2xl mb-1"></i>
                <p class="text-sm font-bold">No active payment gateways available.</p>
                <p class="text-xs text-slate-500 mt-1">Please contact Admin to enable manual payment methods.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    
    activeGateways.forEach((gw, idx) => {
        const card = document.createElement('div');
        card.className = `gateway-card p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 group ${idx === 0 ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20 shadow-sm' : 'border-slate-300 bg-white hover:border-slate-400'}`;
        card.dataset.id = gw.id;

        card.innerHTML = `
            <div class="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center p-1.5 shadow-sm border border-slate-200 shrink-0 group-hover:scale-105 transition-transform">
                ${gw.logoUrl ? `<img src="${gw.logoUrl}" class="w-full h-full object-contain">` : `<i class="fa-solid fa-building-columns text-slate-400 text-xl"></i>`}
            </div>
            <div>
                <p class="font-extrabold text-slate-900 text-xs truncate max-w-[120px]">${gw.name}</p>
                <p class="text-[10px] text-slate-500 font-medium">Manual Deposit</p>
            </div>
        `;

        card.addEventListener('click', () => selectGateway(gw));
        grid.appendChild(card);
    });

    // Auto-select first gateway
    if (activeGateways.length > 0) {
        selectGateway(activeGateways[0]);
    }
}

function selectGateway(gw) {
    selectedGateway = gw;
    
    // Highlight Card
    document.querySelectorAll('.gateway-card').forEach(card => {
        if (card.dataset.id === gw.id) {
            card.className = "gateway-card p-4 rounded-2xl border border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 shadow-sm";
        } else {
            card.className = "gateway-card p-4 rounded-2xl border border-slate-300 bg-white hover:border-slate-400 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 shadow-sm";
        }
    });

    // Render Gateway Details Box
    const infoBox = document.getElementById('dynamic-gateway-info');
    if (!infoBox) return;

    infoBox.classList.remove('hidden');
    infoBox.className = "bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-slate-700";
    infoBox.innerHTML = `
        <div class="flex flex-col sm:flex-row items-start justify-between gap-6 relative z-10">
            <div class="flex items-start gap-4">
                <div class="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center p-2 shrink-0">
                    ${gw.logoUrl ? `<img src="${gw.logoUrl}" class="w-full h-full object-contain">` : `<i class="fa-solid fa-building-columns text-2xl text-emerald-400"></i>`}
                </div>
                <div>
                    <h4 class="font-extrabold text-white text-lg">${gw.name} Payment Details</h4>
                    <p class="text-xs text-slate-300 mt-0.5 font-medium">Send exact payment to account details below before submitting TID.</p>
                </div>
            </div>

            <span class="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold shrink-0">
                <i class="fa-solid fa-circle-check mr-1"></i> Active Merchant Account
            </span>
        </div>

        <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <div>
                <p class="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider mb-1">Account Title</p>
                <p class="font-bold text-white text-base truncate select-all">${gw.accountTitle || 'N/A'}</p>
            </div>
            <div>
                <p class="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider mb-1">Account Number / IBAN</p>
                <div class="flex items-center gap-2">
                    <p class="font-mono font-black text-emerald-400 text-lg select-all">${gw.accountNumber || 'N/A'}</p>
                    <button type="button" onclick="window.copyToClipboard('${gw.accountNumber || ''}')" class="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border border-white/10" title="Copy Number">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>
            </div>
        </div>

        ${gw.instructions ? `
            <div class="mt-4 p-3.5 bg-brand-500/10 border border-brand-500/30 rounded-xl text-xs text-emerald-200 flex gap-2.5 items-start">
                <i class="fa-solid fa-circle-info text-emerald-400 mt-0.5 shrink-0"></i>
                <p class="leading-relaxed font-medium">${gw.instructions}</p>
            </div>
        ` : ''}
    `;
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

    if (!selectedGateway) {
        showNotification("Please select a payment method.", "error");
        return;
    }

    const amount = parseFloat(document.getElementById('fund-amount').value);
    const tid = document.getElementById('fund-tid').value.trim();
    const fileInput = document.getElementById('fund-screenshot');
    const btn = document.getElementById('submit-fund-btn');

    if (!amount || amount < 10) {
        showNotification("Minimum deposit amount is Rs 10.", "error");
        return;
    }

    if (!tid || fileInput.files.length === 0) {
        showNotification("Please provide both the Transaction ID and payment screenshot.", "error");
        return;
    }

    btn.disabled = true;
    
    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Screenshot...';
        const screenshotUrl = await uploadScreenshotToCloudinary(fileInput.files[0]);

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Verification...';
        
        const transactionData = {
            type: 'Deposit',
            method: selectedGateway.name,
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
        document.getElementById('screenshot-upload-area').classList.remove('border-solid', 'border-brand-300', 'bg-emerald-50/30');
        document.getElementById('screenshot-upload-area').classList.add('border-dashed', 'border-slate-200', 'bg-slate-50/60');
        
        showNotification("Deposit proof submitted! Admin will verify and approve your funds shortly.", "success");
        
    } catch (error) {
        console.error("Deposit Submission Error:", error);
        showNotification("An error occurred while submitting. Please try again.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane text-brand-400"></i> Submit Deposit Proof';
    }
}

function listenDepositHistory() {
    const tbody = document.getElementById('deposit-history-tbody');
    if (!tbody || !currentUser) return;

    const txRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'transactions');
    const q = query(txRef, orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-slate-400">
                        No payment history found.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now';
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/80 transition-colors";

            let statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">Pending</span>`;
            if (data.status === 'Completed' || data.status === 'Approved') {
                statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">Approved</span>`;
            } else if (data.status === 'Rejected' || data.status === 'Cancelled') {
                statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-red-100 text-red-800 border border-red-200">Rejected</span>`;
            }

            tr.innerHTML = `
                <td class="py-3 px-4 text-slate-500 whitespace-nowrap">${dateStr}</td>
                <td class="py-3 px-4 font-bold text-slate-900">${data.method || 'Manual'}</td>
                <td class="py-3 px-4 font-mono font-bold text-slate-700">${data.tid || 'N/A'}</td>
                <td class="py-3 px-4 font-black text-slate-900">${window.formatMoney(data.amount)}</td>
                <td class="py-3 px-4">
                    ${data.screenshotUrl ? `
                        <button type="button" onclick="window.previewScreenshot('${data.screenshotUrl}')" class="text-brand-600 hover:text-brand-700 font-bold inline-flex items-center gap-1">
                            <i class="fa-solid fa-image"></i> View
                        </button>
                    ` : '<span class="text-slate-400">N/A</span>'}
                </td>
                <td class="py-3 px-4 whitespace-nowrap">${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }, (error) => {
        console.error("Deposit History Error:", error);
    });
}

window.previewScreenshot = (url) => {
    const modal = document.getElementById('image-modal');
    const target = document.getElementById('modal-image-target');
    if (modal && target) {
        target.src = url;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

function showNotification(message, type) {
    const notif = document.getElementById('fund-notification');
    if (!notif) return;

    notif.innerText = message;
    notif.className = "text-sm px-4 py-3.5 rounded-xl text-center font-bold mt-4 block border animate-fade-in-down";
    
    if (type === 'success') {
        notif.classList.add('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    } else {
        notif.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
    }
    
    setTimeout(() => { notif.classList.add('hidden'); }, 6000);
}