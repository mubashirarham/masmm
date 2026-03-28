import { 
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let allCategories = [];
let allServices = [];
let currentBalance = 0;

// Helper to detect platform for icons - using Real Brand SVGs via SimpleIcons
function getPlatformLogo(categoryName) {
    const name = (categoryName || '').toLowerCase();
    const renderSvg = (slug, color, bg) => ({ 
        icon: `<img src="https://cdn.simpleicons.org/${slug}/${color.replace('#','')}" class="w-full h-full object-contain" alt="${slug}">`, 
        color, bg 
    });

    if (name.includes('tiktok')) return renderSvg('tiktok', '#000000', 'bg-gray-100');
    if (name.includes('instagram') || name.includes('ig')) return renderSvg('instagram', '#E1306C', 'bg-pink-50');
    if (name.includes('youtube') || name.includes('yt')) return renderSvg('youtube', '#FF0000', 'bg-red-50');
    if (name.includes('facebook') || name.includes('fb')) return renderSvg('facebook', '#1877F2', 'bg-blue-50');
    if (name.includes('twitter') || name.includes('x')) return renderSvg('x', '#000000', 'bg-gray-100');
    if (name.includes('telegram')) return renderSvg('telegram', '#26A5E4', 'bg-sky-50');
    if (name.includes('spotify')) return renderSvg('spotify', '#1DB954', 'bg-green-50');
    if (name.includes('linkedin')) return renderSvg('linkedin', '#0A66C2', 'bg-blue-50');
    if (name.includes('discord')) return renderSvg('discord', '#5865F2', 'bg-indigo-50');
    if (name.includes('twitch')) return renderSvg('twitch', '#9146FF', 'bg-purple-50');
    if (name.includes('reddit')) return renderSvg('reddit', '#FF4500', 'bg-orange-50');
    if (name.includes('pinterest')) return renderSvg('pinterest', '#E60023', 'bg-red-50');
    if (name.includes('snapchat')) return renderSvg('snapchat', '#FFFC00', 'bg-yellow-50');
    if (name.includes('threads')) return renderSvg('threads', '#000000', 'bg-gray-100');
    
    // Generic Fallback using classic FontAwesome if no brand found
    return { icon: '<i class="fa-solid fa-layer-group text-lg"></i>', color: '#22c55e', bg: 'bg-brand-50' };
}

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('stat-balance')) fetchStats();
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'dashboard') return;
    renderDashboardUI();
    fetchCategories();
    fetchServices();
    if (currentUser) fetchStats();
});

function renderDashboardUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <!-- Welcome Banner -->
        <div class="mb-8 bg-gradient-to-r from-brand-600 to-brand-800 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
            <div class="relative z-10">
                <h2 class="text-3xl font-bold mb-2">Welcome back, <span id="welcome-username">User</span>! 👋</h2>
                <p class="text-brand-100 text-sm md:text-base max-w-2xl">Ready to skyrocket your social media presence? Select a service below to get started instantly.</p>
            </div>
            <i class="fa-solid fa-rocket absolute -bottom-6 -right-6 text-9xl text-white opacity-10 transform -rotate-12"></i>
            <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <!-- Top Statistics Panel -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div class="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-2xl shrink-0"><i class="fa-solid fa-wallet"></i></div>
                <div class="min-w-0">
                    <p class="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-1">Available Balance</p>
                    <h3 id="stat-balance" class="text-2xl font-bold text-gray-900 truncate">...</h3>
                </div>
            </div>
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div class="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl shrink-0"><i class="fa-solid fa-chart-pie"></i></div>
                <div class="min-w-0">
                    <p class="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-1">Total Spent</p>
                    <h3 id="stat-spent" class="text-2xl font-bold text-gray-900 truncate">...</h3>
                </div>
            </div>
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div class="w-14 h-14 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-2xl shrink-0"><i class="fa-solid fa-box-open"></i></div>
                <div class="min-w-0">
                    <p class="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-1">Total Orders</p>
                    <h3 id="stat-orders" class="text-2xl font-bold text-gray-900 truncate">0</h3>
                </div>
            </div>
        </div>

        <div class="max-w-4xl mx-auto w-full">
            
            <!-- Centered New Order Form -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 relative overflow-visible">
                <!-- Subtle top border accent -->
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-brand-600"></div>

                <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <i class="fa-solid fa-cart-plus text-brand-500"></i> Place New Order
                </h3>

                <form id="new-order-form" class="space-y-6">
                    
                    <!-- Custom Category Dropdown Row -->
                    <div class="relative w-full z-20">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Category <span class="text-red-500">*</span></label>
                        <div class="relative">
                            <button type="button" id="cat-dropdown-btn" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white flex items-center justify-between transition-all text-sm font-medium cursor-pointer shadow-sm">
                                <span id="cat-dropdown-text" class="flex items-center gap-3 text-gray-500">
                                    <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-layer-group"></i></div>
                                    -- Choose Category --
                                </span>
                                <i class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-200" id="cat-dropdown-arrow"></i>
                            </button>
                            <div id="cat-dropdown-menu" class="hidden absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
                                <div class="p-2" id="cat-dropdown-options">
                                    <div class="p-3 text-sm text-gray-500">Loading categories...</div>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="category-select" required>
                    </div>

                    <!-- Custom Service Dropdown Row -->
                    <div class="relative w-full z-10">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Service <span class="text-red-500">*</span></label>
                        <div class="relative">
                            <button type="button" id="srv-dropdown-btn" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white flex items-center justify-between transition-all text-sm font-medium cursor-pointer shadow-sm disabled:bg-gray-50 disabled:opacity-75 disabled:cursor-not-allowed" disabled>
                                <span id="srv-dropdown-text" class="flex items-center gap-3 text-gray-500 overflow-hidden">
                                    <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-tags"></i></div>
                                    <span class="truncate block">Select a category first...</span>
                                </span>
                                <i class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-200 shrink-0" id="srv-dropdown-arrow"></i>
                            </button>
                            <div id="srv-dropdown-menu" class="hidden absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
                                <div class="p-2 flex flex-col gap-1" id="srv-dropdown-options">
                                    <div class="p-3 text-sm text-gray-500 text-center">No services available</div>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="service-select" required>
                        
                        <!-- Beautiful Description Box -->
                        <div id="service-description" class="hidden mt-3 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl text-sm text-gray-700 whitespace-pre-wrap leading-relaxed shadow-sm">
                            <!-- Populated by JS -->
                        </div>
                    </div>

                    <!-- Link Row -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Target Link <span class="text-red-500">*</span></label>
                        <div class="relative">
                            <i class="fa-solid fa-link absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                            <input type="url" id="order-link" placeholder="https://..." required class="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm shadow-sm">
                        </div>
                    </div>

                    <!-- Quantity & Charge Row -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Quantity <span class="text-red-500">*</span></label>
                            <input type="number" id="order-quantity" placeholder="0" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm shadow-sm">
                            <div class="flex justify-between items-center mt-2 px-1">
                                <span id="service-limits" class="text-xs font-semibold text-gray-500">Min: 0 - Max: 0</span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Total Charge</label>
                            <div class="relative">
                                <input type="text" id="order-charge" readonly value="" class="w-full px-4 py-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 font-bold outline-none cursor-not-allowed text-sm shadow-sm">
                            </div>
                        </div>
                    </div>

                    <div id="order-notification" class="hidden text-sm px-4 py-3 rounded-xl font-semibold shadow-sm"></div>

                    <div class="pt-2">
                        <button type="submit" id="submit-order-btn" class="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-base" disabled>
                            <i class="fa-solid fa-paper-plane"></i> Place Order Now
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Bind Custom Dropdown Logic
    const catBtn = document.getElementById('cat-dropdown-btn');
    const catMenu = document.getElementById('cat-dropdown-menu');
    const catArrow = document.getElementById('cat-dropdown-arrow');
    
    catBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Hide srv dropdown if open
        document.getElementById('srv-dropdown-menu').classList.add('hidden');
        document.getElementById('srv-dropdown-arrow').classList.remove('rotate-180');
        
        catMenu.classList.toggle('hidden');
        catArrow.classList.toggle('rotate-180');
    });

    const srvBtn = document.getElementById('srv-dropdown-btn');
    const srvMenu = document.getElementById('srv-dropdown-menu');
    const srvArrow = document.getElementById('srv-dropdown-arrow');
    
    srvBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (srvBtn.disabled) return;
        
        // Hide cat dropdown if open
        catMenu.classList.add('hidden');
        catArrow.classList.remove('rotate-180');
        
        srvMenu.classList.toggle('hidden');
        srvArrow.classList.toggle('rotate-180');
    });

    document.addEventListener('click', (e) => {
        if(catMenu && !catMenu.classList.contains('hidden') && !catMenu.contains(e.target) && !catBtn.contains(e.target)) {
            catMenu.classList.add('hidden');
            catArrow.classList.remove('rotate-180');
        }
        if(srvMenu && !srvMenu.classList.contains('hidden') && !srvMenu.contains(e.target) && !srvBtn.contains(e.target)) {
            srvMenu.classList.add('hidden');
            srvArrow.classList.remove('rotate-180');
        }
    });

    document.getElementById('order-quantity').addEventListener('input', calculateCharge);
    document.getElementById('new-order-form').addEventListener('submit', handlePlaceOrder);
}

