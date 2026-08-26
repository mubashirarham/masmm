import { 
    getFirestore, 
    collection,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allServices = [];
let allCategories = [];
let currentEditingServiceId = null;
let currentPage = 1;
const rowsPerPage = 50;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'services') return;

    renderServicesUI();
    fetchCategories();
    fetchServices();
});

function renderServicesUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Services View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">Service Management</h2>
                <p class="text-sm text-slate-600 font-medium">Create and manage SMM services, rates, and descriptions.</p>
            </div>
            <div class="w-full sm:w-auto flex flex-wrap gap-2">
                <div class="relative flex-1 sm:w-64">
                    <i class="fa-solid fa-search absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input type="text" id="admin-search-services" placeholder="Search services..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-xs sm:text-sm font-sans bg-white shadow-sm">
                </div>
                <a href="clean-import.html" class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-4 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-xs shadow-md border border-emerald-700 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer">
                    <i class="fa-solid fa-cloud-arrow-down"></i> Wipe & Import PakSMMPanels (+50% PKR)
                </a>
                <button id="trigger-update-prices-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all flex items-center gap-2 whitespace-nowrap shadow-sm border border-emerald-700 cursor-pointer">
                    <i class="fa-solid fa-arrows-rotate"></i> Update Prices
                </button>
                <button id="open-bulk-pricing-modal" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm border border-blue-700 cursor-pointer">
                    <i class="fa-solid fa-percent"></i> Markup
                </button>
                <button id="open-smart-sort-modal" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm border border-purple-700 cursor-pointer">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Auto Sort
                </button>
                <button id="open-add-service-modal" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm border border-brand-600 cursor-pointer">
                    <i class="fa-solid fa-plus"></i> Add Service
                </button>
            </div>
        </div>

        <!-- Bulk Action Bar -->
        <div id="services-bulk-bar" class="hidden mb-4 p-3 bg-brand-50 border border-brand-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div class="flex items-center gap-3 text-xs font-black text-brand-900 uppercase tracking-wider">
                <i class="fa-solid fa-check-double text-brand-600 text-sm"></i>
                <span id="services-selected-count">0 services selected</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <button id="bulk-services-delete-btn" class="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-trash"></i> Delete Selected
                </button>
                <button id="bulk-services-status-btn" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-eye-slash"></i> Enable/Disable
                </button>
                <button id="bulk-services-price-btn" class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-calculator"></i> Bulk Update Prices
                </button>
            </div>
        </div>

        <!-- Services Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-700 whitespace-nowrap">
                    <thead class="bg-slate-100 text-slate-800 border-b-2 border-slate-300 sticky top-0">
                        <tr>
                            <th class="px-4 py-4 w-12 text-center">
                                <input type="checkbox" id="services-select-all" class="w-4 h-4 text-brand-500 rounded border-slate-300 cursor-pointer">
                            </th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider w-20">ID</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider">Service Name</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider">Category</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-24">Rate/1k</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-20">Min</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center w-20">Max</th>
                            <th class="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-services-table-body">
                        <tr>
                            <td colspan="8" class="px-6 py-12 text-center text-slate-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p class="font-bold">Loading services...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="admin-services-pagination-container" class="border-t border-slate-200 bg-slate-50 p-4"></div>
        </div>

        <!-- Add Service Modal -->
        <div id="add-service-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 mx-4 transform transition-transform scale-95 overflow-y-auto max-h-[90vh]" id="add-service-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800" id="modal-service-title">Add New Service</h3>
                    <button id="close-service-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <form id="add-service-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Service Name</label>
                            <input type="text" id="new-service-name" required placeholder="e.g. TikTok Video Views [Instant]" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                            <select id="new-service-category" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all">
                                <option value="">Select Category</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Rate (per 1000)</label>
                            <input type="number" step="0.0001" id="new-service-rate" required placeholder="0.8954" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Minimum Quantity</label>
                            <input type="number" id="new-service-min" value="100" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Maximum Quantity</label>
                            <input type="number" id="new-service-max" value="500000" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Sort Order (Optional)</label>
                            <input type="number" id="new-service-sort" value="10" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all" placeholder="10">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Average Time (Display)</label>
                            <input type="text" id="new-service-time" value="13 minutes" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Internal Service ID (Optional)</label>
                            <input type="text" id="new-service-internal-id" placeholder="2536" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                            <textarea id="new-service-desc" rows="3" placeholder="Enter service details, speed, quality..." class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all"></textarea>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-service-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="submit" id="submit-service-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
                            <span>Save Service</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Bulk Pricing Modal -->
        <div id="bulk-pricing-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden justify-center items-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform overflow-y-auto" id="bulk-pricing-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Global Markup Engine</h3>
                    <button id="close-bulk-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <div class="mb-4 text-sm text-gray-600">
                    Apply a universal profit margin multiplier across <b class="text-gray-800">ALL</b> active services. Note: this will overwrite individual service markups and recalculate exactly from the upstream base provider cost.
                </div>
                <div class="mb-5">
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Target Profit Margin (%)</label>
                    <div class="relative">
                        <input type="number" id="global-markup-pct" placeholder="20" value="20" class="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-lg text-gray-800">
                        <span class="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold mb-0.5">%</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-2"><i class="fa-solid fa-circle-info mr-1 text-blue-500"></i> Example: 20% margin calculates base prices at 1.2x.</p>
                </div>
                <button id="execute-bulk-pricing" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-blue-500/20 flex justify-center items-center">
                    <i class="fa-solid fa-bolt mr-2"></i> Apply Global Markup
                </button>
            </div>
        </div>

        <!-- Smart Sort Modal -->
        <div id="smart-sort-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden justify-center items-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform overflow-y-auto" id="smart-sort-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-wand-magic-sparkles text-purple-600 mr-2"></i>Smart Auto-Sort Engine</h3>
                    <button id="close-smart-sort-modal" class="text-gray-400 hover:text-red-500 transition-colors"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <div class="mb-4 text-sm text-gray-600">
                    Target specific platforms and service types to instantly apply them to a <b class="text-purple-700">custom position number</b> on your global panel list.
                </div>
                <div class="space-y-4 mb-6">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Target Platform Keyword</label>
                        <select id="sort-target-platform" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-semibold text-gray-800 bg-white">
                            <option value="any">-- Any Platform --</option>
                            <option value="tiktok">TikTok</option>
                            <option value="instagram">Instagram</option>
                            <option value="youtube">YouTube</option>
                            <option value="facebook">Facebook</option>
                            <option value="spotify">Spotify</option>
                            <option value="twitter">X / Twitter</option>
                            <option value="telegram">Telegram</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Target Service Type</label>
                        <select id="sort-target-type" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-semibold text-gray-800 bg-white">
                            <option value="any">-- Any Type --</option>
                            <option value="like">Likes</option>
                            <option value="view">Views</option>
                            <option value="follow">Followers</option>
                            <option value="comment">Comments</option>
                            <option value="subscribe">Subscribers</option>
                            <option value="share">Shares</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Target Priority Position (Sort Number)</label>
                        <input type="number" id="sort-target-priority" value="1" min="1" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-bold text-purple-700 bg-purple-50">
                        <p class="text-xs text-gray-500 mt-2"><i class="fa-solid fa-circle-info mr-1"></i> Matches will be pinned exactly to this number.</p>
                    </div>
                </div>
                <button id="execute-smart-sort" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-purple-500/20 flex justify-center items-center">
                    <i class="fa-solid fa-sort mr-2"></i> Apply Custom Sort Priority
                </button>
            </div>
        </div>
    `;

    // Manual Update Prices Button Listener
    const triggerUpdatePricesBtn = document.getElementById('trigger-update-prices-btn');
    if (triggerUpdatePricesBtn) {
        triggerUpdatePricesBtn.addEventListener('click', () => openBulkPriceModal());
    }

    // Search Listener
    const searchInput = document.getElementById('admin-search-services');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderServicesTable();
        });
    }

    // Modal Logic
    const modal = document.getElementById('add-service-modal');
    const content = document.getElementById('add-service-content');
    const openBtn = document.getElementById('open-add-service-modal');
    const closeBtn = document.getElementById('close-service-modal-btn');
    const cancelBtn = document.getElementById('cancel-service-btn');
    const form = document.getElementById('add-service-form');

    const openModal = (service = null) => {
        form.reset();
        
        if (service) {
            currentEditingServiceId = service.id;
            document.getElementById('modal-service-title').innerText = "Edit Service";
            document.getElementById('new-service-name').value = service.name || "";
            document.getElementById('new-service-category').value = service.categoryId || "";
            document.getElementById('new-service-rate').value = service.rate || 0;
            document.getElementById('new-service-min').value = service.min || 100;
            document.getElementById('new-service-max').value = service.max || 500000;
            document.getElementById('new-service-time').value = service.averageTime || "";
            document.getElementById('new-service-internal-id').value = service.serviceId || "";
            document.getElementById('new-service-desc').value = service.description || "";
            document.getElementById('new-service-sort').value = service.sort || 9999;
        } else {
            currentEditingServiceId = null;
            document.getElementById('modal-service-title').innerText = "Add New Service";
            document.getElementById('new-service-sort').value = allServices.length > 0 ? allServices.length + 1 : 10;
        }
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }, 10);
    };

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentEditingServiceId = null;
    };

    openBtn.addEventListener('click', () => openModal(null));
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Bulk Pricing Logic
    const bulkModal = document.getElementById('bulk-pricing-modal');
    const executeBulkBtn = document.getElementById('execute-bulk-pricing');
    
    document.getElementById('open-bulk-pricing-modal')?.addEventListener('click', () => {
        bulkModal.classList.remove('hidden');
        bulkModal.classList.add('flex');
    });

    document.getElementById('close-bulk-modal-btn')?.addEventListener('click', () => {
        bulkModal.classList.add('hidden');
        bulkModal.classList.remove('flex');
    });

    executeBulkBtn?.addEventListener('click', async () => {
        const pctInput = document.getElementById('global-markup-pct').value;
        const pct = parseFloat(pctInput);
        if (isNaN(pct) || pct < 0) {
            alert("Please enter a valid positive percentage.");
            return;
        }

        if(!confirm(`WARNING: Are you absolutely sure you want to enforce a ${pct}% standard profit margin across ALL services? This cannot be undone.`)) return;

        executeBulkBtn.disabled = true;
        executeBulkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Recalculating...';

        try {
            const token = await window.getAdminAuthToken();
            const res = await fetch(`/.netlify/functions/adminapi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    action: 'bulk_update_pricing',
                    markupPercentage: pct
                })
            });

            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Failed to bulk update pricing.');

            alert(`Successfully updated ${data.updatedCount} services to ${pct}% profit margin!`);
            bulkModal.classList.add('hidden');
            bulkModal.classList.remove('flex');
        } catch(e) {
            console.error(e);
            alert("Bulk Pricing Error: " + e.message);
        } finally {
            executeBulkBtn.disabled = false;
            executeBulkBtn.innerHTML = '<i class="fa-solid fa-bolt mr-2"></i> Apply Global Markup';
        }
    });

    // Smart Auto Sort Logic
    const sortModal = document.getElementById('smart-sort-modal');
    const executeSortBtn = document.getElementById('execute-smart-sort');
    
    document.getElementById('open-smart-sort-modal')?.addEventListener('click', () => {
        sortModal.classList.remove('hidden');
        sortModal.classList.add('flex');
    });

    document.getElementById('close-smart-sort-modal')?.addEventListener('click', () => {
        sortModal.classList.add('hidden');
        sortModal.classList.remove('flex');
    });

    executeSortBtn?.addEventListener('click', async () => {
        const platformInput = document.getElementById('sort-target-platform').value.toLowerCase();
        const typeInput = document.getElementById('sort-target-type').value.toLowerCase();
        const priorityInput = parseInt(document.getElementById('sort-target-priority').value) || 1;

        if(!confirm(`Push ${platformInput.toUpperCase()} ${typeInput.toUpperCase()} to position #${priorityInput}? Unselected services will NOT be modified.`)) return;

        executeSortBtn.disabled = true;
        executeSortBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Re-sorting Database...';

        try {
            const batches = [];
            let currentBatch = writeBatch(db);
            let operationCount = 0;

            const pushToBatch = (ref, docData) => {
                currentBatch.update(ref, docData);
                operationCount++;
                if (operationCount === 490) { // Limit chunks to 500 per Firebase constraints
                    batches.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    operationCount = 0;
                }
            };

            // 1. Sort Categories (Only prioritize selected platform)
            if (platformInput !== 'any') {
                for (const cat of allCategories) {
                    const name = cat.name.toLowerCase();
                    if (name.includes(platformInput)) {
                        const catRef = doc(db, 'artifacts', appId, 'public', 'data', 'categories', cat.id);
                        pushToBatch(catRef, { sort: priorityInput });
                    }
                }
            }

            // 2. Sort Services (Only target matching combinatorics)
            for (const srv of allServices) {
                const name = srv.name.toLowerCase();

                const platformMatches = platformInput === 'any' || name.includes(platformInput);
                const typeMatches = typeInput === 'any' || name.includes(typeInput);

                if (platformMatches && typeMatches) {
                    const srvRef = doc(db, 'artifacts', appId, 'public', 'data', 'services', srv.id);
                    pushToBatch(srvRef, { sort: priorityInput });
                }
            }

            // Flush remaining queue
            if (operationCount > 0) batches.push(currentBatch.commit());

            await Promise.all(batches);

            alert("Smart Sort Completed Successfully!");
            sortModal.classList.add('hidden');
            sortModal.classList.remove('flex');

        } catch(e) {
            console.error("Smart Sort Error:", e);
            alert("An error occurred during bulk sorting: " + e.message);
        } finally {
            executeSortBtn.disabled = false;
            executeSortBtn.innerHTML = '<i class="fa-solid fa-sort mr-2"></i> Apply Custom Sort Priority';
        }
    });

    // Handle Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submit-service-btn');
        const rateVal = parseFloat(document.getElementById('new-service-rate').value);
        const sortVal = parseInt(document.getElementById('new-service-sort').value) || 9999;
        
        const serviceData = {
            name: document.getElementById('new-service-name').value.trim(),
            categoryId: document.getElementById('new-service-category').value,
            rate: rateVal,
            min: parseInt(document.getElementById('new-service-min').value),
            max: parseInt(document.getElementById('new-service-max').value),
            averageTime: document.getElementById('new-service-time').value.trim(),
            serviceId: document.getElementById('new-service-internal-id').value.trim(),
            description: document.getElementById('new-service-desc').value.trim(),
            sort: sortVal,
            status: 'Active', // Default
        };

        if (!serviceData.name || !serviceData.categoryId) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            if (currentEditingServiceId) {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'services', currentEditingServiceId);
                serviceData.updatedAt = window.serverTimestamp ? window.serverTimestamp() : new Date(); // Using fallback date if serverTimestamp not explicitly fetched since we omitted it in imports. Wait, we imported doc not serverTimestamp, let me just not update timestamp or use Date.now()
                await updateDoc(docRef, serviceData);
            } else {
                serviceData.createdAt = new Date(); // Fast simple fallback instead of explicit serverTimestamp import
                const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
                await addDoc(servicesRef, serviceData);
            }
            closeModal();
        } catch (error) {
            console.error("Error saving service: ", error);
            alert("Failed to save service.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Save Service</span>';
        }
    });

    // Delete and Edit Helpers
    window.editService = (id) => {
        const svc = allServices.find(s => s.id === id);
        if (svc) openModal(svc);
    };

    window.deleteService = async (id, name) => {
        if(!confirm(`Delete service "${name}"?`)) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'services', id));
        } catch (error) {
            console.error("Error deleting: ", error);
            alert("Failed to delete.");
        }
    };
}

