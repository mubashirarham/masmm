import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize Firebase Services
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'masmmpanel-default';

// ==========================================
// DOM Elements
// ==========================================
const profileView = document.getElementById('view-profile');

if (profileView) {
    // Select inputs based on their placeholders or types within the profile view
    const firstNameInput = profileView.querySelector('input[placeholder="John"]');
    const lastNameInput = profileView.querySelector('input[placeholder="Doe"]');
    const timezoneSelect = profileView.querySelector('select');
    
    // Select Buttons
    const saveChangesBtn = profileView.querySelector('button.bg-gray-900');
    const changePasswordBtn = profileView.querySelector('button.border-gray-300');

    let currentUserId = null;
    let currentUserEmail = null;

    // ==========================================
    // UI Helper: Toast Notifications
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

    // ==========================================
    // Core Logic
    // ==========================================

    // 1. Load Profile Data on Init
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        
        currentUserId = user.uid;
        currentUserEmail = user.email;

        const profileRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'account', 'profile');
        
        try {
            const profileSnap = await getDoc(profileRef);
            
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                if (firstNameInput) firstNameInput.value = data.firstName || '';
                if (lastNameInput) lastNameInput.value = data.lastName || '';
                if (timezoneSelect) timezoneSelect.value = data.timezone || 'Asia/Karachi (PKT)';
            }
        } catch (error) {
            console.error("Failed to load profile data", error);
        }
    });

    // 2. Save Profile Changes
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', async () => {
            if (!currentUserId) return;

            const firstName = firstNameInput ? firstNameInput.value.trim() : '';
            const lastName = lastNameInput ? lastNameInput.value.trim() : '';
            const timezone = timezoneSelect ? timezoneSelect.value : '';

            saveChangesBtn.disabled = true;
            saveChangesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const profileRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'account', 'profile');

            try {
                // Use { merge: true } so we don't accidentally overwrite other account data
                await setDoc(profileRef, {
                    firstName: firstName,
                    lastName: lastName,
                    timezone: timezone,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                notify("Profile updated successfully!", "success");
            } catch (error) {
                console.error("Error updating profile:", error);
                notify("Failed to update profile.", "error");
            } finally {
                saveChangesBtn.disabled = false;
                saveChangesBtn.innerHTML = 'Save Changes';
            }
        });
    }

    // 3. Change Password (via Reset Email for Security)
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', async () => {
            if (!currentUserEmail) return;

            const confirmReset = confirm(`We will send a password reset link to ${currentUserEmail}. Do you want to continue?`);
            
            if (!confirmReset) return;

            changePasswordBtn.disabled = true;
            changePasswordBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            try {
                await sendPasswordResetEmail(auth, currentUserEmail);
                notify("Password reset email sent! Please check your inbox.", "success");
            } catch (error) {
                console.error("Error sending password reset:", error);
                notify("Failed to send reset email.", "error");
            } finally {
                changePasswordBtn.disabled = false;
                changePasswordBtn.innerHTML = 'Change Password';
            }
        });
    }
}