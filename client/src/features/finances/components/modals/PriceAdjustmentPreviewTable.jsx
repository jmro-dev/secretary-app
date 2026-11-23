import React from 'react';
import styles from './PriceAdjustmentModal.module.css';

/**
 * PriceAdjustmentPreviewTable Subcomponent.
 * Displays before/after prices and calculated increase for each service.
 */
export const PriceAdjustmentPreviewTable = ({ preview }) => {
    if (!preview) return null;

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className={styles.PriceAdjustmentModal__tableContainer}>
            <table className={styles.PriceAdjustmentModal__table}>
                <thead>
                    <tr>
                        <th>Profesional / Institución</th>
                        <th>Concepto</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Precio Vigente</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Nuevo (+{preview.percent}%)</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Incremento</th>
                    </tr>
                </thead>
                <tbody>
                    {preview.items.length === 0 ? (
                        <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '16px' }}>
                                No se encontraron aranceles configurados para actualizar en el alcance seleccionado.
                            </td>
                        </tr>
                    ) : (
                        preview.items.map((item, idx) => (
                            <tr key={`${item.scope}-${item.targetId}-${item.field}-${idx}`}>
                                <td className={styles.PriceAdjustmentModal__cellBold}>
                                    {item.targetName}
                                </td>
                                <td>{item.fieldLabel}</td>
                                <td className={styles.PriceAdjustmentModal__cellRight}>
                                    {formatCurrency(item.oldValue)}
                                </td>
                                <td className={`${styles.PriceAdjustmentModal__cellRight} ${styles.PriceAdjustmentModal__cellBold}`}>
                                    {formatCurrency(item.newValue)}
                                </td>
                                <td className={styles.PriceAdjustmentModal__cellRight}>
                                    <span className={styles.PriceAdjustmentModal__increaseTag}>
                                        +{formatCurrency(item.difference)}
                                    </span>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};
