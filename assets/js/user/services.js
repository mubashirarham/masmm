import { 
    getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';
import { CacheManager } from '../cache.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allServices = CacheManager.get('services', []);
let allCategories = CacheManager.get('categories', []);
let currentPage = 1;
const rowsPerPage = 30;

window.addEventListener('user-section-load', async (e) => {
    if (e.detail.section !== 'services') return;
    renderServicesUI();

    // Instant Render from Local/Preload Cache
    if (allServices.length > 0 && allCategories.length > 0) {
        renderServicesTable();
    } else {
        const preloaded = await CacheManager.preloadStaticCatalog();
        if (preloaded) {
            allServices = preloaded.services;
            allCategories = preloaded.categories;
            renderServicesTable();
        }
    }

    // Silent background live sync with Firestore
    fetchCategories();
    fetchServices();
});

function renderServicesUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">Services & Pricing</h2>
            <p class="text-sm text-slate-600 font-medium">Browse our complete catalog of social media marketing services with real-time rates.</p>
        </div>

        <div class="mb-6 bg-white p-3 rounded-2xl shadow-sm border border-slate-300 flex items-center">
            <div class="pl-3 pr-2 flex items-center text-slate-400"><i class="fa-solid fa-search text-base"></i></div>
            <input type="text" id="search-services-input" placeholder="Search for a service by name or keyword..." class="w-full px-3 py-1.5 outline-none text-sm text-slate-900 bg-transparent font-sans">
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-700 whitespace-nowrap min-w-[900px]">
                    <thead class="bg-slate-100 text-slate-800 border-b-2 border-slate-300 sticky top-0">
                        <tr>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider w-24">ID</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider">Service Name</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-36">Rate / 1000</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-24">Min</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-24">Max</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-28">Details</th>
                        </tr>
                    </thead>
                    <tbody id="user-services-table-body">
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p class="font-bold">Loading services...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="services-pagination-container" class="border-t border-slate-200 bg-slate-50 p-4"></div>
        </div>

        <!-- Service Description Modal -->
        <div id="service-desc-modal" class="fixed inset-0 bg-slate-900/60 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-300 transform transition-transform scale-95" id="service-desc-content">
                <div class="flex justify-between items-center mb-4 border-b border-slate-200 pb-3">
                    <h3 class="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <i class="fa-solid fa-circle-info text-brand-500"></i> <span id="modal-service-name">Service Details</span>
                    </h3>
                    <button id="close-desc-modal-btn" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer">
                        <i class="fa-solid fa-xmark text-base"></i>
                    </button>
                </div>
                <div id="modal-badges-container" class="flex flex-wrap gap-2 mb-3"></div>
                <div id="modal-desc-text" class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto font-normal bg-slate-50 p-4 rounded-xl border border-slate-200"></div>
            </div>
        </div>
    `;

    document.getElementById('search-services-input').addEventListener('input', () => {
        currentPage = 1;
        renderServicesTable();
    });
    document.getElementById('close-desc-modal-btn').addEventListener('click', closeDescModal);
    
    // Attach to window so table buttons can trigger it
    window.openDescModal = (serviceId) => {
        const srv = allServices.find(s => (s.serviceId === serviceId || s.id === serviceId));
        const modal = document.getElementById('service-desc-modal');
        const content = document.getElementById('service-desc-content');
        const titleEl = document.getElementById('modal-service-name');
        const badgesEl = document.getElementById('modal-badges-container');
        const descEl = document.getElementById('modal-desc-text');

        if (srv) {
            titleEl.innerText = srv.name;
            badgesEl.innerHTML = `
                <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                    Rate: ${window.formatMoney(srv.rate)} / 1k
                </span>
                <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                    Min: ${srv.min} | Max: ${srv.max}
                </span>
                ${srv.average_time != null ? `
                    <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <i class="fa-solid fa-clock mr-1"></i> Avg: ${srv.average_time} min
                    </span>
                ` : ''}
                ${srv.refill ? `
                    <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <i class="fa-solid fa-arrows-rotate mr-1"></i> Refill Guaranteed
                    </span>
                ` : `
                    <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        No Refill
                    </span>
                `}
                ${srv.cancel ? `
                    <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        <i class="fa-solid fa-ban mr-1"></i> Cancel Enabled
                    </span>
                ` : ''}
            `;
            descEl.innerText = srv.description || srv.desc || "No special instructions provided for this service. Follow standard link and public profile guidelines.";
        } else {
            titleEl.innerText = "Service Details";
            badgesEl.innerHTML = '';
            descEl.innerText = "No details available.";
        }

        modal.classList.remove('hidden');
        setTimeout(() => content.classList.remove('scale-95'), 10);
    };
}

function closeDescModal() {
    const modal = document.getElementById('service-desc-modal');
    const content = document.getElementById('service-desc-content');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 150);
}

function fetchCategories() {
    const catsRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    onSnapshot(catsRef, (snapshot) => {
        const fresh = [];
        snapshot.forEach(doc => fresh.push({ id: doc.id, ...doc.data() }));
        fresh.sort((a, b) => (a.sort || 99) - (b.sort || 99));
        
        allCategories = fresh;
        CacheManager.set('categories', fresh);
        renderServicesTable();
    });
}

function fetchServices() {
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        const fresh = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Active') fresh.push({ id: doc.id, ...data });
        });
        
        // Sort in memory by Category, then by ID
        fresh.sort((a, b) => {
            if (a.categoryId === b.categoryId) {
                return (a.serviceId || a.id).localeCompare(b.serviceId || b.id);
            }
            return (a.categoryId || '').localeCompare(b.categoryId || '');
        });
        
        allServices = fresh;
        CacheManager.set('services', fresh);
        renderServicesTable();
    });
}

// Helper to normalize Unicode stylized text (e.g. 𝐓𝐢𝐤𝐓𝐨𝐤 -> tiktok)
function normalizeText(text) {
    return (text || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Helper to detect platform for icons with real-time style preset & admin custom logo support
function getPlatformLogo(categoryName) {
    const rawName = categoryName || '';
    const name = normalizeText(rawName);
    const socialConfig = window.__socialIconsConfig || {};
    const stylePreset = socialConfig.style || '3d-gradient';
    const customPlatforms = socialConfig.platforms || [];
    const customLogos = socialConfig.customLogos || {};

    let styleClass = "w-6 h-6 rounded shrink-0 p-1 flex items-center justify-center transition-all inline-flex mr-2.5 align-middle ";
    switch(stylePreset) {
        case 'minimal-flat':
            styleClass += "bg-slate-900 text-white border border-slate-800 shadow-sm";
            break;
        case 'neon-glass':
            styleClass += "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.4)]";
            break;
        case 'circle-solid':
            styleClass += "rounded-full bg-brand-600 text-white shadow-sm";
            break;
        case 'outline-stroke':
            styleClass += "border-2 border-slate-700 text-slate-800 bg-white shadow-sm";
            break;
        case '3d-gradient':
        default:
            styleClass += "bg-gradient-to-tr from-brand-500 to-emerald-600 text-white shadow-sm";
            break;
    }

    const renderSimpleSvg = (slug, fallbackFa) => {
        const logoData = customLogos[slug];
        if (logoData && logoData.startsWith('data:image')) {
            return { icon: `<img src="${logoData}" class="w-full h-full object-contain" />`, styleClass };
        }
        return { icon: `<img src="https://cdn.simpleicons.org/${slug}/ffffff" class="w-full h-full object-contain" onerror="this.outerHTML='<i class=\\'${fallbackFa}\\' text-xs></i>'" />`, styleClass };
    };

    if (name.includes('tiktok')) return renderSimpleSvg('tiktok', 'fa-brands fa-tiktok');
    if (name.includes('instagram') || name.includes('ig') || name.includes('reels')) return renderSimpleSvg('instagram', 'fa-brands fa-instagram');
    if (name.includes('youtube') || name.includes('yt') || name.includes('shorts')) return renderSimpleSvg('youtube', 'fa-brands fa-youtube');
    if (name.includes('facebook') || name.includes('fb')) return renderSimpleSvg('facebook', 'fa-brands fa-facebook-f');
    if (name.includes('telegram') || name.includes('tg')) return renderSimpleSvg('telegram', 'fa-brands fa-telegram');
    if (name.includes('twitter') || name.includes('x »') || name.includes('x.com') || name.includes('retweet')) return renderSimpleSvg('x', 'fa-brands fa-x-twitter');
    if (name.includes('spotify')) return renderSimpleSvg('spotify', 'fa-brands fa-spotify');
    if (name.includes('discord')) return renderSimpleSvg('discord', 'fa-brands fa-discord');
    if (name.includes('threads')) return renderSimpleSvg('threads', 'fa-brands fa-threads');
    if (name.includes('snapchat') || name.includes('snap')) return renderSimpleSvg('snapchat', 'fa-brands fa-snapchat');
    if (name.includes('linkedin')) return renderSimpleSvg('linkedin', 'fa-brands fa-linkedin');
    if (name.includes('pinterest')) return renderSimpleSvg('pinterest', 'fa-brands fa-pinterest');
    if (name.includes('reddit')) return renderSimpleSvg('reddit', 'fa-brands fa-reddit');
    if (name.includes('twitch')) return renderSimpleSvg('twitch', 'fa-brands fa-twitch');
    if (name.includes('soundcloud')) return renderSimpleSvg('soundcloud', 'fa-brands fa-soundcloud');
    if (name.includes('whatsapp') || name.includes('wa')) return renderSimpleSvg('whatsapp', 'fa-brands fa-whatsapp');
    if (name.includes('traffic') || name.includes('website') || name.includes('visitor')) return { icon: '<i class="fa-solid fa-globe text-xs"></i>', styleClass };
    if (name.includes('google') || name.includes('review') || name.includes('map')) return renderSimpleSvg('google', 'fa-brands fa-google');
    if (name.includes('trustpilot')) return renderSimpleSvg('trustpilot', 'fa-solid fa-star');
    if (name.includes('kick')) return renderSimpleSvg('kick', 'fa-solid fa-bolt');

    return { icon: '<i class="fa-solid fa-folder-open text-xs"></i>', styleClass };
}

window.addEventListener('social-icons-updated', () => {
    if (document.getElementById('user-services-table-body')) {
        renderServicesTable();
    }
});

function renderServicesTable() {
    const tableBody = document.getElementById('user-services-table-body');
    const searchInput = document.getElementById('search-services-input');
    const paginationContainer = document.getElementById('services-pagination-container');
    if (!tableBody || allCategories.length === 0 || allServices.length === 0) return;

    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const searchNorm = normalizeText(searchTerm);
    tableBody.innerHTML = '';

    const filteredServices = allServices.filter(s => {
        if (!searchNorm) return true;
        const nameNorm = normalizeText(s.name);
        const catNorm = normalizeText(s.categoryName || '');
        const idMatch = String(s.serviceId || s.id || '').includes(searchNorm);
        return nameNorm.includes(searchNorm) || catNorm.includes(searchNorm) || idMatch;
    });
    
    // Check page bounds
    const totalPages = Math.ceil(filteredServices.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filteredServices.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let currentCategoryRendered = null;
    let visibleCount = 0;

    paginated.forEach(service => {
        visibleCount++;
        
        // Add Category Header Row if it changes
        if (currentCategoryRendered !== service.categoryId) {
            const cat = allCategories.find(c => c.id === service.categoryId);
            const catName = cat ? cat.name : 'Other Services';
            const platform = getPlatformLogo(catName);
            
            tableBody.innerHTML += `
                <tr class="bg-slate-100 border-y border-slate-300">
                    <td colspan="6" class="px-6 py-3 font-bold text-slate-900 text-sm">
                        <div class="flex items-center">
                            <span class="${platform.styleClass}">${platform.icon}</span>
                            <span>${catName}</span>
                        </div>
                    </td>
                </tr>
            `;
            currentCategoryRendered = service.categoryId;
        }

        const displayId = service.serviceId || service.id.substring(0,4);

        tableBody.innerHTML += `
            <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-mono text-slate-600 text-xs font-bold">${displayId}</td>
                <td class="px-6 py-4 whitespace-normal min-w-[280px]">
                    <div class="font-bold text-slate-900 text-sm leading-snug">${service.name}</div>
                    <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        ${service.average_time != null ? `
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <i class="fa-solid fa-clock text-[9px] mr-1"></i>${service.average_time}m avg
                            </span>
                        ` : ''}
                        ${service.refill ? `
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <i class="fa-solid fa-arrows-rotate text-[9px] mr-1"></i>Refill
                            </span>
                        ` : ''}
                        ${service.cancel ? `
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                <i class="fa-solid fa-ban text-[9px] mr-1"></i>Cancel
                            </span>
                        ` : ''}
                    </div>
                </td>
                <td class="px-6 py-4 text-center font-bold text-brand-600">${window.formatMoney(service.rate)}</td>
                <td class="px-6 py-4 text-center text-slate-600 font-medium">${service.min}</td>
                <td class="px-6 py-4 text-center text-slate-600 font-medium">${service.max}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="window.openDescModal('${service.id}')" class="text-slate-700 hover:text-brand-700 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold shadow-sm cursor-pointer">
                        Details
                    </button>
                </td>
            </tr>
        `;
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500 font-medium">No services match your search.</td></tr>`;
    }

    if(paginationContainer) {
        renderPagination(filteredServices.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderServicesTable();
        }, paginationContainer);
    }
}