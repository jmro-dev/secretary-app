import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureToolbar } from './FeatureToolbar';

describe('FeatureToolbar Organism', () => {
    const tabs = [
        { id: 'tab1', label: 'Tab 1', icon: 'home' },
        { id: 'tab2', label: 'Tab 2', icon: 'settings', badge: 3 },
        { id: 'tab3', label: 'Tab Hidden', hidden: true }
    ];

    it('renders tabs and respects tab.hidden property', () => {
        render(
            <FeatureToolbar
                tabs={tabs}
                activeTab="tab1"
                onTabChange={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: /tab 1/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /tab 2/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /tab hidden/i })).not.toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('triggers onTabChange when clicking inactive tab, but not active tab', () => {
        const handleTabChange = vi.fn();
        render(
            <FeatureToolbar
                tabs={tabs}
                activeTab="tab1"
                onTabChange={handleTabChange}
            />
        );

        // Click active tab
        fireEvent.click(screen.getByRole('button', { name: /tab 1/i }));
        expect(handleTabChange).not.toHaveBeenCalled();

        // Click inactive tab
        fireEvent.click(screen.getByRole('button', { name: /tab 2/i }));
        expect(handleTabChange).toHaveBeenCalledWith('tab2');
    });
});
