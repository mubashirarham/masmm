import { 
    getFirestore, collectionGroup, onSnapshot, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allRefills = [];
let currentManagingRefill = null;
let currentPage = 1;
const rowsPerPage = 50;

window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'refills') return;
    renderRefillsUI();
    fetchAllRefills();
});

function renderRefillsUI() {
    const contentArea = document.getElementById('admin-content');
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Refill Management</h2>
                <p class="text-sm text-gray-500">Review and process order refill requests from users.</p>
            </div>
            <div class="w-full sm:w-auto">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-refills" placeholder="Search by Order ID, Refill ID, or User ID..." class="w-full sm:w-80 pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">Refill ID</th>
                            <th class="px-6 py-4 font-semibold w-24">User ID</th>
                            <th class="px-6 py-4 font-semibold w-24">Order ID</th>
                            <th class="px-6 py-4 font-semibold max-w-[200px]">Service & Link</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Date</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-refills-table-body">
                        <tr>
                            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading refill requests...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="admin-refills-pagination-container"></div>
        </div>

        <!-- Manage Refill Modal -->
        <div id="manage-refill-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="manage-refill-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Update Refill Status</h3>
                    <button id="close-refill-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <div class="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Refill ID:</span>
                        <span id="modal-refill-id" class="font-mono text-gray-800 font-bold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">User ID:</span>
                        <span id="modal-refill-userid" class="font-mono text-gray-800 font-semibold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Original Order ID:</span>
                        <span id="modal-refill-orderid" class="font-mono text-brand-600 font-bold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">API Provider ID:</span>
                        <span id="modal-refill-upstreamid" class="font-mono text-gray-800 font-semibold">---</span>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">New Status</label>
                        <select id="modal-refill-status" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                    <div id="modal-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold mb-2"></div>
                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-refill-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="button" id="save-refill-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm">
                            <span>Save Status</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const searchInput = document.getElementById('admin-search-refills');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderRefillsTable();
        });
    }

    const modal = document.getElementById('manage-refill-modal');
    const closeBtn = document.getElementById('close-refill-modal-btn');
    const content = document.getElementById('manage-refill-content');
    const cancelBtn = document.getElementById('cancel-refill-btn');
    const saveBtn = document.getElementById('save-refill-btn');

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.getElementById('modal-notification').classList.add('hidden');
        }, 150);
        currentManagingRefill = null;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    saveBtn.addEventListener('click', handleStatusUpdate);
}

function fetchAllRefills() {
    const refillsQuery = collectionGroup(db, 'refills');
    onSnapshot(refillsQuery, (snapshot) => {
        allRefills = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const pathSegments = docSnap.ref.path.split('/');
            const userId = pathSegments.length >= 4 ? pathSegments[3] : 'Unknown';

            allRefills.push({ id: docSnap.id, userId: userId, ...data });
        });

        allRefills.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        renderRefillsTable();
    }, (error) => {
        console.error("Error fetching global refills: ", error);
        const tableBody = document.getElementById('admin-refills-table-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Failed to load refills database.</td></tr>`;
    });
}

