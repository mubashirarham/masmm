import { 
    getFirestore, 
    collection, 
    onSnapshot,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allUsers = [];
let currentManagingUserId = null;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'users') return;

    renderUsersUI();
    fetchUsers();
});

function renderUsersUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Users View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">User Management</h2>
                <p class="text-sm text-gray-500">View and manage client accounts, balances, and roles.</p>
            </div>
            <div class="w-full sm:w-auto">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-users" placeholder="Search by email or ID..." class="w-full sm:w-64 pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <!-- Users Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">User ID</th>
                            <th class="px-6 py-4 font-semibold">Email / User</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Role</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-users-table-body">
                        <tr>
                            <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading users database...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Manage User Modal -->
        <div id="manage-user-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="manage-user-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Manage User Account</h3>
                    <button id="close-user-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <div class="mb-6">
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Target Account</p>
                    <p id="modal-user-email" class="text-gray-900 font-bold truncate">user@example.com</p>
                    <p id="modal-user-id" class="text-xs text-gray-400 font-mono mt-1">UID: ---</p>
                </div>

                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <p class="text-xs text-gray-500 font-semibold mb-1">Current Balance</p>
                        <h4 id="modal-user-balance" class="text-lg font-bold text-brand-600"><i class="fa-solid fa-spinner fa-spin text-xs"></i></h4>
                    </div>
                    <div class="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <p class="text-xs text-gray-500 font-semibold mb-1">Total Spent</p>
                        <h4 id="modal-user-spent" class="text-lg font-bold text-gray-700"><i class="fa-solid fa-spinner fa-spin text-xs"></i></h4>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Adjust Balance (Add or Deduct)</label>
                        <div class="flex gap-2">
                            <input type="number" id="balance-adjustment-amount" placeholder="e.g. 500 or -500" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                            <button id="apply-balance-btn" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap">
                                Apply
                            </button>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">Use positive numbers to add funds, negative numbers to deduct.</p>
                    </div>
                </div>

                <div class="mt-6 pt-4 border-t border-gray-100 flex gap-2 justify-end">
                    <button id="toggle-api-ban-btn" data-action="block" class="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold transition-colors text-sm flex items-center gap-2 shadow-sm mr-auto">
                        <i class="fa-solid fa-ban"></i> Block API Access
                    </button>
                    <button id="close-user-modal-footer" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Close</button>
                </div>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-users');
    if (searchInput) {
        searchInput.addEventListener('input', renderUsersTable);
    }

    // Attach Modal Close Listeners
    const modal = document.getElementById('manage-user-modal');
    const closeBtn = document.getElementById('close-user-modal-btn');
    const closeFooterBtn = document.getElementById('close-user-modal-footer');
    const content = document.getElementById('manage-user-content');

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentManagingUserId = null;
    };

    closeBtn.addEventListener('click', closeModal);
    closeFooterBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Attach Balance Update Listener
    document.getElementById('apply-balance-btn').addEventListener('click', handleBalanceAdjustment);

    // Attach API Ban Listener
    document.getElementById('toggle-api-ban-btn').addEventListener('click', handleApiBanToggle);
}

function fetchUsers() {
    const usersRef = collection(db, 'artifacts', appId, 'users');
    
    onSnapshot(usersRef, (snapshot) => {
        allUsers = [];
        snapshot.forEach(doc => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });
        renderUsersTable();
    }, (error) => {
        console.error("Error fetching users: ", error);
        const tableBody = document.getElementById('admin-users-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load users.</td></tr>`;
        }
    });
}

function renderUsersTable() {
    const tableBody = document.getElementById('admin-users-table-body');
    const searchInput = document.getElementById('admin-search-users');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allUsers.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No users found in the database.</td></tr>`;
        return;
    }

    let visibleCount = 0;

    allUsers.forEach(user => {
        const email = user.email || 'No Email';
        const displayId = user.id.substring(0, 8);
        const role = user.role || 'user';
        const isVerified = user.isVerified !== false;

        if (email.toLowerCase().includes(searchTerm) || user.id.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            const roleBadge = role === 'admin' 
                ? `<span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold uppercase tracking-wider">Admin</span>`
                : `<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold uppercase tracking-wider">User</span>`;

            const statusBadge = isVerified 
                ? `<span class="px-2 py-1 text-green-600 text-xs font-semibold"><i class="fa-solid fa-check-circle mr-1"></i> Active</span>`
                : `<span class="px-2 py-1 text-red-600 text-xs font-semibold"><i class="fa-solid fa-xmark-circle mr-1"></i> Banned</span>`;

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-6 py-4 font-mono text-xs text-gray-500">${displayId}</td>
                <td class="px-6 py-4 font-medium text-gray-800">${email}</td>
                <td class="px-6 py-4 text-center">${roleBadge}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 flex justify-center gap-2">
                    <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded transition-colors text-xs font-bold manage-btn shadow-sm">
                        Manage
                    </button>
                    <button class="text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded transition-colors text-xs font-bold shadow-sm flex items-center gap-1" onclick="window.impersonateUser('${user.id}')">
                        <i class="fa-solid fa-right-to-bracket"></i> Login
                    </button>
                </td>
            `;

            row.querySelector('.manage-btn').addEventListener('click', () => openUserModal(user));
            tableBody.appendChild(row);
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No matching users found.</td></tr>`;
    }
}

