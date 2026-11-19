import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProfileDropdown } from './UserProfileDropdown';

describe('UserProfileDropdown', () => {
    const mockUser = {
        name: 'Dr. John Doe',
        role: 'doctor',
        username: 'jdoe'
    };
    const mockLogout = vi.fn();
    const mockToggleLanguage = vi.fn();
    const mockT = (key) => key;

    it('renders user details and triggers dropdown toggle', () => {
        render(
            <MemoryRouter>
                <UserProfileDropdown
                    user={mockUser}
                    logout={mockLogout}
                    language="es"
                    toggleLanguage={mockToggleLanguage}
                    t={mockT}
                    isStaff={true}
                />
            </MemoryRouter>
        );

        // Verify trigger renders
        const trigger = screen.getByRole('button', { name: /dr\. john doe/i });
        expect(trigger).toBeInTheDocument();

        // Click trigger to open dropdown
        fireEvent.click(trigger);

        // Menu options become visible
        expect(screen.getByText('theme_mode')).toBeInTheDocument();
        expect(screen.getAllByText('language').length).toBeGreaterThan(0);
        expect(screen.getByText('sign_out')).toBeInTheDocument();

        // Click sign out
        const signOutBtn = screen.getByText('sign_out').closest('button');
        fireEvent.click(signOutBtn);
        expect(mockLogout).toHaveBeenCalledTimes(1);
    });
});
