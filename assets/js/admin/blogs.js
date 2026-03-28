import { 
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

export async function renderBlogsUI(container) {
    container.innerHTML = `
        <div class="mb-8 flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 mb-2">Platform Features & Blog</h1>
                <p class="text-gray-500 text-sm">Write robust updates and features for Google Bots to organically index.</p>
            </div>
            <button id="new-blog-btn" class="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-6 rounded-xl transition-colors shadow-lg shadow-brand-500/30 flex items-center gap-2">
                <i class="fa-solid fa-pen-nib"></i> Publish New Release
            </button>
        </div>

        <!-- Create Blog Form (Hidden by Default) -->
        <div id="blog-form-container" class="hidden mb-10 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 class="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-6"><i class="fa-solid fa-feather text-brand-500 mr-2"></i> Draft Feature Update</h2>
            <form id="admin-blog-form" class="space-y-6">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Headline Title</label>
                    <input type="text" id="blog-title" placeholder="e.g., We just launched Instant Refills V2!" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Thumbnail Link (Optional)</label>
                    <input type="url" id="blog-image" placeholder="https://res.cloudinary.com/.../banner.png" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Rich Content (Markdown or Text)</label>
                    <textarea id="blog-content" rows="6" placeholder="Write full details about the new update here..." required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none"></textarea>
                </div>
                <div class="flex items-center gap-4 pt-4">
                    <button type="submit" id="save-blog-btn" class="bg-brand-500 hover:bg-brand-600 px-6 py-2.5 rounded-lg text-white font-bold transition-colors shadow-md">Publish Update</button>
                    <button type="button" id="cancel-blog-btn" class="bg-gray-100 hover:bg-gray-200 px-6 py-2.5 rounded-lg text-gray-700 font-bold transition-colors">Cancel</button>
                    <p id="blog-status" class="text-sm font-semibold ml-4"></p>
                </div>
            </form>
        </div>

        <!-- Latest Posts Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="blog-list-grid">
            <div class="col-span-full py-12 text-center text-gray-400">
                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3"></i>
                <p class="font-medium">Fetching database logs...</p>
            </div>
        </div>
    `;

    document.getElementById('new-blog-btn').addEventListener('click', () => {
        document.getElementById('blog-form-container').classList.remove('hidden');
    });
    
    document.getElementById('cancel-blog-btn').addEventListener('click', () => {
        document.getElementById('admin-blog-form').reset();
        document.getElementById('blog-form-container').classList.add('hidden');
    });

    document.getElementById('admin-blog-form').addEventListener('submit', handlePublishBlog);
    
    fetchLatestBlogs();
}

async function fetchLatestBlogs() {
    const grid = document.getElementById('blog-list-grid');
    if(!grid) return;

    try {
        const blogsRef = collection(db, 'artifacts', appId, 'public', 'data', 'blogs');
        const q = query(blogsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);

        if(snap.empty) {
            grid.innerHTML = `<div class="col-span-full py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center"><p class="text-gray-500 font-medium">You haven't published any platform updates yet.</p></div>`;
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'Just now';
            const img = data.image ? `<img src="${data.image}" class="w-full h-40 object-cover rounded-t-xl" alt="Thumbnail">` : `<div class="w-full h-24 bg-gradient-to-r from-brand-400 to-brand-600 rounded-t-xl"></div>`;
            
            html += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow group relative">
                    ${img}
                    <div class="p-5 flex-1 flex flex-col">
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">${date}</span>
                        <h3 class="text-lg font-bold text-gray-800 leading-tight mb-2 line-clamp-2 title-font">${data.title}</h3>
                        <p class="text-sm text-gray-600 line-clamp-3 mb-4">${data.content}</p>
                        <div class="mt-auto flex justify-end">
                            <button onclick="window.deleteBlog('${docSnap.id}')" class="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i> Delete Post</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
    } catch(err) {
        console.error("fetchLatestBlogs error:", err);
        grid.innerHTML = `<div class="col-span-full text-center text-red-500 font-semibold py-8">Failed to fetch platform blogs. Ensure database indexes are built.</div>`;
    }
}

async function handlePublishBlog(e) {
    e.preventDefault();
    const btn = document.getElementById('save-blog-btn');
    const stat = document.getElementById('blog-status');
    const form = document.getElementById('admin-blog-form');
    
    const blogData = {
        title: document.getElementById('blog-title').value.trim(),
        image: document.getElementById('blog-image').value.trim(),
        content: document.getElementById('blog-content').value.trim(),
        createdAt: serverTimestamp()
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Writing...';

    try {
        const blogsRef = collection(db, 'artifacts', appId, 'public', 'data', 'blogs');
        await addDoc(blogsRef, blogData);
        
        stat.className = "text-sm font-semibold ml-4 text-green-600";
        stat.innerText = "Successfully published!";
        form.reset();
        
        setTimeout(() => {
            document.getElementById('blog-form-container').classList.add('hidden');
            stat.innerText = "";
            fetchLatestBlogs();
        }, 1500);

    } catch(err) {
        console.error(err);
        stat.className = "text-sm font-semibold ml-4 text-red-500";
        stat.innerText = "Error publishing post.";
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Publish Update';
    }
}

window.deleteBlog = async (id) => {
    if(!confirm('Are you certain you want to delete this feature post permanently?')) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blogs', id));
        fetchLatestBlogs();
    } catch (e) {
         alert("Could not delete.");
    }
};
