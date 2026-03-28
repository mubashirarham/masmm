import { 
    getFirestore, collection, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'refill') return;
    renderUserRefillsUI();
    fetchUserRefills();
});

function renderUserRefillsUI() {
    const contentArea = document.getElementById('main-content');
    contentArea.innerHTML = `
        <div class="mb-8">
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Refill History</h1>
            <p class="text-gray-500 text-sm">Track your guarantee refills and replacements in real-time.</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                            <th class="p-4 font-semibold">Refill ID</th>
                            <th class="p-4 font-semibold">Order ID</th>
                            <th class="p-4 font-semibold">Service</th>
                            <th class="p-4 font-semibold text-center">Date Requested</th>
                            <th class="p-4 font-semibold text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody id="user-refills-table" class="divide-y divide-gray-50">
                        <tr>
                            <td colspan="5" class="p-8 text-center text-gray-400">
                                <i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading tracking logs...
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function fetchUserRefills() {
    if(!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    
    const refillsRef = collection(db, 'artifacts', appId, 'users', uid, 'refills');
    const q = query(refillsRef, orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const table = document.getElementById('user-refills-table');
        if(!table) return;

        if (snapshot.empty) {
            table.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-sm text-gray-500 font-medium">You have no active or completed refill requests.</td></tr>`;
            return;
        }

        let html = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'Pending';
            const displayId = docSnap.id.substring(0,8).toUpperCase();
            const displayOrderId = (data.orderId || '').substring(0,8).toUpperCase();
            
            let statusBadge = '';
            const s = (data.status || 'Pending').toLowerCase();
            if(s === 'completed') statusBadge = '<span class="px-2.5 py-1 bg-green-100 text-green-700 rounded-md text-xs font-bold">Completed</span>';
            else if(s === 'in progress') statusBadge = '<span class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-bold">In Progress</span>';
            else if(s === 'rejected') statusBadge = '<span class="px-2.5 py-1 bg-red-100 text-red-700 rounded-md text-xs font-bold">Rejected</span>';
            else statusBadge = '<span class="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-md text-xs font-bold">Pending</span>';

            html += `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-4 text-xs font-mono text-gray-500">${displayId}</td>
                    <td class="p-4 text-xs font-mono font-bold text-gray-800">${displayOrderId}</td>
                    <td class="p-4 text-sm text-gray-700 max-w-[200px] truncate">${data.serviceName || 'Unknown Service'}</td>
                    <td class="p-4 text-xs font-semibold text-gray-500 text-center uppercase tracking-wide">${dateStr}</td>
                    <td class="p-4 text-right">${statusBadge}</td>
                </tr>
            `;
        });
        table.innerHTML = html;
    });
}