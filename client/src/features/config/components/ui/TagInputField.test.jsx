import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInputField } from './TagInputField';

describe('TagInputField Component', () => {
    it('renders existing comma-separated tags as chips', () => {
        render(
            <TagInputField
                id="test-tags"
                label="Términos"
                value="crisis, guardia, urgencia"
                onChange={vi.fn()}
            />
        );

        expect(screen.getByText('crisis')).toBeInTheDocument();
        expect(screen.getByText('guardia')).toBeInTheDocument();
        expect(screen.getByText('urgencia')).toBeInTheDocument();
    });

    it('adds a new tag when Enter is pressed', () => {
        const handleChange = vi.fn();
        render(
            <TagInputField
                id="test-tags"
                label="Términos"
                value="crisis"
                onChange={handleChange}
            />
        );

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'auxilio' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        expect(handleChange).toHaveBeenCalledWith('crisis, auxilio');
    });

    it('adds a new tag when comma is pressed', () => {
        const handleChange = vi.fn();
        render(
            <TagInputField
                id="test-tags"
                label="Términos"
                value="crisis"
                onChange={handleChange}
            />
        );

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'socorro' } });
        fireEvent.keyDown(input, { key: ',', code: 'Comma' });

        expect(handleChange).toHaveBeenCalledWith('crisis, socorro');
    });

    it('removes tag when clicking its remove button', () => {
        const handleChange = vi.fn();
        render(
            <TagInputField
                id="test-tags"
                label="Términos"
                value="crisis, guardia"
                onChange={handleChange}
            />
        );

        const removeGuardia = screen.getByLabelText('Eliminar término guardia');
        fireEvent.click(removeGuardia);

        expect(handleChange).toHaveBeenCalledWith('crisis');
    });
});
