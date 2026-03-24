import { 
    getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let myOrdersCache = [];

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('myorders-table-body')) {
        fetchMyOrders();
    }
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'myorders') return;
    renderMyOrdersUI();
    if (currentUser) fetchMyOrders();
});

function renderMyOrdersUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">My Orders</h2>
                <p class="text-sm text-gray-500">Monitor your active and recent campaigns.</p>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
                <div class="flex gap-2 w-full sm:w-auto relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="search-myorders-input" placeholder="Search orders by link or ID..." class="w-full sm:w-80 pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white shadow-sm">
                </div>
                <button class="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl text-gray-600 transition-colors shadow-sm font-semibold text-sm flex items-center gap-2">
                    <i class="fa-solid fa-filter text-brand-500"></i> Filter
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap min-w-[1000px]">
                    <thead class="bg-white text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-16">ID</th>
                            <th class="px-6 py-4 font-semibold w-32">Date</th>
                            <th class="px-6 py-4 font-semibold max-w-[200px]">Link</th>
                            <th class="px-6 py-4 font-semibold w-24 text-center">Start Count</th>
                            <th class="px-6 py-4 font-semibold w-24 text-center">Quantity</th>
                            <th class="px-6 py-4 font-semibold">Service</th>
                            <th class="px-6 py-4 font-semibold w-24 text-center">Charge</th>
                            <th class="px-6 py-4 font-semibold w-32 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody id="myorders-table-body">
                        <tr>
                            <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading recent orders...</p>
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
        myOrdersCache = [];
        snapshot.forEach(doc => myOrdersCache.push({ id: doc.id, ...doc.data() }));
        
        // Sort newest first
        myOrdersCache.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });
        
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
                <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                    <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 text-2xl mx-auto mb-3 border border-gray-100"><i class="fa-solid fa-box-open"></i></div>
                    <p>You haven't placed any orders yet.</p>
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

            tableBody.innerHTML += `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-4 font-mono text-gray-500 text-xs">${shortId}</td>
                    <td class="px-6 py-4 text-xs text-gray-500">${dateStr}</td>
                    <td class="px-6 py-4 whitespace-normal">
                        <a href="${link}" target="_blank" class="text-sm text-brand-600 hover:text-brand-800 font-medium hover:underline truncate block max-w-[200px]" title="${link}">${link}</a>
                    </td>
                    <td class="px-6 py-4 text-center text-gray-500 font-mono">${order.startCount || '0'}</td>
                    <td class="px-6 py-4 text-center font-bold text-gray-800">${order.quantity || 0}</td>
                    <td class="px-6 py-4 whitespace-normal min-w-[250px] text-sm font-semibold text-gray-700 leading-tight">
                        ${serviceName}
                    </td>
                    <td class="px-6 py-4 text-center font-semibold text-brand-600">Rs ${Number(order.charge || 0).toFixed(4)}</td>
                    <td class="px-6 py-4 text-center">${getStatusBadge(order.status)}</td>
                </tr>
            `;
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-gray-500">No matching orders found.</td></tr>`;
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'done') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Completed</span>`;
    if (s === 'processing' || s === 'in progress') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Processing</span>`;
    if (s === 'partial') return `<span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Partial</span>`;
    if (s === 'canceled' || s === 'cancelled') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Canceled</span>`;
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Pending</span>`;
}