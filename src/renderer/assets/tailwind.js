/**
 * Tailwind CSS Runtime Shim
 * Styles are statically precompiled into assets/css/tailwind.min.css for peak performance.
 * This shim prevents runtime MutationObserver overhead and keeps backwards compatibility.
 */
window.tailwind = window.tailwind || { config: {} };
