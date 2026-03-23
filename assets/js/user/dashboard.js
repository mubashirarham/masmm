import { 
    getFirestore, 
    doc, 
    onSnapshot, 
    collection, 
    addDoc, 
    updateDoc, 
    increment, 
    serverTimestamp,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
const statUsername = document.getElementById('stat-username');
const statSpent = document.getElementById('stat-spent');
const statOrders = document.getElementById('stat-orders');
const statBalance = document.getElementById('stat-balance');

const orderForm = document.getElementById('new-order-form');
const categorySelect = document.getElementById('category-select');
const serviceSelect = document.getElementById('service-select');
const linkInput = document.getElementById('order-link');
const quantityInput = document.getElementById('order-quantity');
const chargeInput = document.getElementById('order-charge');
const avgTimeInput = document.getElementById('average-time');
const limitsText = document.getElementById('service-limits');
const submitBtn = document.getElementById('submit-order-btn');

// State Variables
let allServices = [];
let selectedService = null;
let userData = null;

// ==========================================
// UI Helper: Notification Toast
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
// Core Dashboard Initialization
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) return; // Prevent unauthorized queries

    const userId = user.uid;
    const userEmail = user.email;
    const displayName = userEmail.split('@')[0]; // Creates a username out of the email prefix

    // 1. Fetch & Listen to Private User Stats
    const userStatsRef = doc(db, 'artifacts', appId, 'users', userId, 'account', 'stats');
    
    // Check if stats document exists, if not, initialize it
    const statsSnap = await getDoc(userStatsRef);
    if (!statsSnap.exists()) {
        await setDoc(userStatsRef, {
            username: displayName,
            balance: 0.00,
            totalSpent: 0.00,
            totalOrders: 0
        });
    }

    onSnapshot(userStatsRef, (snapshot) => {
        if (snapshot.exists()) {
            userData = snapshot.data();
            
            // Update Top 4 Green Status Cards
            statUsername.innerText = userData.username || displayName;
            statSpent.innerText = `Rs ${Number(userData.totalSpent || 0).toFixed(4)}`;
            statOrders.innerText = userData.totalOrders || 0;
            statBalance.innerText = `Rs ${Number(userData.balance || 0).toFixed(4)}`;
        }
    }, (error) => {
        console.error("Failed to load user stats:", error);
    });

    // 2. Fetch Public Categories
    const categoriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    onSnapshot(categoriesRef, (snapshot) => {
        categorySelect.innerHTML = '<option value="">Select a category...</option>';
        snapshot.forEach(doc => {
            const category = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = category.name; // e.g., "TikTok Views - Cheapest"
            categorySelect.appendChild(option);
        });
    });

    // 3. Fetch Public Services
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => {
            allServices.push({ id: doc.id, ...doc.data() });
        });
    });
});

// ==========================================
// Form Interaction Logic
// ==========================================

// Handle Category Selection
categorySelect.addEventListener('change', (e) => {
    const selectedCategoryId = e.target.value;
    
    // Reset Service Options
    serviceSelect.innerHTML = '<option value="">Select a service...</option>';
    serviceSelect.disabled = !selectedCategoryId;
    
    // Reset Form visual states
    selectedService = null;
    avgTimeInput.value = "Not enough data";
    limitsText.innerText = "Min: 0 - Max: 0";
    chargeInput.value = "Rs 0.00";
    quantityInput.value = "";

    if (!selectedCategoryId) return;

    // Filter services belonging to the chosen category
    const categoryServices = allServices.filter(s => s.categoryId === selectedCategoryId);
    
    categoryServices.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        // Format to perfectly mimic screenshot style: "ID - Name [Quantity 1000=Rs.Rate]"
        option.textContent = `${service.serviceId || service.id} - ${service.name} [Quantity 1000=Rs ${service.rate}]`;
        serviceSelect.appendChild(option);
    });
});

// Handle Service Selection
serviceSelect.addEventListener('change', (e) => {
    const serviceId = e.target.value;
    selectedService = allServices.find(s => s.id === serviceId);

    if (selectedService) {
        avgTimeInput.value = selectedService.averageTime || "13 minutes";
        limitsText.innerText = `Min: ${selectedService.min || 100} - Max: ${selectedService.max || 50000}`;
        
        // Trigger charge recalculation if quantity is already typed
        calculateCharge();
    } else {
        avgTimeInput.value = "Not enough data";
        limitsText.innerText = "Min: 0 - Max: 0";
        chargeInput.value = "Rs 0.00";
    }
});

// Calculate exact charge as user types Quantity
function calculateCharge() {
    if (!selectedService) return;
    
    const qty = parseInt(quantityInput.value) || 0;
    // Calculation: (Quantity / 1000) * Rate per 1000
    const calculatedCharge = (qty / 1000) * (selectedService.rate || 0);
    
    chargeInput.value = `Rs ${calculatedCharge.toFixed(4)}`;
}

quantityInput.addEventListener('input', calculateCharge);

// ==========================================
// Order Submission Logic
// ==========================================
orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!selectedService || !userData) {
        notify("Please select a valid service first.", "error");
        return;
    }

    const qty = parseInt(quantityInput.value) || 0;
    const minQty = selectedService.min || 100;
    const maxQty = selectedService.max || 50000;
    const totalCharge = (qty / 1000) * (selectedService.rate || 0);

    // Guard 1: Check Limits
    if (qty < minQty || qty > maxQty) {
        notify(`Quantity must be between ${minQty} and ${maxQty}`, "error");
        return;
    }

    // Guard 2: Check Balance
    if (userData.balance < totalCharge) {
        notify("Insufficient balance. Please add funds to place this order.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
        const userId = auth.currentUser.uid;
        const userStatsRef = doc(db, 'artifacts', appId, 'users', userId, 'account', 'stats');
        const ordersRef = collection(db, 'artifacts', appId, 'users', userId, 'orders');

        // 1. Log the new Order
        await addDoc(ordersRef, {
            serviceId: selectedService.serviceId || selectedService.id,
            serviceName: selectedService.name,
            link: linkInput.value,
            quantity: qty,
            charge: totalCharge,
            status: 'Pending',
            createdAt: serverTimestamp()
        });

        // 2. Deduct Funds & Increment Stats
        await updateDoc(userStatsRef, {
            balance: increment(-totalCharge),
            totalSpent: increment(totalCharge),
            totalOrders: increment(1)
        });

        notify("Order placed successfully!", "success");
        
        // Reset inputs to clean state
        orderForm.reset();
        chargeInput.value = "Rs 0.00";
        limitsText.innerText = `Min: ${selectedService.min || 100} - Max: ${selectedService.max || 50000}`;

    } catch (error) {
        console.error("Order error:", error);
        notify("Failed to place order. Try again.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Place Order';
    }
});