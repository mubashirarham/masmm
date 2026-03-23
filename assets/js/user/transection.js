apiimport { 
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
const transactionsView = document.getElementById('view-transactions');
const tableBody = transactionsView ? transactionsView.querySelector('tbody') : null;

// State Variables
let allTransactions = [];

// ==========================================
// UI Helpers
// ==========================================
function getStatusBadge(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'completed' || s === 'approved') return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-bold uppercase tracking-wider">Completed</span>`;
    if (s === 'rejected' || s === 'failed') return `<span class="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-bold uppercase tracking-wider">Rejected</span>`;
    
    // Default fallback to pending
    return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold uppercase tracking-wider">Pending</span>`;
}

// ==========================================
// Core Data Fetching & Rendering
// ==========================================

onAuthStateChanged(auth, (user) => {
    if (!user || !tableBody) return; // Only fetch if authenticated and DOM exists

    const userId = user.uid;
    
    // Listen to user's private transactions collection
    const transactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
    
    onSnapshot(transactionsRef, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => {
            allTransactions.push({ id: doc.id, ...doc.data() });
        });

        // Sort transactions by Date in descending order (Newest first)
        allTransactions.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        renderTransactionsTable();
    }, (error) => {
        console.error("Error fetching transactions: ", error);
    });
});

// Table Rendering Engine
function renderTransactionsTable() {
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear table

    // Empty State Check
    if (allTransactions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4 text-2xl text-gray-400">
                        <i class="fa-solid fa-receipt"></i>
                    </div>
                    <p>No transactions found.</p>
                </td>
            </tr>`;
        return;
    }

    // Render Rows
    allTransactions.forEach(trx => {
        // Format Date
        let dateStr = 'Just now';
        if (trx.createdAt) {
            dateStr = trx.createdAt.toDate().toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }

        const method = trx.method || 'Unknown';
        const tid = trx.tid || 'N/A';
        const amount = Number(trx.amount || 0).toFixed(2);
        const status = trx.status || 'Pending';

        const row = document.createElement('tr');
        row.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
        
        row.innerHTML = `
            <td class="px-6 py-4 font-semibold text-gray-700 whitespace-nowrap">
                ${tid}
            </td>
            <td class="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">
                ${dateStr}
            </td>
            <td class="px-6 py-4 text-gray-800 font-medium whitespace-nowrap">
                ${method}
            </td>
            <td class="px-6 py-4 text-gray-800 font-bold whitespace-nowrap">
                Rs ${amount}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${getStatusBadge(status)}
            </td>
        `;

        tableBody.appendChild(row);
    });
}