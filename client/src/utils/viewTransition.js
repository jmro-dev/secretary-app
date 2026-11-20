/**
 * Executes a state update wrapped in document.startViewTransition()
 * as progressive enhancement, falling back immediately if unsupported
 * or if the user prefers reduced motion.
 *
 * @param {Function} updateCallback - Synchronous or asynchronous state updater function
 * @returns {Promise<void>} Resolves when the transition or update completes
 */
export const startSafeViewTransition = (updateCallback) => {
    if (
        typeof document !== 'undefined' &&
        typeof document.startViewTransition === 'function' &&
        !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
        return document.startViewTransition(updateCallback).finished;
    }

    // Fallback: immediate execution
    updateCallback();
    return Promise.resolve();
};
