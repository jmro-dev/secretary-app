import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/molecules/Modal';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Badge } from '@/components/atoms/Badge';
import { Loading } from '@/components/atoms/Loading';
import { financeService } from '@/features/finances/services/financeService';
import { PriceAdjustmentPreviewTable } from './PriceAdjustmentPreviewTable';

import styles from './PriceAdjustmentModal.module.css';

/**
 * PriceAdjustmentModal Component.
 * Implements S9: Quarterly price adjustment with inflation suggestion,
 * commercial rounding to 500, preview and transactional confirmation (#711).
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

    const [percent, setPercent] = useState('');
    const [step, setStep] = useState(500);
    const [scopeDoctors, setScopeDoctors] = useState(true);
    const [scopeInstitutions, setScopeInstitutions] = useState(true);

    const [preview, setPreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

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
            setPreview(null);
        }
    };

    const handlePreview = async () => {
        const numPercent = Number(percent);
        if (isNaN(numPercent) || numPercent <= -100) {
            setErrorMessage('El porcentaje debe ser un número mayor a -100%');
            return;
        }

        const scope = [];
        if (scopeDoctors) scope.push('doctors');
        if (scopeInstitutions) scope.push('institutions');

        if (scope.length === 0) {
            setErrorMessage('Debe seleccionar al menos un alcance (Médicos o Instituciones)');
            return;
        }

        setIsPreviewLoading(true);
        setErrorMessage(null);
        try {
            const previewRes = await financeService.previewPriceIncrease({
                percent: numPercent,
                step: Number(step) || 500,
                scope
            });
            setPreview(previewRes);
        } catch (err) {
            console.error('[PriceAdjustmentModal] Error fetching preview:', err);
            setErrorMessage(err.response?.data?.error || err.message || 'Error calculando previsualización');
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

        const scope = [];
        if (scopeDoctors) scope.push('doctors');
        if (scopeInstitutions) scope.push('institutions');

        setIsApplying(true);
        setErrorMessage(null);
        try {
            const res = await financeService.applyPriceIncrease({
                percent: numPercent,
                step: Number(step) || 500,
                scope,
                inflationSource: inflation?.available ? inflation.source : 'manual',
                inflationPeriod: inflation?.available ? inflation.to : null
            });

            if (alert) {
                await alert(
                    `Ajuste de aranceles aplicado exitosamente.\n\n` +
                    `Porcentaje: +${res.percent}%\n` +
                    `Redondeo: múltiplo de $${res.step}\n` +
                    `Aranceles actualizados: ${res.affectedRows} celdas\n` +
                    `Lote de auditoría: ${res.batchId}`
                );
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error('[PriceAdjustmentModal] Error applying price increase:', err);
            setErrorMessage(err.response?.data?.error || err.message || 'Error al aplicar el ajuste en la base de datos');
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
                                <label className={styles.PriceAdjustmentModal__label}>Porcentaje de aumento (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className={styles.PriceAdjustmentModal__input}
                                    value={percent}
                                    onChange={(e) => {
                                        setPercent(e.target.value);
                                        setPreview(null);
                                    }}
                                    placeholder="Ej: 12.5"
                                />
                                <span className={styles.PriceAdjustmentModal__helperText}>Ratio de índices compuesto.</span>
                            </div>

                            <div className={styles.PriceAdjustmentModal__fieldGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Paso de redondeo comercial ($)</label>
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
                                <span className={styles.PriceAdjustmentModal__helperText}>Redondeo al alza: CEIL(valor / paso) × paso.</span>
                            </div>

                            <div className={styles.PriceAdjustmentModal__scopeGroup}>
                                <label className={styles.PriceAdjustmentModal__label}>Alcance de aplicación</label>
                                <label className={styles.PriceAdjustmentModal__checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={scopeDoctors}
                                        onChange={(e) => {
                                            setScopeDoctors(e.target.checked);
                                            setPreview(null);
                                        }}
                                    />
                                    <span>Aranceles de profesionales médicos (consulta, receta, licencia, cert., virtual)</span>
                                </label>
                                <label className={styles.PriceAdjustmentModal__checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={scopeInstitutions}
                                        onChange={(e) => {
                                            setScopeInstitutions(e.target.checked);
                                            setPreview(null);
                                        }}
                                    />
                                    <span>Aranceles base de instituciones clínicas</span>
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

                        <PriceAdjustmentPreviewTable preview={preview} />
                    </>
                )}
            </div>
        </Modal>
    );
};
