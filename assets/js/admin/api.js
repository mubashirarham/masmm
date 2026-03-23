import { 
    getFirestore, 
    collection, 
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    deleteDoc,
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allProviders = [];
let currentManagingProviderId = null;
let remoteServicesCache = [];
let localCategoriesCache = [];

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'api') return;

    renderApiUI();
    fetchProviders();
    fetchLocalCategories(); // Pre-fetch categories for the import modal
});

function renderApiUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the API Providers View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">API Providers</h2>
                <p class="text-sm text-gray-500">Manage external SMM panel providers and import services.</p>
            </div>
            <div class="w-full sm:w-auto flex gap-2">
                <button id="open-add-provider-modal" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <i class="fa-solid fa-plus"></i> Add Provider
                </button>
            </div>
        </div>

        <!-- Providers Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-48">Provider Name</th>
                            <th class="px-6 py-4 font-semibold">API URL</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-right w-48">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-providers-table-body">
                        <tr>
                            <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading API providers...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add/Edit Provider Modal -->
        <div id="manage-provider-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mx-4 transform transition-transform scale-95 overflow-y-auto max-h-[90vh]" id="manage-provider-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800" id="modal-provider-title">Add New Provider</h3>
                    <button id="close-provider-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <form id="manage-provider-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Provider Name</label>
                        <input type="text" id="provider-name" required placeholder="e.g., HQSmartPanel" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">API URL</label>
                        <input type="url" id="provider-url" required placeholder="https://example.com/api/v2" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        <p class="text-xs text-gray-500 mt-1">Must be the full endpoint URL ending in /api/v2</p>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">API Key</label>
                        <div class="relative">
                            <input type="password" id="provider-apikey" required placeholder="Enter your secret API key" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all pr-10">
                            <button type="button" id="toggle-apikey-vis" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                        <select id="provider-status" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                            <option value="Active">Active</option>
                            <option value="Disabled">Disabled</option>
                        </select>
                    </div>

                    <div id="provider-modal-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold mt-2"></div>

                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-provider-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="submit" id="save-provider-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm">
                            <span>Save Provider</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Advanced Import Services Modal -->
        <div id="import-services-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[70] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 flex flex-col max-h-[90vh]" id="import-services-content">
                
                <!-- Modal Header -->
                <div class="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">Import Services</h3>
                        <p class="text-sm text-gray-500" id="import-modal-subtitle">Select services to import into your panel</p>
                    </div>
                    <button id="close-import-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>
                
                <!-- Import Controls -->
                <div class="p-6 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Target Category <span class="text-red-500">*</span></label>
                        <select id="import-target-category" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                            <option value="">-- Select Local Category --</option>
                            <!-- Populated dynamically -->
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Profit Markup (%)</label>
                        <div class="relative">
                            <input type="number" id="import-markup" value="150" min="100" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm pl-8">
                            <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">%</span>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">150% = 50% Profit</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Search Remote Services</label>
                        <input type="text" id="import-search" placeholder="Search by name or ID..." class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                    </div>
                </div>

                <!-- Remote Services List -->
                <div class="flex-1 overflow-y-auto p-0">
                    <table class="w-full text-left text-sm text-gray-600">
                        <thead class="bg-gray-100 text-gray-700 sticky top-0 shadow-sm z-10">
                            <tr>
                                <th class="px-4 py-3 w-12 text-center">
                                    <input type="checkbox" id="select-all-services" class="rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer">
                                </th>
                                <th class="px-4 py-3 font-semibold w-24">Remote ID</th>
                                <th class="px-4 py-3 font-semibold">Service Name</th>
                                <th class="px-4 py-3 font-semibold text-right w-24">Original Rate</th>
                                <th class="px-4 py-3 font-semibold text-right w-24 text-brand-600">Your Rate</th>
                            </tr>
                        </thead>
                        <tbody id="remote-services-tbody">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>

                <!-- Modal Footer -->
                <div class="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50 shrink-0 rounded-b-xl">
                    <div class="text-sm font-semibold text-gray-700">
                        Selected: <span id="selected-count" class="text-brand-600">0</span> services
                    </div>
                    <div class="flex gap-3">
                        <button type="button" id="cancel-import-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="button" id="execute-import-btn" class="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm">
                            <i class="fa-solid fa-cloud-arrow-down"></i> Import Selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- Provider Modal Logic ---
    const modal = document.getElementById('manage-provider-modal');
    const content = document.getElementById('manage-provider-content');
    const openBtn = document.getElementById('open-add-provider-modal');
    const closeBtn = document.getElementById('close-provider-modal-btn');
    const cancelBtn = document.getElementById('cancel-provider-btn');
    const form = document.getElementById('manage-provider-form');
    const toggleApiVisBtn = document.getElementById('toggle-apikey-vis');
    const apiKeyInput = document.getElementById('provider-apikey');

    toggleApiVisBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiVisBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleApiVisBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    const openModal = (provider = null) => {
        form.reset();
        document.getElementById('provider-modal-notification').classList.add('hidden');
        apiKeyInput.type = 'password';
        toggleApiVisBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        
        if (provider) {
            currentManagingProviderId = provider.id;
            document.getElementById('modal-provider-title').innerText = 'Edit Provider';
            document.getElementById('provider-name').value = provider.name || '';
            document.getElementById('provider-url').value = provider.url || '';
            document.getElementById('provider-apikey').value = provider.apiKey || '';
            document.getElementById('provider-status').value = provider.status || 'Active';
        } else {
            currentManagingProviderId = null;
            document.getElementById('modal-provider-title').innerText = 'Add New Provider';
        }

        modal.classList.remove('hidden');
        setTimeout(() => content.classList.add('scale-100'), 10);
    };

    const closeModal = () => {
        content.classList.remove('scale-100');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentManagingProviderId = null;
    };

    openBtn.addEventListener('click', () => openModal(null));
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', handleSaveProvider);

    // --- Expose window functions for table buttons ---
    window.deleteProvider = async (id, name) => {
        if(!confirm(`Are you sure you want to delete the API provider "${name}"? Services linked to it may fail.`)) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'api_providers', id));
        } catch (error) {
            console.error("Error deleting provider: ", error);
            alert("Failed to delete provider.");
        }
    };

    window.editProvider = (id) => {
        const provider = allProviders.find(p => p.id === id);
        if (provider) openModal(provider);
    };

    window.openImportModal = (id, btnElement) => {
        const provider = allProviders.find(p => p.id === id);
        if (provider) fetchRemoteServices(provider, btnElement);
    };

    // --- Import Modal Logic UI Binding ---
    document.getElementById('close-import-modal-btn').addEventListener('click', closeImportModal);
    document.getElementById('cancel-import-btn').addEventListener('click', closeImportModal);
    document.getElementById('import-search').addEventListener('input', renderRemoteServices);
    document.getElementById('import-markup').addEventListener('input', renderRemoteServices);
    document.getElementById('select-all-services').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.import-checkbox');
        checkboxes.forEach(cb => {
            if(!cb.closest('tr').classList.contains('hidden')) {
                cb.checked = e.target.checked;
            }
        });
        updateSelectedCount();
    });
    document.getElementById('execute-import-btn').addEventListener('click', executeImport);
}

