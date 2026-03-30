import { 
    getFirestore, 
    doc, 
    onSnapshot,
    collection,
    query,
    where,
    getDocs,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;
let currentSettings = null;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'affiliates') return;
    renderAffiliatesUI();
    
    if (currentUser) {
        fetchAffiliateData();
        fetchGlobalSettings();
    } else {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                fetchAffiliateData();
                fetchGlobalSettings();
            }
            unsubscribe();
        });
    }
});

function renderAffiliatesUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Affiliate Program</h2>
            <p class="text-sm text-gray-500">Earn passive income by referring active users to our platform.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <!-- Referral Link Card -->
            <div class="lg:col-span-2 bg-gradient-to-br from-brand-600 to-brand-800 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden">
                <div class="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
                
                <h3 class="text-lg font-bold mb-2 flex items-center gap-2"><i class="fa-solid fa-link"></i> Your Unique Referral Code</h3>
                <p class="text-brand-100 text-sm mb-6 max-w-lg">Share this link across your networks. When users sign up via this link, they are permanently attached to your account and you receive a commission on their deposits.</p>
                
                <div class="flex items-center bg-white/10 rounded-xl border border-white/20 overflow-hidden relative z-10">
                    <input type="text" id="ref-link-input" class="w-full bg-transparent border-none text-white px-4 py-3 text-sm font-mono outline-none" readonly value="Loading...">
                    <button id="copy-ref-btn" class="bg-white text-brand-700 px-5 py-3 font-bold hover:bg-gray-100 transition-colors shrink-0 flex items-center gap-2">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
                
                <div class="mt-4 flex items-center gap-4 text-sm text-brand-100">
                    <span class="flex items-center gap-1"><i class="fa-solid fa-check"></i> Permanent Tracking</span>
                    <span class="flex items-center gap-1"><i class="fa-solid fa-check"></i> Auto-Deposited</span>
                </div>
            </div>

            <!-- Commission Info Card -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center text-center relative">
                <div class="w-16 h-16 mx-auto bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl mb-4 shadow-sm">
                    <i class="fa-solid fa-percent"></i>
                </div>
                <h3 class="text-3xl font-bold text-gray-900 mb-1" id="commission-rate">Loading...</h3>
                <p class="text-gray-500 text-sm font-medium">Commission Rate</p>
                <div class="absolute top-4 right-4 text-xs font-bold px-2 py-1 bg-brand-50 text-brand-600 rounded shadow-sm">Active</div>
            </div>
        </div>

        <!-- Global Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-users"></i></div>
                <div>
                    <p class="text-sm font-semibold text-gray-500 mb-0.5">Total Signups</p>
                    <p class="text-2xl font-bold text-gray-900" id="stat-signups">0</p>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-arrow-pointer"></i></div>
                <div>
                    <p class="text-sm font-semibold text-gray-500 mb-0.5">Total Visits (Hits)</p>
                    <p class="text-2xl font-bold text-gray-900" id="stat-hits">0</p>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 border-l-4 border-l-brand-500">
                <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-sack-dollar"></i></div>
                <div>
                    <p class="text-sm font-semibold text-gray-500 mb-0.5">Total Earnings</p>
                    <p class="text-2xl font-bold text-brand-600" id="stat-earnings">Rs 0.00</p>
                </div>
            </div>
        </div>

        <!-- Explainer -->
        <div class="bg-blue-50/50 rounded-xl border border-blue-100 p-6 flex items-start gap-4">
            <i class="fa-solid fa-circle-info text-blue-500 text-xl mt-0.5"></i>
            <div>
                <h4 class="font-bold text-blue-900 mb-1">How it works</h4>
                <p class="text-sm text-blue-800 leading-relaxed">
                    Whenever an invited user successfully adds funds to their account, your commission is automatically calculated and injected directly into your main balance as a standard deposit entry marking it as "Referral Bonus". No minimum thresholds or manual claiming is required.
                </p>
            </div>
        </div>
    `;

    document.getElementById('copy-ref-btn').addEventListener('click', () => {
        const urlParams = new URL(window.location.origin + '/login.html');
        urlParams.searchParams.set('ref', currentUser.uid);
        
        navigator.clipboard.writeText(urlParams.toString());
        const copyBtn = document.getElementById('copy-ref-btn');
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        copyBtn.classList.replace('text-brand-700', 'text-green-600');
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
            copyBtn.classList.replace('text-green-600', 'text-brand-700');
        }, 2000);
    });
}

async function fetchGlobalSettings() {
    try {
        const configRef = doc(db, 'artifacts', appId, 'public', 'settings', 'affiliates', 'config');
        onSnapshot(configRef, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            const rate = data.commissionRate || 3;
            document.getElementById('commission-rate').innerText = rate + '%';
        });
    } catch(err) {
        console.error("Config fetch error:", err);
        document.getElementById('commission-rate').innerText = '3%';
    }
}

async function fetchAffiliateData() {
    if (!currentUser) return;
    
    // Set Ref Input
    document.getElementById('ref-link-input').value = window.location.origin + '/login.html?ref=' + currentUser.uid;

    const statsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'stats');
    onSnapshot(statsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('stat-signups').innerText = parseInt(data.referralSignups || 0).toLocaleString();
            document.getElementById('stat-hits').innerText = parseInt(data.referralHits || 0).toLocaleString();
            
            if (data.referralEarnings) {
                document.getElementById('stat-earnings').innerText = window.formatMoney(parseFloat(data.referralEarnings));
            } else {
                document.getElementById('stat-earnings').innerText = window.formatMoney(0);
            }
        }
    });
}
