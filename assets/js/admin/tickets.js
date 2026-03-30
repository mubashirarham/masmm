import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allTickets = [];
let currentTicketId = null;
let currentPage = 1;
const rowsPerPage = 50;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'tickets') return;

    renderTicketsUI();
    fetchTickets();
});

function renderTicketsUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject HTML for Tickets View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Support Desk</h2>
                <p class="text-sm text-gray-500">Manage customer inquiries and resolve issues directly.</p>
            </div>
            <div class="w-full sm:w-auto flex gap-2">
                <div class="relative flex-1 sm:w-64">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-tickets" placeholder="Search subject or ID..." class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Ticket List -->
            <div class="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[700px]">
                <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 class="font-bold text-gray-800"><i class="fa-solid fa-inbox text-brand-500 mr-2"></i> Inbox</h3>
                    <span id="ticket-count-badge" class="bg-brand-100 text-brand-700 text-xs font-bold px-2 py-1 rounded-full">0 Pending</span>
                </div>
                <div id="tickets-list-container" class="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50/50">
                    <div class="p-8 text-center text-gray-400">
                        <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm">Loading tickets...</p>
                    </div>
                </div>
                <div id="admin-tickets-pagination-container" class="border-t border-gray-100 bg-white"></div>
            </div>

            <!-- Active Ticket View -->
            <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[700px] hidden" id="active-ticket-container">
                <div class="p-5 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-3 mb-1">
                            <h3 id="active-ticket-subject" class="font-bold text-lg text-gray-900">Ticket Subject</h3>
                            <span id="active-ticket-status" class="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Status</span>
                        </div>
                        <p class="text-xs text-gray-500 font-mono" id="active-ticket-meta">UID: --- | Date: ---</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="close-ticket-btn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors">Mark Closed</button>
                    </div>
                </div>
                
                <div id="ticket-messages-container" class="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                    <!-- Messages render here -->
                </div>
                
                <div class="p-4 border-t border-gray-100 bg-white">
                    <form id="reply-ticket-form" class="flex gap-3">
                        <textarea id="reply-message" rows="2" placeholder="Type your reply here..." required class="flex-1 resize-none px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm bg-gray-50 focus:bg-white"></textarea>
                        <button type="submit" id="send-reply-btn" class="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white px-6 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center">
                            <i class="fa-solid fa-paper-plane mr-2"></i> Send
                        </button>
                    </form>
                </div>
            </div>

            <!-- Placeholder View -->
            <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center h-[700px] text-gray-400" id="empty-ticket-view">
                <i class="fa-solid fa-envelope-open-text text-5xl mb-4 text-gray-200"></i>
                <h3 class="text-xl font-bold text-gray-700">No Ticket Selected</h3>
                <p class="text-sm mt-1">Select a ticket from the inbox to view and reply.</p>
            </div>
    `;

    const searchInput = document.getElementById('admin-search-tickets');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderInboxList();
        });
    }
    
    document.getElementById('close-ticket-btn')?.addEventListener('click', async () => {
        if (!currentTicketId) return;
        if (!confirm("Are you sure you want to mark this ticket as Closed?")) return;
        
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'tickets', currentTicketId), { status: 'Closed' });
            alert("Ticket closed.");
        } catch(e) { console.error(e); }
    });

    document.getElementById('reply-ticket-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentTicketId) return;
        
        const input = document.getElementById('reply-message');
        const msg = input.value.trim();
        if(!msg) return;

        const btn = document.getElementById('send-reply-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            // Add message
            await addDoc(collection(db, 'artifacts', appId, 'tickets', currentTicketId, 'messages'), {
                sender: 'Support Team',
                isAdmin: true,
                message: msg,
                createdAt: serverTimestamp()
            });

            // Update ticket status to answered
            await updateDoc(doc(db, 'artifacts', appId, 'tickets', currentTicketId), {
                status: 'Answered',
                lastUpdatedAt: serverTimestamp()
            });

            input.value = '';
        } catch (err) {
            console.error(err);
            alert("Failed to send reply.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> Send';
        }
    });
}

function fetchTickets() {
    const q = query(collection(db, 'artifacts', appId, 'tickets'), orderBy('lastUpdatedAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        allTickets = [];
        let pendingCount = 0;
        
        snapshot.forEach(d => {
            const data = d.data();
            allTickets.push({ id: d.id, ...data });
            if (data.status === 'Pending') pendingCount++;
        });

        const badge = document.getElementById('ticket-count-badge');
        if(badge) {
            badge.innerText = pendingCount > 0 ? `${pendingCount} Pending` : '0 Pending';
            badge.className = pendingCount > 0 ? 'bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full' : 'bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full';
        }

        renderInboxList();

        // If currently viewing a ticket, ensure UI updates if it changes status
        if (currentTicketId) {
            const stillExists = allTickets.find(t => t.id === currentTicketId);
            if(stillExists) openTicket(stillExists);
            else {
                currentTicketId = null;
                document.getElementById('active-ticket-container').classList.add('hidden');
                document.getElementById('empty-ticket-view').classList.remove('hidden');
            }
        }
    });
}

function renderInboxList() {
    const container = document.getElementById('tickets-list-container');
    const searchInput = document.getElementById('admin-search-tickets');
    const paginationContainer = document.getElementById('admin-tickets-pagination-container');
    if (!container) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    container.innerHTML = '';

    if (allTickets.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-400 font-medium">Inbox is empty.</div>`;
        return;
    }

    const filtered = allTickets.filter(ticket => {
        return ticket.subject.toLowerCase().includes(searchTerm) || 
               ticket.id.toLowerCase().includes(searchTerm) || 
               ticket.uid.toLowerCase().includes(searchTerm);
    });

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let visibleCount = 0;
    paginated.forEach(ticket => {
        visibleCount++;
        
        let statusBadge = '';
        if (ticket.status === 'Pending') statusBadge = '<span class="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Pending</span>';
        else if (ticket.status === 'Answered') statusBadge = '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Answered</span>';
        else statusBadge = '<span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Closed</span>';

        const dateStr = ticket.lastUpdatedAt ? ticket.lastUpdatedAt.toDate().toLocaleDateString() : 'N/A';
        const isActive = currentTicketId === ticket.id;

        const div = document.createElement('div');
        div.className = `p-3 rounded-lg cursor-pointer transition-all border ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <h4 class="text-sm font-bold text-gray-800 truncate pr-2">${ticket.subject}</h4>
                ${statusBadge}
            </div>
            <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500 font-mono">#${ticket.id.substring(0,6)}</span>
                <span class="text-gray-400 font-medium">${dateStr}</span>
            </div>
        `;

        div.addEventListener('click', () => openTicket(ticket));
        container.appendChild(div);
    });

    if (visibleCount === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-400 font-medium">No matching tickets.</div>`;
    }

    if(paginationContainer) {
        renderPagination(filtered.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderInboxList();
        }, paginationContainer);
    }
}