function fetchCategories() {
    const categoriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    onSnapshot(categoriesRef, (snapshot) => {
        allCategories = [];
        const select = document.getElementById('new-service-category');
        if (!select) return;

        select.innerHTML = '<option value="">Select Category</option>';
        snapshot.forEach(doc => {
            const cat = { id: doc.id, ...doc.data() };
            allCategories.push(cat);
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
        renderServicesTable(); // Refresh names in table
    });
}

function fetchServices() {
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    
    // We removed orderBy() so Firestore doesn't hide imported services missing the createdAt field
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => {
            allServices.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory by Explicit Sort Order, fallback to Old Newest-First
        allServices.sort((a, b) => {
            if (a.sort !== undefined && b.sort !== undefined) {
                return a.sort - b.sort;
            }
            if (a.sort !== undefined) return -1;
            if (b.sort !== undefined) return 1;
            
            const timeA = a.createdAt?.seconds || (a.updatedAt?.seconds || 0);
            const timeB = b.createdAt?.seconds || (b.updatedAt?.seconds || 0);
            return timeB - timeA;
        });
        
        renderServicesTable();
    });
}

function renderServicesTable() {
    const tableBody = document.getElementById('admin-services-table-body');
    const searchInput = document.getElementById('admin-search-services');
    const paginationContainer = document.getElementById('admin-services-pagination-container');
    const selectAllCb = document.getElementById('services-select-all');
    const bulkBar = document.getElementById('services-bulk-bar');
    const selectedCountEl = document.getElementById('services-selected-count');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allServices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-gray-500">No services found.</td></tr>`;
        return;
    }

    const filtered = allServices.filter(service => service.name.toLowerCase().includes(searchTerm));

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let visibleCount = 0;

    const updateBulkBar = () => {
        const checkedCbs = document.querySelectorAll('.service-select-cb:checked');
        const count = checkedCbs.length;
        if (count > 0) {
            bulkBar.classList.remove('hidden');
            selectedCountEl.innerText = `${count} service${count > 1 ? 's' : ''} selected`;
        } else {
            bulkBar.classList.add('hidden');
        }
        if (selectAllCb) {
            const allCbs = document.querySelectorAll('.service-select-cb');
            selectAllCb.checked = allCbs.length > 0 && checkedCbs.length === allCbs.length;
        }
    };

    paginated.forEach(service => {
        visibleCount++;
        
        const category = allCategories.find(c => c.id === service.categoryId);
        const catName = category ? category.name : 'Unknown';
        const displayId = service.serviceId || service.id.substring(0,4);

        const row = document.createElement('tr');
        row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors text-xs sm:text-sm";
        row.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" class="service-select-cb w-4 h-4 text-brand-500 rounded border-gray-300 cursor-pointer" data-id="${service.id}">
            </td>
            <td class="px-6 py-4 font-mono text-gray-500">${displayId}</td>
            <td class="px-6 py-4 font-bold text-gray-800 whitespace-normal min-w-[200px]">${service.name}</td>
            <td class="px-6 py-4 text-gray-600">${catName}</td>
            <td class="px-6 py-4 text-center font-bold text-brand-600">Rs ${Number(service.rate).toFixed(4)}</td>
            <td class="px-6 py-4 text-center text-gray-500">${service.min}</td>
            <td class="px-6 py-4 text-center text-gray-500">${service.max}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="window.editService('${service.id}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors mr-1">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="window.deleteService('${service.id}', '${service.name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;

        row.querySelector('.service-select-cb').addEventListener('change', updateBulkBar);
        tableBody.appendChild(row);
    });

    if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.onclick = (e) => {
            document.querySelectorAll('.service-select-cb').forEach(cb => cb.checked = e.target.checked);
            updateBulkBar();
        };
    }
    updateBulkBar();

    // Bulk Action Handlers
    const bulkDeleteBtn = document.getElementById('bulk-services-delete-btn');
    const bulkStatusBtn = document.getElementById('bulk-services-status-btn');
    const bulkPriceBtn = document.getElementById('bulk-services-price-btn');

    if (bulkDeleteBtn) {
        bulkDeleteBtn.onclick = async () => {
            const selectedIds = Array.from(document.querySelectorAll('.service-select-cb:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length === 0) return;
            if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected service(s)?`)) return;

            try {
                for (const srvId of selectedIds) {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'services', srvId));
                }
                alert(`Successfully deleted ${selectedIds.length} service(s).`);
            } catch (err) {
                console.error("Bulk service delete error:", err);
                alert("Failed to delete some services.");
            }
        };
    }

    if (bulkStatusBtn) {
        bulkStatusBtn.onclick = async () => {
            const selectedIds = Array.from(document.querySelectorAll('.service-select-cb:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length === 0) return;

            try {
                for (const srvId of selectedIds) {
                    const targetSrv = allServices.find(s => s.id === srvId);
                    const currentStatus = targetSrv ? targetSrv.status !== 'Disabled' : true;
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'services', srvId), {
                        status: currentStatus ? 'Disabled' : 'Active'
                    });
                }
                alert(`Successfully updated status for ${selectedIds.length} service(s).`);
            } catch (err) {
                console.error("Bulk service status error:", err);
                alert("Failed to update status for some services.");
            }
        };
    }

    if (bulkPriceBtn) {
        bulkPriceBtn.onclick = () => {
            openBulkPriceModal('selected');
        };
    }

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-gray-500">No matches.</td></tr>`;
    }

    if(paginationContainer) {
        renderPagination(filtered.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderServicesTable();
        }, paginationContainer);
    }
}

// Bulk Price Update Modal Helper
function openBulkPriceModal(defaultTarget = 'selected') {
    const selectedIds = Array.from(document.querySelectorAll('.service-select-cb:checked')).map(cb => cb.dataset.id);
    
    let modal = document.getElementById('bulk-price-modal');
    if (!modal) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'bulk-price-modal';
        modalDiv.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 z-[65] flex items-center justify-center backdrop-blur-sm transition-opacity';
        modalDiv.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-100" id="bulk-price-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-calculator text-brand-500 mr-2"></i> Update Prices</h3>
                    <button id="close-bulk-price-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                <!-- API Live Sync Banner -->
                <div class="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                    <div>
                        <p class="text-xs font-bold text-emerald-900"><i class="fa-solid fa-arrows-rotate text-emerald-600 mr-1"></i> Provider API Price Sync</p>
                        <p class="text-[11px] text-emerald-700 mt-0.5">Fetch latest rates from provider APIs and review price increases/drops.</p>
                    </div>
                    <button type="button" id="sync-api-prices-btn" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0">
                        <i class="fa-solid fa-cloud-arrow-down"></i> Sync API Prices
                    </button>
                </div>

                <div class="relative flex py-2 items-center mb-4">
                    <div class="flex-grow border-t border-gray-200"></div>
                    <span class="flex-shrink mx-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Or Manual Bulk Math</span>
                    <div class="flex-grow border-t border-gray-200"></div>
                </div>

                <form id="bulk-price-form" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold uppercase text-gray-600 mb-1">Target Scope</label>
                        <select id="bulk-price-target" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white">
                            <option value="selected">Selected Services (${selectedIds.length})</option>
                            <option value="all">All Services Platform-Wide (${allServices.length})</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold uppercase text-gray-600 mb-1">Adjustment Method</label>
                        <select id="bulk-price-type" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white">
                            <option value="percent">Percentage Change (+10% or -5%)</option>
                            <option value="fixed">Fixed Amount Change (+ Rs 5 or - Rs 2)</option>
                            <option value="multiply">Multiplier (Rate x 1.25)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold uppercase text-gray-600 mb-1">Value / Amount</label>
                        <input type="number" step="0.0001" id="bulk-price-value" required placeholder="e.g. 10 for +10%" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none text-sm font-bold">
                        <p class="text-[11px] text-gray-500 mt-1">Use positive numbers to increase, negative numbers to decrease.</p>
                    </div>

                    <div class="pt-3 border-t border-gray-100 flex justify-end gap-2">
                        <button type="button" id="close-bulk-price-modal-cancel" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm">Cancel</button>
                        <button type="submit" id="submit-bulk-price-btn" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-sm shadow-md flex items-center gap-2">
                            <i class="fa-solid fa-check"></i> Apply Manual Update
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modalDiv);
        modal = modalDiv;

        const closeBtn = document.getElementById('close-bulk-price-modal-btn');
        const cancelBtn = document.getElementById('close-bulk-price-modal-cancel');
        const form = document.getElementById('bulk-price-form');
        const syncApiBtn = document.getElementById('sync-api-prices-btn');

        const hideModal = () => modal.classList.add('hidden');
        closeBtn.onclick = hideModal;
        cancelBtn.onclick = hideModal;

        syncApiBtn.onclick = () => fetchAndCompareApiPrices(syncApiBtn);

        form.onsubmit = async (e) => {
            e.preventDefault();
            const targetScope = document.getElementById('bulk-price-target').value;
            const adjType = document.getElementById('bulk-price-type').value;
            const val = parseFloat(document.getElementById('bulk-price-value').value);
            const submitBtn = document.getElementById('submit-bulk-price-btn');

            if (isNaN(val)) return;

            let targetServices = [];
            if (targetScope === 'selected') {
                const currentSelectedIds = Array.from(document.querySelectorAll('.service-select-cb:checked')).map(cb => cb.dataset.id);
                targetServices = allServices.filter(s => currentSelectedIds.includes(s.id));
            } else {
                targetServices = allServices;
            }

            if (targetServices.length === 0) {
                alert("No services selected to update.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating Rates...';

            try {
                const batches = [];
                let currentBatch = writeBatch(db);
                let count = 0;

                for (const srv of targetServices) {
                    let currentRate = Number(srv.rate) || 0;
                    let newRate = currentRate;

                    if (adjType === 'percent') {
                        newRate = currentRate + (currentRate * (val / 100));
                    } else if (adjType === 'fixed') {
                        newRate = currentRate + val;
                    } else if (adjType === 'multiply') {
                        newRate = currentRate * val;
                    }

                    if (newRate < 0) newRate = 0;

                    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'services', srv.id);
                    currentBatch.update(ref, { rate: Number(newRate.toFixed(4)) });
                    count++;

                    if (count === 490) {
                        batches.push(currentBatch.commit());
                        currentBatch = writeBatch(db);
                        count = 0;
                    }
                }

                if (count > 0) batches.push(currentBatch.commit());

                await Promise.all(batches);
                alert(`Successfully updated prices for ${targetServices.length} service(s)!`);
                hideModal();
            } catch (err) {
                console.error("Bulk price update error:", err);
                alert("Failed to update prices: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Apply Manual Update';
            }
        };
    } else {
        modal.classList.remove('hidden');
    }
}

// --- FETCH & COMPARE API PRICES FUNCTION ---
async function fetchAndCompareApiPrices(btnElement) {
    const originalHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching APIs...';

    try {
        // 1. Fetch API Providers
        const providersRef = collection(db, 'artifacts', appId, 'api_providers');
        const providersSnap = await getDocs(providersRef);
        const providers = [];
        providersSnap.forEach(d => {
            const pData = d.data();
            if (pData.status !== 'Disabled') {
                providers.push({ id: d.id, ...pData });
            }
        });

        if (providers.length === 0) {
            alert("No active API providers found. Please configure API Providers in the API section first.");
            return;
        }

        // 2. Fetch remote service catalogs for all active providers
        const remoteCatalog = {}; // { providerId: { remoteServiceId: { name, rate, ... } } }
        for (const prov of providers) {
            try {
                const res = await fetch('/.netlify/functions/sync-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ providerId: prov.id, action: 'fetch_remote' })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.services)) {
                        remoteCatalog[prov.id] = {};
                        data.services.forEach(s => {
                            const rId = String(s.service || s.id);
                            remoteCatalog[prov.id][rId] = s;
                        });
                    }
                }
            } catch (err) {
                console.warn(`Failed to fetch services for provider ${prov.name}`, err);
            }
        }

        // 3. Match local services with remote provider catalog & detect price changes
        const priceChanges = [];
        allServices.forEach(srv => {
            if (!srv.providerId || !srv.apiServiceId) return;
            const provMap = remoteCatalog[srv.providerId];
            if (!provMap) return;

            const remoteSrv = provMap[String(srv.apiServiceId)];
            if (!remoteSrv) return;

            const oldCost = Number(srv.originalRate || srv.providerRate || srv.rate) || 0;
            const newCost = Number(remoteSrv.rate) || 0;

            if (newCost > 0 && Math.abs(newCost - oldCost) > 0.00001) {
                // Calculate suggested new selling price maintaining previous margin
                let currentRate = Number(srv.rate) || 0;
                let suggestedRate = currentRate;
                if (oldCost > 0) {
                    const marginMultiplier = currentRate / oldCost;
                    suggestedRate = newCost * marginMultiplier;
                } else {
                    suggestedRate = newCost * 1.5; // Default 50% markup fallback
                }

                const providerObj = providers.find(p => p.id === srv.providerId);
                priceChanges.push({
                    service: srv,
                    providerName: providerObj ? providerObj.name : 'Provider',
                    oldCost: oldCost,
                    newCost: newCost,
                    diff: newCost - oldCost,
                    currentRate: currentRate,
                    newRate: Number(suggestedRate.toFixed(4))
                });
            }
        });

        if (priceChanges.length === 0) {
            alert("✨ All imported services are up to date! No price changes detected from provider APIs.");
            return;
        }

        // Hide Bulk Modal and Open Review & Approval Modal
        const bulkModal = document.getElementById('bulk-price-modal');
        if (bulkModal) bulkModal.classList.add('hidden');

        renderPriceReviewModal(priceChanges);

    } catch (error) {
        console.error("API price comparison error:", error);
        alert("Failed to compare API prices: " + error.message);
    } finally {
        btnElement.disabled = false;
        btnElement.innerHTML = originalHtml;
    }
}

