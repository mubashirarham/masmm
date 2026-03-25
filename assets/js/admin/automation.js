import { 
    getFirestore, 
    collectionGroup, 
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

let stats = {
    pending: 0,
    processing: 0,
    lastPulse: 'Never'
};

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'automation') return;

    renderAutomationUI();
    fetchAutomationStats();
});

function renderAutomationUI() {
    const contentArea = document.getElementById('admin-content');
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">System Automation</h2>
            <p class="text-sm text-gray-500">Monitor and control the automated order forwarding and status syncing engine.</p>
        </div>

        <!-- Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div class="flex items-center gap-4 mb-2">
                    <div class="w-10 h-10 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center">
                        <i class="fa-solid fa-clock-rotate-left text-lg"></i>
                    </div>
                    <span class="text-sm font-semibold text-gray-500 uppercase tracking-wider">Pending Forwarding</span>
                </div>
                <h3 id="auto-pending-count" class="text-3xl font-bold text-gray-800">0</h3>
                <p class="text-xs text-gray-400 mt-2">Orders waiting to be sent to providers.</p>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div class="flex items-center gap-4 mb-2">
                    <div class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <i class="fa-solid fa-sync fa-spin-slow text-lg"></i>
                    </div>
                    <span class="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Syncing</span>
                </div>
                <h3 id="auto-processing-count" class="text-3xl font-bold text-gray-800">0</h3>
                <p class="text-xs text-gray-400 mt-2">Orders being tracked for status updates.</p>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div class="flex items-center gap-4 mb-2">
                    <div class="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                        <i class="fa-solid fa-heartbeat text-lg"></i>
                    </div>
                    <span class="text-sm font-semibold text-gray-500 uppercase tracking-wider">System Pulse</span>
                </div>
                <h3 id="auto-last-pulse" class="text-lg font-bold text-gray-800">Running...</h3>
                <p class="text-xs text-gray-400 mt-2">The cron job runs every 1 minute.</p>
            </div>
        </div>

        <!-- Control Center -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-gray-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div class="relative z-10">
                    <h4 class="text-xl font-bold mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-bolt text-yellow-400"></i> Manual Engine Control
                    </h4>
                    <p class="text-gray-400 text-sm mb-6 leading-relaxed">
                        Normally, the system processes orders automatically every minute. If you have urgent orders or just want to test the connection, you can trigger a manual "System Pulse" below.
                    </p>
                    <button id="trigger-pulse-btn" class="bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg flex items-center gap-2">
                        <i class="fa-solid fa-play"></i> Trigger System Pulse
                    </button>
                    <div id="pulse-notification" class="hidden mt-4 p-3 rounded-lg text-sm font-semibold"></div>
                </div>
                <i class="fa-solid fa-robot absolute -bottom-10 -right-10 text-9xl text-white opacity-5 transform rotate-12"></i>
            </div>

            <div class="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-circle-info text-brand-500"></i> Engine Logic
                </h4>
                <div class="space-y-4">
                    <div class="flex gap-3">
                        <div class="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                        <p class="text-sm text-gray-600"><strong>Forwarding:</strong> Grabs all "Pending" orders and sends them to the assigned provider's API.</p>
                    </div>
                    <div class="flex gap-3">
                        <div class="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                        <p class="text-sm text-gray-600"><strong>Syncing:</strong> Checks "Processing" orders with providers and updates Start Count and Remains.</p>
                    </div>
                    <div class="flex gap-3">
                        <div class="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                        <p class="text-sm text-gray-600"><strong>Refunds:</strong> Automatically refunds user balance if a provider cancels an order.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('trigger-pulse-btn').addEventListener('click', triggerManualPulse);
}

function fetchAutomationStats() {
    // Count Pending Orders
    const pendingQuery = query(collectionGroup(db, 'orders'), where('status', '==', 'Pending'));
    onSnapshot(pendingQuery, (snap) => {
        document.getElementById('auto-pending-count').innerText = snap.size;
    });

    // Count Processing Orders
    const processingQuery = query(collectionGroup(db, 'orders'), where('status', 'in', ['Processing', 'In Progress']));
    onSnapshot(processingQuery, (snap) => {
        document.getElementById('auto-processing-count').innerText = snap.size;
    });

    // Update Pulse Time
    const updatePulseDisplay = () => {
        const now = new Date();
        document.getElementById('auto-last-pulse').innerText = now.toLocaleTimeString();
    };
    updatePulseDisplay();
    setInterval(updatePulseDisplay, 60000);
}

async function triggerManualPulse() {
    const btn = document.getElementById('trigger-pulse-btn');
    const notif = document.getElementById('pulse-notification');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulsing Engine...';
    notif.classList.add('hidden');

    try {
        // We hit the Netlify function endpoint directly
        const response = await fetch('/.netlify/functions/worker', {
            method: 'POST'
        });

        if (response.ok) {
            notif.className = "mt-4 p-3 rounded-lg text-sm font-semibold bg-green-500/10 text-green-400 block border border-green-500/20";
            notif.innerHTML = '<i class="fa-solid fa-check-circle mr-2"></i> Engine Pulse Successful. Orders processed.';
        } else {
            throw new Error("Engine returned an error.");
        }
    } catch (error) {
        console.error("Pulse Error:", error);
        notif.className = "mt-4 p-3 rounded-lg text-sm font-semibold bg-red-500/10 text-red-400 block border border-red-500/20";
        notif.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-2"></i> Pulse Failed. Check function logs.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Trigger System Pulse';
        setTimeout(() => notif.classList.add('hidden'), 5000);
    }
}