import { 
    getFirestore, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allServices = [];
let allCategories = [];

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'services') return;
    renderServicesUI();
    fetchCategories();
    fetchServices();
});

function renderServicesUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Services & Pricing</h2>
            <p class="text-sm text-gray-500">Browse our complete catalog of social media marketing services.</p>
        </div>

        <div class="mb-6 bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex">
            <div class="pl-4 flex items-center text-gray-400"><i class="fa-solid fa-search"></i></div>
            <input type="text" id="search-services-input" placeholder="Search for a service..." class="w-full px-4 py-2 outline-none text-sm text-gray-700 bg-transparent">
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-700 whitespace-nowrap min-w-[900px]">
                    <thead class="bg-brand-500 text-white">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">ID</th>
                            <th class="px-6 py-4 font-semibold">Service Name</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Rate per 1000</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Min</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Max</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Details</th>
                        </tr>
                    </thead>
                    <tbody id="user-services-table-body">
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p class="font-medium">Loading services...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Service Description Modal -->
        <div id="service-desc-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mx-4 transform transition-transform scale-95" id="service-desc-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Service Details</h3>
                    <button id="close-desc-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div id="modal-desc-text" class="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto"></div>
            </div>
        </div>
    `;

    document.getElementById('search-services-input').addEventListener('input', renderServicesTable);
    document.getElementById('close-desc-modal-btn').addEventListener('click', closeDescModal);
    
    // Attach to window so table buttons can trigger it
    window.openDescModal = (desc) => {
        document.getElementById('modal-desc-text').innerText = desc || "No description provided.";
        const modal = document.getElementById('service-desc-modal');
        const content = document.getElementById('service-desc-content');
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
        allCategories = [];
        snapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));
        renderServicesTable();
    });
}

function fetchServices() {
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Active') allServices.push({ id: doc.id, ...data });
        });
        
        // Sort in memory by Category, then by ID
        allServices.sort((a, b) => {
            if (a.categoryId === b.categoryId) {
                return (a.serviceId || a.id).localeCompare(b.serviceId || b.id);
            }
            return (a.categoryId || '').localeCompare(b.categoryId || '');
        });
        
        renderServicesTable();
    });
}

function renderServicesTable() {
    const tableBody = document.getElementById('user-services-table-body');
    const searchInput = document.getElementById('search-services-input');
    if (!tableBody || allCategories.length === 0 || allServices.length === 0) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    let currentCategoryRendered = null;
    let visibleCount = 0;

    allServices.forEach(service => {
        if (service.name.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            // Add Category Header Row if it changes
            if (currentCategoryRendered !== service.categoryId) {
                const cat = allCategories.find(c => c.id === service.categoryId);
                const catName = cat ? cat.name : 'Other Services';
                
                tableBody.innerHTML += `
                    <tr class="bg-gray-100 border-b border-gray-200">
                        <td colspan="6" class="px-6 py-3 font-bold text-gray-800 text-sm">
                            <i class="fa-solid fa-folder-open text-brand-500 mr-2"></i> ${catName}
                        </td>
                    </tr>
                `;
                currentCategoryRendered = service.categoryId;
            }

            const displayId = service.serviceId || service.id.substring(0,4);
            const safeDesc = (service.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            tableBody.innerHTML += `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-4 font-mono text-gray-500">${displayId}</td>
                    <td class="px-6 py-4 font-semibold text-gray-800 whitespace-normal min-w-[250px]">${service.name}</td>
                    <td class="px-6 py-4 text-center font-bold text-brand-600">Rs ${Number(service.rate).toFixed(4)}</td>
                    <td class="px-6 py-4 text-center text-gray-500">${service.min}</td>
                    <td class="px-6 py-4 text-center text-gray-500">${service.max}</td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="window.openDescModal('${safeDesc}')" class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded transition-colors text-xs font-bold shadow-sm">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No services match your search.</td></tr>`;
    }
}