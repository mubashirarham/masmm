/**
 * MASMM Fast In-Memory & LocalStorage Cache Manager
 * Provides Stale-While-Revalidate caching for 0ms instant loading
 */

const memoryCache = new Map();

export const CacheManager = {
    /**
     * Get item from memory or LocalStorage instantly
     */
    get(key, fallback = null) {
        if (memoryCache.has(key)) {
            return memoryCache.get(key);
        }
        try {
            const raw = localStorage.getItem(`masmm_cache_${key}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (!parsed.expiresAt || parsed.expiresAt > Date.now())) {
                    memoryCache.set(key, parsed.data);
                    return parsed.data;
                }
            }
        } catch (e) {
            console.warn("Cache read error:", e);
        }
        return fallback;
    },

    /**
     * Set item into memory and LocalStorage
     */
    set(key, data, ttlMs = 24 * 60 * 60 * 1000) { // Default 24 hours
        memoryCache.set(key, data);
        try {
            const payload = {
                data: data,
                timestamp: Date.now(),
                expiresAt: Date.now() + ttlMs
            };
            localStorage.setItem(`masmm_cache_${key}`, JSON.stringify(payload));
        } catch (e) {
            console.warn("Cache write error:", e);
        }
    },

    /**
     * Clear specific or all caches
     */
    clear(key = null) {
        if (key) {
            memoryCache.delete(key);
            localStorage.removeItem(`masmm_cache_${key}`);
        } else {
            memoryCache.clear();
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('masmm_cache_')) localStorage.removeItem(k);
            });
        }
    },

    /**
     * Preload static snapshot from disk if local storage is completely empty
     */
    async preloadStaticCatalog() {
        const cachedServices = this.get('services');
        const cachedCategories = this.get('categories');
        
        if (cachedServices && cachedCategories && cachedServices.length > 0) {
            return { services: cachedServices, categories: cachedCategories };
        }

        try {
            const res = await fetch('/assets/data/paksmmpanels_services.json');
            if (res.ok) {
                const catalog = await res.json();
                if (catalog && catalog.services) {
                    const servicesList = catalog.services.map(s => {
                        const originalRateUSD = parseFloat(s.rate) || 0;
                        const fxRate = catalog.exchangeRateToPKR || 275.81;
                        const markup = catalog.markupMultiplier || 1.50;
                        const baseCostPKR = originalRateUSD * fxRate;
                        const sellingRatePKR = (baseCostPKR * markup).toFixed(4);

                        return {
                            id: `imported_paksmmpanels_${s.service}`,
                            serviceId: String(s.service),
                            name: s.name,
                            categoryName: s.category || 'Other Services',
                            categoryId: s.category || 'Other Services',
                            rate: sellingRatePKR,
                            originalRate: originalRateUSD,
                            providerRate: parseFloat(baseCostPKR.toFixed(4)),
                            min: parseInt(s.min) || 1,
                            max: parseInt(s.max) || 10000000,
                            description: s.description || s.desc || '',
                            desc: s.description || s.desc || '',
                            average_time: s.average_time != null ? s.average_time : null,
                            type: s.type || 'Default',
                            dripfeed: !!s.dripfeed,
                            refill: !!s.refill || s.refill === '1' || s.refill === true,
                            cancel: !!s.cancel || s.cancel === '1' || s.cancel === true,
                            status: 'Active',
                            providerId: 'paksmmpanels',
                            providerName: 'PakSMMPanels'
                        };
                    });

                    // Build unique categories
                    const catNames = [...new Set(servicesList.map(s => s.categoryName))];
                    const categoriesList = catNames.map((name, index) => ({
                        id: name,
                        name: name,
                        sort: index + 1,
                        status: 'Active'
                    }));

                    this.set('services', servicesList);
                    this.set('categories', categoriesList);
                    return { services: servicesList, categories: categoriesList };
                }
            }
        } catch (e) {
            console.warn("Could not preload static catalog:", e);
        }
        return null;
    }
};

window.CacheManager = CacheManager;
