import React, { useMemo, useState } from 'react';
import { ConfigField } from '@/features/config/components/ui/ConfigField';
import { Icon } from '@/components/atoms/Icon';
import { TabButton } from '@/components/atoms/TabButton';
import { TabNav } from '@/components/molecules/TabNav';
import { MessageTemplateEditor } from '@/features/config/components/forms/MessageTemplateEditor';
import { useLanguage } from '@/hooks/useLanguage';
import styles from './CommunicationSettings.module.css';
import shared from '@/styles/shared.module.css';

/**
 * CommunicationSettings Feature Component.
 * Manages clinic address and WhatsApp messaging templates categorized into subtabs.
 */
export const CommunicationSettings = ({ user, settings = {}, updateSetting, insertVariable }) => {
    const { t } = useLanguage();
    const isAdmin = user?.role === 'admin' || user?.role === 'secretary';
    const [subTab, setSubTab] = useState('appointments'); // 'appointments' | 'finances' | 'requests'

    // Track only unsaved local edits overlaying settings
    const [localDrafts, setLocalDrafts] = useState({});

    const getSettingValue = (key) => {
        if (key in localDrafts) return localDrafts[key];
        return settings[key];
    };

    const handleUpdateSetting = (key, value) => {
        setLocalDrafts(prev => ({ ...prev, [key]: value }));

        if (key.startsWith('whatsapp_template_')) {
            const trimmed = (value || '').replace(/\s/g, '');
            if (trimmed.length > 0 && trimmed.length < 20) {
                return;
            }
        }

        updateSetting(key, value);
    };

    const commonVars = useMemo(() => [
        '{patient_name}', '{date}', '{time}', '{doctor_name}',
        '{appointment_type}', '{appointment_location}', '{price}', '{secretary_name}',
        '{cbu}', '{alias}', '{bio}', '{google_review_link}'
    ], []);

    return (
        <div className={`${styles.CommunicationSettings__root} ${shared.TabPanel} ${shared.AnimateFadeIn}`}>
            <div style={{ marginBottom: '1.25rem' }}>
                <TabNav>
                    <TabButton
                        isActive={subTab === 'appointments'}
                        onClick={() => setSubTab('appointments')}
                    >
                        <Icon name="event" size="1.1rem" />
                        <span>Turnos y Recordatorios</span>
                    </TabButton>
                    <TabButton
                        isActive={subTab === 'finances'}
                        onClick={() => setSubTab('finances')}
                    >
                        <Icon name="payments" size="1.1rem" />
                        <span>Cobranzas y Deudas</span>
                    </TabButton>
                    <TabButton
                        isActive={subTab === 'requests'}
                        onClick={() => setSubTab('requests')}
                    >
                        <Icon name="description" size="1.1rem" />
                        <span>Trámites y Consultas Públicas</span>
                    </TabButton>
                </TabNav>
            </div>

            {/* Subpestaña 1: Turnos, Recordatorios y Dirección */}
            {subTab === 'appointments' && (
                <div className={`${shared.ConfigSection} ${shared.AnimateFadeIn}`}>
                    <div className={shared.ConfigSection__body}>
                        <div className={`${shared.ConfigGrid} ${shared['ConfigGrid--2col']}`}>
                            <ConfigField
                                id="clinic-name"
                                label={t('clinic_name_label')}
                                type="text"
                                placeholder="Cima Salud"
                                value={settings.clinic_name || ''}
                                onChange={(e) => updateSetting('clinic_name', e.target.value)}
                                disabled={!isAdmin}
                                hint={t('clinic_name_hint')}
                            />

                            <ConfigField
                                id="clinic-address"
                                label={t('physical_address_label')}
                                type="text"
                                placeholder={t('address_placeholder_example')}
                                value={settings.clinic_address || ''}
                                onChange={(e) => updateSetting('clinic_address', e.target.value)}
                                disabled={!isAdmin}
                                hint={t('physical_address_hint')}
                            />
                        </div>

                        <div className={`${shared.ConfigGrid} ${shared['ConfigGrid--2col']}`}>
                            <MessageTemplateEditor
                                id="reminder-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="history" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('presential_reminder_label')}
                                    </span>
                                }
                                value={getSettingValue('whatsapp_template_reminder')}
                                settingKey="whatsapp_template_reminder"
                                variables={commonVars}
                                updateSetting={handleUpdateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                metaTemplateName={getSettingValue('meta_phone_number_id') ? getSettingValue('meta_reminder_template_name') : undefined}
                                metaParamsOrder={getSettingValue('meta_phone_number_id') ? getSettingValue('meta_reminder_params_order') : undefined}
                                t={t}
                            />

                            <MessageTemplateEditor
                                id="reminder-virtual-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="video_chat" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('virtual_reminder_label')}
                                    </span>
                                }
                                value={settings.appointment_reminder_virtual_template}
                                settingKey="appointment_reminder_virtual_template"
                                variables={commonVars}
                                updateSetting={updateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                t={t}
                            />

                            <MessageTemplateEditor
                                id="confirmation-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="check" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('presential_confirmation_label')}
                                    </span>
                                }
                                value={getSettingValue('whatsapp_template_confirmation')}
                                settingKey="whatsapp_template_confirmation"
                                variables={commonVars}
                                updateSetting={handleUpdateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                metaTemplateName={getSettingValue('meta_phone_number_id') ? getSettingValue('meta_confirmation_template_name') : undefined}
                                metaParamsOrder={getSettingValue('meta_phone_number_id') ? getSettingValue('meta_confirmation_params_order') : undefined}
                                description={t('confirmation_message_hint')}
                                t={t}
                            />

                            <MessageTemplateEditor
                                id="confirmation-virtual-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="video_chat" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('virtual_confirmation_label')}
                                    </span>
                                }
                                value={settings.appointment_confirmation_virtual_template}
                                settingKey="appointment_confirmation_virtual_template"
                                variables={commonVars}
                                updateSetting={updateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                t={t}
                            />
                        </div>

                        <div className={`${shared.ConfigGrid} ${shared['ConfigGrid--2col']}`}>
                            <MessageTemplateEditor
                                id="accept-template"
                                label={t('accept_appointment')}
                                value={getSettingValue('whatsapp_template_accept')}
                                settingKey="whatsapp_template_accept"
                                variables={['{patient_name}', '{date}', '{time}', '{doctor_name}']}
                                updateSetting={handleUpdateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                t={t}
                            />
                            <MessageTemplateEditor
                                id="alternative-template"
                                label={t('suggest_alternative')}
                                value={getSettingValue('whatsapp_template_alternative')}
                                settingKey="whatsapp_template_alternative"
                                variables={['{patient_name}', '{date}', '{time}']}
                                updateSetting={handleUpdateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                t={t}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Subpestaña 2: Cobranzas y Deudas */}
            {subTab === 'finances' && (
                <div className={`${shared.ConfigSection} ${shared.AnimateFadeIn}`}>
                    <div className={shared.ConfigSection__body}>
                        <MessageTemplateEditor
                            id="debt-template"
                            label={t('debt_template')}
                            value={getSettingValue('whatsapp_template_debt')}
                            settingKey="whatsapp_template_debt"
                            variables={['{patient_name}', '{debt_amount}']}
                            updateSetting={handleUpdateSetting}
                            insertVariable={insertVariable}
                            disabled={!isAdmin}
                            t={t}
                        />
                    </div>
                </div>
            )}

            {/* Subpestaña 3: Trámites y Consultas Públicas */}
            {subTab === 'requests' && (
                <div className={`${shared.ConfigSection} ${shared.AnimateFadeIn}`}>
                    <div className={shared.ConfigSection__body}>
                        <div className={`${shared.ConfigGrid} ${shared['ConfigGrid--2col']}`}>
                            <MessageTemplateEditor
                                id="whatsapp-prescription-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="medication" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('prescription_request_whatsapp')}
                                    </span>
                                }
                                value={settings.whatsapp_prescription_request_template}
                                settingKey="whatsapp_prescription_request_template"
                                variables={['{patient_name}', '{link}']}
                                updateSetting={updateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                description={t('prescription_request_hint')}
                                placeholder={t('placeholder_prescription_req')}
                                t={t}
                            />

                            <MessageTemplateEditor
                                id="whatsapp-patient-data-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="account_circle" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('data_update_whatsapp')}
                                    </span>
                                }
                                value={settings.whatsapp_patient_data_request_template}
                                settingKey="whatsapp_patient_data_request_template"
                                variables={['{patient_name}', '{link}']}
                                updateSetting={updateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                description={t('data_update_hint')}
                                placeholder={t('placeholder_data_req')}
                                t={t}
                            />
                        </div>

                        <div className={`${shared.ConfigGrid} ${shared['ConfigGrid--2col']}`}>
                            <ConfigField
                                id="google-review-link"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="star" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('google_review_link_label')}
                                    </span>
                                }
                                type="url"
                                placeholder={t('google_review_placeholder_example')}
                                value={settings.google_review_link || ''}
                                onChange={(e) => updateSetting('google_review_link', e.target.value)}
                                disabled={!isAdmin}
                                hint={t('google_review_hint')}
                            />

                            <MessageTemplateEditor
                                id="medication-refill-template"
                                label={
                                    <span className={styles.CommunicationSettings__labelWithIcon}>
                                        <Icon name="medication" size="1rem" className={styles.CommunicationSettings__labelIcon} /> 
                                        {t('medication_refill_reminder_label')}
                                    </span>
                                }
                                value={settings.medication_refill_reminder_template}
                                settingKey="medication_refill_reminder_template"
                                variables={['{patient_name}', '{medication_name}']}
                                updateSetting={updateSetting}
                                insertVariable={insertVariable}
                                disabled={!isAdmin}
                                description={t('medication_refill_hint')}
                                placeholder={t('medication_refill_placeholder_example')}
                                t={t}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