// --- RENDER PRICE REVIEW & APPROVAL MODAL ---
function renderPriceReviewModal(priceChanges) {
    let modal = document.getElementById('api-price-review-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'api-price-review-modal';
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-60 z-[70] flex items-center justify-center backdrop-blur-sm p-4';

    const increases = priceChanges.filter(c => c.diff > 0).length;
    const decreases = priceChanges.filter(c => c.diff < 0).length;

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
            <!-- Header -->
            <div class="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <i class="fa-solid fa-arrows-rotate text-emerald-400"></i> API Price Change Review & Approval
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">Detected ${priceChanges.length} provider price changes (${increases} price increases, ${decreases} price drops).</p>
                </div>
                <button id="close-review-modal-btn" class="text-slate-400 hover:text-white transition-colors">
                    <i class="fa-solid fa-xmark text-2xl"></i>
                </button>
            </div>

            <!-- Review Table -->
            <div class="flex-1 overflow-y-auto p-4">
                <table class="w-full text-left text-sm text-gray-700 whitespace-nowrap min-w-[700px]">
                    <thead class="bg-slate-100 text-slate-800 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th class="px-4 py-3 w-10 text-center">
                                <input type="checkbox" id="review-select-all" checked class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                            </th>
                            <th class="px-4 py-3 font-bold">Service Name</th>
                            <th class="px-4 py-3 font-bold text-center">Provider</th>
                            <th class="px-4 py-3 font-bold text-center">Current Rate</th>
                            <th class="px-4 py-3 font-bold text-center">Cost Change</th>
                            <th class="px-4 py-3 font-bold text-center w-36">New Panel Rate (PKR)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${priceChanges.map((change, idx) => {
                            const isIncrease = change.diff > 0;
                            const badge = isIncrease
                                ? `<span class="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-xs"><i class="fa-solid fa-arrow-up text-[10px]"></i> +${change.diff.toFixed(4)}</span>`
                                : `<span class="px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold text-xs"><i class="fa-solid fa-arrow-down text-[10px]"></i> ${change.diff.toFixed(4)}</span>`;

                            return `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-4 py-3 text-center">
                                        <input type="checkbox" class="review-cb rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" data-idx="${idx}" checked>
                                    </td>
                                    <td class="px-4 py-3 min-w-[200px]">
                                        <p class="font-bold text-slate-900 text-xs truncate max-w-xs">${change.service.name}</p>
                                        <p class="text-[10px] text-slate-500 font-mono">ID: ${change.service.serviceId || change.service.id}</p>
                                    </td>
                                    <td class="px-4 py-3 text-center text-xs font-semibold text-slate-600">${change.providerName}</td>
                                    <td class="px-4 py-3 text-center font-mono font-bold text-slate-800 text-xs">${window.formatMoney(change.currentRate)}</td>
                                    <td class="px-4 py-3 text-center whitespace-nowrap">
                                        <div class="text-[11px] text-slate-500 font-mono">${change.oldCost.toFixed(4)} &rarr; <b class="text-slate-900">${change.newCost.toFixed(4)}</b></div>
                                        <div class="mt-0.5">${badge}</div>
                                    </td>
                                    <td class="px-4 py-3 text-center">
                                        <input type="number" step="0.0001" value="${change.newRate}" data-idx="${idx}" class="review-new-rate w-32 px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-emerald-700 text-xs text-center focus:ring-2 focus:ring-emerald-500 outline-none">
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Footer Action Bar -->
            <div class="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
                <span class="text-xs font-bold text-slate-600" id="review-selected-count">
                    Selected: ${priceChanges.length} of ${priceChanges.length} service price updates
                </span>
                <div class="flex items-center gap-3">
                    <button id="cancel-review-btn" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button id="approve-review-btn" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2">
                        <i class="fa-solid fa-check-circle"></i> Approve & Update Selected Prices
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = document.getElementById('close-review-modal-btn');
    const cancelBtn = document.getElementById('cancel-review-btn');
    const approveBtn = document.getElementById('approve-review-btn');
    const selectAllCb = document.getElementById('review-select-all');

    const closeModal = () => modal.remove();
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    selectAllCb.onchange = (e) => {
        document.querySelectorAll('.review-cb').forEach(cb => cb.checked = e.target.checked);
        updateReviewCount();
    };

    document.querySelectorAll('.review-cb').forEach(cb => {
        cb.onchange = updateReviewCount;
    });

    function updateReviewCount() {
        const checked = document.querySelectorAll('.review-cb:checked').length;
        const countEl = document.getElementById('review-selected-count');
        if (countEl) countEl.innerText = `Selected: ${checked} of ${priceChanges.length} service price updates`;
    }

    approveBtn.onclick = async () => {
        const selectedCbs = Array.from(document.querySelectorAll('.review-cb:checked'));
        if (selectedCbs.length === 0) {
            alert("No price updates selected for approval.");
            return;
        }

        approveBtn.disabled = true;
        approveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating Firestore...';

        try {
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;

            selectedCbs.forEach(cb => {
                const idx = parseInt(cb.dataset.idx);
                const item = priceChanges[idx];
                const newRateInput = document.querySelector(`.review-new-rate[data-idx="${idx}"]`);
                const finalRate = newRateInput ? parseFloat(newRateInput.value) : item.newRate;

                const ref = doc(db, 'artifacts', appId, 'public', 'data', 'services', item.service.id);
                currentBatch.update(ref, {
                    rate: Number(finalRate.toFixed(4)),
                    originalRate: Number(item.newCost.toFixed(4)),
                    providerRate: Number(item.newCost.toFixed(4))
                });
                count++;

                if (count === 490) {
                    batches.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    count = 0;
                }
            });

            if (count > 0) batches.push(currentBatch.commit());
            await Promise.all(batches);

            alert(`✅ Successfully updated prices for ${selectedCbs.length} service(s)!`);
            closeModal();
        } catch (err) {
            console.error("Failed to apply approved price changes:", err);
            alert("Error updating prices: " + err.message);
        } finally {
            approveBtn.disabled = false;
            approveBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Approve & Update Selected Prices';
        }
    };
}