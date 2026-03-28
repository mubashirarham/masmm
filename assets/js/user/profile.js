import { 
    getFirestore, doc, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, updateProfile, multiFactor, PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

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
                    <div class="w-20 h-20 rounded-full bg-brand-100 border-2 border-brand-200 flex items-center justify-center text-brand-700 font-bold text-3xl shadow-sm relative overflow-hidden group">
                        <i class="fa-solid fa-user" id="profile-avatar-icon"></i>
                        <img id="profile-avatar-img" class="hidden w-full h-full object-cover">
                        <div class="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition-all" onclick="document.getElementById('pfp-upload-input').click()">
                            <i class="fa-camera fa-solid text-white text-xl"></i>
                        </div>
                    </div>
                    <div>
                        <p id="profile-email-display" class="text-lg font-bold text-gray-900">Loading...</p>
                        <span class="inline-block mt-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full uppercase tracking-wider">Active Account</span>
                        <input type="file" id="pfp-upload-input" accept="image/*" class="hidden">
                        <p id="pfp-upload-status" class="text-xs text-brand-500 font-semibold mt-2 hidden"><i class="fa-solid fa-spinner fa-spin"></i> Uploading...</p>
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

            <!-- 2FA Security Section -->
            <div class="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 sm:p-8 mt-6">
                <h2 class="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2"><i class="fa-solid fa-lock text-indigo-600"></i> Two-Factor Auth (2FA)</h2>
                <div id="mfa-section" class="text-sm text-gray-600 mt-4">
                     <p><i class="fa-solid fa-spinner fa-spin"></i> Checking 2FA Status...</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('profile-form').addEventListener('submit', handleSaveProfile);
    document.getElementById('reset-password-btn').addEventListener('click', handlePasswordReset);
    document.getElementById('pfp-upload-input').addEventListener('change', handlePFPUpload);
}

