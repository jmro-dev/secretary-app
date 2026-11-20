import { flushSync } from 'react-dom';

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
        typeof window !== 'undefined' &&
        typeof document.startViewTransition === 'function' &&
        !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
        return new Promise((resolve) => {
            const transition = document.startViewTransition(() => {
                flushSync(() => {
                    updateCallback();
                });
            });

            // Catch AbortError if transition is superseded or aborted
            transition.finished.then(() => resolve()).catch(() => resolve());
        });
    }

    // Fallback: immediate execution
    try {
        const result = updateCallback();
        return Promise.resolve(result);
    } catch (err) {
        return Promise.reject(err);
    }
};
