import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Firebase Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
const apiView = document.getElementById('view-api');

if (apiView) {
    const generateKeyBtn = apiView.querySelector('button.bg-brand-100'); // The Generate Button
    const apiKeyInput = apiView.querySelector('input[type="text"]');
    const copyBtn = apiView.querySelector('button.bg-gray-200'); // The Copy Button

    let currentUserId = null;

    // ==========================================
    // UI Helper
    // ==========================================
    function notify(message, type = "success") {
        const toastContainer = document.getElementById('toast-container');
        if(!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `px-4 py-3 rounded shadow-lg text-sm font-semibold flex items-center gap-3 transform transition-all duration-300 translate-x-full pointer-events-auto`;
        
        if (type === "success") {
            toast.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
            toast.innerHTML = `<i class="fa-solid fa-circle-check text-green-600"></i> ${message}`;
        } else {
            toast.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
            toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-600"></i> ${message}`;
        }

        toastContainer.appendChild(toast);
        setTimeout(() => { toast.classList.remove('translate-x-full'); }, 10);
        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // Generate Secure Key Format: MAsmm-{userId}-{randomString}
    function generateSecureKey(uid) {
        const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        return `MAsmm-${uid}-${randomPart}`;
    }

    // ==========================================
    // Core Logic
    // ==========================================
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        currentUserId = user.uid;

        const apiKeyRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'account', 'api');
        
        try {
            const apiSnap = await getDoc(apiKeyRef);
            if (apiSnap.exists() && apiSnap.data().key) {
                apiKeyInput.value = apiSnap.data().key;
            } else {
                apiKeyInput.value = "No API Key generated yet.";
            }
        } catch (error) {
            console.error("Failed to load API key", error);
        }
    });

    // Generate New Key
    generateKeyBtn.addEventListener('click', async () => {
        if (!currentUserId) return;

        const confirmGenerate = confirm("Generating a new key will invalidate your old one immediately. Are you sure?");
        if (!confirmGenerate) return;

        const newKey = generateSecureKey(currentUserId);
        const apiKeyRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'account', 'api');

        try {
            generateKeyBtn.disabled = true;
            generateKeyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

            await setDoc(apiKeyRef, { 
                key: newKey,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            apiKeyInput.value = newKey;
            notify("New API Key generated successfully!", "success");
        } catch (error) {
            console.error("Error generating key", error);
            notify("Failed to generate API Key.", "error");
        } finally {
            generateKeyBtn.disabled = false;
            generateKeyBtn.innerHTML = 'Generate New Key';
        }
    });

    // Copy to Clipboard
    copyBtn.addEventListener('click', () => {
        if (apiKeyInput.value && apiKeyInput.value !== "No API Key generated yet.") {
            navigator.clipboard.writeText(apiKeyInput.value).then(() => {
                notify("API Key copied to clipboard!", "success");
            }).catch(err => {
                console.error('Failed to copy', err);
                notify("Failed to copy to clipboard.", "error");
            });
        }
    });
}