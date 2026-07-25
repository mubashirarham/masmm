const CACHE_KEY = 'masmmpanel_rates';
const PREF_KEY = 'masmmpanel_currency';

let rates = { PKR: 1, USD: 0.0036, EUR: 0.0033 };
let currentCurrency = localStorage.getItem(PREF_KEY) || 'PKR';

export async function initCurrency() {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - cached.timestamp < 3600000) {
        rates = cached.rates;
        updateUICurrencyLabel();
        return;
    }
    
    try {
        const res = await fetch('https://economia.awesomeapi.com.br/last/USD-PKR,EUR-PKR');
        const data = await res.json();
        if (data.USDPKR) {
            rates.USD = 1 / parseFloat(data.USDPKR.ask);
            rates.EUR = 1 / parseFloat(data.EURPKR.ask);
            localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now() }));
        }
    } catch (e) {
        console.error("Failed to fetch live rates. Using cached or fallback rates.");
    }
    updateUICurrencyLabel();
}

export function setCurrency(curr) {
    if (['PKR', 'USD', 'EUR'].includes(curr)) {
        currentCurrency = curr;
        localStorage.setItem(PREF_KEY, curr);
        updateUICurrencyLabel();
        window.dispatchEvent(new CustomEvent('currency-changed'));
    }
}

function updateUICurrencyLabel() {
    const label = document.getElementById('current-currency-label');
    if (label) {
        if (currentCurrency === 'PKR') label.innerText = 'Rs PKR';
        else if (currentCurrency === 'USD') label.innerText = '$ USD';
        else if (currentCurrency === 'EUR') label.innerText = '€ EUR';
    }
}

export function getCurrency() {
    return currentCurrency;
}

export function formatMoney(pkrAmount) {
    if (isNaN(pkrAmount) || pkrAmount === null || pkrAmount === undefined) return 'Rs 0.00';
    const num = Number(pkrAmount);
    
    if (currentCurrency === 'PKR') {
        if (num < 1 && num > 0) {
            return `Rs ${num.toFixed(4)}`;
        }
        return `Rs ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    const converted = num * rates[currentCurrency];
    const sym = currentCurrency === 'USD' ? '$' : '€';
    if (converted < 1 && converted > 0) {
        return `${sym}${converted.toFixed(4)}`;
    }
    return `${sym}${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Global window bindings for access across all pages
if (typeof window !== 'undefined') {
    window.formatMoney = formatMoney;
    window.changeCurrency = setCurrency;
    window.getCurrency = getCurrency;
}

// Auto-initialize when loaded
initCurrency();
