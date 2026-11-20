import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startSafeViewTransition } from './viewTransition';

describe('startSafeViewTransition', () => {
    beforeEach(() => {
        delete document.startViewTransition;
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

        // Mock window.matchMedia
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });

        await startSafeViewTransition(callback);

        expect(startViewTransitionMock).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(1);
    });
});
