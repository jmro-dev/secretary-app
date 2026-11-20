import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { useLanguage } from '@/hooks/useLanguage';
import styles from './Modal.module.css';

export const Modal = ({ isOpen, onClose, title, children, footer, size = 'md', variant: _variant = 'light', className = '' }) => {
    const { t } = useLanguage();
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Handle native HTMLDialogElement showModal & cancel event
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            if (!dialog.open && typeof dialog.showModal === 'function') {
                dialog.showModal();
            }
        } else {
            if (dialog.open && typeof dialog.close === 'function') {
                dialog.close();
            }
        }
    }, [isOpen]);

    // Native cancel event (triggered by Escape or back gesture on dialog)
    const handleCancel = (e) => {
        e.preventDefault();
        if (onCloseRef.current) onCloseRef.current();
    };

    // Global Escape fallback for jsdom and browsers where showModal isn't supported or dispatching cancel
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDownGlobal = (e) => {
            if (e.key === 'Escape' && onCloseRef.current) {
                onCloseRef.current();
            }
        };
        window.addEventListener('keydown', handleKeyDownGlobal);
        return () => window.removeEventListener('keydown', handleKeyDownGlobal);
    }, [isOpen]);

    // Light dismiss: clicks on the ::backdrop or backdrop element trigger onClose
    const handleBackdropClick = (e) => {
        if (e.target === dialogRef.current) {
            if (onCloseRef.current) onCloseRef.current();
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <dialog
            ref={dialogRef}
            open={isOpen}
            className={`${styles.Modal__dialog} ${styles.Modal__root}`}
            onCancel={handleCancel}
            onClick={handleBackdropClick}
            aria-labelledby="modal-title"
        >
            <button
                type="button"
                className={`${styles.Modal__backdrop}`}
                onClick={onClose}
                aria-label={t('modal_close')}
            />
            <div
                className={`${styles.Modal__content} ${size && size !== 'md' ? styles['Modal__content' + size.charAt(0).toUpperCase() + size.slice(1)] : ''} ${className}`}
                onClick={e => e.stopPropagation()}
                tabIndex={-1}
            >
                <header className={`${styles.Modal__header}`}>
                    <h3 id="modal-title" className={`${styles.Modal__title}`}>{title}</h3>
                    <Button
                        variant="ghost"
                        size="md-compact"
                        className={`${styles.Modal__close}`}
                        onClick={onClose}
                        aria-label={t('modal_close')}
                        icon={<Icon name="CLOSE" />}
                        unstyled
                    />
                </header>

                <div className={`${styles.Modal__body}`}>
                    {children}
                </div>

                {footer && (
                    <footer className={`${styles.Modal__footer}`}>
                        {footer}
                    </footer>
                )}
            </div>
        </dialog>,
        document.body
    );
};

