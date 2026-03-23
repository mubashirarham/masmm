import { 
    getFirestore, 
    collectionGroup, 
    onSnapshot,
    doc,
    updateDoc,
    increment,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allDeposits = [];
let currentManagingDeposit = null;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'deposits') return;

    renderDepositsUI();
    fetchAllDeposits();
});

function renderDepositsUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Deposits View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Deposit Management</h2>
                <p class="text-sm text-gray-500">Review and approve manual fund additions from users.</p>
            </div>
            <div class="w-full sm:w-auto">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-deposits" placeholder="Search by TID or User ID..." class="w-full sm:w-80 pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <!-- Deposits Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-32">Transaction ID (TID)</th>
                            <th class="px-6 py-4 font-semibold w-24">User ID</th>
                            <th class="px-6 py-4 font-semibold w-32">Method</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Amount</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Date</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-deposits-table-body">
                        <tr>
                            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading deposits...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Manage Deposit Modal -->
        <div id="manage-deposit-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="manage-deposit-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Review Deposit</h3>
                    <button id="close-deposit-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <div class="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">TID:</span>
                        <span id="modal-deposit-tid" class="font-mono text-gray-800 font-bold text-base">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">User ID:</span>
                        <span id="modal-deposit-userid" class="font-mono text-gray-800 font-semibold">---</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Method:</span>
                        <span id="modal-deposit-method" class="text-gray-800 font-semibold">---</span>
                    </div>
                    <div class="flex justify-between text-sm items-center border-t border-gray-200 pt-2 mt-2">
                        <span class="text-gray-500">Amount:</span>
                        <span id="modal-deposit-amount" class="text-brand-600 font-bold text-lg">---</span>
                    </div>
                </div>

                <div class="space-y-4">
                    <!-- Inline Notification Area -->
                    <div id="modal-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold mb-2"></div>

                    <p class="text-sm text-gray-600 mb-4 text-center">Approve this deposit to automatically add funds to the user's balance, or reject it if invalid.</p>

                    <div class="flex gap-3" id="deposit-action-buttons">
                        <button type="button" id="reject-deposit-btn" class="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                            <i class="fa-solid fa-xmark"></i> Reject
                        </button>
                        <button type="button" id="approve-deposit-btn" class="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                            <i class="fa-solid fa-check"></i> Approve & Add
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-deposits');
    if (searchInput) {
        searchInput.addEventListener('input', renderDepositsTable);
    }

    // Attach Modal Close Listeners
    const modal = document.getElementById('manage-deposit-modal');
    const closeBtn = document.getElementById('close-deposit-modal-btn');
    const content = document.getElementById('manage-deposit-content');
    
    // Attach Action Listeners
    const approveBtn = document.getElementById('approve-deposit-btn');
    const rejectBtn = document.getElementById('reject-deposit-btn');

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.getElementById('modal-notification').classList.add('hidden');
        }, 150);
        currentManagingDeposit = null;
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    approveBtn.addEventListener('click', () => handleDepositAction('Completed'));
    rejectBtn.addEventListener('click', () => handleDepositAction('Rejected'));
}

function fetchAllDeposits() {
    // collectionGroup query to get all user transactions
    const depositsQuery = collectionGroup(db, 'transactions');
    
    onSnapshot(depositsQuery, (snapshot) => {
        allDeposits = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Only process deposits, not order deductions if you share the collection
            if (data.type !== 'Deposit') return; 

            // Extract the userId from the document reference path
            // Path structure: artifacts/{appId}/users/{userId}/transactions/{txId}
            const pathSegments = docSnap.ref.path.split('/');
            const userId = pathSegments.length >= 4 ? pathSegments[3] : 'Unknown';

            allDeposits.push({
                id: docSnap.id,
                userId: userId,
                ...data
            });
        });

        // Sort by date descending in memory (Newest first)
        allDeposits.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA; // Descending
        });

        renderDepositsTable();
    }, (error) => {
        console.error("Error fetching global deposits: ", error);
        const tableBody = document.getElementById('admin-deposits-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Failed to load deposits database.</td></tr>`;
        }
    });
}

