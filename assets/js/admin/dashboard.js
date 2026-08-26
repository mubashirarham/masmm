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
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">System Overview</h2>
                <p class="text-sm text-slate-600 font-medium">Real-time statistics across the MAsmmpanel platform.</p>
            </div>
            <button onclick="location.reload()" class="bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-xl shadow-sm text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2">
                <i class="fa-solid fa-rotate-right text-brand-600"></i> Refresh Data
            </button>
        </div>

        <!-- Top Statistics Panel -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
            <!-- Stat Card 1 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-users text-blue-500 mr-1.5"></i> Total Users</p>
                <h3 id="stat-total-users" class="text-2xl font-black text-slate-900"><i class="fa-solid fa-spinner fa-spin text-sm text-slate-300"></i></h3>
            </div>
            
            <!-- Stat Card 2 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-clock-rotate-left text-amber-500 mr-1.5"></i> Pending Orders</p>
                <h3 id="stat-pending-orders" class="text-2xl font-black text-slate-900"><i class="fa-solid fa-spinner fa-spin text-sm text-slate-300"></i></h3>
            </div>

            <!-- Stat Card 3 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-money-bill-transfer text-purple-500 mr-1.5"></i> Deposits</p>
                <h3 id="stat-pending-deposits" class="text-2xl font-black text-slate-900"><i class="fa-solid fa-spinner fa-spin text-sm text-slate-300"></i></h3>
            </div>
            
            <!-- Stat Card 4 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-sack-dollar text-brand-600 mr-1.5"></i> Total Revenue</p>
                <h3 id="stat-total-revenue" class="text-2xl font-black text-slate-900"><i class="fa-solid fa-spinner fa-spin text-sm text-slate-300"></i></h3>
            </div>
            
            <!-- Stat Card 5 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-bolt text-rose-500 mr-1.5"></i> API Liability</p>
                <h3 id="stat-upstream-cost" class="text-lg font-black text-slate-900 truncate"><i class="fa-solid fa-spinner fa-spin text-sm text-slate-300"></i></h3>
            </div>

            <!-- Stat Card 6 -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center gap-2">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"><i class="fa-solid fa-chart-line text-emerald-600 mr-1.5"></i> Net Profit</p>
                <h3 id="stat-net-profit" class="text-xl font-black text-emerald-600 truncate"><i class="fa-solid fa-spinner fa-spin text-sm text-emerald-200"></i></h3>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Quick Actions -->
            <div class="bg-white rounded-2xl shadow-sm border border-slate-300 p-6">
                <h3 class="text-lg font-black text-slate-900 mb-4 pb-3 border-b border-slate-200">Quick Actions</h3>
                <div class="grid grid-cols-2 gap-4">
                    <button onclick="window.loadSection('services')" class="p-4 rounded-xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 text-left transition-all group cursor-pointer shadow-sm">
                        <i class="fa-solid fa-plus text-brand-600 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-bold text-slate-900 text-sm">Add Service</h4>
                        <p class="text-xs text-slate-500 mt-1 font-medium">Create a new SMM service</p>
                    </button>
                    <button onclick="window.loadSection('deposits')" class="p-4 rounded-xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 text-left transition-all group cursor-pointer shadow-sm">
                        <i class="fa-solid fa-check-double text-blue-600 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-bold text-slate-900 text-sm">Review Deposits</h4>
                        <p class="text-xs text-slate-500 mt-1 font-medium">Approve user funds</p>
                    </button>
                    <button onclick="window.loadSection('orders')" class="p-4 rounded-xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 text-left transition-all group cursor-pointer shadow-sm">
                        <i class="fa-solid fa-list-check text-amber-600 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-bold text-slate-900 text-sm">Process Orders</h4>
                        <p class="text-xs text-slate-500 mt-1 font-medium">Manage pending tasks</p>
                    </button>
                    <button onclick="window.loadSection('users')" class="p-4 rounded-xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 text-left transition-all group cursor-pointer shadow-sm">
                        <i class="fa-solid fa-user-magnifying-glass text-purple-600 mb-2 text-xl group-hover:scale-110 transition-transform"></i>
                        <h4 class="font-bold text-slate-900 text-sm">Manage Users</h4>
                        <p class="text-xs text-slate-500 mt-1 font-medium">View user accounts</p>
                    </button>
                </div>
            </div>

            <!-- System Alerts -->
            <div class="bg-white rounded-2xl shadow-sm border border-slate-300 p-6">
                <h3 class="text-lg font-black text-slate-900 mb-4 pb-3 border-b border-slate-200">System Notifications</h3>
                <div class="space-y-3" id="system-notifications">
                    <div class="p-4 rounded-xl bg-brand-50 border border-brand-200 flex gap-3 text-sm">
                        <i class="fa-solid fa-circle-info text-brand-600 mt-0.5"></i>
                        <div>
                            <p class="font-bold text-brand-900">Dashboard Initialized</p>
                            <p class="text-xs text-brand-700 font-medium mt-0.5">The MAsmmpanel admin command center is fully operational and tracking metrics securely.</p>
                        </div>
                    </div>
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

        // 4. Financial Analytics Calculation (Exact Margins based on Order history)
        try {
            const allOrdersQuery = query(collectionGroup(db, 'orders'), where('status', '==', 'Completed'));
            onSnapshot(allOrdersQuery, (snapshot) => {
                let totalRevenue = 0;
                let upstreamLiability = 0;
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const charge = Number(data.charge || 0);
                    totalRevenue += charge;
                    
                    if (data._original_rate && data.quantity) {
                        const originalRate = Number(data._original_rate);
                        const exchangeRate = Number(data._pkr_exchange_rate || 1); // fallback to 1 if not set
                        const qty = Number(data.quantity);
                        upstreamLiability += (originalRate * exchangeRate / 1000) * qty;
                    } else {
                        // Fallback to average 20% markup rule if legacy order lacks metadata
                        upstreamLiability += charge / 1.2;
                    }
                });
                
                const netProfit = totalRevenue - upstreamLiability;

                const elRev = document.getElementById('stat-total-revenue');
                const elCost = document.getElementById('stat-upstream-cost');
                const elProfit = document.getElementById('stat-net-profit');
                
                if(elRev) elRev.innerText = `Rs ${totalRevenue.toFixed(0)}`;
                if(elCost) elCost.innerText = `Rs ${upstreamLiability.toFixed(0)}`;
                if(elProfit) elProfit.innerText = `+ Rs ${netProfit.toFixed(0)}`;
            });
        } catch(e) {
            console.warn("Financial Analytics requires Collection Group index on orders by status.", e);
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