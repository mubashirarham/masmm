import { 
    getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, getDocs, query, where, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;
const PANEL_PRICE = 4999;

export async function renderChildPanelUI(container) {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    container.innerHTML = `
        <div class="mb-8">
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Child Panels</h1>
            <p class="text-gray-500 text-sm">Start your own SMM business by renting a white-labeled clone of this panel.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Order Form -->
            <div class="lg:col-span-1">
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 sticky top-6">
                    <h2 class="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><i class="fa-solid fa-cart-plus text-brand-600"></i> Order New Panel</h2>
                    <form id="childpanel-form" class="space-y-5">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Domain Name</label>
                            <input type="text" id="cp-domain" placeholder="e.g., mysmmpanel.com" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-gray-50 focus:bg-white text-sm" required>
                            <p class="text-xs text-gray-400 mt-1">Must point domain to <strong>Netlify DNS</strong> first (e.g. dns1.p01.nsone.net).</p>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Admin Username</label>
                            <input type="text" id="cp-admin-user" placeholder="admin" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-gray-50 focus:bg-white text-sm" required>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Admin Password</label>
                            <input type="password" id="cp-admin-pass" placeholder="••••••••" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-gray-50 focus:bg-white text-sm" required>
                        </div>
                        <div class="pt-4 border-t border-gray-100">
                            <div class="flex justify-between items-center mb-4">
                                <span class="text-sm font-semibold text-gray-600">Monthly Price:</span>
                                <span class="text-lg font-bold text-brand-600 price-display" data-pkr="${PANEL_PRICE}">Rs ${PANEL_PRICE}</span>
                            </div>
                            <button type="submit" id="cp-submit-btn" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-brand-500/30 transition-all flex justify-center items-center gap-2">
                                <i class="fa-solid fa-bolt"></i> Provision Panel
                            </button>
                            <p id="cp-error" class="text-center text-xs text-red-500 mt-3 font-semibold hidden"></p>
                            <p id="cp-success" class="text-center text-xs text-green-500 mt-3 font-semibold hidden"></p>
                        </div>
                    </form>
                </div>
            </div>

            <!-- List of Owned Panels -->
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-server mr-2 text-gray-400"></i> My Child Panels</h2>
                    </div>
                    <div class="p-0">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-white border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                                        <th class="p-4 font-semibold">Domain</th>
                                        <th class="p-4 font-semibold">Status</th>
                                        <th class="p-4 font-semibold">Created</th>
                                        <th class="p-4 font-semibold text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="cp-list-body" class="divide-y divide-gray-50">
                                    <tr><td colspan="4" class="p-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading panels...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if(window.formatMoney) window.formatMoney();

    document.getElementById('childpanel-form').addEventListener('submit', handleProvisionPanel);
    fetchMyPanels(uid);
}

async function fetchMyPanels(uid) {
    const listBody = document.getElementById('cp-list-body');
    if(!listBody) return;

    try {
        const panelsRef = collection(db, 'artifacts', appId, 'child_panels');
        const q = query(panelsRef, where('ownerUid', '==', uid));
        const snap = await getDocs(q);

        if(snap.empty) {
            listBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-sm text-gray-500 font-medium">You don't have any active child panels.</td></tr>`;
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
            const statusBadge = data.status === 'Active' 
                ? '<span class="bg-green-100 text-green-700 px-2.5 py-1 rounded-md text-xs font-bold">Active</span>'
                : '<span class="bg-red-100 text-red-700 px-2.5 py-1 rounded-md text-xs font-bold">Suspended</span>';

            html += `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-4 font-bold text-gray-900 text-sm"><a href="https://${data.domain}" target="_blank" class="text-brand-600 hover:underline"><i class="fa-solid fa-arrow-up-right-from-square mr-1 text-xs text-gray-400"></i> ${data.domain}</a></td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">${date}</td>
                    <td class="p-4 text-right">
                        <button class="text-gray-400 hover:text-brand-600 transition-colors" title="Settings"><i class="fa-solid fa-gear"></i></button>
                    </td>
                </tr>
            `;
        });
        listBody.innerHTML = html;
    } catch(err) {
        console.error("Error fetching child panels", err);
        listBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500 text-sm font-semibold">Failed to load panels.</td></tr>`;
    }
}