function renderDepositsTable() {
    const tableBody = document.getElementById('admin-deposits-table-body');
    const searchInput = document.getElementById('admin-search-deposits');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allDeposits.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No deposits found across the platform.</td></tr>`;
        return;
    }

    let visibleCount = 0;

    allDeposits.forEach(deposit => {
        const displayUserId = deposit.userId.substring(0, 8);
        const tid = deposit.tid || 'N/A';
        const method = deposit.method || 'Unknown';
        const status = deposit.status || 'Pending';
        const amount = Number(deposit.amount || 0).toFixed(2);
        
        // Search Filter Logic
        const matchesSearch = tid.toLowerCase().includes(searchTerm) || 
                              deposit.userId.toLowerCase().includes(searchTerm) ||
                              status.toLowerCase().includes(searchTerm);

        if (matchesSearch) {
            visibleCount++;
            
            // Format Date safely
            let dateStr = 'N/A';
            if (deposit.createdAt) {
                dateStr = deposit.createdAt.toDate().toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-6 py-4 font-mono font-bold text-gray-800">${tid}</td>
                <td class="px-6 py-4 font-mono text-xs text-brand-600" title="${deposit.userId}">${displayUserId}...</td>
                <td class="px-6 py-4 text-gray-700">${method}</td>
                <td class="px-6 py-4 text-center font-bold text-gray-800">Rs ${amount}</td>
                <td class="px-6 py-4 text-center">${getStatusBadge(status)}</td>
                <td class="px-6 py-4 text-center text-xs text-gray-500">${dateStr}</td>
                <td class="px-6 py-4 text-center">
                    <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded transition-colors text-xs font-bold manage-btn shadow-sm">
                        Review
                    </button>
                </td>
            `;

            row.querySelector('.manage-btn').addEventListener('click', () => openDepositModal(deposit));
            tableBody.appendChild(row);
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No matching deposits found.</td></tr>`;
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'approved') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold tracking-wider">Completed</span>`;
    if (s === 'rejected' || s === 'failed') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold tracking-wider">Rejected</span>`;
    
    // Default fallback to pending
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold tracking-wider animate-pulse">Pending</span>`;
}

function openDepositModal(deposit) {
    currentManagingDeposit = deposit;
    
    // Set static UI elements
    document.getElementById('modal-deposit-tid').innerText = deposit.tid || 'N/A';
    document.getElementById('modal-deposit-userid').innerText = deposit.userId;
    document.getElementById('modal-deposit-method').innerText = deposit.method || 'Unknown';
    document.getElementById('modal-deposit-amount').innerText = `Rs ${Number(deposit.amount || 0).toFixed(2)}`;
    
    // Hide notifications
    document.getElementById('modal-notification').classList.add('hidden');

    // Toggle button visibility based on status
    const actionButtons = document.getElementById('deposit-action-buttons');
    if ((deposit.status || 'Pending').toLowerCase() !== 'pending') {
        actionButtons.style.display = 'none';
        showNotification(`This deposit has already been marked as ${deposit.status}.`, 'warning');
    } else {
        actionButtons.style.display = 'flex';
    }

    // Open Modal visually
    const modal = document.getElementById('manage-deposit-modal');
    const content = document.getElementById('manage-deposit-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

async function handleDepositAction(newStatus) {
    if (!currentManagingDeposit) return;

    const actionButtons = document.getElementById('deposit-action-buttons');
    actionButtons.style.display = 'none'; // Hide buttons while processing

    try {
        const txRef = doc(db, 'artifacts', appId, 'users', currentManagingDeposit.userId, 'transactions', currentManagingDeposit.id);
        
        // 1. Update the transaction status
        await updateDoc(txRef, { status: newStatus });

        // 2. If Approved (Completed), safely add funds to the user's balance
        if (newStatus === 'Completed') {
            const amountToAdd = parseFloat(currentManagingDeposit.amount || 0);
            
            if (amountToAdd > 0) {
                const statsRef = doc(db, 'artifacts', appId, 'users', currentManagingDeposit.userId, 'account', 'stats');
                
                // Ensure stats doc exists before incrementing
                const statsSnap = await getDoc(statsRef);
                if (!statsSnap.exists()) {
                    await setDoc(statsRef, { balance: amountToAdd, totalSpent: 0, totalOrders: 0 }, { merge: true });
                } else {
                    await updateDoc(statsRef, { balance: increment(amountToAdd) });
                }
            }
        }

        currentManagingDeposit.status = newStatus;
        showNotification(`Deposit successfully ${newStatus === 'Completed' ? 'approved and funds added!' : 'rejected.'}`, newStatus === 'Completed' ? 'success' : 'error');
        
        // Auto close after 1.5 seconds on success
        setTimeout(() => {
            document.getElementById('close-deposit-modal-btn').click();
        }, 1500);

    } catch (error) {
        console.error("Failed to process deposit:", error);
        showNotification("Failed to process deposit. Check permissions.", "error");
        actionButtons.style.display = 'flex'; // Restore buttons on failure
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