let activeMessageUnsubscribe = null;

function openTicket(ticket) {
    currentTicketId = ticket.id;
    
    // Switch views
    document.getElementById('empty-ticket-view').classList.add('hidden');
    document.getElementById('active-ticket-container').classList.remove('hidden');
    
    // Highlight active in list
    renderInboxList();

    // Set Meta
    document.getElementById('active-ticket-subject').innerText = ticket.subject;
    document.getElementById('active-ticket-meta').innerText = `User: ${ticket.uid} | Opened: ${ticket.createdAt ? ticket.createdAt.toDate().toLocaleString() : 'N/A'}`;
    
    const statusEl = document.getElementById('active-ticket-status');
    statusEl.innerText = ticket.status;
    if(ticket.status === 'Pending') statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-orange-100 text-orange-700';
    else if(ticket.status === 'Answered') statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700';
    else statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-700';

    // If a listener was already attached for another ticket, remove it
    if (activeMessageUnsubscribe) {
        activeMessageUnsubscribe();
    }

    // Attach read listener for messages
    const msgsContainer = document.getElementById('ticket-messages-container');
    msgsContainer.innerHTML = '<div class="text-center text-gray-400 mt-10"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i> Fetching thread...</div>';

    const msgQuery = query(collection(db, 'artifacts', appId, 'tickets', ticket.id, 'messages'), orderBy('createdAt', 'asc'));
    
    activeMessageUnsubscribe = onSnapshot(msgQuery, (snapshot) => {
        msgsContainer.innerHTML = '';
        if(snapshot.empty) {
            msgsContainer.innerHTML = '<div class="text-center text-gray-400 mt-10 text-sm">No messages yet. (This shouldn\'t happen)</div>';
            return;
        }

        snapshot.forEach(doc => {
            const m = doc.data();
            const isSelf = m.isAdmin; // Admin is viewing
            const timeStr = m.createdAt ? m.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
            
            const alignClass = isSelf ? 'justify-end' : 'justify-start';
            const bgClass = isSelf ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm';
            const name = isSelf ? 'Support Team' : 'User';
            
            msgsContainer.innerHTML += `
                <div class="flex ${alignClass} w-full">
                    <div class="max-w-[75%] ${bgClass} p-3 rounded-xl">
                        <div class="text-[10px] opacity-70 mb-1 font-bold uppercase tracking-wider flex justify-between gap-4">
                            <span>${name}</span>
                            <span>${timeStr}</span>
                        </div>
                        <div class="text-sm whitespace-pre-wrap leading-relaxed">${m.message}</div>
                    </div>
                </div>
            `;
        });
        
        // Auto-scroll to bottom
        msgsContainer.scrollTop = msgsContainer.scrollHeight;
    });
}
