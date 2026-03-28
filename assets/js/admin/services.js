import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allServices = [];
let allCategories = [];

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
                <h2 class="text-2xl font-bold text-gray-800">Service Management</h2>
                <p class="text-sm text-gray-500">Create and manage SMM services, rates, and descriptions.</p>
            </div>
            <div class="w-full sm:w-auto flex flex-wrap gap-2">
                <div class="relative flex-1 sm:w-64">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-services" placeholder="Search services..." class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
                <button id="open-bulk-pricing-modal" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <i class="fa-solid fa-percent"></i> Global Markup
                </button>
                <button id="open-add-service-modal" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <i class="fa-solid fa-plus"></i> Add Service
                </button>
            </div>
        </div>

        <!-- Services Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-20">ID</th>
                            <th class="px-6 py-4 font-semibold">Service Name</th>
                            <th class="px-6 py-4 font-semibold">Category</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Rate/1k</th>
                            <th class="px-6 py-4 font-semibold text-center w-20">Min</th>
                            <th class="px-6 py-4 font-semibold text-center w-20">Max</th>
                            <th class="px-6 py-4 font-semibold text-right w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-services-table-body">
                        <tr>
                            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading services...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Service Modal -->
        <div id="add-service-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 mx-4 transform transition-transform scale-95 overflow-y-auto max-h-[90vh]" id="add-service-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800">Add New Service</h3>
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
    `;

    // Search Listener
    const searchInput = document.getElementById('admin-search-services');
    if (searchInput) {
        searchInput.addEventListener('input', renderServicesTable);
    }

    // Modal Logic
    const modal = document.getElementById('add-service-modal');
    const content = document.getElementById('add-service-content');
    const openBtn = document.getElementById('open-add-service-modal');
    const closeBtn = document.getElementById('close-service-modal-btn');
    const cancelBtn = document.getElementById('cancel-service-btn');
    const form = document.getElementById('add-service-form');

    const openModal = () => {
        form.reset();
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
    };

    openBtn.addEventListener('click', openModal);
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

    // Handle Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submit-service-btn');
        const serviceData = {
            name: document.getElementById('new-service-name').value.trim(),
            categoryId: document.getElementById('new-service-category').value,
            rate: parseFloat(document.getElementById('new-service-rate').value),
            min: parseInt(document.getElementById('new-service-min').value),
            max: parseInt(document.getElementById('new-service-max').value),
            averageTime: document.getElementById('new-service-time').value.trim(),
            serviceId: document.getElementById('new-service-internal-id').value.trim(),
            description: document.getElementById('new-service-desc').value.trim(),
            status: 'Active',
            createdAt: serverTimestamp()
        };

        if (!serviceData.name || !serviceData.categoryId) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
            await addDoc(servicesRef, serviceData);
            closeModal();
        } catch (error) {
            console.error("Error adding service: ", error);
            alert("Failed to add service.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Save Service</span>';
        }
    });

    // Delete Helper
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
        
        // Sort in memory (Newest first). Fallback to updatedAt if createdAt is missing.
        allServices.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : (a.updatedAt ? a.updatedAt.toMillis() : 0);
            const timeB = b.createdAt ? b.createdAt.toMillis() : (b.updatedAt ? b.updatedAt.toMillis() : 0);
            return timeB - timeA;
        });
        
        renderServicesTable();
    });
}

function renderServicesTable() {
    const tableBody = document.getElementById('admin-services-table-body');
    const searchInput = document.getElementById('admin-search-services');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allServices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No services found.</td></tr>`;
        return;
    }

    let visibleCount = 0;

    allServices.forEach(service => {
        if (service.name.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            const category = allCategories.find(c => c.id === service.categoryId);
            const catName = category ? category.name : 'Unknown';
            const displayId = service.serviceId || service.id.substring(0,4);

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors text-xs sm:text-sm";
            row.innerHTML = `
                <td class="px-6 py-4 font-mono text-gray-500">${displayId}</td>
                <td class="px-6 py-4 font-bold text-gray-800 whitespace-normal min-w-[200px]">${service.name}</td>
                <td class="px-6 py-4 text-gray-600">${catName}</td>
                <td class="px-6 py-4 text-center font-bold text-brand-600">Rs ${Number(service.rate).toFixed(4)}</td>
                <td class="px-6 py-4 text-center text-gray-500">${service.min}</td>
                <td class="px-6 py-4 text-center text-gray-500">${service.max}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="window.deleteService('${service.id}', '${service.name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No matches.</td></tr>`;
    }
}