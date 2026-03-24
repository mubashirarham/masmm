import { 
    getFirestore, 
    collection, 
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allGateways = [];
let currentManagingGatewayId = null;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'payments') return;

    renderPaymentsUI();
    fetchGateways();
});

function renderPaymentsUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Payments/Gateways View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Payment Gateways</h2>
                <p class="text-sm text-gray-500">Manage account details, logos, and instructions for user deposits.</p>
            </div>
            <div class="w-full sm:w-auto flex gap-2">
                <div class="relative flex-1 sm:w-64">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-gateways" placeholder="Search gateways..." class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
                <button id="open-add-gateway-modal" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <i class="fa-solid fa-plus"></i> Add Gateway
                </button>
            </div>
        </div>

        <!-- Gateways Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold">Gateway</th>
                            <th class="px-6 py-4 font-semibold">Account Title</th>
                            <th class="px-6 py-4 font-semibold">Account Number</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-right w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-gateways-table-body">
                        <tr>
                            <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading payment gateways...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add/Edit Gateway Modal -->
        <div id="manage-gateway-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mx-4 transform transition-transform scale-95 overflow-y-auto max-h-[90vh]" id="manage-gateway-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800" id="modal-gateway-title">Add New Gateway</h3>
                    <button type="button" id="close-gateway-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <form id="manage-gateway-form" class="space-y-4">
                    <!-- Cloudinary Logo Upload Area -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Gateway Logo (Optional)</label>
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0 shadow-sm">
                                <img id="gateway-logo-preview" class="w-full h-full object-cover hidden">
                                <i id="gateway-logo-icon" class="fa-solid fa-image text-gray-400 text-2xl"></i>
                            </div>
                            <input type="file" id="gateway-logo-input" accept="image/*" class="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition-all cursor-pointer">
                        </div>
                        <input type="hidden" id="gateway-existing-logo">
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Gateway Name</label>
                        <input type="text" id="gateway-name" required placeholder="e.g., EasyPaisa (Auto)" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                    </div>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Account Title</label>
                            <input type="text" id="gateway-account-title" placeholder="e.g., Mubashir Arham" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Account Number</label>
                            <input type="text" id="gateway-account-number" placeholder="e.g., 0300-1234567" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Instructions (Shown to User)</label>
                        <textarea id="gateway-instructions" rows="3" placeholder="Please send funds to this account and provide the TID." class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none"></textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                        <select id="gateway-status" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all bg-white">
                            <option value="Active">Active</option>
                            <option value="Disabled">Disabled</option>
                        </select>
                    </div>

                    <!-- Inline Notification -->
                    <div id="gateway-modal-notification" class="hidden text-sm px-3 py-2 rounded-lg text-center font-semibold mt-2"></div>

                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-gateway-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="submit" id="save-gateway-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm">
                            <span>Save Gateway</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-gateways');
    if (searchInput) {
        searchInput.addEventListener('input', renderGatewaysTable);
    }

    // Handle Local Image Preview
    const logoInput = document.getElementById('gateway-logo-input');
    const logoPreview = document.getElementById('gateway-logo-preview');
    const logoIcon = document.getElementById('gateway-logo-icon');

    logoInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            logoPreview.src = URL.createObjectURL(file);
            logoPreview.classList.remove('hidden');
            logoIcon.classList.add('hidden');
        }
    });

    // Modal Logic
    const modal = document.getElementById('manage-gateway-modal');
    const content = document.getElementById('manage-gateway-content');
    const openBtn = document.getElementById('open-add-gateway-modal');
    const closeBtn = document.getElementById('close-gateway-modal-btn');
    const cancelBtn = document.getElementById('cancel-gateway-btn');
    const form = document.getElementById('manage-gateway-form');

    const openModal = (gateway = null) => {
        form.reset();
        document.getElementById('gateway-modal-notification').classList.add('hidden');
        
        // Reset Image Input and Preview
        logoInput.value = '';
        const existingLogoInput = document.getElementById('gateway-existing-logo');
        
        if (gateway) {
            currentManagingGatewayId = gateway.id;
            document.getElementById('modal-gateway-title').innerText = 'Edit Gateway';
            document.getElementById('gateway-name').value = gateway.name || '';
            document.getElementById('gateway-account-title').value = gateway.accountTitle || '';
            document.getElementById('gateway-account-number').value = gateway.accountNumber || '';
            document.getElementById('gateway-instructions').value = gateway.instructions || '';
            document.getElementById('gateway-status').value = gateway.status || 'Active';
            
            // Set existing logo
            existingLogoInput.value = gateway.logoUrl || '';
            if (gateway.logoUrl) {
                logoPreview.src = gateway.logoUrl;
                logoPreview.classList.remove('hidden');
                logoIcon.classList.add('hidden');
            } else {
                logoPreview.classList.add('hidden');
                logoIcon.classList.remove('hidden');
            }
        } else {
            currentManagingGatewayId = null;
            document.getElementById('modal-gateway-title').innerText = 'Add New Gateway';
            existingLogoInput.value = '';
            logoPreview.classList.add('hidden');
            logoIcon.classList.remove('hidden');
        }

        modal.classList.remove('hidden');
        setTimeout(() => content.classList.remove('scale-95'), 10);
    };

    const closeModal = () => {
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentManagingGatewayId = null;
    };

    openBtn.addEventListener('click', () => openModal(null));
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Handle Form Submission
    form.addEventListener('submit', handleSaveGateway);

    // Expose delete to window for inline onclick
    window.deleteGateway = async (id, name) => {
        if(!confirm(`Are you sure you want to delete the gateway "${name}"? Users will no longer be able to select it.`)) return;

        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gateways', id));
        } catch (error) {
            console.error("Error deleting gateway: ", error);
            alert("Failed to delete gateway.");
        }
    };

    // Expose open modal to window for inline onclick
    window.editGateway = (id) => {
        const gateway = allGateways.find(g => g.id === id);
        if (gateway) openModal(gateway);
    };
}

