import { 
    getFirestore, 
    collection, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Firebase Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
const tableBody = document.getElementById('services-table-body');
const searchInput = document.getElementById('search-services-input');

// Modal Elements
const detailsModal = document.getElementById('service-details-modal');
const modalContentBox = document.getElementById('modal-content-box');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalCloseActionBtn = document.getElementById('modal-close-action-btn');
const modalTitle = document.getElementById('modal-service-name');
const modalDescription = document.getElementById('modal-service-description');

// State Variables
let categoriesMap = new Map(); // categoryId -> category object
let allServices = []; // Flat list of all services

// ==========================================
// UI Helpers
// ==========================================

// Auto-detect icon based on category name
function getPlatformIcon(categoryName) {
    const name = categoryName.toLowerCase();
    if (name.includes('tiktok')) return '<i class="fa-brands fa-tiktok text-black mr-2"></i>';
    if (name.includes('instagram') || name.includes('ig')) return '<i class="fa-brands fa-instagram text-pink-600 mr-2"></i>';
    if (name.includes('youtube') || name.includes('yt')) return '<i class="fa-brands fa-youtube text-red-600 mr-2"></i>';
    if (name.includes('facebook') || name.includes('fb')) return '<i class="fa-brands fa-facebook text-blue-600 mr-2"></i>';
    if (name.includes('twitter') || name.includes('x')) return '<i class="fa-brands fa-x-twitter text-black mr-2"></i>';
    if (name.includes('telegram')) return '<i class="fa-brands fa-telegram text-blue-500 mr-2"></i>';
    if (name.includes('spotify')) return '<i class="fa-brands fa-spotify text-green-500 mr-2"></i>';
    return '<i class="fa-solid fa-layer-group text-gray-500 mr-2"></i>';
}

// Global copy function (attached to window so inline onclick works)
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Find the toast container and show success
        const toastContainer = document.getElementById('toast-container');
        if(toastContainer) {
            const toast = document.createElement('div');
            toast.className = `px-4 py-3 rounded shadow-lg text-sm font-semibold flex items-center gap-3 transform transition-all duration-300 translate-x-full bg-green-100 text-green-800 border border-green-200`;
            toast.innerHTML = `<i class="fa-solid fa-check text-green-600"></i> Copied ID: ${text}`;
            toastContainer.appendChild(toast);
            setTimeout(() => { toast.classList.remove('translate-x-full'); }, 10);
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 2500);
        }
    }).catch(err => console.error('Failed to copy', err));
}

// Modal Logic
function openModal(serviceName, description) {
    modalTitle.innerText = serviceName;
    modalDescription.innerHTML = description || "No description provided for this service.";
    detailsModal.classList.remove('hidden');
    // Animate in
    setTimeout(() => {
        modalContentBox.classList.remove('scale-95');
        modalContentBox.classList.add('scale-100');
    }, 10);
}

function closeModal() {
    modalContentBox.classList.remove('scale-100');
    modalContentBox.classList.add('scale-95');
    setTimeout(() => {
        detailsModal.classList.add('hidden');
    }, 150);
}

closeModalBtn.addEventListener('click', closeModal);
modalCloseActionBtn.addEventListener('click', closeModal);
detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) closeModal();
});

// ==========================================
// Core Data Fetching & Rendering
// ==========================================