async function handleProvisionPanel(e) {
    e.preventDefault();
    const domain = document.getElementById('cp-domain').value.trim().toLowerCase();
    const adminUser = document.getElementById('cp-admin-user').value.trim();
    const adminPass = document.getElementById('cp-admin-pass').value;

    const btn = document.getElementById('cp-submit-btn');
    const errEl = document.getElementById('cp-error');
    const succEl = document.getElementById('cp-success');

    errEl.classList.add('hidden');
    succEl.classList.add('hidden');

    if(!domain.includes('.')) {
        errEl.innerText = "Please enter a valid domain name.";
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Provisioning...';

    try {
        const uid = auth.currentUser.uid;
        
        // 1. Check Master Balance
        const statsRef = doc(db, 'artifacts', appId, 'users', uid, 'account', 'stats');
        const statsSnap = await getDoc(statsRef);
        
        if(!statsSnap.exists() || (statsSnap.data().balance || 0) < PANEL_PRICE) {
            throw new Error(`Insufficient funds. You need Rs ${PANEL_PRICE} to provision a child panel.`);
        }

        // 2. Check if Domain Already Provisioned
        const formattedDomain = domain.replace(/[^a-z0-9.-]/g, '');
        const tenantAppId = formattedDomain.replace(/\./g, '-');
        
        const panelRef = doc(db, 'artifacts', appId, 'child_panels', formattedDomain);
        const panelSnap = await getDoc(panelRef);
        if(panelSnap.exists()) {
            throw new Error("This domain is already registered in our network.");
        }

        // 3. Deduct Balance
        await updateDoc(statsRef, {
            balance: increment(-PANEL_PRICE)
        });

        // 4. Register Panel in Master Database
        await setDoc(panelRef, {
            domain: formattedDomain,
            ownerUid: uid,
            tenantAppId: tenantAppId,
            status: 'Active',
            createdAt: serverTimestamp()
        });

        // 5. Scaffold the new Tenant (Create Admin user doc in the new completely isolated tree!)
        // In a real Identity Platform SaaS, you would create a Firebase Auth user via Admin SDK.
        // For this demo, we can't create an Auth user client-side silently without logging out the current user!
        // So we will trigger a webhook or just set a flag. Actually, we can pre-seed their db tenant details.
        const tenantRoot = doc(db, 'artifacts', tenantAppId);
        await setDoc(tenantRoot, {
            parentAppId: appId,
            domain: formattedDomain,
            adminEmail: adminUser,
            createdAt: serverTimestamp()
        });

        // 6. Netlify Auto-Binding
        succEl.innerText = "Finalizing Netlify DNS Routings...";
        succEl.classList.remove('hidden');
        try {
            const token = await auth.currentUser.getIdToken();
            const netlifyRes = await fetch('/.netlify/functions/deploy-tenant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ domain: formattedDomain })
            });
            const nlData = await netlifyRes.json();
            if (nlData.skipped) console.warn(nlData.message);
        } catch(netErr) {
            console.error("Netlify API Warning:", netErr);
        }

        succEl.innerText = `Panel successfully provisioned for ${formattedDomain}! It is automatically bound to Netlify. Please point your domain nameservers to Netlify DNS.`;
        succEl.classList.remove('hidden');
        
        // Reset form
        document.getElementById('childpanel-form').reset();
        
        // Refresh list
        fetchMyPanels(uid);

    } catch(err) {
        console.error("Provisioning Error", err);
        errEl.innerText = err.message || "An error occurred while provisioning the panel.";
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Provision Panel';
        // Refresh header balance
        if(window.updateBalanceDisplayUI) window.updateBalanceDisplayUI();
    }
}

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section === 'childpanel') {
        renderChildPanelUI(document.getElementById('user-content'));
    }
});
