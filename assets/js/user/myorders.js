import { 
    getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { CacheManager } from '../cache.js';

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let myOrdersCache = CacheManager.get('my_orders', []);

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('myorders-table-body')) {
        fetchMyOrders();
    }
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'myorders') return;
    renderMyOrdersUI();
    if (myOrdersCache.length > 0) renderMyOrdersTable();
    if (currentUser) fetchMyOrders();
});

function renderMyOrdersUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">My Orders</h2>
                <p class="text-sm text-slate-600 font-medium">Monitor your active and recent campaigns in real time.</p>
            </div>
        </div>

        <!-- Global Notification Area -->
        <div id="myorders-notification" class="hidden mb-4 text-sm px-4 py-3 rounded-xl font-bold border transition-all"></div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
            <div class="p-4 sm:p-5 border-b border-slate-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
                <div class="flex gap-2 w-full sm:w-auto relative">
                    <i class="fa-solid fa-search absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input type="text" id="search-myorders-input" placeholder="Search orders by link or ID..." class="w-full sm:w-80 pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-sm bg-white text-slate-900 shadow-sm font-sans">
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-700 whitespace-nowrap min-w-[1100px]">
                    <thead class="bg-slate-100 text-slate-800 border-b-2 border-slate-300 sticky top-0">
                        <tr>
                            <th class="px-6 py-4 font-bold w-16 text-xs uppercase tracking-wider">ID</th>
                            <th class="px-6 py-4 font-bold w-32 text-xs uppercase tracking-wider">Date</th>
                            <th class="px-6 py-4 font-bold max-w-[200px] text-xs uppercase tracking-wider">Link</th>
                            <th class="px-6 py-4 font-bold w-24 text-center text-xs uppercase tracking-wider">Start</th>
                            <th class="px-6 py-4 font-bold w-24 text-center text-xs uppercase tracking-wider">Qty</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider">Service</th>
                            <th class="px-6 py-4 font-bold w-24 text-center text-xs uppercase tracking-wider">Charge</th>
                            <th class="px-6 py-4 font-bold w-32 text-center text-xs uppercase tracking-wider">Status</th>
                            <th class="px-6 py-4 font-bold w-32 text-center text-xs uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="myorders-table-body">
                        <tr>
                            <td colspan="9" class="px-6 py-12 text-center text-slate-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p class="font-bold">Loading recent orders...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('search-myorders-input').addEventListener('input', renderMyOrdersTable);
}

function fetchMyOrders() {
    const ordersRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'orders');
    
    onSnapshot(ordersRef, (snapshot) => {
        const fresh = [];
        snapshot.forEach(doc => fresh.push({ id: doc.id, ...doc.data() }));
        
        // Sort newest first
        fresh.sort((a, b) => {
            const dateA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAt.seconds * 1000 || 0)) : 0;
            const dateB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAt.seconds * 1000 || 0)) : 0;
            return dateB - dateA;
        });
        
        myOrdersCache = fresh;
        CacheManager.set('my_orders', fresh);
        renderMyOrdersTable();
    });
}

