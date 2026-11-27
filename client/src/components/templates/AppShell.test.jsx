import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';

vi.mock('@/features/layout/components/Navbar', () => ({
    Navbar: () => <header>Navbar</header>
}));

vi.mock('@/features/communication/components/PendingApprovalQueue', () => ({
    PendingApprovalQueue: () => <div>PendingApprovalQueue</div>
}));

vi.mock('@/context/PendingApprovalContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        PendingApprovalProvider: ({ children }) => <div>{children}</div>
    };
});

const renderShell = () => render(
    <MemoryRouter initialEntries={['/appointments']}>
        <Routes>
            <Route element={<AppShell />}>
                <Route path="/appointments" element={<p>route content</p>} />
                <Route path="/finances" element={<p>finances content</p>} />
            </Route>
        </Routes>
    </MemoryRouter>
);

describe('AppShell', () => {
    it('renders the persistent chrome and the routed page', () => {
        renderShell();

        expect(screen.getByText('Navbar')).toBeInTheDocument();
        expect(screen.getByText('route content')).toBeInTheDocument();
        expect(screen.getByText('PendingApprovalQueue')).toBeInTheDocument();
    });

    it('renders exactly one main landmark for the routed content', () => {
        const { container } = renderShell();

        expect(container.querySelectorAll('main')).toHaveLength(1);
    });
});
