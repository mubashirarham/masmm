import { 
    getFirestore, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp);
const appId = window.__app_id;

let chatHistory = [];
let botSettings = null;
let isBotOpen = false;

const UIElements = {
    toggleBtn: document.getElementById('mabot-toggle-btn'),
    closeBtn: document.getElementById('mabot-close-btn'),
    container: document.getElementById('mabot-container'),
    chatHistoryEl: document.getElementById('mabot-chat-history'),
    form: document.getElementById('mabot-form'),
    input: document.getElementById('mabot-input'),
    sendBtn: document.getElementById('mabot-send-btn'),
    statusDot: document.getElementById('mabot-status-dot'),
    headerName: document.getElementById('mabot-header-name'),
    headerAvatar: document.getElementById('mabot-header-avatar')
};

async function initMABot() {
    try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'settings', 'mabot', 'config');
        const snap = await getDoc(settingsRef);

        if (snap.exists()) {
            botSettings = snap.data();
            
            if (botSettings.botName) UIElements.headerName.innerText = botSettings.botName;
            if (botSettings.avatarUrl) UIElements.headerAvatar.src = botSettings.avatarUrl;
            
            const greeting = botSettings.greeting || "Hi there! I am MA Bot. How can I assist you with your SMM panel needs today?";
            
            chatHistory.push({ role: 'model', parts: [{ text: greeting }] });
            appendMessageUI('model', greeting);

            UIElements.statusDot.classList.remove('bg-red-500', 'animate-pulse');
            UIElements.statusDot.classList.add('bg-green-500');

            UIElements.input.placeholder = "Ask a question...";
            UIElements.input.disabled = false;
            UIElements.sendBtn.disabled = false;
        } else {
            console.warn("MA Bot not configured globally.");
            UIElements.toggleBtn.classList.add('hidden');
        }
    } catch (e) {
        console.error("Failed to load MA bot configurations", e);
    }

    UIElements.toggleBtn.addEventListener('click', toggleChat);
    UIElements.closeBtn.addEventListener('click', toggleChat);
    UIElements.form.addEventListener('submit', handleSendMessage);
}

function toggleChat() {
    isBotOpen = !isBotOpen;
    if (isBotOpen) {
        UIElements.container.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
        UIElements.input.focus();
    } else {
        UIElements.container.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
    }
}

function appendMessageUI(role, text) {
    const isUser = role === 'user';
    let formattedText = text.replace(/\\n/g, '<br>');
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-blue-200 underline">$1</a>');

    const uiHtml = `
        <div class="flex ${isUser ? 'justify-end' : 'justify-start'} w-full animation-fade-in">
            <div class="${isUser ? 'bg-brand-600 text-white rounded-t-xl rounded-bl-xl' : 'bg-white border border-gray-200 text-gray-800 rounded-t-xl rounded-br-xl shadow-sm'} p-3 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap word-break">
                ${formattedText}
            </div>
        </div>
    `;

    UIElements.chatHistoryEl.insertAdjacentHTML('beforeend', uiHtml);
    setTimeout(() => {
        UIElements.chatHistoryEl.scrollTop = UIElements.chatHistoryEl.scrollHeight;
    }, 50);
}

function addTypingIndicator() {
    const uiHtml = `
        <div id="mabot-typing" class="flex justify-start w-full animation-fade-in">
            <div class="bg-white border border-gray-200 rounded-t-xl rounded-br-xl shadow-sm p-4 max-w-[85%] flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                <div class="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                <div class="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
            </div>
        </div>
    `;
    UIElements.chatHistoryEl.insertAdjacentHTML('beforeend', uiHtml);
    UIElements.chatHistoryEl.scrollTop = UIElements.chatHistoryEl.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('mabot-typing');
    if (el) el.remove();
}

async function handleSendMessage(e) {
    e.preventDefault();
    if (!botSettings) return;

    const query = UIElements.input.value.trim();
    if (!query) return;

    const user = auth.currentUser;
    if (!user) {
        alert("You must be logged in to use MA Bot.");
        return;
    }

    chatHistory.push({ role: 'user', parts: [{ text: query }] });
    appendMessageUI('user', query);
    
    UIElements.input.value = '';
    UIElements.input.disabled = true;
    UIElements.sendBtn.disabled = true;

    addTypingIndicator();

    try {
        const token = await user.getIdToken();

        const response = await fetch('/.netlify/functions/mabot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-App-Id': appId
            },
            body: JSON.stringify({
                history: chatHistory.slice(0, -1),
                message: query
            })
        });

        const data = await response.json();
        removeTypingIndicator();

        if (response.ok) {
            chatHistory.push({ role: 'model', parts: [{ text: data.reply }] });
            appendMessageUI('model', data.reply);
            
            if (chatHistory.length > 20) {
                chatHistory = [chatHistory[0], ...chatHistory.slice(chatHistory.length - 19)];
            }
        } else {
            console.error("MA Bot Error:", data.error);
            appendMessageUI('model', `[System] Server Error: ${data.error || 'Failed to process request.'}`);
        }
    } catch (err) {
        console.error("Network Error reaching MA Bot:", err);
        removeTypingIndicator();
        appendMessageUI('model', "[System] Network connection failed. Try again later.");
    } finally {
        UIElements.input.disabled = false;
        UIElements.sendBtn.disabled = false;
        UIElements.input.focus();
    }
}

window.addEventListener('load', () => { 
    setTimeout(initMABot, 500);
});
