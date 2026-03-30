import { 
    getFirestore, 
    collectionGroup, 
    onSnapshot,
    doc,
    updateDoc,
    arrayUnion,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderPagination } from '../pagination.js';

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let allTickets = [];
let currentManagingTicket = null;
let currentPage = 1;
const rowsPerPage = 50;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'support') return;

    renderSupportUI();
    fetchAllTickets();
});

function renderSupportUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Support View
    contentArea.innerHTML = `
        <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Support Tickets</h2>
                <p class="text-sm text-gray-500">Respond to user inquiries, issues, and API requests.</p>
            </div>
            <div class="w-full sm:w-auto">
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="admin-search-tickets" placeholder="Search by Ticket ID or User ID..." class="w-full sm:w-80 pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm">
                </div>
            </div>
        </div>

        <!-- Tickets Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600 whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-4 font-semibold w-24">Ticket ID</th>
                            <th class="px-6 py-4 font-semibold w-24">User ID</th>
                            <th class="px-6 py-4 font-semibold min-w-[200px]">Subject</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Status</th>
                            <th class="px-6 py-4 font-semibold text-center w-32">Last Updated</th>
                            <th class="px-6 py-4 font-semibold text-center w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-tickets-table-body">
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                                <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-brand-500"></i>
                                <p>Loading support tickets...</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="admin-support-pagination-container"></div>
        </div>

        <!-- Manage Ticket Modal -->
        <div id="manage-ticket-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 mx-4 transform transition-transform scale-95 flex flex-col max-h-[90vh]" id="manage-ticket-content">
                
                <!-- Modal Header -->
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3 shrink-0">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800" id="modal-ticket-subject">Ticket Subject</h3>
                        <p class="text-xs text-gray-500 font-mono mt-0.5" id="modal-ticket-id">ID: ---</p>
                    </div>
                    <button id="close-ticket-modal-btn" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                
                <!-- Chat History Area -->
                <div class="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4 flex flex-col gap-3 min-h-[300px]" id="ticket-messages-container">
                    <!-- Messages dynamically injected here -->
                    <div class="text-center text-gray-400 text-sm my-auto">
                        <i class="fa-solid fa-spinner fa-spin mb-2"></i><br>Loading conversation...
                    </div>
                </div>

                <!-- Reply Area -->
                <div class="shrink-0 space-y-3" id="ticket-reply-area">
                    <textarea id="reply-text" rows="3" placeholder="Type your response here..." class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all resize-none text-sm"></textarea>
                    
                    <div class="flex justify-between items-center">
                        <button type="button" id="mark-closed-btn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                            <i class="fa-solid fa-lock"></i> Close Ticket
                        </button>
                        <button type="button" id="send-reply-btn" class="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-md">
                            <i class="fa-solid fa-paper-plane"></i> Send Reply
                        </button>
                    </div>
                </div>

                <!-- Closed Alert (Hidden by default) -->
                <div id="ticket-closed-alert" class="hidden shrink-0 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-semibold text-center border border-red-100">
                    <i class="fa-solid fa-lock mr-2"></i> This ticket is closed and cannot receive new replies.
                </div>
            </div>
        </div>
    `;

    // Attach Search Listener
    const searchInput = document.getElementById('admin-search-tickets');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderTicketsTable();
        });
    }

    // Attach Modal Close Listeners
    const modal = document.getElementById('manage-ticket-modal');
    const closeBtn = document.getElementById('close-ticket-modal-btn');
    const content = document.getElementById('manage-ticket-content');
    
    // Attach Action Listeners
    const sendBtn = document.getElementById('send-reply-btn');
    const closeTicketBtn = document.getElementById('mark-closed-btn');

    const closeModal = () => {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 150);
        currentManagingTicket = null;
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    sendBtn.addEventListener('click', handleSendReply);
    closeTicketBtn.addEventListener('click', () => updateTicketStatus('Closed'));
}

