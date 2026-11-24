import React, { useState } from 'react';
import shared from '@/styles/shared.module.css';
import { TabButton } from '@/components/atoms/TabButton';
import { TabNav } from '@/components/molecules/TabNav';
import { Icon } from '@/components/atoms/Icon';

// Feature Molecules
import { IntegrationGoogleCalendar } from '@/features/config/components/sections/IntegrationGoogleCalendar';
import { IntegrationMetaWhatsApp } from '@/features/config/components/sections/IntegrationMetaWhatsApp';
import { IntegrationRemoteAccess } from '@/features/config/components/sections/IntegrationRemoteAccess';

/**
 * IntegrationSettings Feature Organism.
 * Orchestrates third-party service configurations within the config domain using subtabs.
 */
export const IntegrationSettings = ({
    user,
    settings,
    updateSetting,
    loading,
    googleUnlinked,
    onGoogleAuth,
    onDisconnectGoogle,
    onRefreshToken,
    onRetryGoogle,
    onRefreshTunnel,
    onTestMeta,
    onShowQr
}) => {
    const [subTab, setSubTab] = useState('google'); // 'google' | 'meta' | 'remote'
    const isAuthorized = user?.role === 'admin' || user?.role === 'secretary';

    return (
        <div className={`${shared.TabPanel} ${shared.AnimateFadeIn}`}>
            <div style={{ marginBottom: '1.25rem' }}>
                <TabNav>
                    <TabButton
                        isActive={subTab === 'google'}
                        onClick={() => setSubTab('google')}
                    >
                        <Icon name="calendar_today" size="1.1rem" />
                        <span>Google Calendar</span>
                    </TabButton>
                    <TabButton
                        isActive={subTab === 'meta'}
                        onClick={() => setSubTab('meta')}
                    >
                        <Icon name="chat" size="1.1rem" />
                        <span>WhatsApp (Meta)</span>
                    </TabButton>
                    <TabButton
                        isActive={subTab === 'remote'}
                        onClick={() => setSubTab('remote')}
                    >
                        <Icon name="language" size="1.1rem" />
                        <span>Acceso Remoto y Red</span>
                    </TabButton>
                </TabNav>
            </div>

            {subTab === 'google' && (
                <IntegrationGoogleCalendar
                    googleUnlinked={googleUnlinked}
                    settings={settings}
                    updateSetting={updateSetting}
                    onGoogleAuth={onGoogleAuth}
                    onDisconnectGoogle={onDisconnectGoogle}
                    onRefreshToken={onRefreshToken}
                    onRetryGoogle={onRetryGoogle}
                    loading={loading}
                />
            )}

            {subTab === 'meta' && (
                <IntegrationMetaWhatsApp
                    settings={settings}
                    updateSetting={updateSetting}
                    onTestMeta={onTestMeta}
                    loading={loading}
                    isAuthorized={isAuthorized}
                />
            )}

            {subTab === 'remote' && (
                <IntegrationRemoteAccess
                    settings={settings}
                    updateSetting={updateSetting}
                    onRefreshTunnel={onRefreshTunnel}
                    onShowQr={onShowQr}
                    loading={loading}
                    isAuthorized={isAuthorized}
                />
            )}
        </div>
    );
};
