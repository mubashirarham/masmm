import { 
    getFirestore, 
    collection, 
    onSnapshot,
    query,
    where,
    getDocs,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'dashboard') return;

    renderDashboardUI();
    fetchRealtimeStats();
});

function renderDashboardUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Dashboard View
    contentArea.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">System Overview</h2>
                <p class="text-sm text-gray-500">Real-time statistics across the MAsmmpanel platform.</p>
            </div>
            <button onclick="location.reload()" class="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors">
                <i class="fa-solid fa-rotate-right mr-2"></i> Refresh Data
            </button>
        </div>

        <!-- Top Statistics Panel -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
            <!-- Stat Card 1 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-blue-500">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-users text-blue-500 mr-2"></i>Total Users</p>
                <h3 id="stat-total-users" class="text-2xl font-bold text-gray-900"><i class="fa-solid fa-spinner fa-spin text-sm text-gray-300"></i></h3>
            </div>
            
            <!-- Stat Card 2 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-orange-500">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-clock-rotate-left text-orange-500 mr-2"></i>Pending Orders</p>
                <h3 id="stat-pending-orders" class="text-2xl font-bold text-gray-900"><i class="fa-solid fa-spinner fa-spin text-sm text-gray-300"></i></h3>
            </div>

            <!-- Stat Card 3 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-purple-500">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-money-bill-transfer text-purple-500 mr-2"></i>Deposits</p>
                <h3 id="stat-pending-deposits" class="text-2xl font-bold text-gray-900"><i class="fa-solid fa-spinner fa-spin text-sm text-gray-300"></i></h3>
            </div>
            
            <!-- Stat Card 4 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-[#22c55e]">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-sack-dollar text-green-500 mr-2"></i>Total Revenue</p>
                <h3 id="stat-total-revenue" class="text-2xl font-bold text-gray-900"><i class="fa-solid fa-spinner fa-spin text-sm text-gray-300"></i></h3>
            </div>
            
            <!-- Stat Card 5 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-red-500">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-bolt text-red-500 mr-2"></i>API Liability</p>
                <h3 id="stat-upstream-cost" class="text-lg font-bold text-gray-900 truncate"><i class="fa-solid fa-spinner fa-spin text-sm text-gray-300"></i></h3>
            </div>

            <!-- Stat Card 6 -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-2 border-t-4 border-t-emerald-600">
                <p class="text-sm text-gray-500 font-medium whitespace-nowrap"><i class="fa-solid fa-chart-line text-emerald-600 mr-2"></i>Net Profit <span class="text-[10px] text-gray-400 font-normal">(Est)</span></p>
                <h3 id="stat-net-profit" class="text-xl font-bold text-emerald-600 truncate"><i class="fa-solid fa-spinner fa-spin text-sm text-emerald-200"></i></h3>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Quick Actions -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">Quick Actions</h3>
                <div class="grid grid-cols-2 gap-4">
                    <button onclick="window.loadSection('services')" class="p-4 rounded-lg bg-gray-50 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 text-left transition-all group">
                        <i class="fa-solid fa-plus text-brand-500 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-semibold text-gray-800">Add Service</h4>
                        <p class="text-xs text-gray-500 mt-1">Create a new SMM service</p>
                    </button>
                    <button onclick="window.loadSection('deposits')" class="p-4 rounded-lg bg-gray-50 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 text-left transition-all group">
                        <i class="fa-solid fa-check-double text-blue-500 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-semibold text-gray-800">Review Deposits</h4>
                        <p class="text-xs text-gray-500 mt-1">Approve user funds</p>
                    </button>
                    <button onclick="window.loadSection('orders')" class="p-4 rounded-lg bg-gray-50 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 text-left transition-all group">
                        <i class="fa-solid fa-list-check text-orange-500 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-semibold text-gray-800">Process Orders</h4>
                        <p class="text-xs text-gray-500 mt-1">Manage pending tasks</p>
                    </button>
                    <button onclick="window.loadSection('users')" class="p-4 rounded-lg bg-gray-50 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 text-left transition-all group">
                        <i class="fa-solid fa-user-magnifying-glass text-purple-500 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-semibold text-gray-800">Manage Users</h4>
                        <p class="text-xs text-gray-500 mt-1">View user accounts</p>
                    </button>
                </div>
            </div>

            <!-- System Alerts -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">System Notifications</h3>
                <div class="space-y-3" id="system-notifications">
                    <div class="p-4 rounded-lg bg-blue-50 border border-blue-100 flex gap-3 text-sm">
                        <i class="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
                        <div>
                            <p class="font-semibold text-blue-900">Dashboard Initialized</p>
                            <p class="text-blue-700">The MAsmmpanel admin command center is fully operational and tracking metrics securely.</p>
                        </div>
                    </div>
                    <!-- Additional alerts will be populated dynamically -->
                </div>
            </div>
        </div>
    `;
}

async function fetchRealtimeStats() {
    // Note: In a production Firebase environment, querying across all user subcollections 
    // requires setting up a Collection Group Index in your Firebase Console.

    try {
        // 1. Total Users
        const usersRef = collection(db, 'artifacts', appId, 'users');
        onSnapshot(usersRef, (snapshot) => {
            const el = document.getElementById('stat-total-users');
            if(el) el.innerText = snapshot.size;
        });

        // 2. Pending Orders (Using Collection Group query to search ALL users' orders)
        // Requires Firebase Index on 'orders' collection group filtering by status
        try {
            const pendingOrdersQuery = query(collectionGroup(db, 'orders'), where('status', '==', 'Pending'));
            onSnapshot(pendingOrdersQuery, (snapshot) => {
                const el = document.getElementById('stat-pending-orders');
                if(el) el.innerText = snapshot.size;
            });
        } catch (e) {
            console.warn("Pending Orders stat requires Collection Group index.", e);
            const el = document.getElementById('stat-pending-orders');
            if(el) el.innerText = "Needs Index";
        }

        // 3. Pending Deposits (Collection Group query on 'transactions')
        try {
            const pendingDepositsQuery = query(collectionGroup(db, 'transactions'), where('status', '==', 'Pending'));
            onSnapshot(pendingDepositsQuery, (snapshot) => {
                const el = document.getElementById('stat-pending-deposits');
                if(el) el.innerText = snapshot.size;
                
                // Add an alert if there are pending deposits
                if (snapshot.size > 0) {
                    addNotification(`You have ${snapshot.size} pending deposit(s) awaiting verification.`, 'warning');
                }
            });
        } catch (e) {
            console.warn("Pending Deposits stat requires Collection Group index.", e);
            const el = document.getElementById('stat-pending-deposits');
            if(el) el.innerText = "Needs Index";
        }

        // 4. Total Revenue Calculation
        // This calculates totalSpent across all user stats documents
        try {
            const allStatsQuery = collectionGroup(db, 'stats'); // Needs an index
            onSnapshot(allStatsQuery, (snapshot) => {
                let totalRevenue = 0;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.totalSpent) totalRevenue += Number(data.totalSpent);
                });
                
                // Master Financial Analytics (Derives exact margins based on Global Markup)
                const GLOBAL_MARKUP = 1.2; // 20% target margin
                const upstreamLiability = totalRevenue / GLOBAL_MARKUP;
                const netProfit = totalRevenue - upstreamLiability;

                const elRev = document.getElementById('stat-total-revenue');
                const elCost = document.getElementById('stat-upstream-cost');
                const elProfit = document.getElementById('stat-net-profit');
                
                if(elRev) elRev.innerText = `Rs ${totalRevenue.toFixed(0)}`;
                if(elCost) elCost.innerText = `Rs ${upstreamLiability.toFixed(0)}`;
                if(elProfit) elProfit.innerText = `+ Rs ${netProfit.toFixed(0)}`;
            });
        } catch(e) {
             const el = document.getElementById('stat-total-revenue');
             if(el) el.innerText = "Needs Index";
        }

    } catch (error) {
        console.error("Error fetching dashboard statistics:", error);
    }
}

function addNotification(message, type = 'info') {
    const container = document.getElementById('system-notifications');
    if (!container) return;

    let colors = {
        bg: 'bg-blue-50', border: 'border-blue-100', icon: 'text-blue-500', text: 'text-blue-900', desc: 'text-blue-700', iClass: 'fa-circle-info'
    };

    if (type === 'warning') {
        colors = { bg: 'bg-yellow-50', border: 'border-yellow-100', icon: 'text-yellow-500', text: 'text-yellow-900', desc: 'text-yellow-700', iClass: 'fa-triangle-exclamation' };
    }

    const alertHTML = `
        <div class="p-4 rounded-lg ${colors.bg} border ${colors.border} flex gap-3 text-sm animation-fade-in">
            <i class="fa-solid ${colors.iClass} ${colors.icon} mt-0.5"></i>
            <div>
                <p class="font-semibold ${colors.text}">Action Required</p>
                <p class="${colors.desc}">${message}</p>
            </div>
        </div>
    `;

    // Prepend to show at the top
    container.insertAdjacentHTML('afterbegin', alertHTML);
}