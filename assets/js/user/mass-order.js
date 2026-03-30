import { 
    getFirestore, collection, onSnapshot, doc, writeBatch, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let allServices = [];
let currentBalance = 0;
let currentDiscount = 0;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('stat-balance')) fetchStats();
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'massorder') return;
    renderMassOrderUI();
    fetchServices();
    if (currentUser) fetchStats();
});

function fetchStats() {
    if (!currentUser) return;
    const statsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'stats');
    onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentBalance = parseFloat(data.balance || 0);
            currentDiscount = parseFloat(data.discount || 0);
        } else {
            currentBalance = 0;
            currentDiscount = 0;
        }
    });
}

function fetchServices() {
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => allServices.push({ id: doc.id, ...doc.data() }));
    });
}

function renderMassOrderUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-800">Mass Order</h2>
            <p class="text-sm text-gray-500">Place multiple orders at once using a specific format.</p>
        </div>

        <div class="max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-brand-500"></div>

                <div class="mb-4">
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Order Format: <span class="text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded">service_id | link | quantity</span></label>
                    <textarea id="mass-order-input" rows="12" class="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors font-mono text-sm shadow-inner" placeholder="102 | https://instagram.com/p/123 | 1000&#10;105 | https://youtube.com/watch?v=123 | 500"></textarea>
                </div>

                <div id="mass-notification" class="hidden mb-4 p-4 rounded-xl text-sm font-semibold shadow-sm border"></div>

                <button id="mass-order-btn" class="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-lg flex justify-center items-center gap-2">
                    <i class="fa-solid fa-layer-group"></i> Submit Mass Order
                </button>
            </div>

            <div class="bg-gray-50 rounded-2xl p-6 border border-gray-200 shadow-sm h-fit">
                <h3 class="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2"><i class="fa-solid fa-circle-info text-blue-500 mr-1"></i> Instructions</h3>
                <ul class="text-sm text-gray-600 space-y-3 list-disc pl-4 mb-6">
                    <li>Enter one order per line.</li>
                    <li>Use the pipe character <code class="font-bold bg-gray-200 px-1 rounded">|</code> as a separator.</li>
                    <li>Ensure the <code class="font-bold">service_id</code> exists in the Services list.</li>
                    <li>Make sure the quantity respects the minimum and maximum limits of the service.</li>
                    <li>If any single line is invalid, the entire batch will be rejected to prevent partial drops.</li>
                </ul>
                <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <h4 class="font-bold text-blue-800 text-xs uppercase tracking-wider mb-2">Example</h4>
                    <p class="font-mono text-xs text-blue-700 whitespace-pre-wrap leading-relaxed">201 | https://inst.com/p/123 | 2000
344 | https://youtu.be/123 | 500</p>
                </div>
            </div>

        </div>
    `;

    document.getElementById('mass-order-btn').addEventListener('click', handleMassOrder);
}

async function handleMassOrder() {
    if (!currentUser) return;

    const inputArea = document.getElementById('mass-order-input');
    const texts = inputArea.value.trim().split('\n');
    const notif = document.getElementById('mass-notification');
    const btn = document.getElementById('mass-order-btn');

    if (!inputArea.value.trim()) {
        showNotif('error', 'Please enter at least one order.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating...';
    notif.classList.add('hidden');

    let totalCharge = 0;
    const parsedOrders = [];

    // Validation Phase
    for (let i = 0; i < texts.length; i++) {
        const line = texts[i].trim();
        if (!line) continue;

        const parts = line.split('|').map(p => p.trim());
        if (parts.length !== 3) {
            showNotif('error', `Line ${i + 1}: Invalid format. Expected 3 parts divided by |.`);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
            return;
        }

        const srvId = parts[0];
        const link = parts[1];
        const qty = parseInt(parts[2]);

        if (!link || isNaN(qty) || qty <= 0) {
            showNotif('error', `Line ${i + 1}: Invalid link or quantity.`);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
            return;
        }

        const service = allServices.find(s => s.id === srvId);
        if (!service) {
            showNotif('error', `Line ${i + 1}: Service ID ${srvId} not found.`);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
            return;
        }

        if (qty < parseInt(service.min) || qty > parseInt(service.max)) {
            showNotif('error', `Line ${i + 1}: Quantity ${qty} is out of bounds for ${service.name} (Min: ${service.min}, Max: ${service.max}).`);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
            return;
        }

        const actualRate = parseFloat(service.rate) * (1 - (currentDiscount / 100));
        const lineCharge = (actualRate / 1000) * qty;
        totalCharge += lineCharge;

        parsedOrders.push({
            serviceId: service.id,
            serviceName: service.name,
            providerId: service.providerId || null,
            upstreamServiceId: service.serviceId || null,
            _original_rate: service._original_rate || null,
            _pkr_exchange_rate: service._pkr_exchange_rate || null,
            link: link,
            quantity: qty,
            charge: lineCharge
        });
    }

    if (parsedOrders.length === 0) {
        showNotif('error', 'No valid orders to process.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
        return;
    }

    if (currentBalance < totalCharge) {
        showNotif('error', `Insufficient balance. Total charge for ${parsedOrders.length} orders is ${window.formatMoney(totalCharge)} but you have ${window.formatMoney(currentBalance)}.`);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
        return;
    }

    // Execution Phase using Firestore Batch
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing ' + parsedOrders.length + ' Orders...';
    try {
        const batch = writeBatch(db);
        
        // 1. Add all orders
        const ordersRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'orders');
        parsedOrders.forEach(order => {
            const newDocRef = doc(ordersRef);
            batch.set(newDocRef, {
                ...order,
                status: 'Pending',
                createdAt: serverTimestamp()
            });
        });

        // 2. Deduct total balance
        const statsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'stats');
        batch.update(statsRef, {
            balance: increment(-totalCharge),
            totalOrders: increment(parsedOrders.length),
            totalSpent: increment(totalCharge)
        });

        await batch.commit();

        showNotif('success', `Successfully placed ${parsedOrders.length} orders. Total charge: ${window.formatMoney(totalCharge)}.`);
        inputArea.value = '';

    } catch (e) {
        console.error("Mass Order Error:", e);
        showNotif('error', 'An error occurred while processing your mass orders. No balance was deducted.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Submit Mass Order';
    }
}

function showNotif(type, msg) {
    const notif = document.getElementById('mass-notification');
    notif.classList.remove('hidden', 'bg-red-50', 'text-red-600', 'border-red-100', 'bg-green-50', 'text-green-700', 'border-green-200');
    
    if (type === 'error') {
        notif.classList.add('bg-red-50', 'text-red-600', 'border-red-100');
        notif.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${msg}`;
    } else {
        notif.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
        notif.innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i> ${msg}`;
    }
}
