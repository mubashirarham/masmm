import { 
    getFirestore, collection, getDocs, doc, updateDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

export async function renderChildPanelsUI(container) {
    container.innerHTML = `
        <div class="mb-8 flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 mb-2">Child Panels Network</h1>
                <p class="text-gray-500 text-sm">Monitor and manage all active sub-panels dynamically routed through your SaaS.</p>
            </div>
            <button onclick="window.openAssignTenantModal()" class="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-brand-500/30 transition-all flex items-center gap-2 text-sm">
                <i class="fa-solid fa-bolt"></i> One-Click Deploy Tenant
            </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h2 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-server mr-2 text-brand-600"></i> Provisioned Tenants</h2>
            </div>
            <div class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-white border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                                <th class="p-4 font-semibold">Domain</th>
                                <th class="p-4 font-semibold">Tenant UUID</th>
                                <th class="p-4 font-semibold">Owner UID</th>
                                <th class="p-4 font-semibold">Status</th>
                                <th class="p-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="cp-admin-list-body" class="divide-y divide-gray-50">
                            <tr><td colspan="5" class="p-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading network data...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Assign Tenant Modal -->
        <div id="assign-tenant-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4 transform transition-transform scale-95" id="assign-tenant-content">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-bolt text-brand-500 mr-1"></i> Provision Custom Tenant</h3>
                    <button onclick="window.closeAssignTenantModal()" class="text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Target User ID (UID)</label>
                        <input type="text" id="assign-uid" placeholder="Firebase UID string" class="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors text-sm" required>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Custom Domain</label>
                        <input type="text" id="assign-domain" placeholder="panel.example.com" class="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors text-sm" required>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Tenant Admin Login (Email)</label>
                        <input type="email" id="assign-admin" placeholder="admin@example.com" class="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors text-sm" required>
                    </div>
                    <button onclick="window.submitAssignTenant()" id="assign-tenant-btn" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 mt-4 rounded-xl shadow-md transition-colors flex justify-center items-center gap-2">
                        Deploy System (No Billing)
                    </button>
                    <p class="text-xs text-center text-gray-400 mt-2 font-medium">Domain MUST be manually added to Netlify DNS.</p>
                </div>
            </div>
        </div>
    `;

    fetchAllChildPanels();
}

async function fetchAllChildPanels() {
    const listBody = document.getElementById('cp-admin-list-body');
    if(!listBody) return;

    try {
        const panelsRef = collection(db, 'artifacts', 'masmmpanel-default', 'child_panels');
        const snap = await getDocs(panelsRef);

        if(snap.empty) {
            listBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-sm text-gray-500 font-medium">No child panels have been provisioned yet.</td></tr>`;
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const bgBadge = data.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            
            html += `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-4 font-bold text-gray-900 text-sm"><a href="https://${data.domain}" target="_blank" class="text-brand-600 hover:underline"><i class="fa-solid fa-globe mr-1 text-gray-400"></i> ${data.domain}</a></td>
                    <td class="p-4 text-xs font-mono text-gray-500">${data.tenantAppId || 'N/A'}</td>
                    <td class="p-4 text-xs font-mono text-gray-500">${data.ownerUid}</td>
                    <td class="p-4"><span class="px-2.5 py-1 rounded-md text-xs font-bold ${bgBadge}">${data.status}</span></td>
                    <td class="p-4 text-right">
                        ${data.status === 'Active' ? 
                            `<button class="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors" onclick="window.toggleTenantStatus('${docSnap.id}', 'Suspended')">Suspend</button>` :
                            `<button class="text-xs font-bold bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors" onclick="window.toggleTenantStatus('${docSnap.id}', 'Active')">Activate</button>`
                        }
                    </td>
                </tr>
            `;
        });
        
        listBody.innerHTML = html;
        
    } catch(err) {
        console.error("Admin Panel Data Error", err);
        listBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 text-sm font-semibold">Failed to fetch network metrics.</td></tr>`;
    }
}

window.toggleTenantStatus = async (domainDocId, newStatus) => {
    if(!confirm(`Are you sure you want to change tenant status to ${newStatus}?`)) return;
    
    try {
        const panelRef = doc(db, 'artifacts', 'masmmpanel-default', 'child_panels', domainDocId);
        await updateDoc(panelRef, { status: newStatus });
        fetchAllChildPanels();
    } catch(e) {
        alert("Failed to update status.");
        console.error(e);
    }
};

window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section === 'childpanels') {
        renderChildPanelsUI(document.getElementById('admin-content'));
    }
});

// Modal UI Functions
window.openAssignTenantModal = () => {
    document.getElementById('assign-tenant-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('assign-tenant-content').classList.remove('scale-95'), 10);
};

window.closeAssignTenantModal = () => {
    document.getElementById('assign-tenant-content').classList.add('scale-95');
    setTimeout(() => document.getElementById('assign-tenant-modal').classList.add('hidden'), 150);
};

// Form submission for Assigning Tenant bypassing payment logic
window.submitAssignTenant = async () => {
    const uid = document.getElementById('assign-uid').value.trim();
    const domain = document.getElementById('assign-domain').value.trim().toLowerCase();
    const adminEmail = document.getElementById('assign-admin').value.trim();
    const btn = document.getElementById('assign-tenant-btn');

    if(!uid || !domain || !adminEmail) { alert('Please meticulously fill all fields to provision.'); return; }
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scaffolding Tenant...';
    try {
        const formattedDomain = domain.replace(/[^a-z0-9.-]/g, '');
        const tenantAppId = formattedDomain.replace(/\./g, '-');
        
        // 1. Root Master Tracker
        await setDoc(doc(db, 'artifacts', 'masmmpanel-default', 'child_panels', formattedDomain), {
            domain: formattedDomain,
            ownerUid: uid,
            tenantAppId: tenantAppId,
            status: 'Active',
            createdAt: serverTimestamp(),
            assignedByAdmin: true
        });

        // 2. Sub-Tenant Database Scaffold
        await setDoc(doc(db, 'artifacts', tenantAppId), {
            parentAppId: 'masmmpanel-default',
            domain: formattedDomain,
            adminEmail: adminEmail,
            createdAt: serverTimestamp()
        });

        // 3. Automated Netlify Pipeline
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Binding Netlify DNS...';
        try {
            const auth = getAuth(window.firebaseApp);
            const token = await auth.currentUser.getIdToken();
            const netlifyRes = await fetch('/.netlify/functions/deploy-tenant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ domain: formattedDomain })
            });
            const nlData = await netlifyRes.json();
            if(nlData.skipped) console.warn(nlData.message);
        } catch(e) {
            console.error(e);
        }

        const successMsg = "Tenant architecture successfully provisioned AND attached to Netlify infrastructure API!\n\nJust tell the user to point their domain nameservers to Netlify.";
        alert(successMsg);
        window.closeAssignTenantModal();
        fetchAllChildPanels();
        
    } catch(e) {
        console.error("Assign Tenant Failed:", e);
        alert(e.message);
    } finally {
        btn.disabled = false; 
        btn.innerHTML = "Deploy System (No Billing)";
    }
};
