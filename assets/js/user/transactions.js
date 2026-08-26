import { 
    getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let userTransactions = [];
let currentPage = 1;
const rowsPerPage = 15;

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
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">Payment History</h2>
                <p class="text-sm text-slate-600 font-medium">Track all your deposits and fund additions.</p>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-700 whitespace-nowrap">
                    <thead class="bg-slate-100 text-slate-800 border-b-2 border-slate-300 sticky top-0">
                        <tr>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider w-36">Date</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider">TID / Reference</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-36">Method</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-36">Amount</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-36">Status</th>
                        </tr>
                    </thead>
                    <tbody id="user-tx-table-body">
                        <tr>
                            <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p class="font-bold">Loading history...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="tx-pagination-container" class="border-t border-slate-200 bg-slate-50 p-4"></div>
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
    const paginationContainer = document.getElementById('tx-pagination-container');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (userTransactions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                    <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-2xl mx-auto mb-3 border border-slate-300 shadow-sm"><i class="fa-solid fa-receipt"></i></div>
                    <p class="font-bold text-slate-700">No deposit history found.</p>
                </td>
            </tr>`;
        return;
    }

    const totalPages = Math.ceil(userTransactions.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = userTransactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    paginated.forEach(tx => {
        let dateStr = 'N/A';
        if (tx.createdAt) {
            dateStr = tx.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        tableBody.innerHTML += `
            <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 text-xs text-slate-600 font-medium">${dateStr}</td>
                <td class="px-6 py-4 font-mono font-bold text-slate-900 text-sm">${tx.tid || 'N/A'}</td>
                <td class="px-6 py-4 text-center text-slate-700 font-semibold">${tx.method || 'Manual'}</td>
                <td class="px-6 py-4 text-center font-bold text-brand-600">Rs ${Number(tx.amount || 0).toFixed(2)}</td>
                <td class="px-6 py-4 text-center">${getStatusBadge(tx.status)}</td>
            </tr>
        `;
    });

    if(paginationContainer) {
        renderPagination(userTransactions.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderTransactionsTable();
        }, paginationContainer);
    }
}

function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'approved') return `<span class="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Completed</span>`;
    if (s === 'rejected' || s === 'failed') return `<span class="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Rejected</span>`;
    return `<span class="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">Pending</span>`;
}