function renderRefillsTable() {
    const tableBody = document.getElementById('admin-refills-table-body');
    const searchInput = document.getElementById('admin-search-refills');
    const paginationContainer = document.getElementById('admin-refills-pagination-container');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allRefills.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No refill requests found across the platform.</td></tr>`;
        return;
    }

    const filtered = allRefills.filter(refill => {
        const serviceName = refill.serviceName || '';
        const link = refill.link || '';
        return serviceName.toLowerCase().includes(searchTerm) || 
               link.toLowerCase().includes(searchTerm) || 
               refill.id.toLowerCase().includes(searchTerm) ||
               (refill.orderId || '').toLowerCase().includes(searchTerm) ||
               refill.userId.toLowerCase().includes(searchTerm);
    });

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let visibleCount = 0;
    paginated.forEach(refill => {
        visibleCount++;
        const displayRefillId = refill.id.substring(0, 8).toUpperCase();
        const displayOrderId = (refill.orderId || 'Unknown').substring(0, 8).toUpperCase();
        const displayUserId = refill.userId.substring(0, 8);
        const serviceName = refill.serviceName || 'Unknown Service';
        const link = refill.link || 'N/A';
        const status = refill.status || 'Pending';
        
        let dateStr = 'N/A';
        if (refill.createdAt) {
            dateStr = refill.createdAt.toDate().toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }

        const row = document.createElement('tr');
        row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
        
        row.innerHTML = `
            <td class="px-6 py-4 font-mono text-xs text-gray-500">${displayRefillId}</td>
            <td class="px-6 py-4 font-mono text-xs text-brand-600" title="${refill.userId}">${displayUserId}...</td>
            <td class="px-6 py-4 font-mono text-xs font-bold text-gray-700" title="${refill.orderId}">${displayOrderId}</td>
            <td class="px-6 py-4 whitespace-normal min-w-[200px]">
                <p class="font-semibold text-gray-800 text-sm leading-tight mb-1">${serviceName}</p>
                <a href="${link}" target="_blank" class="text-xs text-blue-500 hover:underline truncate block max-w-[200px]" title="${link}">${link}</a>
            </td>
            <td class="px-6 py-4 text-center">${getStatusBadge(status)}</td>
            <td class="px-6 py-4 text-center text-xs text-gray-500">${dateStr}</td>
            <td class="px-6 py-4 text-center">
                <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded transition-colors text-xs font-bold manage-btn shadow-sm">
                    Manage
                </button>
            </td>
        `;

        row.querySelector('.manage-btn').addEventListener('click', () => openRefillModal(refill));
        tableBody.appendChild(row);
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No matching refills found.</td></tr>`;
    }

    if(paginationContainer) {
        renderPagination(filtered.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderRefillsTable();
        }, paginationContainer);
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'done') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold tracking-wider">Completed</span>`;
    if (s === 'processing' || s === 'in progress') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold tracking-wider">In Progress</span>`;
    if (s === 'rejected' || s === 'failed') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold tracking-wider">Rejected</span>`;
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold tracking-wider">Pending</span>`;
}

function openRefillModal(refill) {
    currentManagingRefill = refill;
    document.getElementById('modal-refill-id').innerText = refill.id.substring(0, 12) + '...';
    document.getElementById('modal-refill-userid').innerText = refill.userId;
    document.getElementById('modal-refill-orderid').innerText = refill.orderId || 'Unknown';
    document.getElementById('modal-refill-upstreamid').innerText = refill.upstreamServiceId || 'N/A';

    const statusSelect = document.getElementById('modal-refill-status');
    const validStatuses = Array.from(statusSelect.options).map(o => o.value);
    statusSelect.value = validStatuses.includes(refill.status) ? refill.status : 'Pending';
    
    document.getElementById('modal-notification').classList.add('hidden');

    const modal = document.getElementById('manage-refill-modal');
    const content = document.getElementById('manage-refill-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

async function handleStatusUpdate() {
    if (!currentManagingRefill) return;

    const newStatus = document.getElementById('modal-refill-status').value;
    const btn = document.getElementById('save-refill-btn');

    if (newStatus === currentManagingRefill.status) {
        showNotification("No changes detected.", "warning");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        const refillRef = doc(db, 'artifacts', appId, 'users', currentManagingRefill.userId, 'refills', currentManagingRefill.id);
        await updateDoc(refillRef, {
            status: newStatus,
            updatedAt: serverTimestamp()
        });

        if (newStatus === 'Rejected' || newStatus === 'Completed') {
            const orderRef = doc(db, 'artifacts', appId, 'users', currentManagingRefill.userId, 'orders', currentManagingRefill.orderId);
            await updateDoc(orderRef, { refillRequested: false }).catch(()=>console.log("Could not reset order refill status"));
        }

        showNotification("Refill status updated successfully!", "success");
        setTimeout(() => { document.getElementById('close-refill-modal-btn').click(); }, 1000);

    } catch (error) {
        console.error("Failed to update refill status:", error);
        showNotification("Failed to update status. Check permissions.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Save Status</span>';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('modal-notification');
    notif.innerText = message;
    notif.className = "text-sm px-3 py-2 rounded-lg text-center font-semibold mb-4 block"; 
    
    if (type === 'success') notif.classList.add('bg-green-100', 'text-green-700');
    else if (type === 'error') notif.classList.add('bg-red-100', 'text-red-700');
    else notif.classList.add('bg-yellow-100', 'text-yellow-700');
}
