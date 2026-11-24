import React, { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import styles from './TagInputField.module.css';

/**
 * TagInputField component.
 * Allows entering and removing individual interactive chips/tags.
 * Serializes as a comma-separated string for compatibility with existing settings APIs.
 */
export const TagInputField = ({
    id,
    label,
    value = '',
    onChange,
    placeholder = 'Escribe un término y presiona Enter...',
    description,
    disabled = false,
    variant = 'default' // 'danger' | 'warning' | 'default'
}) => {
    const [inputValue, setInputValue] = useState('');

    const tags = React.useMemo(() => {
        if (!value || typeof value !== 'string') return [];
        return value.split(',').map(t => t.trim()).filter(Boolean);
    }, [value]);

    const addTag = (rawText) => {
        if (disabled) return;
        const clean = rawText.trim().replace(/^,+|,+$/g, '');
        if (!clean) return;

        // Support pasting multiple terms separated by commas
        const candidates = clean.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const next = [...tags];
        candidates.forEach(item => {
            if (!next.includes(item)) {
                next.push(item);
            }
        });

        onChange?.(next.join(', '));
        setInputValue('');
    };

    const removeTag = (tagToRemove) => {
        if (disabled) return;
        const next = tags.filter(t => t !== tagToRemove);
        onChange?.(next.join(', '));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(inputValue);
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            e.preventDefault();
            removeTag(tags[tags.length - 1]);
        }
    };

    const handleBlur = () => {
        if (inputValue.trim()) {
            addTag(inputValue);
        }
    };

    return (
        <div className={styles.TagInputField__root}>
            {label && (
                <label className={styles.TagInputField__label} htmlFor={id}>
                    {label}
                </label>
            )}

            <div className={`${styles.TagInputField__container} ${disabled ? styles['TagInputField__container--disabled'] : ''}`}>
                <div className={styles.TagInputField__tagsList}>
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className={`${styles.TagInputField__tag} ${styles[`TagInputField__tag--${variant}`] || ''}`}
                        >
                            <span className={styles.TagInputField__tagText}>{tag}</span>
                            {!disabled && (
                                <button
                                    type="button"
                                    className={styles.TagInputField__removeBtn}
                                    onClick={() => removeTag(tag)}
                                    title={`Eliminar "${tag}"`}
                                    aria-label={`Eliminar término ${tag}`}
                                >
                                    <Icon name="close" size="0.85rem" />
                                </button>
                            )}
                        </span>
                    ))}

                    {!disabled && (
                        <input
                            id={id}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                            placeholder={tags.length === 0 ? placeholder : 'Agregar otro término...'}
                            className={styles.TagInputField__input}
                        />
                    )}
                </div>
            </div>

            {description && (
                <span className={styles.TagInputField__description}>{description}</span>
            )}
        </div>
    );
};
