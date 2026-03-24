import { 
    getFirestore, doc, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user && document.getElementById('view-profile').classList.contains('active')) {
        fetchProfile();
    }
});

window.addEventListener('user-section-load', (e) => {
    if (e.detail.section !== 'profile') return;
    renderProfileUI();
    if (currentUser) fetchProfile();
});

function renderProfileUI() {
    const contentArea = document.getElementById('user-content');
    
    contentArea.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Profile Settings</h2>
            <p class="text-sm text-gray-500">Manage your personal details and account security.</p>
        </div>

        <div class="max-w-3xl mx-auto space-y-6">
            
            <!-- Personal Information Form -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
                <div class="flex items-center gap-6 mb-8 border-b border-gray-100 pb-8">
                    <div class="w-20 h-20 rounded-full bg-brand-100 border-2 border-brand-200 flex items-center justify-center text-brand-700 font-bold text-3xl shadow-sm">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div>
                        <p id="profile-email-display" class="text-lg font-bold text-gray-900">Loading...</p>
                        <span class="inline-block mt-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full uppercase tracking-wider">Active Account</span>
                    </div>
                </div>

                <form id="profile-form" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">First Name</label>
                            <input type="text" id="profile-fname" placeholder="Enter first name" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
                            <input type="text" id="profile-lname" placeholder="Enter last name" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Timezone</label>
                        <select id="profile-timezone" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all">
                            <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                            <option value="UTC">UTC (GMT 0)</option>
                            <option value="America/New_York">America/New_York (EST)</option>
                            <option value="Europe/London">Europe/London (GMT)</option>
                        </select>
                    </div>

                    <div id="profile-notification" class="hidden text-sm px-4 py-3 rounded-lg font-semibold transition-all"></div>

                    <div class="pt-4 border-t border-gray-100 flex justify-end">
                        <button type="submit" id="save-profile-btn" class="bg-gray-900 hover:bg-black text-white font-bold py-3.5 px-8 rounded-xl transition-all flex items-center gap-2 shadow-md">
                            <i class="fa-solid fa-floppy-disk"></i> Save Changes
                        </button>
                    </div>
                </form>
            </div>

            <!-- Security Section -->
            <div class="bg-white rounded-2xl shadow-sm border border-red-100 p-6 sm:p-8">
                <h2 class="text-xl font-bold text-red-600 mb-2 flex items-center gap-2"><i class="fa-solid fa-shield-halved"></i> Security</h2>
                <p class="text-sm text-gray-600 mb-6">Manage your password to keep your account secure. A secure link will be sent to your email.</p>
                
                <div id="security-notification" class="hidden text-sm px-4 py-3 rounded-lg font-semibold transition-all mb-4"></div>

                <button type="button" id="reset-password-btn" class="bg-white border-2 border-gray-200 hover:border-gray-800 hover:bg-gray-50 text-gray-800 font-bold py-3 px-6 rounded-xl transition-all flex items-center gap-2">
                    <i class="fa-solid fa-key"></i> Send Password Reset Email
                </button>
            </div>
        </div>
    `;

    document.getElementById('profile-form').addEventListener('submit', handleSaveProfile);
    document.getElementById('reset-password-btn').addEventListener('click', handlePasswordReset);
}

async function fetchProfile() {
    if (!currentUser) return;
    
    // Set email display
    const emailDisplay = document.getElementById('profile-email-display');
    if (emailDisplay) emailDisplay.innerText = currentUser.email;

    try {
        const profileRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'profile');
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
            const data = profileSnap.data();
            const fNameInput = document.getElementById('profile-fname');
            const lNameInput = document.getElementById('profile-lname');
            const tzInput = document.getElementById('profile-timezone');
            
            if (fNameInput) fNameInput.value = data.firstName || '';
            if (lNameInput) lNameInput.value = data.lastName || '';
            if (tzInput) tzInput.value = data.timezone || 'Asia/Karachi';
        }
    } catch (error) {
        console.error("Error fetching profile:", error);
    }
}

async function handleSaveProfile(e) {
    e.preventDefault();
    if (!currentUser) return;

    const btn = document.getElementById('save-profile-btn');
    const fName = document.getElementById('profile-fname').value.trim();
    const lName = document.getElementById('profile-lname').value.trim();
    const timezone = document.getElementById('profile-timezone').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        const profileRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'account', 'profile');
        
        await setDoc(profileRef, {
            firstName: fName,
            lastName: lName,
            timezone: timezone,
            updatedAt: serverTimestamp()
        }, { merge: true });

        showProfileNotification("Profile updated successfully!", "success");

    } catch (error) {
        console.error("Error saving profile:", error);
        showProfileNotification("Failed to save profile. Please try again.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }
}

async function handlePasswordReset() {
    if (!currentUser || !currentUser.email) return;

    const btn = document.getElementById('reset-password-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending Link...';

    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        const notif = document.getElementById('security-notification');
        notif.innerText = `A password reset link has been sent to ${currentUser.email}. Please check your inbox.`;
        notif.className = "text-sm px-4 py-3 rounded-lg font-semibold transition-all mb-4 block bg-green-50 text-green-700 border border-green-200";
    } catch (error) {
        console.error("Error sending reset email:", error);
        const notif = document.getElementById('security-notification');
        notif.innerText = "Failed to send reset email. You may need to sign out and use the 'Forgot Password' link on the login page.";
        notif.className = "text-sm px-4 py-3 rounded-lg font-semibold transition-all mb-4 block bg-red-50 text-red-700 border border-red-200";
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Send Password Reset Email';
    }
}

function showProfileNotification(message, type) {
    const notif = document.getElementById('profile-notification');
    notif.innerText = message;
    notif.className = "text-sm px-4 py-3 rounded-lg font-semibold transition-all block"; 
    
    if (type === 'success') {
        notif.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-200');
    } else {
        notif.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    }

    setTimeout(() => {
        notif.classList.add('hidden');
    }, 4000);
}