async function fetchProfile() {
    if (!currentUser) return;
    
    // Set email display
    const emailDisplay = document.getElementById('profile-email-display');
    if (emailDisplay) emailDisplay.innerText = currentUser.email;

    if (currentUser.photoURL) {
        document.getElementById('profile-avatar-icon').classList.add('hidden');
        document.getElementById('profile-avatar-img').src = currentUser.photoURL;
        document.getElementById('profile-avatar-img').classList.remove('hidden');
    }
    
    // Render 2FA Status
    renderMfaStatus();

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

async function handlePFPUpload(e) {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    
    const statusEl = document.getElementById('pfp-upload-status');
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'mubashir');
    
    try {
        const response = await fetch('https://api.cloudinary.com/v1_1/dis1ptaip/image/upload', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Cloudinary upload failed');
        const data = await response.json();
        const url = data.secure_url;
        
        await updateProfile(currentUser, { photoURL: url });
        
        // Update local UI
        document.getElementById('profile-avatar-icon').classList.add('hidden');
        document.getElementById('profile-avatar-img').src = url;
        document.getElementById('profile-avatar-img').classList.remove('hidden');
        
        // Update Global Header UI
        const headerIcon = document.getElementById('header-avatar-icon');
        const headerImg = document.getElementById('header-avatar-img');
        if (headerIcon && headerImg) {
            headerIcon.classList.add('hidden');
            headerImg.src = url;
            headerImg.classList.remove('hidden');
        }
        
        statusEl.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> Uploaded!';
    } catch (err) {
        console.error("PFP Upload error:", err);
        statusEl.innerHTML = '<i class="fa-solid fa-xmark text-red-500"></i> Upload failed.';
    } finally {
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }
}

function renderMfaStatus() {
    const mfaContainer = document.getElementById('mfa-section');
    if (!mfaContainer || !currentUser) return;
    
    try {
        const mfa = multiFactor(currentUser);
        if (mfa.enrolledFactors && mfa.enrolledFactors.length > 0) {
            mfaContainer.innerHTML = `
                <div class="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl mb-4">
                    <p class="font-bold flex items-center gap-2"><i class="fa-solid fa-mobile-screen"></i> SMS Phone 2FA Enabled</p>
                    <p class="text-xs mt-1">Your account is secured via SMS verification.</p>
                </div>
                <button type="button" id="disable-mfa-btn" class="bg-red-50 text-red-600 hover:bg-red-100 font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm">
                    Disable Phone 2FA
                </button>
            `;
            document.getElementById('disable-mfa-btn').addEventListener('click', handleDisableMFA);
        } else {
            mfaContainer.innerHTML = `
                <div class="bg-gray-50 border border-gray-200 text-gray-700 p-4 rounded-xl mb-4">
                    <p class="font-bold">Phone 2FA is Not Enabled</p>
                    <p class="text-xs mt-1">Protect your account with a personal mobile number via SMS verification.</p>
                </div>
                <button type="button" id="start-mfa-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm">
                    Enable Phone Verification
                </button>
            `;
            document.getElementById('start-mfa-btn').addEventListener('click', handleStartMFA);
        }
    } catch(err) {
        mfaContainer.innerHTML = `<p class="text-red-500 text-xs">MFA is not supported in the current environment or session.</p>`;
    }
}

let pendingVerificationId = null;

async function handleStartMFA() {
    const mfaContainer = document.getElementById('mfa-section');
    
    mfaContainer.innerHTML = `
        <div class="bg-white p-5 rounded-xl border border-gray-200">
            <h3 class="font-bold text-gray-800 mb-2">Step 1: Enter Phone Number</h3>
            <p class="text-xs text-gray-500 mb-4">Enter your number with country code (e.g., +1234567890).</p>
            <div class="flex flex-col sm:flex-row gap-3">
                <input type="tel" id="mfa-phone-input" placeholder="+1234567890" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-brand-500 text-sm font-semibold">
                <button id="send-sms-btn" class="bg-brand-500 text-white px-5 py-2 rounded-lg font-bold hover:bg-brand-600 transition-colors">Send SMS</button>
            </div>
            <div id="recaptcha-enroll-container" class="mt-3"></div>
            <p id="mfa-error" class="text-red-500 text-xs mt-3 hidden"></p>
            
            <div id="sms-verify-section" class="hidden mt-6 pt-4 border-t border-gray-100">
                <h3 class="font-bold text-gray-800 mb-2">Step 2: Enter SMS Code</h3>
                <div class="flex gap-2">
                    <input type="text" id="mfa-verification-code" placeholder="000000" maxlength="6" class="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-mono text-lg font-bold outline-none focus:border-brand-500">
                    <button id="verify-mfa-btn" class="bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-600 transition-colors">Verify</button>
                </div>
            </div>
            
            <div class="mt-4 pt-3 border-t border-gray-100">
                <button id="cancel-mfa-btn" class="text-xs text-gray-500 hover:text-gray-800 underline font-bold">Cancel</button>
            </div>
        </div>
    `;

    document.getElementById('send-sms-btn').addEventListener('click', handleSendSMS);
    document.getElementById('verify-mfa-btn').addEventListener('click', handleVerifyMFA);
    document.getElementById('cancel-mfa-btn').addEventListener('click', renderMfaStatus);
    
    // Initialize Recaptcha
    if (!window.recaptchaVerifierEnroll) {
        window.recaptchaVerifierEnroll = new RecaptchaVerifier(auth, 'recaptcha-enroll-container', {
            'size': 'invisible'
        });
    }
}

async function handleSendSMS() {
    const rawNum = document.getElementById('mfa-phone-input').value.trim();
    if (!rawNum) return;
    
    const phoneNumber = rawNum.startsWith('+') ? rawNum : '+' + rawNum;
    const btn = document.getElementById('send-sms-btn');
    const errEl = document.getElementById('mfa-error');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    errEl.classList.add('hidden');

    try {
        const mfa = multiFactor(currentUser);
        const session = await mfa.getSession();
        
        const phoneProvider = new PhoneAuthProvider(auth);
        
        // Ensure verifier is built
        if(!window.recaptchaVerifierEnroll) throw new Error("Recaptcha Not Initialized");
        
        pendingVerificationId = await phoneProvider.verifyPhoneNumber(
            { phoneNumber, session },
            window.recaptchaVerifierEnroll
        );
        
        document.getElementById('mfa-phone-input').disabled = true;
        btn.innerText = 'Sent ✔';
        document.getElementById('sms-verify-section').classList.remove('hidden');
        
    } catch(err) {
        console.error("SMS Error", err);
        btn.disabled = false;
        btn.innerText = 'Send SMS';
        errEl.innerText = err.message || "Failed to send SMS. Ensure your Identity Platform settings have Phone Auth enabled.";
        errEl.classList.remove('hidden');
    }
}

async function handleVerifyMFA() {
    const code = document.getElementById('mfa-verification-code').value.trim();
    if(code.length !== 6 || !pendingVerificationId) return;
    
    const btn = document.getElementById('verify-mfa-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const errEl = document.getElementById('mfa-error');
    
    try {
        const cred = PhoneAuthProvider.credential(pendingVerificationId, code);
        const assertion = PhoneMultiFactorGenerator.assertion(cred);
        const mfa = multiFactor(currentUser);
        await mfa.enroll(assertion, "Primary Mobile");
        
        showProfileNotification("Phone verification securely enabled!", "success");
        renderMfaStatus();
    } catch(err) {
        console.error("Enrollment Error", err);
        btn.disabled = false;
        btn.innerHTML = 'Verify';
        errEl.innerText = "Invalid SMS code. Please try again.";
        errEl.classList.remove('hidden');
    }
}

async function handleDisableMFA() {
    try {
        const mfa = multiFactor(currentUser);
        const factorId = mfa.enrolledFactors[0].uid;
        await mfa.unenroll(factorId);
        showProfileNotification("Phone Verification disabled.", "success");
        renderMfaStatus();
    } catch(e) {
        console.error(e);
        showProfileNotification("Failed to disable 2FA.", "error");
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