function fetchGateways() {
    const gatewaysRef = collection(db, 'artifacts', appId, 'public', 'data', 'gateways');
    
    onSnapshot(gatewaysRef, (snapshot) => {
        allGateways = [];
        snapshot.forEach(doc => {
            allGateways.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort alphabetically by name
        allGateways.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        renderGatewaysTable();
    }, (error) => {
        console.error("Error fetching gateways: ", error);
        const tableBody = document.getElementById('admin-gateways-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load gateways.</td></tr>`;
        }
    });
}

function renderGatewaysTable() {
    const tableBody = document.getElementById('admin-gateways-table-body');
    const searchInput = document.getElementById('admin-search-gateways');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allGateways.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No payment gateways configured. Click "Add Gateway" to create one.</td></tr>`;
        return;
    }

    let visibleCount = 0;

    allGateways.forEach(gateway => {
        const name = gateway.name || 'Unnamed';
        const title = gateway.accountTitle || 'N/A';
        const number = gateway.accountNumber || 'N/A';
        const status = gateway.status || 'Active';
        const logoUrl = gateway.logoUrl || null;

        if (name.toLowerCase().includes(searchTerm) || number.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            const statusBadge = status === 'Active'
                ? `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">Active</span>`
                : `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase tracking-wider">Disabled</span>`;

            // HTML for the logo or a placeholder icon
            const logoHtml = logoUrl 
                ? `<img src="${logoUrl}" class="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-white">`
                : `<div class="w-10 h-10 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400"><i class="fa-solid fa-building-columns"></i></div>`;

            const row = document.createElement('tr');
            row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        ${logoHtml}
                        <span class="font-bold text-gray-800">${name}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-gray-600">${title}</td>
                <td class="px-6 py-4 font-mono text-brand-600 font-semibold">${number}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-right space-x-2">
                    <button onclick="window.editGateway('${gateway.id}')" class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="window.deleteGateway('${gateway.id}', '${name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;

            tableBody.appendChild(row);
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No matching gateways found.</td></tr>`;
    }
}

// Function to upload the image directly from browser to Cloudinary
async function uploadLogoToCloudinary(file) {
    const cloudinaryUrl = 'https://api.cloudinary.com/v1_1/dis1ptaip/image/upload';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'mubashir'); 
    
    const response = await fetch(cloudinaryUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Cloudinary upload failed');
    }

    const data = await response.json();
    return data.secure_url; // The HTTPS URL of the uploaded image
}

async function handleSaveGateway(e) {
    e.preventDefault();
    
    const btn = document.getElementById('save-gateway-btn');
    const nameInput = document.getElementById('gateway-name').value.trim();
    
    if (!nameInput) return;

    btn.disabled = true;
    
    // --- Step 1: Handle Logo Upload if a new file is selected ---
    const fileInput = document.getElementById('gateway-logo-input');
    let finalLogoUrl = document.getElementById('gateway-existing-logo').value;

    if (fileInput.files.length > 0) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Logo...';
        try {
            finalLogoUrl = await uploadLogoToCloudinary(fileInput.files[0]);
        } catch (uploadError) {
            console.error("Upload error:", uploadError);
            showNotification("Failed to upload logo to Cloudinary. Please try again.", "error");
            btn.disabled = false;
            btn.innerHTML = '<span>Save Gateway</span>';
            return;
        }
    }

    // --- Step 2: Save to Firestore ---
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Gateway...';

    const gatewayData = {
        name: nameInput,
        accountTitle: document.getElementById('gateway-account-title').value.trim(),
        accountNumber: document.getElementById('gateway-account-number').value.trim(),
        instructions: document.getElementById('gateway-instructions').value.trim(),
        status: document.getElementById('gateway-status').value,
        logoUrl: finalLogoUrl, // Added Logo URL
        updatedAt: serverTimestamp()
    };

    try {
        if (currentManagingGatewayId) {
            // Update existing
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'gateways', currentManagingGatewayId);
            await updateDoc(docRef, gatewayData);
            showNotification("Gateway updated successfully!", "success");
        } else {
            // Add new
            gatewayData.createdAt = serverTimestamp();
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'gateways');
            await addDoc(colRef, gatewayData);
            showNotification("New gateway created successfully!", "success");
        }

        setTimeout(() => {
            document.getElementById('close-gateway-modal-btn').click();
        }, 1000);

    } catch (error) {
        console.error("Error saving gateway: ", error);
        showNotification("Failed to save gateway details.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Save Gateway</span>';
    }
}

function showNotification(message, type) {
    const notif = document.getElementById('gateway-modal-notification');
    notif.innerText = message;
    notif.className = "text-sm px-3 py-2 rounded-lg text-center font-semibold mt-2 block";
    
    if (type === 'success') {
        notif.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        notif.classList.add('bg-red-100', 'text-red-700');
    } else {
        notif.classList.add('bg-yellow-100', 'text-yellow-700');
    }
}