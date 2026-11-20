import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startSafeViewTransition } from './viewTransition';

describe('startSafeViewTransition', () => {
    const originalStartViewTransition = document.startViewTransition;
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        delete document.startViewTransition;
    });

    afterEach(() => {
        document.startViewTransition = originalStartViewTransition;
        window.matchMedia = originalMatchMedia;
        vi.restoreAllMocks();
    });

    it('executes callback immediately when startViewTransition is unsupported', async () => {
        const callback = vi.fn();
        await startSafeViewTransition(callback);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('delegates to document.startViewTransition when supported and reduced-motion is not set', async () => {
        const callback = vi.fn();
        const mockFinished = Promise.resolve();
        const startViewTransitionMock = vi.fn((fn) => {
            fn();
            return { finished: mockFinished };
        });
        document.startViewTransition = startViewTransitionMock;

        await startSafeViewTransition(callback);

        expect(startViewTransitionMock).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('bypasses startViewTransition when prefers-reduced-motion is reduce', async () => {
        const callback = vi.fn();
        const startViewTransitionMock = vi.fn();
        document.startViewTransition = startViewTransitionMock;

        window.matchMedia = vi.fn().mockReturnValue({ matches: true });

        await startSafeViewTransition(callback);

        expect(startViewTransitionMock).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles aborted transitions gracefully without throwing', async () => {
        const callback = vi.fn();
        const mockFinished = Promise.reject(new Error('AbortError'));
        const startViewTransitionMock = vi.fn((fn) => {
            fn();
            return { finished: mockFinished };
        });
        document.startViewTransition = startViewTransitionMock;

        await expect(startSafeViewTransition(callback)).resolves.not.toThrow();
        expect(callback).toHaveBeenCalledTimes(1);
    });
});
