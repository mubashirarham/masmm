export function renderPagination(totalItems, rowsPerPage, currentPage, onPageChangeCallback, containerElement) {
    if (!containerElement) return;
    containerElement.innerHTML = '';
    
    // Safety check constraints
    if (currentPage < 1) currentPage = 1;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (totalPages <= 1) return; // No pagination needed

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 mt-auto shrink-0 z-10 w-full';

    // Mobile view (Prev / Next only)
    const mobileView = document.createElement('div');
    mobileView.className = 'flex justify-between flex-1 sm:hidden';
    mobileView.innerHTML = `
        <button class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 prev-btn" ${currentPage === 1 ? 'disabled style="opacity:0.5"' : ''}>Previous</button>
        <button class="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 next-btn" ${currentPage === totalPages ? 'disabled style="opacity:0.5"' : ''}>Next</button>
    `;
    if(currentPage > 1) mobileView.querySelector('.prev-btn').addEventListener('click', () => onPageChangeCallback(currentPage - 1));
    if(currentPage < totalPages) mobileView.querySelector('.next-btn').addEventListener('click', () => onPageChangeCallback(currentPage + 1));

    // Desktop view
    const desktopView = document.createElement('div');
    desktopView.className = 'hidden sm:flex sm:flex-1 sm:items-center sm:justify-between';
    
    let showingStart = ((currentPage - 1) * rowsPerPage) + 1;
    let showingEnd = Math.min(currentPage * rowsPerPage, totalItems);
    if (totalItems === 0) { showingStart = 0; showingEnd = 0; }

    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `<p class="text-sm text-gray-500">Showing <span class="font-medium text-gray-800">${showingStart}</span> to <span class="font-medium text-gray-800">${showingEnd}</span> of <span class="font-medium text-gray-800">${totalItems}</span> results</p>`;

    const nav = document.createElement('nav');
    nav.className = 'isolate inline-flex -space-x-px rounded-md shadow-sm';
    nav.setAttribute('aria-label', 'Pagination');

    const prevBtn = document.createElement('button');
    prevBtn.className = `relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`;
    prevBtn.innerHTML = '<span class="sr-only">Previous</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>';
    prevBtn.disabled = currentPage === 1;
    if(!prevBtn.disabled) prevBtn.addEventListener('click', () => onPageChangeCallback(currentPage - 1));
    nav.appendChild(prevBtn);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        nav.appendChild(createPageBtn(1, currentPage, onPageChangeCallback));
        if (startPage > 2) nav.appendChild(createEllipsis());
    }
    for (let i = startPage; i <= endPage; i++) {
        nav.appendChild(createPageBtn(i, currentPage, onPageChangeCallback));
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) nav.appendChild(createEllipsis());
        nav.appendChild(createPageBtn(totalPages, currentPage, onPageChangeCallback));
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`;
    nextBtn.innerHTML = '<span class="sr-only">Next</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg>';
    nextBtn.disabled = currentPage === totalPages;
    if(!nextBtn.disabled) nextBtn.addEventListener('click', () => onPageChangeCallback(currentPage + 1));
    nav.appendChild(nextBtn);

    desktopView.appendChild(infoDiv);
    desktopView.appendChild(nav);

    wrapper.appendChild(mobileView);
    wrapper.appendChild(desktopView);
    containerElement.appendChild(wrapper);
}

function createPageBtn(page, currentPage, callback) {
    const btn = document.createElement('button');
    if (page === currentPage) {
        btn.className = 'relative z-10 inline-flex items-center bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus:z-20 border-y border-brand-500';
    } else {
        btn.className = 'relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 custom-page-btn';
    }
    btn.innerText = page;
    if (page !== currentPage) {
        btn.addEventListener('click', () => callback(page));
    }
    return btn;
}

function createEllipsis() {
    const span = document.createElement('span');
    span.className = 'relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-500 ring-1 ring-inset ring-gray-300';
    span.innerText = '...';
    return span;
}
