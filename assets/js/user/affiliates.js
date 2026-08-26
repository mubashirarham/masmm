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
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">Affiliate Program</h2>
            <p class="text-sm text-slate-600 font-medium">Earn passive income by referring active users to our platform.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <!-- Referral Link Card -->
            <div class="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 p-6 sm:p-8 rounded-2xl shadow-sm text-white border border-slate-700 relative overflow-hidden">
                <h3 class="text-lg font-black mb-2 flex items-center gap-2 text-white"><i class="fa-solid fa-link text-brand-400"></i> Your Unique Referral Code</h3>
                <p class="text-slate-300 text-xs sm:text-sm mb-6 max-w-lg font-medium leading-relaxed">Share this link across your networks. When users sign up via this link, they are attached to your account and you receive a commission on their deposits.</p>
                
                <div class="flex items-center bg-slate-950/80 rounded-xl border border-slate-700 overflow-hidden relative z-10 shadow-inner">
                    <input type="text" id="ref-link-input" class="w-full bg-transparent border-none text-white px-4 py-3 text-xs sm:text-sm font-mono outline-none" readonly value="Loading...">
                    <button id="copy-ref-btn" class="bg-brand-500 hover:bg-brand-600 text-white px-5 py-3 font-extrabold uppercase tracking-wider text-xs transition-colors shrink-0 flex items-center gap-2 cursor-pointer">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
                
                <div class="mt-4 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400">
                    <span class="flex items-center gap-1.5"><i class="fa-solid fa-check text-emerald-400"></i> Permanent Tracking</span>
                    <span class="flex items-center gap-1.5"><i class="fa-solid fa-check text-emerald-400"></i> Auto-Deposited</span>
                </div>
            </div>

            <!-- Commission Info Card -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex flex-col justify-center text-center relative">
                <div class="w-14 h-14 mx-auto bg-brand-50 text-brand-600 border border-brand-200 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-sm">
                    <i class="fa-solid fa-percent"></i>
                </div>
                <h3 class="text-3xl font-black text-slate-900 mb-1" id="commission-rate">Loading...</h3>
                <p class="text-slate-500 text-xs font-bold uppercase tracking-wider">Commission Rate</p>
                <div class="absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full shadow-sm">Active</div>
            </div>
        </div>

        <!-- Global Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-users"></i></div>
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">Total Signups</p>
                    <p class="text-2xl font-black text-slate-900" id="stat-signups">0</p>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-arrow-pointer"></i></div>
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">Total Visits (Hits)</p>
                    <p class="text-2xl font-black text-slate-900" id="stat-hits">0</p>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-300 flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-sack-dollar"></i></div>
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">Total Earnings</p>
                    <p class="text-2xl font-black text-brand-600" id="stat-earnings">Rs 0.00</p>
                </div>
            </div>
        </div>

        <!-- Explainer -->
        <div class="bg-slate-50 rounded-2xl border border-slate-300 p-6 flex items-start gap-4 shadow-sm">
            <i class="fa-solid fa-circle-info text-brand-600 text-xl mt-0.5"></i>
            <div>
                <h4 class="font-black text-slate-900 text-sm mb-1">How it works</h4>
                <p class="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
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