function fetchStats() {
    if (!currentUser) return;
    
    // Set username
    const usernameEl = document.getElementById('welcome-username');
    if (usernameEl) usernameEl.innerText = currentUser.email.split('@')[0];

    const statsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'stats');
    onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentBalance = parseFloat(data.balance || 0);
            
            const balEl = document.getElementById('stat-balance');
            const spentEl = document.getElementById('stat-spent');
            const ordersEl = document.getElementById('stat-orders');
            
            if (balEl) balEl.innerText = window.formatMoney(currentBalance);
            if (spentEl) spentEl.innerText = window.formatMoney(data.totalSpent);
            if (ordersEl) ordersEl.innerText = parseInt(data.totalOrders || 0);
        } else {
            currentBalance = 0;
            updateDoc(statsRef, { balance: 0, totalSpent: 0, totalOrders: 0 }).catch(() => {});
        }
    });
}

function fetchCategories() {
    const catsRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    onSnapshot(catsRef, (snapshot) => {
        allCategories = [];
        snapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));
        allCategories.sort((a, b) => (a.sort || 99) - (b.sort || 99));
        
        const optionsContainer = document.getElementById('cat-dropdown-options');
        if (!optionsContainer) return;
        
        // Default Option
        optionsContainer.innerHTML = `
            <div class="cat-option flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-600 transition-colors" data-value="">
                <div class="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-layer-group"></i></div>
                <span class="font-medium">-- Choose Category --</span>
            </div>
        `;

        // Render real options with icons
        allCategories.forEach(cat => {
            if(cat.status === 'Active') {
                const platform = getPlatformLogo(cat.name);
                optionsContainer.innerHTML += `
                    <div class="cat-option flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-800 transition-colors" data-value="${cat.id}">
                        <div class="w-8 h-8 rounded-lg ${platform.bg} flex items-center justify-center shrink-0 shadow-sm p-1.5" style="color: ${platform.color}">
                            ${platform.icon}
                        </div>
                        <span class="font-medium">${cat.name}</span>
                    </div>
                `;
            }
        });

        // Attach click listeners to the dynamically injected custom options
        document.querySelectorAll('.cat-option').forEach(option => {
            option.addEventListener('click', function() {
                const val = this.getAttribute('data-value');
                const htmlContent = this.innerHTML;
                
                const dropText = document.getElementById('cat-dropdown-text');
                dropText.innerHTML = htmlContent;
                dropText.classList.remove('text-gray-500');
                dropText.classList.add('text-gray-900');
                
                document.getElementById('category-select').value = val;
                
                // Close menu
                document.getElementById('cat-dropdown-menu').classList.add('hidden');
                document.getElementById('cat-dropdown-arrow').classList.remove('rotate-180');
                
                // Trigger natural change logic
                handleCategoryChange({ target: { value: val } });
            });
        });
    });
}

function fetchServices() {
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => allServices.push({ id: doc.id, ...doc.data() }));
    });
}