function fetchAllTickets() {
    // collectionGroup query to get all tickets created by any user
    const ticketsQuery = collectionGroup(db, 'tickets');
    
    onSnapshot(ticketsQuery, (snapshot) => {
        allTickets = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Extract the userId from the document reference path
            // Path structure: artifacts/{appId}/users/{userId}/tickets/{ticketId}
            const pathSegments = docSnap.ref.path.split('/');
            const userId = pathSegments.length >= 4 ? pathSegments[3] : 'Unknown';

            allTickets.push({
                id: docSnap.id,
                userId: userId,
                ...data
            });
        });

        // Sort by updatedAt descending (Tickets with newest activity first)
        allTickets.sort((a, b) => {
            const dateA = a.updatedAt ? a.updatedAt.toMillis() : (a.createdAt ? a.createdAt.toMillis() : 0);
            const dateB = b.updatedAt ? b.updatedAt.toMillis() : (b.createdAt ? b.createdAt.toMillis() : 0);
            return dateB - dateA;
        });

        renderTicketsTable();

        // If a modal is currently open, refresh its messages
        if (currentManagingTicket) {
            const updatedTicket = allTickets.find(t => t.id === currentManagingTicket.id);
            if (updatedTicket) {
                currentManagingTicket = updatedTicket;
                renderMessages(updatedTicket.messages);
                toggleReplyArea(updatedTicket.status);
            }
        }

    }, (error) => {
        console.error("Error fetching global tickets: ", error);
        const tableBody = document.getElementById('admin-tickets-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Failed to load tickets database.</td></tr>`;
        }
    });
}

