import { 
    getFirestore, 
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const db = getFirestore(window.firebaseApp);
const appId = window.__app_id;

// Listen for the custom routing event from admin/index.html
window.addEventListener('admin-section-load', (e) => {
    if (e.detail.section !== 'branding') return;

    renderBrandingUI();
    fetchCurrentBranding();
});

let customSocialPlatforms = [];

function renderBrandingUI() {
    const contentArea = document.getElementById('admin-content');
    
    // Inject the HTML for the Branding & Appearance View
    contentArea.innerHTML = `
        <div class="mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-gray-800">Appearance & Branding</h2>
                <p class="text-sm text-gray-500">Customize the UI, logo upload, social networks, typography, colors, and global SEO metadata.</p>
            </div>
            <button id="save-branding-btn" class="bg-brand-500 hover:bg-brand-600 px-6 py-2.5 rounded-lg text-white font-bold transition-all shadow-md shadow-brand-500/30 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Save Aesthetics
            </button>
        </div>

        <div id="branding-alerts" class="mb-6 hidden text-sm px-4 py-3 rounded-xl font-bold text-center"></div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <!-- Global Brand Card -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                    <h3 class="font-bold text-gray-800"><i class="fa-solid fa-palette text-brand-500 mr-2"></i> Theme & Logo Configuration</h3>
                </div>
                <div class="p-6 space-y-6">
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Platform Name</label>
                        <input type="text" id="site-name" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. PanelPeak">
                        <p class="text-xs text-gray-500 mt-1">Displayed in headers and automated emails.</p>
                    </div>

                    <!-- Logo Upload Section -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Site Logo (File Upload or Image URL)</label>
                        
                        <div class="flex items-center gap-3 mb-3">
                            <label for="logo-file-input" class="cursor-pointer px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-lg border border-gray-300 transition-colors flex items-center gap-2 shadow-sm">
                                <i class="fa-solid fa-upload text-brand-600"></i> Choose File to Upload
                            </label>
                            <input type="file" id="logo-file-input" accept="image/*" class="hidden">
                            <button type="button" id="clear-logo-btn" class="hidden text-xs text-red-500 hover:text-red-700 font-semibold">
                                <i class="fa-solid fa-trash mr-1"></i> Clear
                            </button>
                        </div>

                        <input type="text" id="logo-url" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm font-mono text-brand-600" placeholder="https://example.com/logo.png or uploaded image URL">
                        
                        <!-- DigitalMarketplace Brand Logo Suite (Short, Long, Detailed) -->
                        <div class="mt-4 pt-4 border-t border-gray-100">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">DigitalMarketplace Consistent Brand Logo Suite</label>
                            <div class="grid grid-cols-3 gap-3">
                                <div onclick="window.selectLogoPreset('../assets/images/brand_logo_short.png')" class="p-3 rounded-xl border border-gray-200 hover:border-brand-500 bg-gray-50 hover:bg-white transition-all cursor-pointer text-center group shadow-sm">
                                    <img src="../assets/images/brand_logo_short.png" class="h-12 mx-auto object-contain mb-1.5 group-hover:scale-105 transition-transform">
                                    <p class="text-[11px] font-extrabold text-gray-900">Short Mark</p>
                                    <p class="text-[9px] text-gray-500 font-medium">Favicon & App Icon</p>
                                </div>
                                <div onclick="window.selectLogoPreset('../assets/images/brand_logo_long.png')" class="p-3 rounded-xl border border-gray-200 hover:border-brand-500 bg-gray-50 hover:bg-white transition-all cursor-pointer text-center group shadow-sm">
                                    <img src="../assets/images/brand_logo_long.png" class="h-12 mx-auto object-contain mb-1.5 group-hover:scale-105 transition-transform">
                                    <p class="text-[11px] font-extrabold text-gray-900">Long Logo</p>
                                    <p class="text-[9px] text-gray-500 font-medium">Navbar & Header</p>
                                </div>
                                <div onclick="window.selectLogoPreset('../assets/images/brand_logo_detailed.png')" class="p-3 rounded-xl border border-gray-200 hover:border-brand-500 bg-gray-50 hover:bg-white transition-all cursor-pointer text-center group shadow-sm">
                                    <img src="../assets/images/brand_logo_detailed.png" class="h-12 mx-auto object-contain mb-1.5 group-hover:scale-105 transition-transform">
                                    <p class="text-[11px] font-extrabold text-gray-900">Detailed Logo</p>
                                    <p class="text-[9px] text-gray-500 font-medium">Footer & Splash</p>
                                </div>
                            </div>
                        </div>

                        <div id="logo-preview-box" class="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hidden flex items-center gap-3">
                            <span class="text-xs font-semibold text-gray-500">Logo Preview:</span>
                            <img id="logo-preview-img" class="h-10 max-w-[180px] object-contain" alt="Logo Preview">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Global Color Palette Base</label>
                        <select id="palette-select" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm appearance-none bg-white">
                            <option value="green">Green (Default)</option>
                            <option value="blue">Blue</option>
                            <option value="indigo">Indigo</option>
                            <option value="purple">Purple</option>
                            <option value="pink">Pink</option>
                            <option value="rose">Rose</option>
                            <option value="orange">Orange</option>
                            <option value="amber">Amber</option>
                            <option value="yellow">Yellow</option>
                            <option value="teal">Teal</option>
                            <option value="cyan">Cyan</option>
                            <option value="sky">Sky</option>
                            <option value="slate">Slate</option>
                            <option value="zinc">Zinc</option>
                            <option value="red">Red</option>
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Changes all primary buttons, accents, and UI elements site-wide.</p>
                    </div>

                </div>
            </div>

            <!-- Typography & SEO -->
            <div class="space-y-8">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-800"><i class="fa-solid fa-font text-brand-500 mr-2"></i> Web Typography</h3>
                    </div>
                    <div class="p-6 space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Heading Font (Google Fonts)</label>
                            <input type="text" id="heading-font" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. Outfit, Poppins, Inter">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Body Font (Google Fonts)</label>
                            <input type="text" id="body-font" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="e.g. Inter, Roboto">
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-800"><i class="fa-brands fa-google text-brand-500 mr-2"></i> SEO Metadata</h3>
                    </div>
                    <div class="p-6 space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Title</label>
                            <input type="text" id="seo-title" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm" placeholder="Panel Title - Home">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Description</label>
                            <textarea id="seo-desc" rows="3" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm resize-none"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Meta Keywords</label>
                            <input type="text" id="seo-keys" class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm font-mono text-gray-500" placeholder="smm panel, cheap likes, instagram views">
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Social Media Platform Logos & Icon Styles Card -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-2">
                <div class="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 class="font-bold text-gray-800"><i class="fa-solid fa-icons text-brand-500 mr-2"></i> Social Media Logos & Icon Style Selector</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">5 Style Presets Available</span>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Style Preset Selector -->
                    <div>
                        <label class="block text-sm font-bold text-gray-800 mb-2">Icon Design Style Preset</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3" id="social-icon-style-presets">
                            <div class="preset-option cursor-pointer p-4 rounded-xl border-2 border-brand-500 bg-brand-50/40 text-center transition-all hover:shadow-md" data-style="3d-gradient">
                                <div class="w-10 h-10 mx-auto rounded-xl bg-gradient-to-tr from-pink-500 to-yellow-400 text-white flex items-center justify-center text-xl shadow-md mb-2">
                                    <i class="fa-brands fa-instagram"></i>
                                </div>
                                <p class="text-xs font-bold text-gray-800">3D Gradient</p>
                                <p class="text-[10px] text-gray-500">Vibrant & Glossy</p>
                            </div>

                            <div class="preset-option cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-500 bg-gray-50 text-center transition-all hover:shadow-md" data-style="minimal-flat">
                                <div class="w-10 h-10 mx-auto rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl mb-2">
                                    <i class="fa-brands fa-tiktok"></i>
                                </div>
                                <p class="text-xs font-bold text-gray-800">Minimal Flat</p>
                                <p class="text-[10px] text-gray-500">Sleek Vector</p>
                            </div>

                            <div class="preset-option cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-500 bg-gray-900 text-center transition-all hover:shadow-md text-white" data-style="neon-glass">
                                <div class="w-10 h-10 mx-auto rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xl shadow-[0_0_12px_rgba(6,182,212,0.4)] mb-2">
                                    <i class="fa-brands fa-youtube"></i>
                                </div>
                                <p class="text-xs font-bold text-white">Neon Glass</p>
                                <p class="text-[10px] text-gray-400">Cyber Glow</p>
                            </div>

                            <div class="preset-option cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-500 bg-gray-50 text-center transition-all hover:shadow-md" data-style="circle-solid">
                                <div class="w-10 h-10 mx-auto rounded-full bg-blue-600 text-white flex items-center justify-center text-xl mb-2">
                                    <i class="fa-brands fa-facebook-f"></i>
                                </div>
                                <p class="text-xs font-bold text-gray-800">Circle Solid</p>
                                <p class="text-[10px] text-gray-500">Classic Pill</p>
                            </div>

                            <div class="preset-option cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-500 bg-gray-50 text-center transition-all hover:shadow-md" data-style="outline-stroke">
                                <div class="w-10 h-10 mx-auto rounded-xl border-2 border-gray-800 text-gray-800 flex items-center justify-center text-xl mb-2">
                                    <i class="fa-brands fa-whatsapp"></i>
                                </div>
                                <p class="text-xs font-bold text-gray-800">Outline Stroke</p>
                                <p class="text-[10px] text-gray-500">Clean Outlined</p>
                            </div>
                        </div>
                        <input type="hidden" id="selected-social-icon-style" value="3d-gradient">
                    </div>

                    <!-- Custom Platform Logos Image File Uploaders Section -->
                    <div class="pt-4 border-t border-gray-100">
                        <h4 class="text-sm font-bold text-gray-800 mb-1">Custom Category Platform Logos (Reflected in User Panel)</h4>
                        <p class="text-xs text-gray-500 mb-4">Upload custom logo image files or enter image URLs to replace default category platform icons across user dashboard & services.</p>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <!-- Instagram -->
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <label class="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><i class="fa-brands fa-instagram text-pink-500"></i> Instagram Custom Logo</label>
                                <div class="flex items-center gap-2 mb-2">
                                    <label for="upload-file-instagram" class="cursor-pointer px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[11px] rounded border border-gray-300 transition-colors flex items-center gap-1 shadow-sm">
                                        <i class="fa-solid fa-upload text-brand-600"></i> Upload Logo
                                    </label>
                                    <input type="file" id="upload-file-instagram" accept="image/*" class="hidden">
                                </div>
                                <input type="text" id="logo-instagram-url" placeholder="https://.../instagram.png or uploaded image" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-mono">
                            </div>

                            <!-- TikTok -->
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <label class="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><i class="fa-brands fa-tiktok text-black"></i> TikTok Custom Logo</label>
                                <div class="flex items-center gap-2 mb-2">
                                    <label for="upload-file-tiktok" class="cursor-pointer px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[11px] rounded border border-gray-300 transition-colors flex items-center gap-1 shadow-sm">
                                        <i class="fa-solid fa-upload text-brand-600"></i> Upload Logo
                                    </label>
                                    <input type="file" id="upload-file-tiktok" accept="image/*" class="hidden">
                                </div>
                                <input type="text" id="logo-tiktok-url" placeholder="https://.../tiktok.png or uploaded image" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-mono">
                            </div>

                            <!-- YouTube -->
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <label class="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><i class="fa-brands fa-youtube text-red-600"></i> YouTube Custom Logo</label>
                                <div class="flex items-center gap-2 mb-2">
                                    <label for="upload-file-youtube" class="cursor-pointer px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[11px] rounded border border-gray-300 transition-colors flex items-center gap-1 shadow-sm">
                                        <i class="fa-solid fa-upload text-brand-600"></i> Upload Logo
                                    </label>
                                    <input type="file" id="upload-file-youtube" accept="image/*" class="hidden">
                                </div>
                                <input type="text" id="logo-youtube-url" placeholder="https://.../youtube.png or uploaded image" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-mono">
                            </div>

                            <!-- Facebook -->
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <label class="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><i class="fa-brands fa-facebook text-blue-600"></i> Facebook Custom Logo</label>
                                <div class="flex items-center gap-2 mb-2">
                                    <label for="upload-file-facebook" class="cursor-pointer px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[11px] rounded border border-gray-300 transition-colors flex items-center gap-1 shadow-sm">
                                        <i class="fa-solid fa-upload text-brand-600"></i> Upload Logo
                                    </label>
                                    <input type="file" id="upload-file-facebook" accept="image/*" class="hidden">
                                </div>
                                <input type="text" id="logo-facebook-url" placeholder="https://.../facebook.png or uploaded image" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-mono">
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Multiple Social Networks Section -->
                    <div class="pt-4 border-t border-gray-100">
                        <div class="flex justify-between items-center mb-4">
                            <div>
                                <h4 class="text-sm font-bold text-gray-800">Multiple Social Networks & Links Manager</h4>
                                <p class="text-xs text-gray-500">Add custom social media platforms, handles, and links to reflect across the site.</p>
                            </div>
                            <button type="button" id="add-social-network-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
                                <i class="fa-solid fa-plus"></i> Add Social Network
                            </button>
                        </div>

                        <!-- Social Platforms Grid List -->
                        <div id="social-platforms-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <p class="text-xs text-gray-400 italic col-span-full">No custom social networks added yet.</p>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <!-- Add Social Network Modal -->
        <div id="add-social-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[65] hidden flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                    <h3 class="text-lg font-bold text-gray-800" id="social-modal-title">Add Social Network</h3>
                    <button id="close-social-modal-btn" class="text-gray-400 hover:text-red-500">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <form id="social-platform-form" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Platform Name</label>
                        <select id="social-platform-name-select" class="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-brand-500 outline-none">
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Telegram">Telegram</option>
                            <option value="Instagram">Instagram</option>
                            <option value="TikTok">TikTok</option>
                            <option value="YouTube">YouTube</option>
                            <option value="Facebook">Facebook</option>
                            <option value="Twitter">Twitter / X</option>
                            <option value="LinkedIn">LinkedIn</option>
                            <option value="Discord">Discord</option>
                            <option value="Spotify">Spotify</option>
                            <option value="Reddit">Reddit</option>
                            <option value="Custom">Custom Network</option>
                        </select>
                    </div>

                    <div id="custom-platform-name-wrap" class="hidden">
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Custom Network Title</label>
                        <input type="text" id="social-platform-custom-name" placeholder="e.g. SnapChat" class="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-bold">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Link / Profile URL</label>
                        <input type="url" id="social-platform-url" required placeholder="https://wa.me/923000000000" class="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-mono">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Logo / Icon (Upload File or URL)</label>
                        <div class="flex items-center gap-2 mb-2">
                            <label for="social-logo-file-input" class="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded border border-gray-300 transition-colors flex items-center gap-1.5">
                                <i class="fa-solid fa-upload text-brand-600"></i> Upload Icon
                            </label>
                            <input type="file" id="social-logo-file-input" accept="image/*" class="hidden">
                        </div>
                        <input type="text" id="social-platform-icon-url" placeholder="https://.../logo.png or fa-brands fa-whatsapp" class="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-mono">
                    </div>

                    <div class="pt-3 border-t border-gray-100 flex justify-end gap-2">
                        <button type="button" id="close-social-modal-cancel" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-bold">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-md">
                            Save Network
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // --- LOGO FILE UPLOAD HANDLING ---
    const logoFileInput = document.getElementById('logo-file-input');
    const logoUrlInput = document.getElementById('logo-url');
    const logoPreviewBox = document.getElementById('logo-preview-box');
    const logoPreviewImg = document.getElementById('logo-preview-img');
    const clearLogoBtn = document.getElementById('clear-logo-btn');

    const updateLogoPreview = (url) => {
        if (url && url.trim() !== '') {
            logoPreviewImg.src = url;
            logoPreviewBox.classList.remove('hidden');
            clearLogoBtn.classList.remove('hidden');
        } else {
            logoPreviewBox.classList.add('hidden');
            clearLogoBtn.classList.add('hidden');
        }
    };

    logoUrlInput.addEventListener('input', () => updateLogoPreview(logoUrlInput.value));

    logoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            logoUrlInput.value = dataUrl;
            updateLogoPreview(dataUrl);
        };
        reader.readAsDataURL(file);
    });

    clearLogoBtn.addEventListener('click', () => {
        logoUrlInput.value = '';
        logoFileInput.value = '';
        updateLogoPreview('');
    });

    // Presets click handling
    const presetOptions = document.querySelectorAll('.preset-option');
    const selectedStyleInput = document.getElementById('selected-social-icon-style');

    presetOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            presetOptions.forEach(o => {
                o.classList.remove('border-brand-500', 'bg-brand-50/40');
                o.classList.add('border-gray-200');
            });
            opt.classList.remove('border-gray-200');
            opt.classList.add('border-brand-500', 'bg-brand-50/40');
            selectedStyleInput.value = opt.dataset.style;
        });
    });

    // --- PLATFORM CUSTOM LOGOS FILE UPLOADS ---
    const bindPlatformLogoUpload = (inputId, textId) => {
        const fileIn = document.getElementById(inputId);
        const textIn = document.getElementById(textId);
        if (!fileIn || !textIn) return;

        fileIn.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                textIn.value = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    bindPlatformLogoUpload('upload-file-instagram', 'logo-instagram-url');
    bindPlatformLogoUpload('upload-file-tiktok', 'logo-tiktok-url');
    bindPlatformLogoUpload('upload-file-youtube', 'logo-youtube-url');
    bindPlatformLogoUpload('upload-file-facebook', 'logo-facebook-url');

    // --- MULTIPLE SOCIAL NETWORKS MODAL LOGIC ---
    const socialModal = document.getElementById('add-social-modal');
    const addSocialBtn = document.getElementById('add-social-network-btn');
    const closeSocialBtn = document.getElementById('close-social-modal-btn');
    const cancelSocialBtn = document.getElementById('close-social-modal-cancel');
    const socialForm = document.getElementById('social-platform-form');
    const nameSelect = document.getElementById('social-platform-name-select');
    const customNameWrap = document.getElementById('custom-platform-name-wrap');
    const socialLogoFileInput = document.getElementById('social-logo-file-input');
    const socialIconUrlInput = document.getElementById('social-platform-icon-url');

    nameSelect.addEventListener('change', () => {
        if (nameSelect.value === 'Custom') {
            customNameWrap.classList.remove('hidden');
        } else {
            customNameWrap.classList.add('hidden');
        }
    });

    socialLogoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            socialIconUrlInput.value = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    const hideSocialModal = () => socialModal.classList.add('hidden');
    addSocialBtn.addEventListener('click', () => {
        document.getElementById('social-platform-url').value = '';
        socialIconUrlInput.value = '';
        socialModal.classList.remove('hidden');
    });
    closeSocialBtn.addEventListener('click', hideSocialModal);
    cancelSocialBtn.addEventListener('click', hideSocialModal);

    socialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedName = nameSelect.value === 'Custom' 
            ? (document.getElementById('social-platform-custom-name').value.trim() || 'Custom')
            : nameSelect.value;
        const url = document.getElementById('social-platform-url').value.trim();
        const iconOrLogo = socialIconUrlInput.value.trim() || getPlatformDefaultIcon(selectedName);

        customSocialPlatforms.push({
            id: 'soc_' + Date.now(),
            name: selectedName,
            url: url,
            icon: iconOrLogo
        });

        renderSocialPlatformsList();
        hideSocialModal();
    });

    document.getElementById('save-branding-btn').addEventListener('click', saveBrandingConfig);
}

function getPlatformDefaultIcon(name) {
    const key = name.toLowerCase();
    if (key.includes('whatsapp')) return 'fa-brands fa-whatsapp';
    if (key.includes('telegram')) return 'fa-brands fa-telegram';
    if (key.includes('instagram')) return 'fa-brands fa-instagram';
    if (key.includes('tiktok')) return 'fa-brands fa-tiktok';
    if (key.includes('youtube')) return 'fa-brands fa-youtube';
    if (key.includes('facebook')) return 'fa-brands fa-facebook-f';
    if (key.includes('twitter')) return 'fa-brands fa-x-twitter';
    if (key.includes('linkedin')) return 'fa-brands fa-linkedin-in';
    if (key.includes('discord')) return 'fa-brands fa-discord';
    if (key.includes('spotify')) return 'fa-brands fa-spotify';
    if (key.includes('reddit')) return 'fa-brands fa-reddit-alien';
    return 'fa-solid fa-share-nodes';
}

function renderSocialPlatformsList() {
    const container = document.getElementById('social-platforms-list');
    if (!container) return;

    if (customSocialPlatforms.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-400 italic col-span-full">No custom social networks added yet. Click "+ Add Social Network" above.</p>`;
        return;
    }

    container.innerHTML = '';
    customSocialPlatforms.forEach((soc, idx) => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between gap-2 shadow-sm';
        
        const isImage = soc.icon.startsWith('http') || soc.icon.startsWith('data:image');
        const iconMarkup = isImage 
            ? `<img src="${soc.icon}" class="w-6 h-6 object-contain rounded">`
            : `<i class="${soc.icon} text-lg text-brand-600"></i>`;

        item.innerHTML = `
            <div class="flex items-center gap-2.5 overflow-hidden">
                ${iconMarkup}
                <div class="truncate">
                    <p class="text-xs font-bold text-gray-800 truncate">${soc.name}</p>
                    <a href="${soc.url}" target="_blank" class="text-[11px] text-brand-600 font-mono truncate hover:underline block">${soc.url}</a>
                </div>
            </div>
            <button type="button" class="text-red-500 hover:text-red-700 text-xs p-1" onclick="window.removeSocialPlatform(${idx})">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        container.appendChild(item);
    });
}

window.removeSocialPlatform = (idx) => {
    customSocialPlatforms.splice(idx, 1);
    renderSocialPlatformsList();
};

// Fetch the existing document
async function fetchCurrentBranding() {
    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        const snap = await getDoc(ref);

        if (snap.exists()) {
            const data = snap.data();
            
            document.getElementById('site-name').value = data.siteName || '';
            document.getElementById('seo-title').value = data.seoTitle || '';
            document.getElementById('seo-desc').value = data.seoDescription || '';
            document.getElementById('seo-keys').value = data.seoKeywords || '';

            if (data.theme) {
                const logoUrl = data.theme.logoUrl || '';
                document.getElementById('logo-url').value = logoUrl;
                if (logoUrl) {
                    const previewBox = document.getElementById('logo-preview-box');
                    const previewImg = document.getElementById('logo-preview-img');
                    const clearBtn = document.getElementById('clear-logo-btn');
                    if (previewImg) previewImg.src = logoUrl;
                    if (previewBox) previewBox.classList.remove('hidden');
                    if (clearBtn) clearBtn.classList.remove('hidden');
                }
                document.getElementById('heading-font').value = data.theme.headingFont || '';
                document.getElementById('body-font').value = data.theme.bodyFont || '';
                if(data.theme.palette) document.getElementById('palette-select').value = data.theme.palette;
            }

            if (data.socialIconsConfig) {
                const style = data.socialIconsConfig.style || '3d-gradient';
                document.getElementById('selected-social-icon-style').value = style;

                const presetOptions = document.querySelectorAll('.preset-option');
                presetOptions.forEach(opt => {
                    if (opt.dataset.style === style) {
                        opt.click();
                    }
                });

                if (data.socialIconsConfig.customLogos) {
                    const logos = data.socialIconsConfig.customLogos;
                    if (document.getElementById('logo-instagram-url')) document.getElementById('logo-instagram-url').value = logos.instagram || '';
                    if (document.getElementById('logo-tiktok-url')) document.getElementById('logo-tiktok-url').value = logos.tiktok || '';
                    if (document.getElementById('logo-youtube-url')) document.getElementById('logo-youtube-url').value = logos.youtube || '';
                    if (document.getElementById('logo-facebook-url')) document.getElementById('logo-facebook-url').value = logos.facebook || '';
                }

                if (Array.isArray(data.socialIconsConfig.platforms)) {
                    customSocialPlatforms = data.socialIconsConfig.platforms;
                    renderSocialPlatformsList();
                }
            }
        }
    } catch (e) {
        console.error("Failed to load branding preferences", e);
    }
}

// Save back to Firestore
async function saveBrandingConfig() {
    const btn = document.getElementById('save-branding-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const alertsBox = document.getElementById('branding-alerts');
    alertsBox.classList.add('hidden');
    alertsBox.className = "mb-6 hidden text-sm px-4 py-3 rounded-xl font-bold text-center";

    const payload = {
        siteName: document.getElementById('site-name').value.trim(),
        seoTitle: document.getElementById('seo-title').value.trim(),
        seoDescription: document.getElementById('seo-desc').value.trim(),
        seoKeywords: document.getElementById('seo-keys').value.trim(),
        theme: {
            logoUrl: document.getElementById('logo-url').value.trim(),
            palette: document.getElementById('palette-select').value,
            headingFont: document.getElementById('heading-font').value.trim() || 'Inter',
            bodyFont: document.getElementById('body-font').value.trim() || 'Inter'
        },
        socialIconsConfig: {
            style: document.getElementById('selected-social-icon-style').value,
            customLogos: {
                instagram: document.getElementById('logo-instagram-url') ? document.getElementById('logo-instagram-url').value.trim() : '',
                tiktok: document.getElementById('logo-tiktok-url') ? document.getElementById('logo-tiktok-url').value.trim() : '',
                youtube: document.getElementById('logo-youtube-url') ? document.getElementById('logo-youtube-url').value.trim() : '',
                facebook: document.getElementById('logo-facebook-url') ? document.getElementById('logo-facebook-url').value.trim() : ''
            },
            platforms: customSocialPlatforms
        }
    };

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general');
        await setDoc(ref, payload, { merge: true });

        alertsBox.classList.remove('hidden');
        alertsBox.classList.add('bg-green-100', 'text-green-700');
        alertsBox.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Configuration saved successfully! Custom platform logos updated globally across user categories & services.';

    } catch (e) {
        console.error("Save failure", e);
        alertsBox.classList.remove('hidden');
        alertsBox.classList.add('bg-red-100', 'text-red-700');
        alertsBox.innerHTML = '<i class="fa-solid fa-times mr-2"></i> Failed to save branding configuration.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Aesthetics';
    }
}
