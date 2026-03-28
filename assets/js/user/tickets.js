import { 
    getFirestore, 
    collection, 
    onSnapshot,
    addDoc,
    doc,
    serverTimestamp,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let myTickets = [];
let currentTicketId = null;

// Listen for the custom routing event from user/index.html
window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'support') return;

    renderTicketsUI();
    fetchTickets();
});

function renderTicketsUI() {
    const contentArea = document.getElementById('user-content');
    
    // Inject HTML for Tickets View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Support Center</h2>
                <p class="text-sm text-gray-500">Need help? Subject a ticket and our team will assist you.</p>
            </div>
            <button id="open-new-ticket-btn" class="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-brand-500/20 transition-all flex items-center gap-2">
                <i class="fa-solid fa-plus"></i> Open Ticket
            </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Ticket List -->
            <div class="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[700px]">
                <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 class="font-bold text-gray-800"><i class="fa-solid fa-ticket text-brand-500 mr-2"></i> My Tickets</h3>
                </div>
                <div id="tickets-list-container" class="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50/50">
                    <div class="p-8 text-center text-gray-400">
                        <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm">Loading history...</p>
                    </div>
                </div>
            </div>

            <!-- Active Ticket View -->
            <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[700px] hidden" id="active-ticket-container">
                <div class="p-5 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-3 mb-1">
                            <h3 id="active-ticket-subject" class="font-bold text-lg text-gray-900">Ticket Subject</h3>
                            <span id="active-ticket-status" class="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Status</span>
                        </div>
                        <p class="text-xs text-gray-500 font-mono" id="active-ticket-meta">Ticket ID: --- | Date: ---</p>
                    </div>
                </div>
                
                <div id="ticket-messages-container" class="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                    <!-- Messages render here -->
                </div>
                
                <div class="p-4 border-t border-gray-100 bg-white" id="reply-container">
                    <form id="reply-ticket-form" class="flex gap-3">
                        <textarea id="reply-message" rows="2" placeholder="Write your reply here..." required class="flex-1 resize-none px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm bg-gray-50 focus:bg-white"></textarea>
                        <button type="submit" id="send-reply-btn" class="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white px-6 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center">
                            <i class="fa-solid fa-paper-plane mr-2"></i> Send
                        </button>
                    </form>
                </div>
                <div id="closed-notice" class="p-4 border-t border-gray-100 bg-gray-50 text-center text-sm font-bold text-gray-500 hidden">
                    <i class="fa-solid fa-lock mr-2"></i> This ticket is closed. Please open a new ticket for further assistance.
                </div>
            </div>

            <!-- Placeholder View -->
            <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center h-[700px] text-gray-400" id="empty-ticket-view">
                <i class="fa-solid fa-envelope-open-text text-5xl mb-4 text-gray-200"></i>
                <h3 class="text-xl font-bold text-gray-700">No Ticket Selected</h3>
                <p class="text-sm mt-1">Select a ticket from the left or create a new one.</p>
            </div>
        </div>

        <!-- New Ticket Modal -->
        <div id="new-ticket-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mx-4 transform transition-transform scale-95" id="new-ticket-content">
                <div class="flex justify-between items-center mb-5 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-plus-circle text-brand-500 mr-2"></i>Open Support Ticket</h3>
                    <button id="close-ticket-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <form id="new-ticket-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Subject</label>
                        <select id="new-ticket-subject" required class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-gray-800 font-semibold bg-gray-50">
                            <option value="Order Issue">Order Issue (Pending/Canceled/Stuck)</option>
                            <option value="Deposit / Payment">Deposit / Payment Issue</option>
                            <option value="API Assistance">Wholesale API Assistance</option>
                            <option value="Feature Request">Bug Report / Feature Request</option>
                            <option value="Other">Other Inquiry</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Message <span class="text-xs text-gray-400 font-normal ml-1">(Include Order IDs if applicable)</span></label>
                        <textarea id="new-ticket-msg" rows="5" placeholder="Please describe your issue in detail so we can help you faster..." required class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm bg-gray-50 focus:bg-white"></textarea>
                    </div>
                    <div class="pt-2 flex justify-end gap-3">
                        <button type="button" id="cancel-ticket-btn" class="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">Cancel</button>
                        <button type="submit" id="submit-ticket-btn" class="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold transition-colors flex items-center gap-2">
                            Submit Ticket
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Modal UI Logic
    const modal = document.getElementById('new-ticket-modal');
    const content = document.getElementById('new-ticket-content');
    
    document.getElementById('open-new-ticket-btn')?.addEventListener('click', () => {
        document.getElementById('new-ticket-form').reset();
        modal.classList.remove('hidden');
        setTimeout(() => content.classList.remove('scale-95'), 10);
    });

    const closeModal = () => {
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
    };

    document.getElementById('close-ticket-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('cancel-ticket-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Submit New Ticket
    document.getElementById('new-ticket-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const auth = getAuth(window.firebaseApp);
        if (!auth.currentUser) return;
        
        const subject = document.getElementById('new-ticket-subject').value;
        const msg = document.getElementById('new-ticket-msg').value.trim();
        const btn = document.getElementById('submit-ticket-btn');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        try {
            const ticketRef = await addDoc(collection(db, 'artifacts', appId, 'tickets'), {
                uid: auth.currentUser.uid,
                subject: subject,
                status: 'Pending',
                createdAt: serverTimestamp(),
                lastUpdatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'artifacts', appId, 'tickets', ticketRef.id, 'messages'), {
                sender: 'User',
                isAdmin: false,
                message: msg,
                createdAt: serverTimestamp()
            });

            closeModal();
            // Not immediately opening here, auth snapshot will catch it and render it.
        } catch (err) {
            console.error(err);
            alert("Failed to submit ticket.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Submit Ticket';
        }
    });

    // Submit Reply
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
                sender: 'User',
                isAdmin: false,
                message: msg,
                createdAt: serverTimestamp()
            });

            // Update ticket status to Pending so admin sees it needs attention
            await updateDoc(doc(db, 'artifacts', appId, 'tickets', currentTicketId), {
                status: 'Pending',
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
    const auth = getAuth(window.firebaseApp);
    if (!auth.currentUser) return;

    const q = query(
        collection(db, 'artifacts', appId, 'tickets'), 
        where('uid', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        myTickets = [];
        snapshot.forEach(d => {
            myTickets.push({ id: d.id, ...d.data() });
        });
        
        // Ensure accurate memory sort since we are ordering by createdAt descending
        myTickets.sort((a,b) => (b.lastUpdatedAt?.toMillis() || 0) - (a.lastUpdatedAt?.toMillis() || 0));

        renderInboxList();

        if (currentTicketId) {
            const stillExists = myTickets.find(t => t.id === currentTicketId);
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
    if (!container) return;
    container.innerHTML = '';

    if (myTickets.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-400 font-medium">You have no support tickets.</div>`;
        return;
    }

    myTickets.forEach(ticket => {
        let statusBadge = '';
        if (ticket.status === 'Pending') statusBadge = '<span class="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Investigating</span>';
        else if (ticket.status === 'Answered') statusBadge = '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Answered</span>';
        else statusBadge = '<span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Closed</span>';

        const dateStr = ticket.createdAt ? ticket.createdAt.toDate().toLocaleDateString() : 'N/A';
        const isActive = currentTicketId === ticket.id;

        const div = document.createElement('div');
        div.className = `p-3 rounded-lg cursor-pointer transition-all border ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <h4 class="text-sm font-bold text-gray-800 truncate pr-2">${ticket.subject}</h4>
                ${statusBadge}
            </div>
            <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500 font-mono">#${ticket.id.substring(0,8)}</span>
                <span class="text-gray-400 font-medium">${dateStr}</span>
            </div>
        `;

        div.addEventListener('click', () => openTicket(ticket));
        container.appendChild(div);
    });
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
    document.getElementById('active-ticket-meta').innerText = `Ticket ID: ${ticket.id} | Opened: ${ticket.createdAt ? ticket.createdAt.toDate().toLocaleString() : 'N/A'}`;
    
    const statusEl = document.getElementById('active-ticket-status');
    const isClosed = ticket.status === 'Closed';
    
    if(ticket.status === 'Pending') {
        statusEl.innerText = 'Investigating';
        statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-orange-100 text-orange-700';
    } else if(ticket.status === 'Answered') {
        statusEl.innerText = ticket.status;
        statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700';
    } else {
        statusEl.innerText = ticket.status;
        statusEl.className = 'px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-700';
    }

    // Toggle Reply Box visibility based on Closed status
    if (isClosed) {
        document.getElementById('reply-container').classList.add('hidden');
        document.getElementById('closed-notice').classList.remove('hidden');
    } else {
        document.getElementById('reply-container').classList.remove('hidden');
        document.getElementById('closed-notice').classList.add('hidden');
    }

    if (activeMessageUnsubscribe) activeMessageUnsubscribe();

    const msgsContainer = document.getElementById('ticket-messages-container');
    msgsContainer.innerHTML = '<div class="text-center text-gray-400 mt-10"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i> Fetching thread...</div>';

    const msgQuery = query(collection(db, 'artifacts', appId, 'tickets', ticket.id, 'messages'), orderBy('createdAt', 'asc'));
    
    activeMessageUnsubscribe = onSnapshot(msgQuery, (snapshot) => {
        msgsContainer.innerHTML = '';
        if(snapshot.empty) return;

        snapshot.forEach(doc => {
            const m = doc.data();
            const isSelf = !m.isAdmin; // User is viewing
            const timeStr = m.createdAt ? m.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
            
            const alignClass = isSelf ? 'justify-end' : 'justify-start';
            const bgClass = isSelf ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm';
            const name = isSelf ? 'You' : 'Support Team';
            
            msgsContainer.innerHTML += `
                <div class="flex ${alignClass} w-full">
                    <div class="max-w-[85%] ${bgClass} p-3 rounded-xl">
                        <div class="text-[10px] opacity-70 mb-1 font-bold uppercase tracking-wider flex justify-between gap-4">
                            <span>${name}</span>
                            <span>${timeStr}</span>
                        </div>
                        <div class="text-sm whitespace-pre-wrap leading-relaxed">${m.message}</div>
                    </div>
                </div>
            `;
        });
        
        msgsContainer.scrollTop = msgsContainer.scrollHeight;
    });
}