function renderTicketsTable() {
    const tableBody = document.getElementById('admin-tickets-table-body');
    const searchInput = document.getElementById('admin-search-tickets');
    const paginationContainer = document.getElementById('admin-support-pagination-container');
    if (!tableBody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tableBody.innerHTML = '';

    if (allTickets.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No support tickets found.</td></tr>`;
        return;
    }

    const filtered = allTickets.filter(ticket => {
        const subject = ticket.subject || '';
        const status = ticket.status || 'Open';
        return ticket.id.toLowerCase().includes(searchTerm) || 
               ticket.userId.toLowerCase().includes(searchTerm) ||
               subject.toLowerCase().includes(searchTerm) ||
               status.toLowerCase().includes(searchTerm);
    });

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if(currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let visibleCount = 0;

    paginated.forEach(ticket => {
        visibleCount++;
        const displayTicketId = ticket.id.substring(0, 8).toUpperCase();
        const displayUserId = ticket.userId.substring(0, 8);
        const subject = ticket.subject || 'No Subject';
        const status = ticket.status || 'Open';
        
        // Format Last Updated safely
        let dateStr = 'N/A';
        const timeObj = ticket.updatedAt || ticket.createdAt;
        if (timeObj) {
            dateStr = timeObj.toDate().toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }

        const row = document.createElement('tr');
        row.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
        
        row.innerHTML = `
            <td class="px-6 py-4 font-mono font-bold text-gray-800">${displayTicketId}</td>
            <td class="px-6 py-4 font-mono text-xs text-brand-600" title="${ticket.userId}">${displayUserId}...</td>
            <td class="px-6 py-4 text-gray-800 font-medium truncate max-w-[250px]">${subject}</td>
            <td class="px-6 py-4 text-center">${getStatusBadge(status)}</td>
            <td class="px-6 py-4 text-center text-xs text-gray-500">${dateStr}</td>
            <td class="px-6 py-4 text-center">
                <button class="text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-4 py-1.5 rounded transition-colors text-xs font-bold manage-btn shadow-sm">
                    View
                </button>
            </td>
        `;

        row.querySelector('.manage-btn').addEventListener('click', () => openTicketModal(ticket));
        tableBody.appendChild(row);
    });

    if (visibleCount === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No matching tickets found.</td></tr>`;
    }

    if (paginationContainer) {
        renderPagination(filtered.length, rowsPerPage, currentPage, (page) => {
            currentPage = page;
            renderTicketsTable();
        }, paginationContainer);
    }
}

function getStatusBadge(status) {
    const s = (status || 'Open').toLowerCase();
    if (s === 'open') return `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold tracking-wider">Open</span>`;
    if (s === 'answered') return `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold tracking-wider">Answered</span>`;
    if (s === 'closed') return `<span class="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs font-bold tracking-wider">Closed</span>`;
    return `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold tracking-wider">${status}</span>`;
}

function openTicketModal(ticket) {
    currentManagingTicket = ticket;
    
    // Set Header
    document.getElementById('modal-ticket-subject').innerText = ticket.subject || 'No Subject';
    document.getElementById('modal-ticket-id').innerText = `ID: ${ticket.id} | User: ${ticket.userId.substring(0,8)}...`;
    
    // Clear textarea
    document.getElementById('reply-text').value = '';

    // Render Messages
    renderMessages(ticket.messages);

    // Toggle Reply Area based on Status
    toggleReplyArea(ticket.status);

    // Open Modal visually
    const modal = document.getElementById('manage-ticket-modal');
    const content = document.getElementById('manage-ticket-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function toggleReplyArea(status) {
    const replyArea = document.getElementById('ticket-reply-area');
    const closedAlert = document.getElementById('ticket-closed-alert');

    if ((status || 'Open').toLowerCase() === 'closed') {
        replyArea.classList.add('hidden');
        closedAlert.classList.remove('hidden');
    } else {
        replyArea.classList.remove('hidden');
        closedAlert.classList.add('hidden');
    }
}

function renderMessages(messages) {
    const container = document.getElementById('ticket-messages-container');
    container.innerHTML = '';

    if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 text-sm my-auto">No messages found for this ticket.</div>`;
        return;
    }

    messages.forEach(msg => {
        const isAdmin = msg.role === 'admin';
        const alignment = isAdmin ? 'self-end' : 'self-start';
        const bgColor = isAdmin ? 'bg-brand-500 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none';
        const author = isAdmin ? 'Support Team' : 'User';
        
        let timeStr = '';
        if (msg.timestamp) {
            // Check if it's a Firestore Timestamp or ISO string
            const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
            timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `max-w-[85%] rounded-2xl p-3 shadow-sm ${alignment} ${bgColor}`;
        
        msgDiv.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-xs ${isAdmin ? 'text-brand-100' : 'text-gray-500'}">${author}</span>
                <span class="text-[10px] ${isAdmin ? 'text-brand-200' : 'text-gray-400'}">${timeStr}</span>
            </div>
            <div class="text-sm whitespace-pre-wrap leading-relaxed">${escapeHTML(msg.text)}</div>
        `;
        
        container.appendChild(msgDiv);
    });

    // Scroll to the bottom to show latest message
    container.scrollTop = container.scrollHeight;
}

// Utility to prevent XSS in chat
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

async function handleSendReply() {
    if (!currentManagingTicket) return;

    const replyInput = document.getElementById('reply-text');
    const text = replyInput.value.trim();
    const btn = document.getElementById('send-reply-btn');

    if (!text) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

    const newMessage = {
        role: 'admin',
        text: text,
        timestamp: new Date().toISOString() // Storing as ISO string to be simple inside arrayUnion
    };

    try {
        const ticketRef = doc(db, 'artifacts', appId, 'users', currentManagingTicket.userId, 'tickets', currentManagingTicket.id);
        
        // Append message, update status to 'Answered', and bump the updatedAt timestamp
        await updateDoc(ticketRef, {
            messages: arrayUnion(newMessage),
            status: 'Answered',
            updatedAt: serverTimestamp()
        });

        // Clear input immediately for better UX (onSnapshot will handle rendering the new message)
        replyInput.value = '';

    } catch (error) {
        console.error("Failed to send reply:", error);
        alert("Failed to send reply. Please check your permissions.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Reply';
    }
}

async function updateTicketStatus(newStatus) {
    if (!currentManagingTicket) return;
    
    // Confirm if closing
    if (newStatus === 'Closed' && !confirm("Are you sure you want to close this ticket?")) return;

    try {
        const ticketRef = doc(db, 'artifacts', appId, 'users', currentManagingTicket.userId, 'tickets', currentManagingTicket.id);
        await updateDoc(ticketRef, {
            status: newStatus,
            updatedAt: serverTimestamp()
        });
        
    } catch (error) {
        console.error(`Failed to update status to ${newStatus}:`, error);
        alert(`Failed to close ticket.`);
    }
}