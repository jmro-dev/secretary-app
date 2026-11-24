import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/molecules/Modal';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Badge } from '@/components/atoms/Badge';
import { Loading } from '@/components/atoms/Loading';
import { financeService } from '@/features/finances/services/financeService';
import { PriceAdjustmentPreviewTable } from './PriceAdjustmentPreviewTable';

import styles from './PriceAdjustmentModal.module.css';

const getCurrentPeriod = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${quarter}`;
};

/**
 * PriceAdjustmentModal Component.
 * Implements quarterly price adjustment with compounding preview, manual overrides,
 * and contract payload fields for closing/ledger workflows (#711).
 */
export const PriceAdjustmentModal = ({
    isOpen,
    onClose,
    onSuccess,
    alert,
    t
}) => {
    const [status, setStatus] = useState(null);
    const [inflation, setInflation] = useState(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);

    const [period, setPeriod] = useState(getCurrentPeriod());
    const [percent, setPercent] = useState('');
    const [step, setStep] = useState(500);
    const [source, setSource] = useState('auto');
    const [adjustmentReason, setAdjustmentReason] = useState('');
    const [scopeDoctors, setScopeDoctors] = useState(true);
    const [scopeInstitutions, setScopeInstitutions] = useState(true);
    const [appliedByRow, setAppliedByRow] = useState({});

    const [preview, setPreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const compoundingFactor = useMemo(() => {
        const num = Number(percent);
        if (Number.isNaN(num)) return null;
        return 1 + (num / 100);
    }, [percent]);

    useEffect(() => {
        if (!isOpen) return;

        let active = true;
        (async () => {
            try {
                const statusRes = await financeService.getPriceAdjustmentStatus();
                if (!active) return;
                setStatus(statusRes);

                const inflationRes = await financeService.getInflationAdjustment(statusRes?.lastAdjustedAt);
                if (!active) return;
                setInflation(inflationRes);
                if (inflationRes?.available && inflationRes.percent) {
                    setPercent(String(inflationRes.percent));
                    setSource('auto');
                } else {
                    setSource('manual');
                }
            } catch (err) {
                if (!active) return;
                console.error('[PriceAdjustmentModal] Error loading initial data:', err);
                setErrorMessage(err.message || 'Error cargando datos de ajuste');
            } finally {
                if (active) {
                    setIsLoadingInitial(false);
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [isOpen]);

    const handleApplySuggested = () => {
        if (inflation?.available && inflation.percent) {
            setPercent(String(inflation.percent));
            setSource('auto');
            setPreview(null);
            setAppliedByRow({});
        }
    };

    const getRowKey = (item) => `${item.scope}-${item.targetId}-${item.field}`;

    const handleAppliedPriceChange = (rowKey, value) => {
        setAppliedByRow((prev) => ({ ...prev, [rowKey]: value }));
    };

    const handlePreview = async () => {
        const numPercent = Number(percent);
        if (Number.isNaN(numPercent) || numPercent <= -100) {
            setErrorMessage('Percent must be greater than -100%.');
            return;
        }
        if (!/^[0-9]{4}-Q[1-4]$/.test(period)) {
            setErrorMessage('Period must use YYYY-QN format.');
            return;
        }

        const scope = [];
        if (scopeDoctors) scope.push('doctors');
        if (scopeInstitutions) scope.push('institutions');

        if (scope.length === 0) {
            setErrorMessage('Select at least one scope (doctors or institutions).');
            return;
        }

        setIsPreviewLoading(true);
        setErrorMessage(null);
        try {
            const previewRes = await financeService.previewPriceIncrease({
                percent: numPercent,
                step: Number(step) || 500,
                scope,
                period
            });
            setPreview(previewRes);
            const rows = previewRes.rows || previewRes.items || [];
            setAppliedByRow(Object.fromEntries(rows.map((item, idx) => [getRowKey(item, idx), String(item.newValue ?? item.suggestedPrice ?? '')])));
        } catch (err) {
            console.error('[PriceAdjustmentModal] Error fetching preview:', err);
            setErrorMessage(err.response?.data?.error || err.message || 'Error calculating preview.');
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleApply = async () => {
        const numPercent = Number(percent);
        if (isNaN(numPercent) || numPercent <= -100) {
            setErrorMessage('El porcentaje debe ser mayor a -100%');
            return;
        }

        if (Number.isNaN(numPercent) || numPercent <= -100) {
            setErrorMessage('Percent must be greater than -100%.');
            return;
        }
        if (!/^[0-9]{4}-Q[1-4]$/.test(period)) {
            setErrorMessage('Period must use YYYY-QN format.');
            return;
        }

        const scope = [];
        if (scopeDoctors) scope.push('doctors');
        if (scopeInstitutions) scope.push('institutions');
        if (scope.length === 0) {
            setErrorMessage('Select at least one scope (doctors or institutions).');
            return;
        }

        const rows = preview?.rows || preview?.items || [];
        if (rows.length === 0) {
            setErrorMessage('Preview required before applying.');
            return;
        }

        const hasInvalidApplied = rows.some((item, idx) => {
            const key = getRowKey(item, idx);
            const value = Number(appliedByRow[key]);
            return Number.isNaN(value) || value < 0;
        });
        if (hasInvalidApplied) {
            setErrorMessage('Applied price must be a valid non-negative number for every row.');
            return;
        }

        const rounding = Number(step) || 500;
        const firstRow = rows[0];
        const firstKey = getRowKey(firstRow, 0);
        const basePrice = Number(firstRow.basePrice ?? firstRow.oldValue ?? 0);
        const suggestedPrice = Number(firstRow.suggestedPrice ?? firstRow.newValue ?? 0);
        const appliedPrice = Number(appliedByRow[firstKey] ?? suggestedPrice);

        setIsApplying(true);
        setErrorMessage(null);
        try {
            const res = await financeService.applyPriceIncrease({
                period,
                basePrice,
                suggestedPrice,
                appliedPrice,
                roundingStep: rounding,
                adjustmentReason: adjustmentReason || 'Manual adjustment',
                source,
                percent: numPercent,
                step: rounding,
                scope,
                inflationSource: source,
                inflationPeriod: period
            });

            if (alert) {
                await alert(
                    `Price adjustment applied.\n\n` +
                    `Period: ${period}\n` +
                    `Percent: +${res.percent ?? numPercent}%\n` +
                    `Rounding: ${res.step ?? rounding}\n` +
                    `Updated rows: ${res.affectedRows ?? rows.length}\n` +
                    `Batch: ${res.batchId || 'n/a'}`
                );
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error('[PriceAdjustmentModal] Error applying price increase:', err);
            setErrorMessage(err.response?.data?.error || err.message || 'Error applying price adjustment.');
        } finally {
            setIsApplying(false);
        }
    };

    const formatDate = (isoStr) => {
        if (!isoStr) return 'Nunca registrado';
        try {
            return new Date(isoStr).toLocaleDateString('es-AR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return isoStr;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('price_adjustment_title') || 'Ajuste de Aranceles por Inflación'}
            size="lg"
            footer={
                <div className={styles.PriceAdjustmentModal__footer}>
                    <div className={styles.PriceAdjustmentModal__notice}>
                        <Icon name="info" size="1rem" />
                        <span>
                            {t('price_adjustment_immutable_notice') ||
                             'Los aranceles pactados por paciente (override) y transacciones pasadas son inmutables.'}
                        </span>
                    </div>
                    <div className={styles.PriceAdjustmentModal__footerButtons}>
                        <Button variant="secondary" onClick={onClose} disabled={isApplying}>
                            {t('cancel') || 'Cancelar'}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleApply}
                            disabled={!preview || preview.count === 0 || isApplying || isPreviewLoading}
                            icon={<Icon name="check_circle" size="1.1rem" />}
                        >
                            {isApplying
                                ? (t('applying') || 'Aplicando...')
                                : (t('apply_increase_button') || 'Confirmar y Aplicar')}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className={`${styles.PriceAdjustmentModal__container} animate-fade-in`}>
                {isLoadingInitial ? (
                    <Loading variant="centered" text={t('loading_price_status') || 'Consultando estado de aranceles e IPC...'} />
                ) : (
                    <>
                        <div className={styles.PriceAdjustmentModal__statusCard}>
                            <div className={styles.PriceAdjustmentModal__statusHeader}>
                                <div className={styles.PriceAdjustmentModal__statusTitle}>
                                    <Icon name="schedule" size="1.1rem" />
                                    <span>Cadencia de Ajuste Trimestral (90 días)</span>
                                </div>
                                {status?.isAdjustmentPending ? (
                                    <Badge text="Ajuste Pendiente (≥ 90 días)" variant="danger" />
                                ) : (
                                    <Badge text="Al Día" variant="success" />
                                )}
                            </div>
                            <div className={styles.PriceAdjustmentModal__statusMeta}>
                                <div>Último ajuste: <strong>{formatDate(status?.lastAdjustedAt)}</strong></div>
                                <div>Días transcurridos: <strong>{status?.daysSinceLastAdjustment ?? 'N/A'}</strong></div>
                                <div>Lotes previos: <strong>{status?.totalBatches || 0}</strong></div>
                            </div>
                        </div>

                        {inflation?.available ? (
                            <div className={styles.PriceAdjustmentModal__inflationBanner}>
                                <div className={styles.PriceAdjustmentModal__inflationInfo}>
                                    <Icon name="trending_up" size="1.3rem" />
                                    <div>
                                        <span>Inflación ({inflation.source} · {inflation.from} a {inflation.to} · {inflation.months} meses):</span>
                                        <div className={styles.PriceAdjustmentModal__inflationPercent}>+{inflation.percent}%</div>
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm" onClick={handleApplySuggested} icon={<Icon name="auto_fix_high" size="1rem" />}>
                                    Usar sugerencia
                                </Button>
                            </div>
                        ) : (
                            <div className={styles.PriceAdjustmentModal__notice}>
                                <Icon name="warning" size="1rem" />
                                <span>{inflation?.reason || 'Servicio de consulta IPC no disponible. Ingrese el porcentaje manualmente.'}</span>
                            </div>
                        )}

                        <div className={styles.PriceAdjustmentModal__formGrid}>
                            <div className={styles.PriceAdjustmentModal__fieldGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Period (YYYY-QN)</label>
                                <input
                                    type="text"
                                    className={styles.PriceAdjustmentModal__input}
                                    value={period}
                                    onChange={(e) => { setPeriod(e.target.value); setPreview(null); }}
                                    placeholder="2026-Q2"
                                />
                                <span className={styles.PriceAdjustmentModal__helperText}>Quarterly evaluation. Annual closing is an additional year-end confronte, not a replacement.</span>
                            </div>

                            <div className={styles.PriceAdjustmentModal__fieldGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Inflation increase (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className={styles.PriceAdjustmentModal__input}
                                    value={percent}
                                    onChange={(e) => {
                                        setPercent(e.target.value);
                                        setPreview(null);
                                    }}
                                    placeholder="e.g. 12.5"
                                />
                                <span className={styles.PriceAdjustmentModal__helperText}>
                                    Compounding factor: <strong>{compoundingFactor !== null ? compoundingFactor.toFixed(6) : 'n/a'}</strong> (1 + pct/100)
                                </span>
                            </div>

                            <div className={styles.PriceAdjustmentModal__fieldGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Commercial rounding step ($)</label>
                                <input
                                    type="number"
                                    step="100"
                                    className={styles.PriceAdjustmentModal__input}
                                    value={step}
                                    onChange={(e) => {
                                        setStep(Number(e.target.value));
                                        setPreview(null);
                                    }}
                                    placeholder="500"
                                />
                                <span className={styles.PriceAdjustmentModal__helperText}>Rounding up: CEIL(value / step) * step.</span>
                            </div>

                            <div className={styles.PriceAdjustmentModal__fieldGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Source</label>
                                <select className={styles.PriceAdjustmentModal__input} value={source} onChange={(e) => setSource(e.target.value)}>
                                    <option value="auto">Auto</option>
                                    <option value="manual">Manual</option>
                                </select>
                                <span className={styles.PriceAdjustmentModal__helperText}>Use manual when operator overrides the suggestion.</span>
                            </div>

                            <div className={`${styles.PriceAdjustmentModal__fieldGroup} ${styles.PriceAdjustmentModal__fieldGroupWide}`}>
                                <label className={styles.PriceAdjustmentModal__label}>Adjustment reason</label>
                                <input
                                    type="text"
                                    className={styles.PriceAdjustmentModal__input}
                                    value={adjustmentReason}
                                    onChange={(e) => setAdjustmentReason(e.target.value)}
                                    placeholder="e.g. Specialist demand / commercial decision"
                                />
                            </div>

                            <div className={styles.PriceAdjustmentModal__scopeGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Scope</label>
                                <label className={styles.PriceAdjustmentModal__checkboxLabel}>
                                    <input type="checkbox" checked={scopeDoctors} onChange={(e) => { setScopeDoctors(e.target.checked); setPreview(null); }} />
                                    <span>Doctor tariffs (consultation, prescription, license, certificate, virtual)</span>
                                </label>
                                <label className={styles.PriceAdjustmentModal__checkboxLabel}>
                                    <input type="checkbox" checked={scopeInstitutions} onChange={(e) => { setScopeInstitutions(e.target.checked); setPreview(null); }} />
                                    <span>Institution base tariffs</span>
                                </label>
                            </div>
                        </div>

                        <div className={styles.PriceAdjustmentModal__previewActions}>
                            <Button
                                variant="secondary"
                                onClick={handlePreview}
                                disabled={isPreviewLoading || !percent}
                                icon={<Icon name="visibility" size="1.1rem" />}
                            >
                                {isPreviewLoading ? 'Calculando previsualización...' : 'Previsualizar impacto antes de aplicar'}
                            </Button>
                        </div>

                        {errorMessage && (
                            <div className={styles.PriceAdjustmentModal__notice} style={{ borderColor: '#ef4444', color: '#b91c1c' }}>
                                <Icon name="error" size="1.1rem" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        <PriceAdjustmentPreviewTable
                            preview={preview}
                            appliedByRow={appliedByRow}
                            onAppliedPriceChange={handleAppliedPriceChange}
                            getRowKey={getRowKey}
                        />
                    </>
                )}
            </div>
        </Modal>
    );
};
