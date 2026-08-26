import { 
    getFirestore, doc, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let currentApiKey = "Not generated yet";

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const viewEl = document.getElementById('view-api');
    if (user && viewEl && viewEl.classList.contains('active')) {
        fetchApiKey();
    }
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'api') return;
    renderApiUI();
    if (currentUser) fetchApiKey();
});

function renderApiUI() {
    const contentArea = document.getElementById('user-content');
    const baseUrl = `https://${window.location.host}/api/v2`;
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">API Documentation</h2>
            <p class="text-sm text-slate-600 font-medium">Integrate our wholesale SMM services directly into your panel or application.</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 sm:p-8 mb-8">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-4 mb-6 gap-4">
                <div>
                    <h3 class="text-lg font-black text-slate-900">Your API Key</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Use this token for programmatic authentication.</p>
                </div>
                <button id="generate-key-btn" class="bg-brand-50 text-brand-700 border border-brand-300 hover:bg-brand-100 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer shadow-sm">
                    <i class="fa-solid fa-arrows-rotate"></i> Generate New Key
                </button>
            </div>

            <div class="mb-2">
                <div class="flex relative shadow-sm rounded-xl overflow-hidden border border-slate-300">
                    <input type="text" id="api-key-display" readonly value="Loading..." class="w-full px-4 py-3 bg-slate-50 text-slate-900 font-mono text-sm outline-none font-bold tracking-wide">
                    <button id="copy-key-btn" class="bg-brand-500 hover:bg-brand-600 text-white px-6 font-extrabold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer shrink-0">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
                <p class="text-xs text-slate-500 mt-2 font-medium"><i class="fa-solid fa-circle-info text-brand-500 mr-1"></i> Keep your API key secret. Do not share it with anyone.</p>
            </div>
        </div>

        <!-- API Documentation Details -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
            <div class="p-6 sm:p-8 border-b border-slate-300 bg-slate-50">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p class="text-slate-500 font-bold mb-1 uppercase text-xs tracking-wider">HTTP Method</p>
                        <p class="font-extrabold text-slate-900">POST</p>
                    </div>
                    <div class="lg:col-span-2">
                        <p class="text-slate-500 font-bold mb-1 uppercase text-xs tracking-wider">API URL</p>
                        <code class="text-brand-700 bg-brand-50 px-2 py-1 rounded-lg border border-brand-300 font-mono text-xs font-bold">${baseUrl}</code>
                    </div>
                    <div>
                        <p class="text-slate-500 font-bold mb-1 uppercase text-xs tracking-wider">Response Format</p>
                        <p class="font-extrabold text-slate-900">JSON</p>
                    </div>
                </div>
            </div>

            <div class="p-6 sm:p-8 space-y-12">
                
                <!-- 1. Services List -->
                <div>
                    <h4 class="text-lg font-black text-slate-900 mb-4 flex items-center gap-2"><div class="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 border border-brand-300 flex items-center justify-center text-xs font-black">1</div> Services List</h4>
                    <div class="overflow-x-auto rounded-xl border border-slate-300 mb-4">
                        <table class="w-full text-left text-sm text-slate-700">
                            <thead class="bg-slate-100 text-slate-800">
                                <tr>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Parameters</th>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">key</td><td class="px-4 py-3">Your API Key</td></tr>
                                <tr><td class="px-4 py-3 font-mono font-bold text-slate-900">action</td><td class="px-4 py-3 font-mono text-brand-600 font-bold">services</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-md">
                        <p class="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider">Example Response</p>
                        <pre class="text-emerald-400 font-mono text-xs leading-relaxed">
[
    {
        "service": 1,
        "name": "Instagram Followers [Real]",
        "type": "Default",
        "category": "Instagram",
        "rate": "0.90",
        "min": "50",
        "max": "10000"
    }
]</pre>
                    </div>
                </div>

                <!-- 2. Add Order -->
                <div>
                    <h4 class="text-lg font-black text-slate-900 mb-4 flex items-center gap-2"><div class="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 border border-brand-300 flex items-center justify-center text-xs font-black">2</div> Add Order</h4>
                    <div class="overflow-x-auto rounded-xl border border-slate-300 mb-4">
                        <table class="w-full text-left text-sm text-slate-700">
                            <thead class="bg-slate-100 text-slate-800">
                                <tr>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Parameters</th>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">key</td><td class="px-4 py-3">Your API Key</td></tr>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">action</td><td class="px-4 py-3 font-mono text-brand-600 font-bold">add</td></tr>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">service</td><td class="px-4 py-3">Service ID</td></tr>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">link</td><td class="px-4 py-3">Link to page/profile</td></tr>
                                <tr><td class="px-4 py-3 font-mono font-bold text-slate-900">quantity</td><td class="px-4 py-3">Needed quantity</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-md">
                        <p class="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider">Example Response (Success)</p>
                        <pre class="text-emerald-400 font-mono text-xs leading-relaxed">
{
    "order": 23501
}</pre>
                    </div>
                </div>

                <!-- 3. Order Status -->
                <div>
                    <h4 class="text-lg font-black text-slate-900 mb-4 flex items-center gap-2"><div class="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 border border-brand-300 flex items-center justify-center text-xs font-black">3</div> Order Status</h4>
                    <div class="overflow-x-auto rounded-xl border border-slate-300 mb-4">
                        <table class="w-full text-left text-sm text-slate-700">
                            <thead class="bg-slate-100 text-slate-800">
                                <tr>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Parameters</th>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">key</td><td class="px-4 py-3">Your API Key</td></tr>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">action</td><td class="px-4 py-3 font-mono text-brand-600 font-bold">status</td></tr>
                                <tr><td class="px-4 py-3 font-mono font-bold text-slate-900">order</td><td class="px-4 py-3">Order ID</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-md">
                        <p class="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider">Example Response</p>
                        <pre class="text-emerald-400 font-mono text-xs leading-relaxed">
{
    "charge": "0.27819",
    "start_count": "3572",
    "status": "Partial",
    "remains": "157",
    "currency": "PKR"
}</pre>
                    </div>
                </div>

                <!-- 4. User Balance -->
                <div>
                    <h4 class="text-lg font-black text-slate-900 mb-4 flex items-center gap-2"><div class="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 border border-brand-300 flex items-center justify-center text-xs font-black">4</div> User Balance</h4>
                    <div class="overflow-x-auto rounded-xl border border-slate-300 mb-4">
                        <table class="w-full text-left text-sm text-slate-700">
                            <thead class="bg-slate-100 text-slate-800">
                                <tr>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Parameters</th>
                                    <th class="px-4 py-3 font-bold text-xs uppercase tracking-wider border-b border-slate-300">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-b border-slate-200"><td class="px-4 py-3 font-mono font-bold text-slate-900">key</td><td class="px-4 py-3">Your API Key</td></tr>
                                <tr><td class="px-4 py-3 font-mono font-bold text-slate-900">action</td><td class="px-4 py-3 font-mono text-brand-600 font-bold">balance</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-md">
                        <p class="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider">Example Response</p>
                        <pre class="text-emerald-400 font-mono text-xs leading-relaxed">
{
    "balance": 1500.50,
    "currency": "PKR"
}</pre>
                    </div>
                </div>

            </div>
        </div>
    `;

    document.getElementById('generate-key-btn').addEventListener('click', handleGenerateKey);
    
    document.getElementById('copy-key-btn').addEventListener('click', () => {
        const keyDisplay = document.getElementById('api-key-display');
        keyDisplay.select();
        document.execCommand('copy');
        
        const btn = document.getElementById('copy-key-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        btn.classList.replace('bg-gray-800', 'bg-brand-500');
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.replace('bg-brand-500', 'bg-gray-800');
        }, 2000);
    });
}

function generateSecureHex() {
    const array = new Uint8Array(20); // 40 characters long hex
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchApiKey() {
    if (!currentUser) return;

    try {
        const apiRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'api');
        const apiSnap = await getDoc(apiRef);

        if (apiSnap.exists() && apiSnap.data().key) {
            currentApiKey = apiSnap.data().key;
            const display = document.getElementById('api-key-display');
            if(display) display.value = currentApiKey;
        } else {
            // First time loading, automatically generate one
            await handleGenerateKey(false); 
        }
    } catch (error) {
        console.error("Error fetching API key:", error);
    }
}

async function handleGenerateKey(requireConfirmation = true) {
    if (!currentUser) return;

    if (requireConfirmation && currentApiKey !== "Not generated yet") {
        if (!confirm("Are you sure you want to generate a new API key? Any applications using your old key will immediately stop working.")) {
            return;
        }
    }

    const newKey = generateSecureHex();
    const btn = document.getElementById('generate-key-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const apiRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'api');
        await setDoc(apiRef, { 
            key: newKey,
            createdAt: serverTimestamp()
        }, { merge: true });

        currentApiKey = newKey;
        const display = document.getElementById('api-key-display');
        if(display) display.value = currentApiKey;

    } catch (error) {
        console.error("Error saving new API key:", error);
        alert("Failed to generate key. Please try again.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Generate New Key';
        }
    }
}