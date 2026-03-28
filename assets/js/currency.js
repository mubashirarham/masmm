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
    if (isNaN(pkrAmount) || pkrAmount === null) return formatMoney(0);
    
    if (currentCurrency === 'PKR') {
        const val = Number(pkrAmount);
        // Clean display for big numbers, precise for tiny numbers
        return `Rs ${val < 1 && val > 0 ? val.toFixed(4) : val.toFixed(2)}`;
    }
    
    const converted = pkrAmount * rates[currentCurrency];
    const sym = currentCurrency === 'USD' ? '$' : '€';
    return `${sym}${Number(converted).toFixed(4)}`;
}

// Auto-initialize when loaded
initCurrency();
