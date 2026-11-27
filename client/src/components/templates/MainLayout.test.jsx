import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageProvider } from '@/context/MessageContext';
import { LanguageProvider } from '@/context/LanguageProvider';
import { SearchProvider } from '@/context/SearchProvider';
import { MainLayout } from './MainLayout';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock('@/api/axios', () => ({
    api: { get: mockGet, post: vi.fn() }
}));

vi.mock('@/features/auth/AuthContext', () => ({
    useAuth: mockUseAuth
}));

vi.mock('@/components/ui/PageHeader', () => ({
    PageHeader: () => <header>PageHeader</header>
}));

vi.mock('@/features/doctors/components/ui/DoctorSelector', () => ({
    DoctorSelector: () => null
}));

const renderLayout = (props = {}) => render(
    <MemoryRouter>
        <MessageProvider>
            <LanguageProvider>
                <SearchProvider>
                    <MainLayout {...props}>
                        <p>child content</p>
                    </MainLayout>
                </SearchProvider>
            </LanguageProvider>
        </MessageProvider>
    </MemoryRouter>
);

describe('MainLayout', () => {
    it('renders children without owning the persistent app chrome', () => {
        mockUseAuth.mockReturnValue({ user: { role: 'secretary', user_id: 1 } });
        renderLayout();

        expect(screen.getByText('child content')).toBeInTheDocument();
        // Navbar/pending approvals belong to AppShell at the router level.
        expect(screen.queryByText('Navbar')).not.toBeInTheDocument();
    });

    it('renders the page header only when a title is provided', () => {
        mockUseAuth.mockReturnValue({ user: { role: 'secretary', user_id: 1 } });
        renderLayout({ title: 'Turnos' });

        expect(screen.getByText('PageHeader')).toBeInTheDocument();
    });

    it('applies preset contained modifier when specified', () => {
        mockUseAuth.mockReturnValue({ user: { role: 'secretary', user_id: 1 } });
        const { container } = renderLayout({ preset: 'contained' });

        const pageShell = container.querySelector('p')?.parentElement;
        expect(pageShell?.className).toContain('MainLayout__pageShell--contained');
    });
});
