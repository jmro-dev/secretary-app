
import React from 'react';

// Atomic Design Components
import { MainLayout } from '@/components/templates/MainLayout';
import { Loading } from '@/components/atoms/Loading';
import { useFinancesPageController } from '@/features/finances/hooks/useFinancesPageController';
import { FinanceStatsCards } from '@/features/finances/components/sections/FinanceStatsCards';
import { FinanceModalOrchestrator } from '@/features/finances/components/FinanceModalOrchestrator';
import { FeatureToolbar } from '@/components/organisms/FeatureToolbar';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Badge } from '@/components/atoms/Badge';
import { TransactionsTable } from '@/features/finances/components/tables/TransactionsTable';

import styles from './FinancesPage.module.css';

/**
 * FinancesPage (Orchestrator).
 * Coordinates financial stats, transactions, and cash box management.
 */
export const FinancesPage = ({ MedicationInputComponent }) => {
    const controller = useFinancesPageController();
    const [showStats, setShowStats] = React.useState(false);
    const [deliveryMenuOpen, setDeliveryMenuOpen] = React.useState(false);
    const menuRef = React.useRef(null);
    const {
        stats,
        loading,
        filteredTransactions,
        user,
        settings,
        t,
        handlers
    } = controller;

    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setDeliveryMenuOpen(false);
            }
        };
        if (deliveryMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [deliveryMenuOpen]);

    const isAdminOrSecretary = user && (user.role === 'admin' || user.role === 'secretary');

    return (
        <MainLayout title={t('finances')}>
            <div>
                <FeatureToolbar
                    className="__toolbar"
                    actions={
                        isAdminOrSecretary && (
                            <div className="finances-page__toolbar-actions">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowStats(!showStats)}
                                    icon={<Icon name={showStats ? "visibility_off" : "visibility"} size="1.1rem" />}
                                >
                                    {showStats ? (t('hide_summary')) : (t('show_summary'))}
                                </Button>

                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handlers.onOpenNewTransaction}
                                    icon={<Icon name="add" size="1.1rem" />}
                                >
                                    {t('new_transaction')}
                                </Button>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="finances-page__action-btn--badge"
                                    onClick={() => handlers.setPriceAdjustmentModalOpen(true)}
                                    icon={<Icon name="price_change" size="1.1rem" />}
                                    title={t('price_adjustment_title') || 'Ajuste de Aranceles por Inflación'}
                                >
                                    {t('adjust_tariffs') || 'Ajustar Aranceles'}
                                    {controller.priceAdjustmentStatus?.isAdjustmentPending && (
                                        <Badge 
                                            position="top-right" 
                                            variant="danger" 
                                        />
                                    )}
                                </Button>

                                <div className={styles.FinancesPage__dropdownContainer} ref={menuRef}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="finances-page__action-btn--badge"
                                        onClick={() => setDeliveryMenuOpen(!deliveryMenuOpen)}
                                        icon={<Icon name="calendar_view_week" size="1.1rem" />}
                                    >
                                        {t('deliver_box')}
                                        <Badge 
                                            count={controller.pendingClosures.length} 
                                            position="top-right" 
                                            variant="danger" 
                                        />
                                    </Button>

                                    {deliveryMenuOpen && (
                                        <div className={`${styles.FinancesPage__dropdownMenu} animate-fade-in`}>
                                            <button
                                                type="button"
                                                className={styles.FinancesPage__dropdownItem}
                                                onClick={() => {
                                                    setDeliveryMenuOpen(false);
                                                    handlers.setPendingClosuresOpen(true);
                                                }}
                                            >
                                                <span className={styles.FinancesPage__dropdownItemContent}>
                                                    <Icon name="history" size="1rem" />
                                                    {t('view_pending_closures') || 'Ver Cierres Pendientes'}
                                                </span>
                                                {controller.pendingClosures.length > 0 && (
                                                    <Badge 
                                                        count={controller.pendingClosures.length} 
                                                        variant="danger" 
                                                    />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                className={styles.FinancesPage__dropdownItem}
                                                onClick={() => {
                                                    setDeliveryMenuOpen(false);
                                                    handlers.onOpenTodayBalancing();
                                                }}
                                            >
                                                <span className={styles.FinancesPage__dropdownItemContent}>
                                                    <Icon name="account_balance_wallet" size="1.1rem" />
                                                    {t('today_cash_balancing') || 'Arqueo de Hoy'}
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }
                />

                <section >
                    {loading && filteredTransactions.length === 0 ? (
                        <Loading variant="centered" text={t('loading')} />
                    ) : (
                        <div className="__content">
                            {isAdminOrSecretary && showStats && stats.length > 0 && (
                                <FinanceStatsCards 
                                    stats={stats} 
                                    totalDebt={controller.totalDebt}
                                    rentalDebt={controller.rentalDebt}
                                    t={t} 
                                />
                            )}

                            {isAdminOrSecretary && (
                                <div className={styles.FinancesPage__pricePanel}>
                                    <div className={styles.FinancesPage__pricePanelHeader}>
                                        <h3 className={styles.FinancesPage__pricePanelTitle}>
                                            <Icon name="monitoring" size="1rem" />
                                            Price adjustment overview ({new Date().getFullYear()})
                                        </h3>
                                        <span className={styles.FinancesPage__pricePanelNote}>Annual closing is an additional confronte; quarterly evaluation remains active.</span>
                                    </div>

                                    <div className={styles.FinancesPage__priceGrid}>
                                        <div className={styles.FinancesPage__priceCard}>
                                            <h4 className={styles.FinancesPage__priceCardTitle}>Annual closing summary</h4>
                                            {controller.priceClosingSummary ? (
                                                <div className={styles.FinancesPage__kvList}>
                                                    <div><span>Inflation YoY</span><strong>{Number(controller.priceClosingSummary.inflationYoY).toFixed(4)}</strong></div>
                                                    <div><span>Applied cumulative</span><strong>{Number(controller.priceClosingSummary.appliedCumulative).toFixed(4)}</strong></div>
                                                    <div><span>Margin</span><strong>{Number(controller.priceClosingSummary.margin).toFixed(4)}</strong></div>
                                                    <div><span>Verdict</span><strong>{controller.priceClosingSummary.verdict}</strong></div>
                                                </div>
                                            ) : <p className={styles.FinancesPage__empty}>No closing summary for this year.</p>}
                                        </div>

                                        <div className={styles.FinancesPage__priceCard}>
                                            <h4 className={styles.FinancesPage__priceCardTitle}>Due price-variation notices (7 days)</h4>
                                            {(controller.duePriceNotices || []).length > 0 ? (
                                                <div className={styles.FinancesPage__miniTableWrap}>
                                                    <table className={styles.FinancesPage__miniTable}>
                                                        <thead><tr><th>Booking</th><th>Quoted</th><th>Current</th><th>Delta</th><th>Days</th><th>Notified</th></tr></thead>
                                                        <tbody>
                                                            {controller.duePriceNotices.map((n) => (
                                                                <tr key={`${n.bookingId}-${n.quotedPrice}-${n.daysBefore}`}>
                                                                    <td>{n.bookingId}</td>
                                                                    <td>${Number(n.quotedPrice).toLocaleString()}</td>
                                                                    <td>${Number(n.currentPrice).toLocaleString()}</td>
                                                                    <td>${Number(n.delta).toLocaleString()}</td>
                                                                    <td>{n.daysBefore}</td>
                                                                    <td>{n.notifiedAt || 'null'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : <p className={styles.FinancesPage__empty}>No due notices in 7-day window.</p>}
                                        </div>
                                    </div>

                                    <div className={styles.FinancesPage__priceCard}>
                                        <h4 className={styles.FinancesPage__priceCardTitle}>Adjustment ledger</h4>
                                        {(controller.priceLedger || []).length > 0 ? (
                                            <div className={styles.FinancesPage__miniTableWrap}>
                                                <table className={styles.FinancesPage__miniTable}>
                                                    <thead><tr><th>Period</th><th>Suggested</th><th>Applied</th><th>Delta</th><th>Delta %</th><th>Reason</th><th>Source</th><th>Status</th></tr></thead>
                                                    <tbody>
                                                        {controller.priceLedger.map((row) => (
                                                            <tr key={`${row.period}-${row.suggestedPrice}-${row.appliedPrice}-${row.reason || row.adjustmentReason}-${row.source}`}>
                                                                <td>{row.period}</td>
                                                                <td>${Number(row.suggestedPrice).toLocaleString()}</td>
                                                                <td>${Number(row.appliedPrice).toLocaleString()}</td>
                                                                <td>${Number(row.delta).toLocaleString()}</td>
                                                                <td>{Number(row.deltaPct).toFixed(3)}%</td>
                                                                <td>{row.adjustmentReason}</td>
                                                                <td>{row.source}</td>
                                                                <td>{row.status || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : <p className={styles.FinancesPage__empty}>No ledger rows for this year.</p>}
                                    </div>
                                </div>
                            )}

                            <TransactionsTable
                                transactions={filteredTransactions}
                                totalCount={controller.totalCount}
                                currentPage={controller.currentPage}
                                totalPages={controller.totalPages}
                                onPageChange={handlers.onPageChange}
                                user={user}
                                settings={settings}
                                t={t}
                                onEdit={handlers.onEditTransaction}
                                onDelete={handlers.onDeleteTransaction}
                                onGenerateInvoice={handlers.onGenerateInvoice}
                                onSync={handlers.onSyncTransaction}
                                alert={controller.alert}
                            />
                        </div>
                    )}
                </section>
            </div>

            <FinanceModalOrchestrator
                controller={controller}
                MedicationInputComponent={MedicationInputComponent}
            />
        </MainLayout>
    );
};

