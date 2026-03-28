import { 
    getFirestore, 
    collectionGroup, 
    onSnapshot,
    doc,
    updateDoc,
    runTransaction,
    increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allOrders = [];
let currentManagingOrder = null;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'orders') return;

    renderOrdersUI();
    fetchAllOrders();
});

function renderOrdersUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Orders View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Order Management</h2>
                <p class="text-sm text-gray-500">Monitor and process all user orders across the platform.</p>
            </div>
            <div class="w-full sm:w-auto">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-orders" placeholder="Search by link, service, or user ID..." class="w-full sm:w-80 pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <!-- Orders Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">Order ID</th>
                            <th class="px-6 py-4 font-semibold w-24">User ID</th>
                            <th class="px-6 py-4 font-semibold max-w-[200px]">Service & Link</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Qty / Charge</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Date</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-orders-table-body">
                        <tr>
                            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading global orders...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Manage Order Modal -->
        <div id="manage-order-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="manage-order-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Update Order Status</h3>
                    <button id="close-order-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <div class="mb-6 space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Order ID:</span>
                        <span id="modal-order-id" class="font-mono text-gray-800 font-semibold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">User ID:</span>
                        <span id="modal-order-userid" class="font-mono text-gray-800 font-semibold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Service:</span>
                        <span id="modal-order-service" class="text-gray-800 font-semibold truncate max-w-[200px]">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Link:</span>
                        <a href="#" target="_blank" id="modal-order-link" class="text-brand-600 hover:underline truncate max-w-[200px]">---</a>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">New Status</label>
                        <select id="modal-order-status" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                            <option value="Pending">Pending</option>
                            <option value="Processing">Processing</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Partial">Partial</option>
                            <option value="Canceled">Canceled</option>
                        </select>
                    </div>
                    
                    <!-- Inline Notification Area -->
                    <div id="modal-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold"></div>

                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-order-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="button" id="save-order-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
                            <span>Update Order</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-orders');
    if (searchInput) {
        searchInput.addEventListener('input', renderOrdersTable);
    }

    // Attach Modal Close Listeners
    const modal = document.getElementById('manage-order-modal');
    const closeBtn = document.getElementById('close-order-modal-btn');
    const cancelBtn = document.getElementById('cancel-order-btn');
    const content = document.getElementById('manage-order-content');
    const saveBtn = document.getElementById('save-order-btn');

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.getElementById('modal-notification').classList.add('hidden');
        }, 150);
        currentManagingOrder = null;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Attach Save Listener
    saveBtn.addEventListener('click', handleStatusUpdate);
}

function fetchAllOrders() {
    // We use a collectionGroup query to get ALL orders across ALL users.
    // We fetch everything and sort/filter in memory to avoid complex Firebase index requirements.
    const ordersQuery = collectionGroup(db, 'orders');
    
    onSnapshot(ordersQuery, (snapshot) => {
        allOrders = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Extract the userId from the document reference path
            // Path structure: artifacts/{appId}/users/{userId}/orders/{orderId}
            const pathSegments = docSnap.ref.path.split('/');
            const userId = pathSegments.length >= 4 ? pathSegments[3] : 'Unknown';

            allOrders.push({
                id: docSnap.id,
                userId: userId,
                ...data
            });
        });

        // Sort by date descending in memory (Newest first)
        allOrders.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA; // Descending
        });

        renderOrdersTable();
    }, (error) => {
        console.error("Error fetching global orders: ", error);
        const tableBody = document.getElementById('admin-orders-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Failed to load orders database.</td></tr>`;
        }
    });
}

