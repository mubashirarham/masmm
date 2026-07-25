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
let currentDiscount = 0;

// Helper to detect platform for icons with real-time style preset & admin custom logo support
function getPlatformLogo(categoryName) {
    const name = (categoryName || '').toLowerCase();
    const socialConfig = window.__socialIconsConfig || {};
    const stylePreset = socialConfig.style || '3d-gradient';
    const customPlatforms = socialConfig.platforms || [];
    const customLogos = socialConfig.customLogos || {};

    let styleClass = "w-8 h-8 rounded-lg shrink-0 p-1.5 flex items-center justify-center transition-all ";
    switch(stylePreset) {
        case 'minimal-flat':
            styleClass += "bg-slate-900 text-white border border-slate-800 shadow-sm";
            break;
        case 'neon-glass':
            styleClass += "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.4)]";
            break;
        case 'circle-solid':
            styleClass += "rounded-full bg-brand-600 text-white shadow-sm";
            break;
        case 'outline-stroke':
            styleClass += "border-2 border-slate-700 text-slate-800 bg-white shadow-sm";
            break;
        case '3d-gradient':
        default:
            styleClass += "bg-gradient-to-tr from-brand-500 via-emerald-500 to-teal-400 text-white shadow-md";
            break;
    }

    // 1. Check custom platform entry from Admin Panel
    const matchPlat = customPlatforms.find(p => p.name && name.includes(p.name.toLowerCase()));
    if (matchPlat && matchPlat.icon) {
        const isImg = matchPlat.icon.startsWith('http') || matchPlat.icon.startsWith('data:image');
        const iconHtml = isImg
            ? `<img src="${matchPlat.icon}" class="w-full h-full object-contain rounded" alt="${matchPlat.name}">`
            : `<i class="${matchPlat.icon} text-sm"></i>`;
        return { icon: iconHtml, styleClass };
    }

    // 2. Check custom logos mapping (Instagram, TikTok, YouTube, Facebook)
    let customImgUrl = null;
    if (name.includes('tiktok') && customLogos.tiktok) customImgUrl = customLogos.tiktok;
    else if ((name.includes('instagram') || name.includes('ig')) && customLogos.instagram) customImgUrl = customLogos.instagram;
    else if ((name.includes('youtube') || name.includes('yt')) && customLogos.youtube) customImgUrl = customLogos.youtube;
    else if ((name.includes('facebook') || name.includes('fb')) && customLogos.facebook) customImgUrl = customLogos.facebook;

    if (customImgUrl && customImgUrl.trim() !== '') {
        return {
            icon: `<img src="${customImgUrl}" class="w-full h-full object-contain rounded" alt="Logo">`,
            styleClass
        };
    }

    // 3. Fallback to SimpleIcons
    const renderSimpleSvg = (slug) => ({ 
        icon: `<img src="https://cdn.simpleicons.org/${slug}/ffffff" class="w-full h-full object-contain" alt="${slug}">`, 
        styleClass 
    });

    if (name.includes('tiktok')) return renderSimpleSvg('tiktok');
    if (name.includes('instagram') || name.includes('ig')) return renderSimpleSvg('instagram');
    if (name.includes('youtube') || name.includes('yt')) return renderSimpleSvg('youtube');
    if (name.includes('facebook') || name.includes('fb')) return renderSimpleSvg('facebook');
    if (name.includes('twitter') || name.includes('x')) return renderSimpleSvg('x');
    if (name.includes('telegram')) return renderSimpleSvg('telegram');
    if (name.includes('spotify')) return renderSimpleSvg('spotify');
    if (name.includes('linkedin')) return renderSimpleSvg('linkedin');
    if (name.includes('discord')) return renderSimpleSvg('discord');
    if (name.includes('twitch')) return renderSimpleSvg('twitch');
    if (name.includes('reddit')) return renderSimpleSvg('reddit');
    if (name.includes('pinterest')) return renderSimpleSvg('pinterest');
    if (name.includes('snapchat')) return renderSimpleSvg('snapchat');
    if (name.includes('threads')) return renderSimpleSvg('threads');

    return { icon: '<i class="fa-solid fa-layer-group text-sm"></i>', styleClass };
}

