import { 
    getFirestore, 
    collection, 
    onSnapshot,
    doc,
    query,
    orderBy,
    limit,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let unreadCount = 0;
let currentNotifications = [];

// Initialize Notifications Logic
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        listenForNotifications();
    }
});

// Dropdown UI Logic
const bellBtn = document.getElementById('header-bell-btn');
const notifMenu = document.getElementById('notifications-dropdown-menu');
const markReadBtn = document.getElementById('mark-all-read-btn');

if (bellBtn && notifMenu) {
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMenu.classList.toggle('hidden');
        if (!notifMenu.classList.contains('hidden')) {
            notifMenu.classList.add('flex');
        } else {
            notifMenu.classList.remove('flex');
        }
    });

    document.addEventListener('click', (e) => {
        if (!notifMenu.contains(e.target) && !bellBtn.contains(e.target)) {
            notifMenu.classList.add('hidden');
            notifMenu.classList.remove('flex');
        }
    });
}

if (markReadBtn) {
    markReadBtn.addEventListener('click', handleMarkAllRead);
}

function listenForNotifications() {
    if (!currentUser) return;
    const notifRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'notifications');
    // Fetch latest 30 notifications
    const q = query(notifRef, orderBy('createdAt', 'desc'), limit(30));

    onSnapshot(q, (snapshot) => {
        currentNotifications = [];
        unreadCount = 0;
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentNotifications.push({ id: docSnap.id, ref: docSnap.ref, ...data });
            if (data.isRead === false) unreadCount++;
        });

        updateBadge();
        renderNotificationsList();
    });
}

function updateBadge() {
    const badge = document.getElementById('header-bell-badge');
    if (!badge) return;
    
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function getIconForNotif(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('completed')) return '<i class="fa-solid fa-check-circle text-green-500"></i>';
    if (t.includes('canceled')) return '<i class="fa-solid fa-circle-xmark text-red-500"></i>';
    if (t.includes('deposit')) return '<i class="fa-solid fa-money-bill-wave text-blue-500"></i>';
    if (t.includes('refill')) return '<i class="fa-solid fa-rotate-left text-orange-500"></i>';
    return '<i class="fa-solid fa-bell text-brand-500"></i>';
}

function renderNotificationsList() {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (currentNotifications.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-sm text-gray-400 font-semibold"><i class="fa-regular fa-bell-slash text-3xl mb-3 border border-gray-100 p-4 rounded-full shadow-sm"></i><br>You're all caught up!</div>`;
        return;
    }

    list.innerHTML = currentNotifications.map(n => {
        const bgClass = n.isRead ? 'bg-white' : 'bg-brand-50';
        const dateStr = n.createdAt ? n.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
        
        return `
            <div class="px-4 py-3 border-b border-gray-100 ${bgClass} hover:bg-gray-50 transition-colors flex gap-3 items-start">
                <div class="mt-1 text-lg">
                    ${getIconForNotif(n.title)}
                </div>
                <div class="flex-1 min-w-0 pr-2">
                    <p class="text-sm font-bold text-gray-900 truncate">${n.title || 'Notification'}</p>
                    <p class="text-xs text-gray-600 leading-tight mt-0.5 whitespace-pre-wrap">${n.message || ''}</p>
                    <p class="text-[10px] font-semibold text-gray-400 mt-1 uppercase tracking-wider">${dateStr}</p>
                </div>
            </div>
        `;
    }).join('');
}

async function handleMarkAllRead(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser || unreadCount === 0) return;

    try {
        const batch = writeBatch(db);
        let count = 0;
        
        currentNotifications.forEach(n => {
            if (n.isRead === false) {
                batch.update(n.ref, { isRead: true });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
    } catch (e) {
        console.error("Error marking notifications as read", e);
    }
}
