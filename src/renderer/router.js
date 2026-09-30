
// router.js - Premium Page Transitions for Lux Retail
(function() {
    // 1. Add Fade-In Styles immediately
    const style = document.createElement('style');
    style.innerHTML = `
        body { 
            animation: fadeIn 0.16s ease-out forwards; 
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .fade-out {
            animation: fadeOut 0.08s ease-in forwards !important;
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // 2. Handle Navigation
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const url = link.getAttribute('href');
        
        // Skip for external links, anchors, new tabs, etc.
        if (!url || 
            link.hasAttribute('download') ||
            link.dataset.routerIgnore === 'true' ||
            url.startsWith('http') || 
            url.startsWith('blob:') ||
            url.startsWith('data:') ||
            url.startsWith('#') || 
            url.startsWith('javascript:') || 
            url.startsWith('mailto:') ||
            url.startsWith('tel:') ||
            link.getAttribute('target') === '_blank' ||
            e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0
        ) return;

        e.preventDefault();
        
        // Add fade-out class
        document.body.classList.add('fade-out');
        
        setTimeout(() => {
            window.location.href = url;
        }, 80);
    });
})();
