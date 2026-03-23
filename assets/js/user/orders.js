import { 
    getFirestore, 
    collection, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Firebase Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
// Select elements safely using the parent view container
const ordersView = document.getElementById('view-orders');
const tableBody = ordersView.querySelector('tbody');
const searchInput = ordersView.querySelector('input[type="text"]');

// State Variables
let allOrders = [];

// ==========================================
// UI Helpers
// ==========================================
function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-bold uppercase tracking-wider">Completed</span>`;
    if (s === 'processing') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold uppercase tracking-wider">Processing</span>`;
    if (s === 'canceled' || s === 'cancelled') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-bold uppercase tracking-wider">Canceled</span>`;
    
    // Default fallback to pending
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold uppercase tracking-wider">Pending</span>`;
}

// ==========================================
// Core Data Fetching & Rendering
// ==========================================

onAuthStateChanged(auth, (user) => {
    if (!user) return; // Only fetch if authenticated

    const userId = user.uid;
    
    // Listen to user's private orders collection
    const ordersRef = collection(db, 'artifacts', appId, 'users', userId, 'orders');
    
    onSnapshot(ordersRef, (snapshot) => {
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });

        // Sort orders by Date in descending order (Newest first) in memory
        allOrders.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        renderOrdersTable();
    }, (error) => {
        console.error("Error fetching orders: ", error);
    });
});

// Real-time Search Listener
if (searchInput) {
    searchInput.addEventListener('input', () => {
        renderOrdersTable();
    });
}

// Table Rendering Engine
function renderOrdersTable() {
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = ''; // Clear table

    // Empty State Check
    if (allOrders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4 text-2xl text-gray-400">
                        <i class="fa-solid fa-box-open"></i>
                    </div>
                    <p>No orders found yet.</p>
                </td>
            </tr>`;
        return;
    }

    let visibleOrderCount = 0;

    // Filter and Render
    allOrders.forEach(order => {
        const displayId = order.serviceId || 'N/A';
        const serviceName = order.serviceName || 'Unknown Service';
        const link = order.link || '';
        const status = order.status || 'Pending';

        // Search match condition
        const matchesSearch = serviceName.toLowerCase().includes(searchTerm) || 
                              link.toLowerCase().includes(searchTerm) || 
                              displayId.toString().includes(searchTerm) ||
                              status.toLowerCase().includes(searchTerm);
        
        if (matchesSearch) {
            visibleOrderCount++;
            
            // Format Date
            let dateStr = 'Just now';
            if (order.createdAt) {
                dateStr = order.createdAt.toDate().toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            }

            // Format Charge
            const rate = Number(order.charge || 0).toFixed(4);

            const row = document.createElement('tr');
            row.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-6 py-4 font-semibold text-gray-700 whitespace-nowrap">
                    ${displayId}
                </td>
                <td class="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">
                    ${dateStr}
                </td>
                <td class="px-6 py-4 text-gray-800 whitespace-normal min-w-[250px] leading-relaxed">
                    ${serviceName}
                    <div class="text-xs text-gray-400 mt-1">Qty: ${order.quantity || 0}</div>
                </td>
                <td class="px-6 py-4 text-blue-600 truncate max-w-[200px]">
                    <a href="${link}" target="_blank" class="hover:underline" title="${link}">${link}</a>
                </td>
                <td class="px-6 py-4 text-gray-800 font-medium whitespace-nowrap">
                    Rs ${rate}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${getStatusBadge(status)}
                </td>
            `;

            tableBody.appendChild(row);
        }
    });

    // Check if search yielded no results
    if (visibleOrderCount === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <i class="fa-solid fa-magnifying-glass text-3xl mb-3 text-gray-300"></i>
                    <p class="font-medium">No matching orders found.</p>
                </td>
            </tr>`;
    }
}