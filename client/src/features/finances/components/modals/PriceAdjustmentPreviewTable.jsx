import React from 'react';
import styles from './PriceAdjustmentModal.module.css';

/**
 * PriceAdjustmentPreviewTable Subcomponent.
 * Displays suggested vs applied prices with editable applied value, delta and deltaPct.
 */
export const PriceAdjustmentPreviewTable = ({ preview, appliedByRow = {}, onAppliedPriceChange, getRowKey }) => {
    if (!preview) return null;

    const formatCurrency = (val) => new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(Number(val || 0));

    const rows = preview.rows || preview.items || [];

    return (
        <div className={styles.PriceAdjustmentModal__tableContainer}>
            <table className={styles.PriceAdjustmentModal__table}>
                <thead>
                    <tr>
                        <th>Target</th>
                        <th>Field</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Base</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Suggested</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Applied</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Delta</th>
                        <th className={styles.PriceAdjustmentModal__cellRight}>Delta %</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '16px' }}>
                                No tariffs found for selected scope.
                            </td>
                        </tr>
                    ) : (
                        rows.map((item, idx) => {
                            const rowKey = getRowKey ? getRowKey(item, idx) : `${item.scope}-${item.targetId}-${item.field}`;
                            const base = Number(item.basePrice ?? item.oldValue ?? 0);
                            const suggested = Number(item.suggestedPrice ?? item.newValue ?? 0);
                            const appliedRaw = appliedByRow[rowKey];
                            const applied = appliedRaw === '' || appliedRaw === undefined ? suggested : Number(appliedRaw);
                            const delta = applied - suggested;
                            const deltaPct = suggested ? (100 * delta) / suggested : 0;

                            return (
                                <tr key={rowKey}>
                                    <td className={styles.PriceAdjustmentModal__cellBold}>{item.targetName}</td>
                                    <td>{item.fieldLabel || item.field}</td>
                                    <td className={styles.PriceAdjustmentModal__cellRight}>{formatCurrency(base)}</td>
                                    <td className={`${styles.PriceAdjustmentModal__cellRight} ${styles.PriceAdjustmentModal__cellBold}`}>{formatCurrency(suggested)}</td>
                                    <td className={styles.PriceAdjustmentModal__cellRight}>
                                        <input
                                            type="number"
                                            step={preview.roundingStep || preview.step || 500}
                                            className={styles.PriceAdjustmentModal__tableInput}
                                            value={appliedRaw ?? String(suggested)}
                                            onChange={(e) => onAppliedPriceChange?.(rowKey, e.target.value)}
                                        />
                                    </td>
                                    <td className={styles.PriceAdjustmentModal__cellRight}>
                                        <span className={delta === 0 ? styles.PriceAdjustmentModal__increaseTagNeutral : styles.PriceAdjustmentModal__increaseTag}>
                                            {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                                        </span>
                                    </td>
                                    <td className={styles.PriceAdjustmentModal__cellRight}>{deltaPct.toFixed(3)}%</td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};