onAuthStateChanged(auth, (user) => {
    if (!user) return;

    // 1. Fetch Categories
    const categoriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    onSnapshot(categoriesRef, (snapshot) => {
        categoriesMap.clear();
        snapshot.forEach(doc => {
            categoriesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        renderServicesTable(); // Re-render if categories update
    });

    // 2. Fetch Services
    const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
    onSnapshot(servicesRef, (snapshot) => {
        allServices = [];
        snapshot.forEach(doc => {
            allServices.push({ id: doc.id, ...doc.data() });
        });
        renderServicesTable(); // Re-render if services update
    });
});

// Real-time Search Listener
searchInput.addEventListener('input', () => {
    renderServicesTable();
});

// Table Rendering Engine
function renderServicesTable() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    tableBody.innerHTML = ''; // Clear table

    if (categoriesMap.size === 0 || allServices.length === 0) {
        if(searchTerm === "") {
             // Keep loading state until data arrives
             tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-[#7ac143]"></i><p class="font-medium">Loading services...</p></td></tr>`;
        } else {
             tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No services found.</td></tr>`;
        }
        return;
    }

    // Group services by category
    const groupedServices = new Map();
    
    // Sort all categories initially to maintain order
    const sortedCategories = Array.from(categoriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    sortedCategories.forEach(cat => groupedServices.set(cat.id, []));

    let visibleServiceCount = 0;

    // Filter and assign services to their categories
    allServices.forEach(service => {
        const matchesSearch = service.name.toLowerCase().includes(searchTerm) || 
                              (service.serviceId && service.serviceId.toString().includes(searchTerm));
        
        if (matchesSearch && groupedServices.has(service.categoryId)) {
            groupedServices.get(service.categoryId).push(service);
            visibleServiceCount++;
        }
    });

    if (visibleServiceCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500"><i class="fa-solid fa-magnifying-glass text-3xl mb-3 text-gray-300"></i><p class="font-medium">No matching services found.</p></td></tr>`;
        return;
    }

    // Generate DOM Nodes
    groupedServices.forEach((servicesInCat, categoryId) => {
        // Skip rendering category headers if they have no matching services
        if (servicesInCat.length === 0) return;

        const category = categoriesMap.get(categoryId);
        const iconHTML = getPlatformIcon(category.name);

        // 1. Render Category Row
        const catRow = document.createElement('tr');
        catRow.className = "bg-[#f0fdf4] border-b border-[#dcfce7]";
        catRow.innerHTML = `
            <td colspan="7" class="px-6 py-3 font-bold text-[#166534]">
                ${iconHTML} ${category.name}
            </td>
        `;
        tableBody.appendChild(catRow);

        // 2. Render Service Rows
        // Sort services by ID within the category for a cleaner look
        servicesInCat.sort((a, b) => (parseInt(a.serviceId) || 0) - (parseInt(b.serviceId) || 0));

        servicesInCat.forEach(service => {
            const serviceRow = document.createElement('tr');
            serviceRow.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
            
            const displayId = service.serviceId || service.id.substring(0,4);
            const rate = Number(service.rate || 0).toFixed(4);

            serviceRow.innerHTML = `
                <td class="px-6 py-4 font-semibold text-blue-600 whitespace-nowrap">
                    ${displayId}
                    <i class="fa-regular fa-copy ml-1 cursor-pointer text-blue-400 hover:text-blue-600 transition-colors" onclick="copyToClipboard('${displayId}')" title="Copy ID"></i>
                </td>
                <td class="px-6 py-4 text-gray-800 whitespace-normal min-w-[300px] leading-relaxed">
                    ${service.name}
                </td>
                <td class="px-6 py-4 text-center text-gray-700 font-medium whitespace-nowrap">
                    Rs ${rate}
                </td>
                <td class="px-6 py-4 text-center text-gray-600">
                    ${service.min || 100}
                </td>
                <td class="px-6 py-4 text-center text-gray-600">
                    ${service.max || 50000}
                </td>
                <td class="px-6 py-4 text-center text-gray-600 whitespace-nowrap">
                    ${service.averageTime || '13 minutes'}
                </td>
                <td class="px-6 py-4 text-center">
                    <button class="bg-[#5cb85c] hover:bg-[#4cae4c] text-white px-4 py-2 rounded text-sm font-semibold transition-colors shadow-sm whitespace-nowrap view-details-btn">
                        View Details
                    </button>
                </td>
            `;

            // Attach event listener dynamically for the modal
            const btn = serviceRow.querySelector('.view-details-btn');
            btn.addEventListener('click', () => {
                openModal(`${displayId} - ${service.name}`, service.description);
            });

            tableBody.appendChild(serviceRow);
        });
    });
}