function renderMyOrdersTable() {
    const tableBody = document.getElementById('myorders-table-body');
    const searchInput = document.getElementById('search-myorders-input');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (myOrdersCache.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="px-6 py-12 text-center text-slate-500">
                    <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-2xl mx-auto mb-3 border border-slate-300 shadow-sm"><i class="fa-solid fa-box-open"></i></div>
                    <p class="font-bold text-slate-700">You haven't placed any orders yet.</p>
                </td>
            </tr>`;
        return;
    }

    let visibleCount = 0;

    myOrdersCache.forEach(order => {
        const serviceName = order.serviceName || 'Unknown Service';
        const link = order.link || '#';
        const shortId = order.id.substring(0,8).toUpperCase();
        
        if (serviceName.toLowerCase().includes(searchTerm) || link.toLowerCase().includes(searchTerm) || shortId.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            let dateStr = 'N/A';
            if (order.createdAt) {
                dateStr = order.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            // --- Dynamic Action Buttons Logic ---
            let actionButtonsHTML = '';
            
            // Check for Refill Availability
            if ((order.refill === true || order.refillAvailable === true) && !order.refillRequested) {
                actionButtonsHTML += `
                    <button onclick="window.requestOrderRefill('${order.id}')" class="bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 border border-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm w-full mb-1 flex items-center justify-center gap-1 cursor-pointer">
                        <i class="fa-solid fa-rotate"></i> Refill
                    </button>
                `;
            } else if (order.refillRequested) {
                actionButtonsHTML += `
                    <button disabled class="bg-slate-100 text-slate-400 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold w-full mb-1 flex items-center justify-center gap-1 cursor-not-allowed">
                        <i class="fa-solid fa-rotate"></i> Refilling...
                    </button>
                `;
            }

            // Check for Cancel Availability
            if ((order.cancel === true || order.cancelAvailable === true) && !order.cancelRequested) {
                actionButtonsHTML += `
                    <button onclick="window.requestOrderCancel('${order.id}')" class="bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900 border border-red-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm w-full flex items-center justify-center gap-1 cursor-pointer">
                        <i class="fa-solid fa-ban"></i> Cancel
                    </button>
                `;
            } else if (order.cancelRequested) {
                actionButtonsHTML += `
                    <button disabled class="bg-slate-100 text-slate-400 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold w-full flex items-center justify-center gap-1 cursor-not-allowed">
                        <i class="fa-solid fa-ban"></i> Canceling...
                    </button>
                `;
            }

            if (actionButtonsHTML === '') {
                actionButtonsHTML = '<span class="text-slate-400 text-xs font-bold">-</span>';
            }

            tableBody.innerHTML += `
                <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-mono text-slate-600 text-xs font-bold">${shortId}</td>
                    <td class="px-6 py-4 text-xs text-slate-600 font-medium">${dateStr}</td>
                    <td class="px-6 py-4 whitespace-normal">
                        <a href="${link}" target="_blank" class="text-sm text-brand-600 hover:text-brand-800 font-bold hover:underline truncate block max-w-[200px]" title="${link}">${link}</a>
                    </td>
                    <td class="px-6 py-4 text-center text-slate-600 font-mono font-medium">${order.startCount || '0'}</td>
                    <td class="px-6 py-4 text-center font-bold text-slate-900">${order.quantity || 0}</td>
                    <td class="px-6 py-4 whitespace-normal min-w-[250px] text-sm font-semibold text-slate-800 leading-tight">
                        ${serviceName}
                    </td>
                    <td class="px-6 py-4 text-center font-bold text-brand-600">${window.formatMoney(order.charge)}</td>
                    <td class="px-6 py-4 text-center">${getStatusBadge(order.status)}</td>
                    <td class="px-6 py-4 text-center align-middle">
                        <div class="flex flex-col items-center justify-center w-full max-w-[100px] mx-auto">
                            ${actionButtonsHTML}
                        </div>
                    </td>
                </tr>
            `;
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="px-6 py-12 text-center text-slate-500 font-medium">No matching orders found.</td></tr>`;
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'done') return `<span class="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Completed</span>`;
    if (s === 'processing' || s === 'in progress') return `<span class="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Processing</span>`;
    if (s === 'partial') return `<span class="px-3 py-1 bg-orange-50 text-orange-700 border border-orange-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Partial</span>`;
    if (s === 'canceled' || s === 'cancelled') return `<span class="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Canceled</span>`;
    if (s === 'cancel requested') return `<span class="px-3 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Canceling...</span>`;
    return `<span class="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Pending</span>`;
}

// --- Exposed Global Actions ---

window.requestOrderRefill = async (orderId) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to request a refill for this order?')) return;

    try {
        const order = myOrdersCache.find(o => o.id === orderId);
        if (!order) return;

        // 1. Create a Refill request document
        const refillRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'refills');
        await addDoc(refillRef, {
            orderId: orderId,
            serviceName: order.serviceName,
            link: order.link,
            upstreamServiceId: order.upstreamServiceId || null,
            status: 'Pending',
            createdAt: serverTimestamp()
        });

        // 2. Mark the order so the button changes to "Refilling..."
        const orderDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'orders', orderId);
        await updateDoc(orderDocRef, { refillRequested: true });

        showNotification("Refill requested successfully! You can track it in the Refill History tab.", "success");
    } catch (error) {
        console.error("Refill Request Error:", error);
        showNotification("Failed to submit refill request. Please try again.", "error");
    }
};

window.requestOrderCancel = async (orderId) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to request cancellation for this order? If it is already in progress, it may not be possible.')) return;

    try {
        // Mark the order as Cancel Requested
        const orderDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'orders', orderId);
        await updateDoc(orderDocRef, { 
            cancelRequested: true,
            status: 'Cancel Requested'
        });

        showNotification("Cancellation requested. The system is attempting to halt your order.", "success");
    } catch (error) {
        console.error("Cancel Request Error:", error);
        showNotification("Failed to submit cancellation request.", "error");
    }
};

function showNotification(message, type) {
    const notif = document.getElementById('myorders-notification');
    if (!notif) return;
    
    notif.innerText = message;
    notif.className = "mb-4 text-sm px-4 py-3 rounded-xl font-semibold shadow-sm transition-all block";
    
    if (type === 'success') {
        notif.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-200');
    } else {
        notif.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    }

    setTimeout(() => {
        notif.classList.add('hidden');
    }, 5000);
}