window.addEventListener('social-icons-updated', () => {
    if (document.getElementById('cat-dropdown-options')) {
        fetchCategories();
    }
});

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
        <div class="mb-8 bg-gradient-to-r from-brand-500 to-emerald-600 rounded-[24px] p-6 sm:p-8 text-white shadow-md relative overflow-hidden animate-fade-in-up">
            <div class="relative z-10">
                <h2 class="text-3xl font-extrabold mb-1 tracking-tight">Welcome back, <span id="welcome-username">User</span>! 👋</h2>
                <p class="text-emerald-50 text-sm max-w-2xl opacity-90 font-medium">Boost your social media presence instantly. Select a service below to place your order.</p>
            </div>
            <i class="fa-solid fa-chart-line absolute -bottom-6 -right-2 text-[8rem] text-white/10 transform -rotate-12"></i>
        </div>

        <!-- Top Statistics Panel -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            <div class="glass-card rounded-[20px] p-5 flex items-center gap-4 hover:-translate-y-1 transition-all duration-200 cursor-default bg-white/80 border border-slate-200/80 shadow-sm">
                <div class="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0 border border-emerald-100"><i class="fa-solid fa-wallet"></i></div>
                <div class="min-w-0">
                    <p class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-0.5">Available Balance</p>
                    <h3 id="stat-balance" class="text-2xl font-black text-slate-900 truncate tracking-tight">...</h3>
                </div>
            </div>
            <div class="glass-card rounded-[20px] p-5 flex items-center gap-4 hover:-translate-y-1 transition-all duration-200 cursor-default bg-white/80 border border-slate-200/80 shadow-sm">
                <div class="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-xl shrink-0 border border-sky-100"><i class="fa-solid fa-receipt"></i></div>
                <div class="min-w-0">
                    <p class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-0.5">Total Spent</p>
                    <h3 id="stat-spent" class="text-2xl font-black text-slate-900 truncate tracking-tight">...</h3>
                </div>
            </div>
            <div class="glass-card rounded-[20px] p-5 flex items-center gap-4 hover:-translate-y-1 transition-all duration-200 cursor-default bg-white/80 border border-slate-200/80 shadow-sm">
                <div class="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl shrink-0 border border-purple-100"><i class="fa-solid fa-box-open"></i></div>
                <div class="min-w-0">
                    <p class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-0.5">Total Orders</p>
                    <h3 id="stat-orders" class="text-2xl font-black text-slate-900 truncate tracking-tight">0</h3>
                </div>
            </div>
        </div>

        <div class="max-w-4xl mx-auto w-full z-10 relative">
            
            <!-- Centered New Order Form -->
            <div class="glass-card rounded-[24px] shadow-lg p-6 sm:p-8 relative bg-white/90 border border-slate-200/80 animate-fade-in-up">

                <h3 class="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center text-base"><i class="fa-solid fa-cart-plus"></i></div> 
                    Place New Order
                </h3>

                <form id="new-order-form" class="space-y-5">
                    
                    <!-- Custom Category Dropdown Row -->
                    <div class="relative w-full z-20">
                        <label class="block text-xs font-bold tracking-wider uppercase text-slate-700 mb-1.5">Category <span class="text-brand-600">*</span></label>
                        <div class="relative">
                            <button type="button" id="cat-dropdown-btn" class="w-full px-4 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/80 flex items-center justify-between transition-all text-sm font-semibold cursor-pointer text-slate-800">
                                <span id="cat-dropdown-text" class="flex items-center gap-2.5 text-slate-700">
                                    <div class="w-5 h-5 rounded bg-slate-200/80 flex items-center justify-center shrink-0 text-brand-600 text-xs"><i class="fa-solid fa-list"></i></div>
                                    -- Select Category --
                                </span>
                                <i class="fa-solid fa-chevron-down text-slate-500 transition-transform duration-200 text-xs" id="cat-dropdown-arrow"></i>
                            </button>
                            <div id="cat-dropdown-menu" class="hidden absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto z-50">
                                <div class="p-1" id="cat-dropdown-options">
                                    <div class="p-3 text-sm text-slate-500 text-center font-medium">Loading categories...</div>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="category-select" required>
                    </div>

                    <!-- Custom Service Dropdown Row -->
                    <div class="relative w-full z-10">
                        <label class="block text-xs font-bold tracking-wider uppercase text-slate-700 mb-1.5">Service <span class="text-brand-600">*</span></label>
                        <div class="relative">
                            <button type="button" id="srv-dropdown-btn" class="w-full px-4 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-slate-50/80 flex items-center justify-between transition-all text-sm font-semibold cursor-pointer text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                <span id="srv-dropdown-text" class="flex items-center gap-2.5 text-slate-700 overflow-hidden">
                                    <div class="w-5 h-5 rounded bg-slate-200/80 flex items-center justify-center shrink-0 text-brand-600 text-xs"><i class="fa-solid fa-tag"></i></div>
                                    <span class="truncate block">Select category first...</span>
                                </span>
                                <i class="fa-solid fa-chevron-down text-slate-500 transition-transform duration-200 shrink-0 text-xs" id="srv-dropdown-arrow"></i>
                            </button>
                            <div id="srv-dropdown-menu" class="hidden absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto z-50">
                                <div class="p-1 flex flex-col gap-1" id="srv-dropdown-options">
                                    <div class="p-3 text-sm text-slate-500 text-center font-medium">No services available</div>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="service-select" required>
                        
                        <!-- Description Box -->
                        <div id="service-description" class="hidden mt-2.5 p-3.5 bg-brand-50/60 border-l-4 border-brand-500 rounded-r-xl text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            <!-- Populated by JS -->
                        </div>
                    </div>

                    <!-- Link Row -->
                    <div>
                        <label class="block text-xs font-bold tracking-wider uppercase text-slate-700 mb-1.5">Link / URL <span class="text-brand-600">*</span></label>
                        <div class="relative">
                            <i class="fa-solid fa-link absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm"></i>
                            <input type="url" id="order-link" placeholder="https://..." required class="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/80 focus:bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-sm">
                        </div>
                    </div>

                    <!-- Quantity & Charge Row -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <div class="relative z-0">
                            <label class="block text-xs font-bold tracking-wider uppercase text-slate-700 mb-1.5">Quantity <span class="text-brand-600">*</span></label>
                            <input type="number" id="order-quantity" placeholder="1000" required class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-base font-bold">
                            <div class="flex justify-between items-center mt-1.5 px-1 text-[11px] font-medium text-slate-500">
                                <span id="service-limits">Limits: 0 - 0</span>
                            </div>
                        </div>
                        <div class="relative z-0">
                            <label class="block text-xs font-bold tracking-wider uppercase text-slate-700 mb-1.5">Total Charge</label>
                            <input type="text" id="order-charge" readonly value="" class="w-full px-4 py-3 rounded-xl border border-brand-200 bg-brand-50/50 text-brand-700 font-extrabold outline-none cursor-not-allowed text-base tracking-wide">
                        </div>
                    </div>

                    <!-- Drip Feed Toggle -->
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200/80 transition-colors">
                        <div>
                            <p class="font-bold text-slate-900 text-sm">Drip-Feed Option</p>
                            <p class="text-xs text-slate-500">Deliver order automatically in intervals.</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="drip-feed-checkbox" class="sr-only peer">
                            <div class="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                        </label>
                    </div>

                    <!-- Drip Feed Options -->
                    <div id="drip-feed-options" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-4 bg-brand-50/40 p-4 rounded-xl border border-brand-200">
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-700 mb-1.5">Runs (Splits)</label>
                            <input type="number" id="order-runs" value="2" min="2" class="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 outline-none text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-700 mb-1.5">Interval (Minutes)</label>
                            <input type="number" id="order-interval" value="60" min="1" class="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20 outline-none text-sm">
                        </div>
                        <div class="sm:col-span-2">
                            <div class="flex justify-between items-center text-xs font-bold bg-white p-3 rounded-lg border border-slate-200">
                                <span class="text-slate-600">Total Quantity:</span>
                                <span id="drip-feed-total-qty" class="text-brand-600 font-bold text-sm">0</span>
                            </div>
                        </div>
                    </div>

                    <div id="order-notification" class="hidden text-sm px-4 py-3 rounded-xl font-bold"></div>

                    <div class="pt-2">
                        <button type="submit" id="submit-order-btn" class="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50">
                            <i class="fa-solid fa-paper-plane text-sm"></i> Submit Order
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

    // Drip Feed Handlers
    const dripCheck = document.getElementById('drip-feed-checkbox');
    const dripOptions = document.getElementById('drip-feed-options');
    dripCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            dripOptions.classList.remove('hidden');
        } else {
            dripOptions.classList.add('hidden');
        }
        calculateCharge();
    });

    document.getElementById('order-runs').addEventListener('input', calculateCharge);
    document.getElementById('order-interval').addEventListener('input', calculateCharge);
    
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
            currentDiscount = parseFloat(data.discount || 0);
            
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
                        <div class="${platform.styleClass}">
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
        
        // Sort explicitly by numeric sort field, fallback to oldest order logically
        allServices.sort((a, b) => {
            if (a.sort !== undefined && b.sort !== undefined) {
                return a.sort - b.sort;
            }
            if (a.sort !== undefined) return -1;
            if (b.sort !== undefined) return 1;
            
            const timeA = a.createdAt?.seconds || (a.updatedAt?.seconds || 0);
            const timeB = b.createdAt?.seconds || (b.updatedAt?.seconds || 0);
            return timeA - timeB; // New UI prefers older items first as generic fallback
        });
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
    document.getElementById('drip-feed-checkbox').checked = false;
    document.getElementById('drip-feed-options').classList.add('hidden');
    document.getElementById('order-runs').value = '2';
    document.getElementById('order-interval').value = '60';
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
        const actualRate = srv.rate * (1 - (currentDiscount / 100));
        let rateDisplay = `${window.formatMoney(actualRate)}/1k`;
        
        if (currentDiscount > 0) {
            rateDisplay = `<span class="line-through text-gray-400 mr-1 opacity-70">${window.formatMoney(srv.rate)}</span> ${window.formatMoney(actualRate)}/1k <i class="fa-solid fa-fire text-orange-500 ml-1" title="${currentDiscount}% VIP Discount Applied"></i>`;
        }

        srvOptions.innerHTML += `
            <div class="srv-option flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-800 transition-colors border border-transparent hover:border-gray-200" data-value="${srv.id}">
                <div class="w-8 h-8 rounded-lg ${platform.bg} flex items-center justify-center shrink-0 shadow-sm p-1.5" style="color: ${platform.color}">
                    ${platform.icon}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm leading-tight text-gray-900 mb-1">${srv.name}</p>
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                            ${rateDisplay}
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
        document.getElementById('drip-feed-total-qty').innerText = "0";
        return;
    }

    const service = allServices.find(s => s.id === srvId);
    if (service) {
        const isDripFeed = document.getElementById('drip-feed-checkbox').checked;
        const runs = isDripFeed ? (parseInt(document.getElementById('order-runs').value) || 1) : 1;
        const totalQty = qty * runs;
        
        document.getElementById('drip-feed-total-qty').innerText = totalQty.toLocaleString();

        const actualRate = parseFloat(service.rate) * (1 - (currentDiscount / 100));
        const charge = (actualRate / 1000) * totalQty;
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

    const isDripFeed = document.getElementById('drip-feed-checkbox').checked;
    const runs = isDripFeed ? parseInt(document.getElementById('order-runs').value) : null;
    const interval = isDripFeed ? parseInt(document.getElementById('order-interval').value) : null;

    if (isDripFeed && (isNaN(runs) || runs < 2 || isNaN(interval) || interval < 1)) {
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-red-50 text-red-600 border border-red-100 block mt-4 shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> Invalid drip-feed parameters.`;
        return;
    }

    const totalQty = isDripFeed ? (qty * runs) : qty;

    const actualRate = parseFloat(service.rate) * (1 - (currentDiscount / 100));
    const charge = (actualRate / 1000) * totalQty;

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
            _original_rate: service._original_rate || null,
            _pkr_exchange_rate: service._pkr_exchange_rate || null,
            link: link,
            quantity: totalQty, // final quantity deducted and registered
            charge: charge,
            status: 'Pending',
            dripFeed: isDripFeed,
            runs: isDripFeed ? runs : null,
            interval: isDripFeed ? interval : null,
            baseQuantity: isDripFeed ? qty : null, // quantity per run
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

        document.getElementById('drip-feed-checkbox').checked = false;
        document.getElementById('drip-feed-options').classList.add('hidden');
        document.getElementById('order-runs').value = '2';
        document.getElementById('order-interval').value = '60';

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