import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'mabot') return;
    renderMABotUI();
    fetchMABotSettings();
});

function renderMABotUI() {
    const contentArea = document.getElementById('admin-content');
    
    contentArea.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <i class="fa-solid fa-microchip text-blue-500"></i> Gemini MA Bot Configuration
                </h2>
                <p class="text-sm text-gray-500 mt-1">Configure artificial intelligence system prompts, behavior boundaries, and autonomous permission scopes.</p>
            </div>
            <button id="save-mabot-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-md font-semibold transition-all flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Save Configuration
            </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Main Settings (Left Col) -->
            <div class="lg:col-span-2 space-y-6">
                
                <!-- System Instructions -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">System Instructions <span class="text-sm font-normal text-gray-500">(Core Prompt)</span></h3>
                    <p class="text-sm text-gray-600 mb-4">You are defining the core behavior of the MA Bot. The bot will receive this instruction block before every conversation iteration. Real-time metrics and service lists will automatically be injected securely by the Node backend.</p>
                    
                    <textarea id="mabot-system-prompt" rows="12" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono text-gray-700 resize-y" placeholder="You are an expert customer success agent for MAsmmpanel..."></textarea>
                    
                    <div class="mt-3 flex gap-2">
                        <span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">Variables Available Natively:</span>
                        <span class="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded text-xs font-mono">{{SERVICES_LIST}}</span>
                        <span class="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded text-xs font-mono">{{USER_BALANCE}}</span>
                    </div>
                </div>

                <!-- Parameters -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">LLM Parameters</h3>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Temperature (Creativity)</label>
                            <div class="flex items-center gap-4">
                                <input type="range" id="mabot-temperature" min="0" max="1" step="0.1" value="0.7" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
                                <span id="mabot-temp-display" class="font-mono text-brand-600 font-bold bg-brand-50 px-2 py-1 rounded border border-brand-100 min-w-[3rem] text-center">0.7</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-2">Lower = Strict & Focused, Higher = Creative & Adaptive</p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Maximum Output Tokens</label>
                            <input type="number" id="mabot-max-tokens" value="800" min="100" max="4000" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm">
                            <p class="text-xs text-gray-500 mt-2">Limits how long the AI response can be.</p>
                        </div>
                    </div>
                </div>
                
            </div>

            <!-- Capabilities (Right Col) -->
            <div class="space-y-6">
                
                <!-- Autonomous Function Scope -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Autonomous Permissions</h3>
                    <p class="text-sm text-gray-600 mb-5">Enable or disable specific function-calling capabilities for the AI.</p>
                    
                    <div class="space-y-4">
                        <label class="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <input type="checkbox" id="mabot-perm-ticket" class="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                            <div>
                                <p class="font-semibold text-sm text-gray-800">Support Ticket Creation</p>
                                <p class="text-xs text-gray-500 mt-0.5">Allows AI to create support tickets natively if the user asks for human escalation.</p>
                            </div>
                        </label>
                        
                        <label class="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <input type="checkbox" id="mabot-perm-upstream" class="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                            <div>
                                <p class="font-semibold text-sm text-gray-800">Upstream Validation (Auto-Fix)</p>
                                <p class="text-xs text-gray-500 mt-0.5">Allows AI to ping upstream APIs to check order status and optionally close stuck tickets.</p>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Bot Customization -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Interface Customization</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Bot Name</label>
                            <input type="text" id="mabot-name" value="MA Bot" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Avatar URL (Optional)</label>
                            <input type="text" id="mabot-avatar" placeholder="https://..." class="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Initial Greeting</label>
                            <textarea id="mabot-greeting" rows="2" class="w-full px-4 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Hi there! I am MA Bot. How can I help you?"></textarea>
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
    `;

    // Bind slider UI
    const tempSlider = document.getElementById('mabot-temperature');
    const tempDisp = document.getElementById('mabot-temp-display');
    tempSlider.addEventListener('input', (e) => {
        tempDisp.innerText = parseFloat(e.target.value).toFixed(1);
    });

    document.getElementById('save-mabot-btn').addEventListener('click', saveMABotSettings);
}

async function fetchMABotSettings() {
    try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'settings', 'mabot', 'config');
        const snap = await getDoc(settingsRef);

        if (snap.exists()) {
            const data = snap.data();
            
            document.getElementById('mabot-system-prompt').value = data.systemPrompt || '';
            document.getElementById('mabot-temperature').value = data.temperature || 0.7;
            document.getElementById('mabot-temp-display').innerText = data.temperature || 0.7;
            document.getElementById('mabot-max-tokens').value = data.maxTokens || 800;
            
            document.getElementById('mabot-perm-ticket').checked = data.permissions?.canCreateTicket || false;
            document.getElementById('mabot-perm-upstream').checked = data.permissions?.canCheckUpstream || false;
            
            document.getElementById('mabot-name').value = data.botName || 'MA Bot';
            document.getElementById('mabot-avatar').value = data.avatarUrl || '';
            document.getElementById('mabot-greeting').value = data.greeting || 'Hi there! I am MA Bot. How can I assist you with your SMM panel needs today?';
        }
    } catch (error) {
        console.error("Error fetching MA Bot settings:", error);
    }
}

async function saveMABotSettings() {
    const btn = document.getElementById('save-mabot-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const payload = {
            systemPrompt: document.getElementById('mabot-system-prompt').value,
            temperature: parseFloat(document.getElementById('mabot-temperature').value),
            maxTokens: parseInt(document.getElementById('mabot-max-tokens').value),
            permissions: {
                canCreateTicket: document.getElementById('mabot-perm-ticket').checked,
                canCheckUpstream: document.getElementById('mabot-perm-upstream').checked
            },
            botName: document.getElementById('mabot-name').value,
            avatarUrl: document.getElementById('mabot-avatar').value,
            greeting: document.getElementById('mabot-greeting').value,
            updatedAt: new Date().toISOString()
        };

        const settingsRef = doc(db, 'artifacts', appId, 'public', 'settings', 'mabot', 'config');
        
        // We write to public/settings so even the backend Node function or Frontend can securely read it 
        await setDoc(settingsRef, payload, { merge: true });

        btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved successfully';
        btn.classList.replace('bg-blue-600', 'bg-green-600');
        btn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.replace('bg-green-600', 'bg-blue-600');
            btn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Failed to save settings:", error);
        alert("Failed to save Bot configuration.");
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}
