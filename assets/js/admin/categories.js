import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allCategories = [];
let currentManagingCategoryId = null; // Track edit state
let currentPage = 1;
const rowsPerPage = 50;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'categories') return;

    renderCategoriesUI();
    fetchCategories();
});

function renderCategoriesUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Categories View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Category Management</h2>
                <p class="text-sm text-gray-500">Organize and manage service categories for the platform.</p>
            </div>
            <div class="w-full sm:w-auto flex gap-2">
                <div class="relative flex-1 sm:w-64">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-categories" placeholder="Search categories..." class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
                <button id="open-add-category-modal" class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap">
                    <i class="fa-solid fa-plus"></i> Add New
                </button>
            </div>
        </div>

        <!-- Categories Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-16 text-center">Sort</th>
                            <th class="px-6 py-4 font-semibold">Category Name</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-right w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-categories-table-body">
                        <tr>
                            <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading categories...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="admin-categories-pagination-container"></div>
        </div>

        <!-- Add/Edit Category Modal -->
        <div id="manage-category-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="manage-category-content">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800" id="modal-category-title">Add New Category</h3>
                    <button id="close-category-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <form id="manage-category-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Category Name</label>
                        <input type="text" id="manage-category-name" required placeholder="e.g., TikTok Views - Cheapest" class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Sort Order (Number)</label>
                        <input type="number" id="manage-category-sort" value="1" min="1" required class="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        <p class="text-xs text-gray-500 mt-1">Lower numbers appear first in the dropdown.</p>
                    </div>
                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-category-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="submit" id="submit-category-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
                            <span>Save Category</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-categories');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderCategoriesTable();
        });
    }

    // Modal Logic
    const modal = document.getElementById('manage-category-modal');
    const content = document.getElementById('manage-category-content');
    const form = document.getElementById('manage-category-form');

    const openModal = (category = null) => {
        form.reset();
        if (category) {
            // Editing existing category
            currentManagingCategoryId = category.id;
            document.getElementById('modal-category-title').innerText = 'Edit Category';
            document.getElementById('manage-category-name').value = category.name || '';
            document.getElementById('manage-category-sort').value = category.sort || 1;
        } else {
            // Adding new category
            currentManagingCategoryId = null;
            document.getElementById('modal-category-title').innerText = 'Add New Category';
            document.getElementById('manage-category-sort').value = allCategories.length > 0 ? allCategories.length + 1 : 1;
        }
        
        modal.classList.remove('hidden');
        setTimeout(() => content.classList.remove('scale-95'), 10);
    };

    const closeModal = () => {
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentManagingCategoryId = null;
    };

    document.getElementById('open-add-category-modal').addEventListener('click', () => openModal(null));
    document.getElementById('close-category-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-category-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Handle Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('manage-category-name').value.trim();
        const sort = parseInt(document.getElementById('manage-category-sort').value) || 1;
        const submitBtn = document.getElementById('submit-category-btn');

        if (!name) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            if (currentManagingCategoryId) {
                // Update Existing Document
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'categories', currentManagingCategoryId);
                await updateDoc(docRef, { name: name, sort: sort, updatedAt: serverTimestamp() });
            } else {
                // Add New Document
                const categoriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
                await addDoc(categoriesRef, { name: name, sort: sort, status: 'Active', createdAt: serverTimestamp() });
            }
            closeModal();
        } catch (error) {
            console.error("Error saving category: ", error);
            alert("Failed to save category.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Save Category</span>';
        }
    });

    // Make functions globally accessible for inline onclick handlers
    window.editCategory = (id) => {
        const cat = allCategories.find(c => c.id === id);
        if (cat) openModal(cat);
    };

    window.deleteCategory = async (categoryId, categoryName) => {
        if(!confirm(`Are you sure you want to delete "${categoryName}"? This cannot be undone.`)) return;

        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', categoryId));
        } catch (error) {
            console.error("Error deleting category: ", error);
            alert("Failed to delete category.");
        }
    };
}

function fetchCategories() {
    // Fetch categories ordered by sort number
    const categoriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'categories');
    const q = query(categoriesRef, orderBy('sort', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        allCategories = [];
        snapshot.forEach(doc => {
            allCategories.push({ id: doc.id, ...doc.data() });
        });
        renderCategoriesTable();
    }, (error) => {
        console.error("Error fetching categories: ", error);
        const tableBody = document.getElementById('admin-categories-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Failed to load categories.</td></tr>`;
        }
    });
}

function renderCategoriesTable() {
    const tableBody = document.getElementById('admin-categories-table-body');
    const searchInput = document.getElementById('admin-search-categories');
    const paginationContainer = document.getElementById('admin-categories-pagination-container');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allCategories.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">No categories found. Click "Add New" to create one.</td></tr>`;
        return;
    }

    const filtered = allCategories.filter(category => {
        const name = category.name || '';
        return name.toLowerCase().includes(searchTerm);
    });

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let visibleCount = 0;

    paginated.forEach(category => {
        visibleCount++;
        const name = category.name || 'Unnamed';
        const sort = category.sort || 0;
        const status = category.status || 'Active';

        const statusBadge = `<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">${status}</span>`;

        const row = document.createElement('tr');
        row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
        
        row.innerHTML = `
            <td class="px-6 py-4 text-center font-semibold text-gray-500">${sort}</td>
            <td class="px-6 py-4 font-bold text-gray-800">${name}</td>
            <td class="px-6 py-4 text-center">${statusBadge}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="window.editCategory('${category.id}')" class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="window.deleteCategory('${category.id}', '${name.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded inline-flex items-center justify-center transition-colors shadow-sm">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">No matching categories found.</td></tr>`;
    }

    if(paginationContainer) {
        renderPagination(filtered.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderCategoriesTable();
        }, paginationContainer);
    }
}