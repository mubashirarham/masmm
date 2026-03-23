import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Firebase Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
const addFundsView = document.getElementById('view-addfunds');

if (addFundsView) {
    const methodSelect = addFundsView.querySelector('select');
    const amountInput = addFundsView.querySelector('input[type="number"]');
    const tidInput = addFundsView.querySelector('input[type="text"]');
    const verifyBtn = addFundsView.querySelector('button');

    // ==========================================
    // UI Helper
    // ==========================================
    function notify(message, type = "success") {
        const toastContainer = document.getElementById('toast-container');
        if(!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `px-4 py-3 rounded shadow-lg text-sm font-semibold flex items-center gap-3 transform transition-all duration-300 translate-x-full pointer-events-auto`;
        
        if (type === "success") {
            toast.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
            toast.innerHTML = `<i class="fa-solid fa-circle-check text-green-600"></i> ${message}`;
        } else {
            toast.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
            toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-600"></i> ${message}`;
        }

        toastContainer.appendChild(toast);
        setTimeout(() => { toast.classList.remove('translate-x-full'); }, 10);
        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ==========================================
    // Deposit Submission Logic
    // ==========================================
    verifyBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            notify("You must be logged in to add funds.", "error");
            return;
        }

        const method = methodSelect.value;
        const amount = parseFloat(amountInput.value);
        const tid = tidInput.value.trim();

        // Basic Validation
        if (isNaN(amount) || amount < 100) {
            notify("Minimum deposit amount is Rs 100.", "error");
            return;
        }

        if (!tid) {
            notify("Please enter a valid Transaction ID (TID).", "error");
            return;
        }

        // Lock button to prevent double submission
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        try {
            const userId = user.uid;
            const transactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');

            // Log the pending transaction
            await addDoc(transactionsRef, {
                method: method,
                amount: amount,
                tid: tid,
                status: 'Pending', // Admin will review and change to 'Completed' to add funds
                type: 'Deposit',
                createdAt: serverTimestamp()
            });

            notify("Payment submitted for verification! It will be added to your balance shortly.", "success");
            
            // Clear inputs
            amountInput.value = '';
            tidInput.value = '';
            
        } catch (error) {
            console.error("Deposit submission error:", error);
            notify("Failed to submit deposit. Please try again.", "error");
        } finally {
            // Restore button
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = 'Verify Payment';
        }
    });
}