async function openUserModal(user) {
    currentManagingUserId = user.id;
    
    // Set static UI elements
    document.getElementById('modal-user-email').innerText = user.email || 'Unknown Email';
    document.getElementById('modal-user-id').innerText = `UID: ${user.id}`;
    document.getElementById('balance-adjustment-amount').value = '';
    
    // Show Loading state for stats
    document.getElementById('modal-user-balance').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
    document.getElementById('modal-user-spent').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';

    // Open Modal visually
    const modal = document.getElementById('manage-user-modal');
    const content = document.getElementById('manage-user-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

    // Fetch realtime stats & API Firewall State
    try {
        const statsRef = doc(db, 'artifacts', appId, 'users', user.id, 'account', 'stats');
        const apiRef = doc(db, 'artifacts', appId, 'users', user.id, 'api', 'key');
        
        // Parallel queries to minimize load time
        const [statsSnap, apiSnap] = await Promise.all([getDoc(statsRef), getDoc(apiRef)]);
        
        if (statsSnap.exists()) {
            const data = statsSnap.data();
            document.getElementById('modal-user-balance').innerText = `Rs ${Number(data.balance || 0).toFixed(4)}`;
            document.getElementById('modal-user-spent').innerText = `Rs ${Number(data.totalSpent || 0).toFixed(4)}`;
        } else {
            document.getElementById('modal-user-balance').innerText = `Rs 0.0000`;
            document.getElementById('modal-user-spent').innerText = `Rs 0.0000`;
            await setDoc(statsRef, { balance: 0, totalSpent: 0, totalOrders: 0 }, { merge: true });
        }

        // Setup API Firewall Toggle UI Context
        const apiBtn = document.getElementById('toggle-api-ban-btn');
        if (apiSnap.exists() && apiSnap.data().status === 'Suspended') {
            apiBtn.innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i> Unlock API';
            apiBtn.className = 'px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-bold transition-colors text-sm flex items-center mr-auto shadow-sm';
            apiBtn.dataset.action = 'unblock';
        } else {
            apiBtn.innerHTML = '<i class="fa-solid fa-ban mr-1"></i> Block API';
            apiBtn.className = 'px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold transition-colors text-sm flex items-center mr-auto shadow-sm';
            apiBtn.dataset.action = 'block';
        }

    } catch (error) {
        console.error("Failed to load user dependencies", error);
        document.getElementById('modal-user-balance').innerText = 'Error';
        document.getElementById('modal-user-spent').innerText = 'Error';
    }
}

async function handleBalanceAdjustment() {
    if (!currentManagingUserId) return;

    const amountInput = document.getElementById('balance-adjustment-amount');
    const btn = document.getElementById('apply-balance-btn');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount === 0) {
        alert("Please enter a valid amount to add or deduct.");
        return;
    }

    const confirmMsg = amount > 0 
        ? `Are you sure you want to ADD Rs ${amount} to this user's balance?`
        : `Are you sure you want to DEDUCT Rs ${Math.abs(amount)} from this user's balance?`;
        
    if (!confirm(confirmMsg)) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const auth = getAuth(window.firebaseApp);
        const token = await auth.currentUser.getIdToken();

        const response = await fetch('/.netlify/functions/adminapi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'adjust_balance',
                userId: currentManagingUserId,
                amount: amount
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to update balance');
        }

        // Refresh the modal view stats
        const statsRef = doc(db, 'artifacts', appId, 'users', currentManagingUserId, 'account', 'stats');
        const freshSnap = await getDoc(statsRef);
        if (freshSnap.exists()) {
            document.getElementById('modal-user-balance').innerText = `Rs ${Number(freshSnap.data().balance || 0).toFixed(4)}`;
        }

        amountInput.value = '';
        alert("Balance updated successfully via secure backend!");

    } catch (error) {
        console.error("Failed to update balance:", error);
        alert("An error occurred while updating the balance.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Apply';
    }
}

async function handleApiBanToggle(e) {
    if (!currentManagingUserId) return;
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const newStatus = action === 'block' ? 'Suspended' : 'Active';
    
    if(!confirm(`WARNING: Are you sure you want to ${action.toUpperCase()} Wholesale API access for this specific user?`)) return;
    
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Deploying Firewall...';

    try {
        const apiRef = doc(db, 'artifacts', appId, 'users', currentManagingUserId, 'api', 'key');
        await setDoc(apiRef, { status: newStatus }, { merge: true });
        
        // Soft refresh the modal
        const emailLabel = document.getElementById('modal-user-email').innerText;
        openUserModal({ id: currentManagingUserId, email: emailLabel });
        
    } catch(err) {
        console.error(err);
        alert("Failed to modify API firewall rules.");
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
}

// Impersonation feature attached globally to dispatch token request
window.impersonateUser = async (userId) => {
    if(!confirm("Launch a new tab logged in securely as this user WITHOUT their password?")) return;
    try {
        const auth = getAuth(window.firebaseApp);
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/.netlify/functions/adminapi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'impersonate_user', userId })
        });
        const result = await response.json();
        if(!response.ok || !result.success) throw new Error(result.error);
        
        // Spawns the authenticating tab
        window.open(`../user/index.html?impersonate_token=${result.token}`, '_blank');
    } catch (e) {
        alert("Impersonation failed: " + e.message);
    }
};