// --- Data Fetching ---

function fetchProviders() {
    const providersRef = collection(db, 'artifacts', appId, 'api_providers'); // Fixed path!
    
    onSnapshot(providersRef, (snapshot) => {
        allProviders = [];
        snapshot.forEach(doc => {
            allProviders.push({ id: doc.id, ...doc.data() });
        });
        allProviders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderProvidersTable();
    }, (error) => {
        console.error("Error fetching providers: ", error);
    });
}

async function fetchLocalCategories() {
    const catsRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    try {
        const snap = await getDocs(catsRef);
        localCategoriesCache = [];
        snap.forEach(doc => localCategoriesCache.push({ id: doc.id, ...doc.data() }));
        localCategoriesCache.sort((a, b) => (a.sort || 99) - (b.sort || 99));
    } catch(err) {
        console.error("Error pre-fetching categories", err);
    }
}

function renderProvidersTable() {
    const tableBody = document.getElementById('admin-providers-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (allProviders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">No API providers configured. Click "Add Provider" to connect one.</td></tr>`;
        return;
    }

    allProviders.forEach(provider => {
        const name = provider.name || 'Unnamed';
        const url = provider.url || 'N/A';
        const status = provider.status || 'Active';

        const statusBadge = status === 'Active'
            ? `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">Active</span>`
            : `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase tracking-wider">Disabled</span>`;

        const row = document.createElement('tr');
        row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
        
        row.innerHTML = `
            <td class="px-6 py-4 font-bold text-gray-800">${name}</td>
            <td class="px-6 py-4 text-gray-500 font-mono text-xs truncate max-w-[250px]" title="${url}">${url}</td>
            <td class="px-6 py-4 text-center">${statusBadge}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="window.openImportModal('${provider.id}', this)" class="text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded text-xs font-semibold transition-colors shadow-sm" title="Import Services">
                    <i class="fa-solid fa-cloud-arrow-down mr-1"></i> Import
                </button>
                <button onclick="window.editProvider('${provider.id}')" class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm" title="Edit Provider">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="window.deleteProvider('${provider.id}', '${name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm" title="Delete Provider">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Import Modal & Sync Logic ---

async function fetchRemoteServices(provider, btnElement) {
    const originalHtml = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';
    btnElement.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/sync-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId: provider.id, action: 'fetch_remote' })
        });

        const result = await response.json();

        if (result.success && result.services) {
            remoteServicesCache = result.services;
            currentManagingProviderId = provider.id;
            
            // Setup Categories Dropdown
            const catSelect = document.getElementById('import-target-category');
            catSelect.innerHTML = '<option value="">-- Select Local Category --</option>';
            localCategoriesCache.forEach(cat => {
                catSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });

            document.getElementById('import-modal-subtitle').innerText = `Select services from ${provider.name} to import`;
            document.getElementById('import-search').value = '';
            document.getElementById('select-all-services').checked = false;
            
            renderRemoteServices();

            // Open Modal visually
            const importModal = document.getElementById('import-services-modal');
            importModal.classList.remove('hidden');
        } else {
            alert(`Error fetching services: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error("Fetch remote services error:", error);
        alert("Failed to connect to backend server. Check your connection.");
    } finally {
        btnElement.innerHTML = originalHtml;
        btnElement.disabled = false;
    }
}

function renderRemoteServices() {
    const tbody = document.getElementById('remote-services-tbody');
    const searchTerm = document.getElementById('import-search').value.toLowerCase().trim();
    const markupVal = parseFloat(document.getElementById('import-markup').value) || 100;
    const markupMultiplier = markupVal / 100;

    tbody.innerHTML = '';
    
    if (remoteServicesCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">No services returned by the provider.</td></tr>`;
        return;
    }

    remoteServicesCache.forEach((service, index) => {
        const sName = (service.name || '').toLowerCase();
        const sId = (service.service || '').toString().toLowerCase();
        
        if (sName.includes(searchTerm) || sId.includes(searchTerm)) {
            const originalRate = parseFloat(service.rate || 0);
            const myRate = (originalRate * markupMultiplier).toFixed(4);

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" value="${index}" class="import-checkbox rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer">
                </td>
                <td class="px-4 py-3 font-mono text-xs text-gray-500">${service.service}</td>
                <td class="px-4 py-3 text-sm text-gray-800 max-w-[300px] truncate" title="${service.name}">${service.name}</td>
                <td class="px-4 py-3 text-right text-gray-500 text-sm">${originalRate.toFixed(4)}</td>
                <td class="px-4 py-3 text-right text-brand-600 font-bold text-sm">${myRate}</td>
            `;
            tbody.appendChild(row);
        }
    });

    // Rebind checkbox listener for counts
    document.querySelectorAll('.import-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });
    
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = document.querySelectorAll('.import-checkbox:checked').length;
    document.getElementById('selected-count').innerText = count;
}

function closeImportModal() {
    document.getElementById('import-services-modal').classList.add('hidden');
    remoteServicesCache = [];
}

async function executeImport() {
    const targetCategoryId = document.getElementById('import-target-category').value;
    const markupPercentage = parseFloat(document.getElementById('import-markup').value) || 150;
    
    if (!targetCategoryId) {
        alert("Please select a Target Local Category.");
        return;
    }

    const checkedBoxes = document.querySelectorAll('.import-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert("Please select at least one service to import.");
        return;
    }

    const selectedServices = Array.from(checkedBoxes).map(cb => {
        const index = cb.value;
        return remoteServicesCache[index];
    });

    const btn = document.getElementById('execute-import-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';
    btn.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/sync-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'import_selected',
                providerId: currentManagingProviderId,
                targetCategoryId: targetCategoryId,
                markupPercentage: markupPercentage,
                selectedServices: selectedServices
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Success! ${result.message}`);
            closeImportModal();
        } else {
            alert(`Import Error: ${result.error}`);
        }
    } catch (error) {
        console.error("Import execution error:", error);
        alert("Failed to connect to backend to execute import.");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// --- Basic Form Handlers ---

async function handleSaveProvider(e) {
    e.preventDefault();
    const btn = document.getElementById('save-provider-btn');
    const notif = document.getElementById('provider-modal-notification');

    const providerData = {
        name: document.getElementById('provider-name').value.trim(),
        url: document.getElementById('provider-url').value.trim(),
        apiKey: document.getElementById('provider-apikey').value.trim(),
        status: document.getElementById('provider-status').value,
        updatedAt: serverTimestamp()
    };

    if (!providerData.name || !providerData.url || !providerData.apiKey) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        if (currentManagingProviderId) {
            const docRef = doc(db, 'artifacts', appId, 'api_providers', currentManagingProviderId); // Fixed path
            await updateDoc(docRef, providerData);
            showNotification("Provider updated successfully!", "success");
        } else {
            providerData.createdAt = serverTimestamp();
            const colRef = collection(db, 'artifacts', appId, 'api_providers'); // Fixed path
            await addDoc(colRef, providerData);
            showNotification("New provider created successfully!", "success");
        }

        setTimeout(() => document.getElementById('close-provider-modal-btn').click(), 1000);

    } catch (error) {
        console.error("Error saving provider: ", error);
        showNotification("Failed to save provider details.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Save Provider</span>';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('provider-modal-notification');
    notif.innerText = message;
    notif.className = "text-sm px-3 py-2 rounded-lg text-center font-semibold mt-2 block";
    
    if (type === 'success') {
        notif.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        notif.classList.add('bg-red-100', 'text-red-700');
    }
}