function handleCategoryChange(e) {
    const catId = e.target.value;
    const srvBtn = document.getElementById('srv-dropdown-btn');
    const srvText = document.getElementById('srv-dropdown-text');
    const srvOptions = document.getElementById('srv-dropdown-options');
    const hiddenServiceInput = document.getElementById('service-select');
    const submitBtn = document.getElementById('submit-order-btn');
    const descBox = document.getElementById('service-description');
    
    // Reset Service
    hiddenServiceInput.value = '';
    srvText.innerHTML = `
        <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-tags"></i></div>
        <span class="truncate block">-- Choose Service --</span>
    `;
    srvText.classList.remove('text-gray-900');
    srvText.classList.add('text-gray-500');
    srvOptions.innerHTML = '<div class="p-3 text-sm text-gray-500">No services available</div>';

    document.getElementById('order-charge').value = window.formatMoney(0);
    document.getElementById('order-quantity').value = '';
    document.getElementById('service-limits').innerText = 'Min: 0 - Max: 0';
    descBox.classList.add('hidden');
    submitBtn.disabled = true;

    if (!catId) {
        srvBtn.disabled = true;
        return;
    }

    srvBtn.disabled = false;
    const filteredServices = allServices.filter(s => s.categoryId === catId && s.status === 'Active');
    
    if (filteredServices.length === 0) {
        srvOptions.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">No active services in this category</div>';
        return;
    }

    // Get current category platform logic for icons
    const parentCat = allCategories.find(c => c.id === catId);
    const platform = parentCat ? getPlatformLogo(parentCat.name) : getPlatformLogo('');

    srvOptions.innerHTML = '';
    filteredServices.forEach(srv => {
        srvOptions.innerHTML += `
            <div class="srv-option flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-800 transition-colors border border-transparent hover:border-gray-200" data-value="${srv.id}">
                <div class="w-8 h-8 rounded-lg ${platform.bg} flex items-center justify-center shrink-0 shadow-sm p-1.5" style="color: ${platform.color}">
                    ${platform.icon}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm leading-tight text-gray-900 mb-1">${srv.name}</p>
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                            ${window.formatMoney(srv.rate)}/1k
                        </span>
                        <span class="text-xs text-gray-500">Min: ${srv.min} - Max: ${srv.max}</span>
                    </div>
                </div>
            </div>
        `;
    });

    document.querySelectorAll('.srv-option').forEach(option => {
        option.addEventListener('click', function() {
            const val = this.getAttribute('data-value');
            const clickedService = allServices.find(s => s.id === val);
            
            srvText.innerHTML = `
                <div class="w-6 h-6 rounded ${platform.bg} flex items-center justify-center shrink-0 p-1">
                    ${platform.icon}
                </div>
                <span class="truncate block text-gray-900 font-semibold">${clickedService.name}</span>
            `;
            
            hiddenServiceInput.value = val;
            
            // Close menu
            document.getElementById('srv-dropdown-menu').classList.add('hidden');
            document.getElementById('srv-dropdown-arrow').classList.remove('rotate-180');
            
            // Trigger natural change logic
            handleServiceChange(val);
        });
    });
}

function handleServiceChange(srvId) {
    const descBox = document.getElementById('service-description');
    const submitBtn = document.getElementById('submit-order-btn');
    
    document.getElementById('order-quantity').value = '';
    document.getElementById('order-charge').value = window.formatMoney(0);

    if (!srvId) {
        descBox.classList.add('hidden');
        submitBtn.disabled = true;
        return;
    }

    const service = allServices.find(s => s.id === srvId);
    if (service) {
        document.getElementById('service-limits').innerText = `Min: ${service.min || 0} - Max: ${service.max || 0}`;
        
        // Show Description beautifully if it physically exists and is not empty
        if (service.description && service.description.trim() !== '') {
            descBox.innerHTML = `
                <div class="font-bold text-blue-800 mb-1"><i class="fa-solid fa-circle-info mr-1"></i> Service Details</div>
                ${service.description}
            `;
            descBox.classList.remove('hidden');
        } else {
            // Strictly hide it if there is no description
            descBox.classList.add('hidden');
        }
        submitBtn.disabled = false;
    }
}

