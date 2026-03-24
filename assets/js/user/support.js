import { 
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, arrayUnion, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let userTickets = [];
let currentActiveTicket = null;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('user-tickets-table-body')) {
        fetchTickets();
    }
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'support') return;
    renderSupportUI();
    if (currentUser) fetchTickets();
});

function renderSupportUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Support Tickets</h2>
                <p class="text-sm text-gray-500">Need help? Open a ticket and our team will assist you.</p>
            </div>
            <button id="open-new-ticket-btn" class="w-full sm:w-auto bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-500/30 flex items-center justify-center gap-2">
                <i class="fa-solid fa-plus"></i> Open New Ticket
            </button>
        </div>

        <!-- Tickets Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-6 border-b border-gray-100 bg-gray-50">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="search-tickets-input" placeholder="Search by subject or ID..." class="w-full sm:w-80 pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white shadow-sm transition-all">
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap min-w-[800px]">
                    <thead class="bg-white text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">Ticket ID</th>
                            <th class="px-6 py-4 font-semibold">Subject</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-40">Last Updated</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Action</th>
                        </tr>
                    </thead>
                    <tbody id="user-tickets-table-body">
                        <tr>
                            <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading tickets...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- New Ticket Modal -->
        <div id="new-ticket-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 mx-4 transform transition-transform scale-95" id="new-ticket-content">
                <div class="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 class="text-xl font-bold text-gray-800">Open New Ticket</h3>
                    <button id="close-new-ticket-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>
                
                <form id="new-ticket-form" class="space-y-5">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Subject <span class="text-red-500">*</span></label>
                        <input type="text" id="ticket-subject" required placeholder="e.g., Order #12345 not starting" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Message <span class="text-red-500">*</span></label>
                        <textarea id="ticket-message" required rows="4" placeholder="Please describe your issue in detail..." class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none"></textarea>
                    </div>
                    
                    <div id="new-ticket-notification" class="hidden text-sm px-4 py-3 rounded-xl font-semibold"></div>

                    <div class="pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" id="cancel-new-ticket-btn" class="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold transition-colors">Cancel</button>
                        <button type="submit" id="submit-new-ticket-btn" class="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold transition-colors shadow-md flex items-center gap-2">
                            <i class="fa-solid fa-paper-plane"></i> Submit Ticket
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Chat / View Ticket Modal -->
        <div id="chat-ticket-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-4 sm:p-6 mx-4 transform transition-transform scale-95 flex flex-col h-[85vh]" id="chat-ticket-content">
                
                <!-- Modal Header -->
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-4 shrink-0">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800 truncate max-w-[280px] sm:max-w-md" id="chat-ticket-subject">Subject</h3>
                        <p class="text-xs text-gray-500 font-mono mt-1" id="chat-ticket-id">ID: ---</p>
                    </div>
                    <button id="close-chat-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors bg-gray-50 hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                
                <!-- Chat History Area -->
                <div class="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-4 flex flex-col gap-4" id="chat-messages-container">
                    <div class="text-center text-gray-400 text-sm my-auto">
                        <i class="fa-solid fa-spinner fa-spin mb-2"></i><br>Loading conversation...
                    </div>
                </div>

                <!-- Reply Area -->
                <div class="shrink-0" id="chat-reply-area">
                    <form id="chat-reply-form" class="relative">
                        <textarea id="chat-reply-text" rows="2" placeholder="Type your reply here..." class="w-full pl-4 pr-16 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none text-sm shadow-sm" required></textarea>
                        <button type="submit" id="send-chat-btn" class="absolute right-2 bottom-2 w-10 h-10 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center justify-center transition-colors shadow-md disabled:opacity-50">
                            <i class="fa-solid fa-paper-plane text-sm"></i>
                        </button>
                    </form>
                </div>

                <!-- Closed Alert -->
                <div id="chat-closed-alert" class="hidden shrink-0 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-semibold text-center border border-red-100">
                    <i class="fa-solid fa-lock mr-2"></i> This ticket is closed. You cannot reply to it.
                </div>
            </div>
        </div>
    `;

    // Search Listener
    document.getElementById('search-tickets-input').addEventListener('input', renderTicketsTable);

    // New Ticket Modal Logic
    const newModal = document.getElementById('new-ticket-modal');
    const newContent = document.getElementById('new-ticket-content');
    
    document.getElementById('open-new-ticket-btn').addEventListener('click', () => {
        document.getElementById('new-ticket-form').reset();
        document.getElementById('new-ticket-notification').classList.add('hidden');
        newModal.classList.remove('hidden');
        setTimeout(() => newContent.classList.remove('scale-95'), 10);
    });

    const closeNewModal = () => {
        newContent.classList.add('scale-95');
        setTimeout(() => newModal.classList.add('hidden'), 150);
    };

    document.getElementById('close-new-ticket-btn').addEventListener('click', closeNewModal);
    document.getElementById('cancel-new-ticket-btn').addEventListener('click', closeNewModal);
    
    document.getElementById('new-ticket-form').addEventListener('submit', handleCreateTicket);

    // Chat Modal Logic
    const chatModal = document.getElementById('chat-ticket-modal');
    const chatContent = document.getElementById('chat-ticket-content');

    const closeChatModal = () => {
        chatContent.classList.add('scale-95');
        setTimeout(() => chatModal.classList.add('hidden'), 150);
        currentActiveTicket = null;
    };

    document.getElementById('close-chat-modal-btn').addEventListener('click', closeChatModal);
    document.getElementById('chat-reply-form').addEventListener('submit', handleSendReply);
}

function fetchTickets() {
    if (!currentUser) return;
    const ticketsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'tickets');
    
    onSnapshot(ticketsRef, (snapshot) => {
        userTickets = [];
        snapshot.forEach(doc => userTickets.push({ id: doc.id, ...doc.data() }));
        
        // Sort newest activity first
        userTickets.sort((a, b) => {
            const dateA = a.updatedAt ? a.updatedAt.toMillis() : (a.createdAt ? a.createdAt.toMillis() : 0);
            const dateB = b.updatedAt ? b.updatedAt.toMillis() : (b.createdAt ? b.createdAt.toMillis() : 0);
            return dateB - dateA;
        });
        
        renderTicketsTable();

        // Live update active chat if open
        if (currentActiveTicket) {
            const updatedTicket = userTickets.find(t => t.id === currentActiveTicket.id);
            if (updatedTicket) {
                currentActiveTicket = updatedTicket;
                renderChatMessages(updatedTicket.messages);
                toggleReplyArea(updatedTicket.status);
            }
        }
    });
}

function renderTicketsTable() {
    const tableBody = document.getElementById('user-tickets-table-body');
    const searchInput = document.getElementById('search-tickets-input');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (userTickets.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-2xl mx-auto mb-3 border border-gray-200"><i class="fa-solid fa-headset"></i></div>
                    <p>No support tickets found.</p>
                </td>
            </tr>`;
        return;
    }

    let visibleCount = 0;

    userTickets.forEach(ticket => {
        const shortId = ticket.id.substring(0,8).toUpperCase();
        const subject = ticket.subject || 'No Subject';
        
        if (subject.toLowerCase().includes(searchTerm) || shortId.toLowerCase().includes(searchTerm)) {
            visibleCount++;
            
            let dateStr = 'N/A';
            const timeObj = ticket.updatedAt || ticket.createdAt;
            if (timeObj) {
                dateStr = timeObj.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            tableBody.innerHTML += `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onclick="window.openTicketChat('${ticket.id}')">
                    <td class="px-6 py-4 font-mono text-xs text-gray-500">${shortId}</td>
                    <td class="px-6 py-4 font-semibold text-gray-800 truncate max-w-[250px]">${subject}</td>
                    <td class="px-6 py-4 text-center">${getStatusBadge(ticket.status)}</td>
                    <td class="px-6 py-4 text-center text-xs text-gray-500">${dateStr}</td>
                    <td class="px-6 py-4 text-center">
                        <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold shadow-sm">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No matching tickets found.</td></tr>`;
    }
}

function getStatusBadge(status) {
    const s = (status || 'Open').toLowerCase();
    if (s === 'open') return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Open</span>`;
    if (s === 'answered') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Answered</span>`;
    if (s === 'closed') return `<span class="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Closed</span>`;
    return `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">${status}</span>`;
}

// Exposed to window so the onclick in the table works
window.openTicketChat = (ticketId) => {
    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    currentActiveTicket = ticket;
    
    document.getElementById('chat-ticket-subject').innerText = ticket.subject;
    document.getElementById('chat-ticket-id').innerText = `Ticket ID: ${ticket.id.substring(0,8).toUpperCase()}`;
    document.getElementById('chat-reply-text').value = '';

    renderChatMessages(ticket.messages);
    toggleReplyArea(ticket.status);

    const modal = document.getElementById('chat-ticket-modal');
    const content = document.getElementById('chat-ticket-content');
    modal.classList.remove('hidden');
    setTimeout(() => content.classList.remove('scale-95'), 10);
};

function toggleReplyArea(status) {
    const replyArea = document.getElementById('chat-reply-area');
    const closedAlert = document.getElementById('chat-closed-alert');

    if ((status || 'Open').toLowerCase() === 'closed') {
        replyArea.classList.add('hidden');
        closedAlert.classList.remove('hidden');
    } else {
        replyArea.classList.remove('hidden');
        closedAlert.classList.add('hidden');
    }
}

function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages-container');
    container.innerHTML = '';

    if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 text-sm my-auto">Start the conversation...</div>`;
        return;
    }

    messages.forEach(msg => {
        const isUser = msg.role === 'user';
        const alignment = isUser ? 'self-end' : 'self-start';
        const bgColor = isUser ? 'bg-brand-500 text-white rounded-br-none shadow-md' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm';
        const author = isUser ? 'You' : 'Support Team';
        
        let timeStr = '';
        if (msg.timestamp) {
            const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
            timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `max-w-[85%] rounded-2xl p-4 ${alignment} ${bgColor}`;
        
        msgDiv.innerHTML = `
            <div class="flex items-center gap-2 mb-1.5">
                <span class="font-bold text-xs ${isUser ? 'text-brand-100' : 'text-brand-600'}">${author}</span>
                <span class="text-[10px] ${isUser ? 'text-brand-200' : 'text-gray-400'}">${timeStr}</span>
            </div>
            <div class="text-sm whitespace-pre-wrap leading-relaxed">${escapeHTML(msg.text)}</div>
        `;
        
        container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

async function handleCreateTicket(e) {
    e.preventDefault();
    if (!currentUser) return;

    const btn = document.getElementById('submit-new-ticket-btn');
    const notif = document.getElementById('new-ticket-notification');
    const subject = document.getElementById('ticket-subject').value.trim();
    const message = document.getElementById('ticket-message').value.trim();

    if (!subject || !message) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    notif.classList.add('hidden');

    const newTicketData = {
        subject: subject,
        status: 'Open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [{
            role: 'user',
            text: message,
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const ticketsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'tickets');
        await addDoc(ticketsRef, newTicketData);

        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-green-50 text-green-700 border border-green-200 block shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i> Ticket created successfully!`;
        
        e.target.reset();
        
        setTimeout(() => {
            document.getElementById('close-new-ticket-btn').click();
        }, 1500);

    } catch (error) {
        console.error("Create ticket error:", error);
        notif.className = "text-sm px-4 py-3 rounded-xl font-semibold bg-red-50 text-red-600 border border-red-100 block shadow-sm";
        notif.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i> Failed to submit ticket.`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Ticket';
    }
}

async function handleSendReply(e) {
    e.preventDefault();
    if (!currentUser || !currentActiveTicket) return;

    const input = document.getElementById('chat-reply-text');
    const text = input.value.trim();
    const btn = document.getElementById('send-chat-btn');

    if (!text) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i>';

    const newMessage = {
        role: 'user',
        text: text,
        timestamp: new Date().toISOString()
    };

    try {
        const ticketRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'tickets', currentActiveTicket.id);
        
        await updateDoc(ticketRef, {
            messages: arrayUnion(newMessage),
            status: 'Open', // Automatically re-open if the user replies
            updatedAt: serverTimestamp()
        });

        input.value = '';

    } catch (error) {
        console.error("Failed to send reply:", error);
        alert("Failed to send message. Please try again.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane text-sm"></i>';
    }
}