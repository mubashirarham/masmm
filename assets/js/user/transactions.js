import { 
    getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let userTransactions = [];

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) fetchTransactions();
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'transactions') return;
    renderTransactionsUI();
    if (currentUser) fetchTransactions();
});

function renderTransactionsUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Payment History</h2>
                <p class="text-sm text-gray-500">Track all your deposits and fund additions.</p>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-32">Date</th>
                            <th class="px-6 py-4 font-semibold">TID / Reference</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Method</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Amount</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                        </tr>
                    </thead>
                    <tbody id="user-tx-table-body">
                        <tr>
                            <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading history...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function fetchTransactions() {
    const txRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'transactions');
    
    onSnapshot(txRef, (snapshot) => {
        userTransactions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if(data.type === 'Deposit') userTransactions.push({ id: doc.id, ...data });
        });
        
        userTransactions.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });
        
        renderTransactionsTable();
    });
}

function renderTransactionsTable() {
    const tableBody = document.getElementById('user-tx-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (userTransactions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-2xl mx-auto mb-3"><i class="fa-solid fa-receipt"></i></div>
                    <p>No deposit history found.</p>
                </td>
            </tr>`;
        return;
    }

    userTransactions.forEach(tx => {
        let dateStr = 'N/A';
        if (tx.createdAt) {
            dateStr = tx.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        tableBody.innerHTML += `
            <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 text-xs text-gray-500">${dateStr}</td>
                <td class="px-6 py-4 font-mono font-semibold text-gray-800">${tx.tid || 'N/A'}</td>
                <td class="px-6 py-4 text-center text-gray-600">${tx.method || 'Manual'}</td>
                <td class="px-6 py-4 text-center font-bold text-brand-600">Rs ${Number(tx.amount || 0).toFixed(2)}</td>
                <td class="px-6 py-4 text-center">${getStatusBadge(tx.status)}</td>
            </tr>
        `;
    });
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'approved') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Completed</span>`;
    if (s === 'rejected' || s === 'failed') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Rejected</span>`;
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Pending</span>`;
}