function calculateCharge() {
    const srvId = document.getElementById('service-select').value;
    const qty = parseInt(document.getElementById('order-quantity').value) || 0;
    
    if (!srvId || qty <= 0) {
        document.getElementById('order-charge').value = window.formatMoney(0);
        return;
    }

    const service = allServices.find(s => s.id === srvId);
    if (service) {
        const ratePer1k = parseFloat(service.rate);
        const charge = (ratePer1k / 1000) * qty;
        document.getElementById('order-charge').value = window.formatMoney(charge);
    }
}

async function handlePlaceOrder(e) {
    e.preventDefault();
    if (!currentUser) return;

    // Standard HTML5 validation check for custom dropdown
    const catId = document.getElementById('category-select').value;
    if (!catId) {
        alert("Please select a category first.");
        return;
    }

    const notif = document.getElementById('order-notification');
    const btn = document.getElementById('submit-order-btn');
    
    const srvId = document.getElementById('service-select').value;
    const link = document.getElementById('order-link').value.trim();
    const qty = parseInt(document.getElementById('order-quantity').value);
    
    const service = allServices.find(s => s.id === srvId);
    if (!service) return;

    if (qty < parseInt(service.min) || qty > parseInt(service.max)) {
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-red-50 text-red-600 border border-red-100 block mt-4 shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> Quantity must be between ${service.min} and ${service.max}.`;
        return;
    }

    const charge = (parseFloat(service.rate) / 1000) * qty;

    if (currentBalance < charge) {
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-red-50 text-red-600 border border-red-100 block mt-4 shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-wallet mr-1"></i> Insufficient balance. Required: ${window.formatMoney(charge)}. <a href="#addfunds" class="underline font-bold hover:text-red-800">Add Funds</a>`;
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Order...';
    notif.classList.add('hidden');

    try {
        const orderData = {
            serviceId: service.id,
            serviceName: service.name,
            providerId: service.providerId || null,
            upstreamServiceId: service.serviceId || null,
            link: link,
            quantity: qty,
            charge: charge,
            status: 'Pending',
            createdAt: serverTimestamp()
        };

        // Save Order
        const orderRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'orders');
        await addDoc(orderRef, orderData);

        // Deduct Balance
        const statsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'stats');
        await updateDoc(statsRef, {
            balance: increment(-charge),
            totalSpent: increment(charge),
            totalOrders: increment(1)
        });

        // Show Success
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-green-50 text-green-700 border border-green-200 block mt-4 shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i> Order placed successfully! Thank you.`;
        
        // Form Reset Operations
        e.target.reset();
        
        // Reset Custom Category UI
        document.getElementById('category-select').value = '';
        document.getElementById('cat-dropdown-text').innerHTML = `
            <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-layer-group"></i></div>
            <span class="text-gray-500">-- Choose Category --</span>
        `;
        document.getElementById('cat-dropdown-text').classList.add('text-gray-500');
        document.getElementById('cat-dropdown-text').classList.remove('text-gray-900');
        
        // Reset Custom Service UI
        document.getElementById('service-select').value = '';
        const srvText = document.getElementById('srv-dropdown-text');
        srvText.innerHTML = `
            <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-gray-100"><i class="fa-solid fa-tags"></i></div>
            <span class="truncate block">Select a category first...</span>
        `;
        srvText.classList.add('text-gray-500');
        srvText.classList.remove('text-gray-900');
        document.getElementById('srv-dropdown-btn').disabled = true;
        document.getElementById('srv-dropdown-options').innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">No services available</div>';

        document.getElementById('service-description').classList.add('hidden');
        document.getElementById('order-charge').value = window.formatMoney(0);
        document.getElementById('service-limits').innerText = 'Min: 0 - Max: 0';

        setTimeout(() => { notif.classList.add('hidden'); }, 5000);

    } catch (error) {
        console.error("Order Error:", error);
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-red-50 text-red-600 border border-red-100 block mt-4 shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Failed to place order. Please try again.`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Place Order Now';
    }
}