function renderOrdersTable() {
    const tableBody = document.getElementById('admin-orders-table-body');
    const searchInput = document.getElementById('admin-search-orders');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allOrders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No orders found across the platform.</td></tr>`;
        return;
    }

    let visibleCount = 0;

    allOrders.forEach(order => {
        const displayOrderId = order.id.substring(0, 8).toUpperCase();
        const displayUserId = order.userId.substring(0, 8);
        const serviceName = order.serviceName || 'Unknown Service';
        const link = order.link || 'N/A';
        const status = order.status || 'Pending';
        
        // Search Filter Logic
        const matchesSearch = serviceName.toLowerCase().includes(searchTerm) || 
                              link.toLowerCase().includes(searchTerm) || 
                              order.id.toLowerCase().includes(searchTerm) ||
                              order.userId.toLowerCase().includes(searchTerm);

        if (matchesSearch) {
            visibleCount++;
            
            // Format Date safely
            let dateStr = 'N/A';
            if (order.createdAt) {
                dateStr = order.createdAt.toDate().toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-6 py-4 font-mono text-xs text-gray-500">${displayOrderId}</td>
                <td class="px-6 py-4 font-mono text-xs text-brand-600" title="${order.userId}">${displayUserId}...</td>
                <td class="px-6 py-4 whitespace-normal min-w-[200px]">
                    <p class="font-semibold text-gray-800 text-sm leading-tight mb-1">${serviceName}</p>
                    <a href="${link}" target="_blank" class="text-xs text-blue-500 hover:underline truncate block max-w-[200px]" title="${link}">${link}</a>
                </td>
                <td class="px-6 py-4 text-center">
                    <p class="font-bold text-gray-800">${order.quantity || 0}</p>
                    <p class="text-xs text-gray-500">Rs ${Number(order.charge || 0).toFixed(4)}</p>
                </td>
                <td class="px-6 py-4 text-center">${getStatusBadge(status)}</td>
                <td class="px-6 py-4 text-center text-xs text-gray-500">${dateStr}</td>
                <td class="px-6 py-4 text-center">
                    <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded transition-colors text-xs font-bold manage-btn shadow-sm">
                        Edit
                    </button>
                </td>
            `;

            row.querySelector('.manage-btn').addEventListener('click', () => openOrderModal(order));
            tableBody.appendChild(row);
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No matching orders found.</td></tr>`;
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'done') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold tracking-wider">Completed</span>`;
    if (s === 'processing' || s === 'in progress') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold tracking-wider">Processing</span>`;
    if (s === 'partial') return `<span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold tracking-wider">Partial</span>`;
    if (s === 'canceled' || s === 'cancelled') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold tracking-wider">Canceled</span>`;
    
    // Default fallback to pending
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold tracking-wider">Pending</span>`;
}

function openOrderModal(order) {
    currentManagingOrder = order;
    
    // Set static UI elements
    document.getElementById('modal-order-id').innerText = order.id.substring(0, 12) + '...';
    document.getElementById('modal-order-userid').innerText = order.userId;
    document.getElementById('modal-order-service').innerText = order.serviceName || 'Unknown';
    
    const linkEl = document.getElementById('modal-order-link');
    linkEl.innerText = order.link || 'N/A';
    linkEl.href = order.link || '#';

    // Set Select Value
    const statusSelect = document.getElementById('modal-order-status');
    const validStatuses = Array.from(statusSelect.options).map(o => o.value);
    statusSelect.value = validStatuses.includes(order.status) ? order.status : 'Pending';
    
    // Hide notifications
    document.getElementById('modal-notification').classList.add('hidden');

    // Open Modal visually
    const modal = document.getElementById('manage-order-modal');
    const content = document.getElementById('manage-order-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

async function handleStatusUpdate() {
    if (!currentManagingOrder) return;

    const newStatus = document.getElementById('modal-order-status').value;
    const btn = document.getElementById('save-order-btn');

    // Prevent unnecessary writes
    if (newStatus === currentManagingOrder.status) {
        showNotification("No changes detected.", "warning");
        return;
    }

    if(newStatus === 'Canceled' && !confirm("WARNING: Changing status to 'Canceled' will intercept this order and AUTOMATICALLY REFUND the exact charge amount to the user's balance. Proceed?")) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Ledger...';

    try {
        const orderRef = doc(db, 'artifacts', appId, 'users', currentManagingOrder.userId, 'orders', currentManagingOrder.id);
        
        if (newStatus === 'Canceled' && currentManagingOrder.status !== 'Canceled') {
            // Force Cancel & Native Ledger Refund Setup
            await runTransaction(db, async (t) => {
                const orderSnap = await t.get(orderRef);
                if (orderSnap.exists() && orderSnap.data().status === 'Canceled') {
                    throw new Error("Order was already refunded and canceled recently.");
                }
                
                const statsRef = doc(db, 'artifacts', appId, 'users', currentManagingOrder.userId, 'account', 'stats');
                const cost = Number(currentManagingOrder.charge || 0);

                t.update(orderRef, { status: 'Canceled' });
                if (cost > 0) {
                    t.update(statsRef, { balance: increment(cost) });
                }
            });
            showNotification(`Intercepted & Refunded Rs ${Number(currentManagingOrder.charge).toFixed(4)}`, "success");
        } else {
            // Standard non-financial status update
            await updateDoc(orderRef, { status: newStatus });
            showNotification("Order status updated successfully!", "success");
        }

        currentManagingOrder.status = newStatus;
        
        // Auto close after 1.5 second on success
        setTimeout(() => {
            document.getElementById('close-order-modal-btn').click();
        }, 1500);

    } catch (error) {
        console.error("Failed to update status/refund ledger:", error);
        showNotification(error.message || "Failed to process ledger update.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Update Order</span>';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('modal-notification');
    notif.innerText = message;
    notif.className = "text-sm px-3 py-2 rounded-lg text-center font-semibold mb-4 block"; // Reset base classes
    
    if (type === 'success') {
        notif.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        notif.classList.add('bg-red-100', 'text-red-700');
    } else {
        notif.classList.add('bg-yellow-100', 'text-yellow-700');
    }
}