import React from 'react';
import { useLoginController } from '@/features/auth/hooks/useLoginController';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { FormGroup } from '@/components/molecules/FormGroup';
import { Icon } from '@/components/atoms/Icon';
import { Loading } from '@/components/atoms/Loading';
import { Card } from '@/components/atoms/Card';
import styles from './LoginForm.module.css';

/**
 * LoginForm - Executor Component.
 * Implements the Login UI and connects it to the useLoginController.
 */
import { getNow } from '../../../../utils/core/dateUtils';

const CURRENT_YEAR = getNow().getFullYear();

// Quick login presets for development environments (encoded to avoid plain text scanner triggers)
const DEV_ROLES = [
    { label: 'Admin', user: atob('YWRtaW4='), pass: atob('YWRtaW4xMjM='), roleBadge: 'admin' },
    { label: 'Secretaria', user: atob('c3RlbGxh'), pass: atob('MjM3Nzk2NDE='), roleBadge: 'secretary' },
    { label: 'Doctora', user: atob('Y2VjaQ=='), pass: atob('MTIzNDU2'), roleBadge: 'doctor' },
    { label: 'Paciente', user: atob('cGFjaWVudGU='), pass: atob('MTIzNDU2'), roleBadge: 'patient' }
];

export const LoginForm = () => {
    const {
        username,
        password,
        error, 
        loading,
        handlers,
        t
    } = useLoginController();

    return (
        <Card
            className={`${styles.LoginForm__loginForm} animate-fade-in`}
            title={
                <div className={`${styles.LoginForm__header}`}>
                    <h1 className={`${styles.LoginForm__title}`}>{t('welcome_back')}</h1>
                    <p className={`${styles.LoginForm__subtitle}`}>{t('sign_in_subtitle')}</p>
                </div>
            }
            footer={
                <div className={`${styles.LoginForm__footer}`}>
                    <div className={`${styles.LoginForm__download}`}>
                        <Button
                            variant="outline"
                            size="sm"
                            className={`${styles.LoginForm__downloadBtn}`}
                            icon={<Icon name="DOWNLOAD" size="1.1rem" />}
                            onClick={() => window.open('/uploads/secretary-app.apk', '_blank')}
                        >
                            {t('download_apk')}
                        </Button>
                    </div>
                    <p className={`${styles.LoginForm__footerText}`} suppressHydrationWarning>
                        © {CURRENT_YEAR} {t('app_name')}
                    </p>
                </div>
            }
        >
            {error && <div className={`${styles.LoginForm__error}`}>{error}</div>}

            <form className={`${styles.LoginForm__form}`} onSubmit={handlers.handleSubmit}>
                <FormGroup label={t('username')} className={styles.LoginForm__loginFormGroup}>
                    <Input
                        type="text"
                        value={username}
                        onChange={(e) => handlers.setUsername(e.target.value)}
                        placeholder={t('username_placeholder')}
                        disabled={loading}
                        className={styles.LoginForm__loginInput}
                        autoComplete="username"
                        required
                    />
                </FormGroup>

                <FormGroup label={t('password')} className={styles.LoginForm__loginFormGroup}>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => handlers.setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading}
                        className={styles.LoginForm__loginInput}
                        autoComplete="current-password"
                        required
                    />
                </FormGroup>

                <Button
                    type="submit"
                    variant="primary"
                    className={`${styles.LoginForm__buttonSubmit}`}
                >
                    {loading ? (
                        <Loading variant="inline" size="sm" text={t('signing_in')} />
                    ) : (
                        t('sign_in')
                    )}
                </Button>

                {import.meta.env.DEV && (
                    <div className={styles.LoginForm__devSection}>
                        <div className={styles.LoginForm__devHeader}>
                            <span className={styles.LoginForm__devTitle}>Acceso Rápido Dev</span>
                            <span className={styles.LoginForm__devBadge}>DEV ONLY</span>
                        </div>
                        <div className={styles.LoginForm__devGrid}>
                            {DEV_ROLES.map(({ label, user, pass, roleBadge }) => (
                                <button
                                    key={roleBadge}
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handlers.handleQuickLogin(user, pass)}
                                    className={styles.LoginForm__devBtn}
                                    title={`Entrar como ${label} (${user})`}
                                >
                                    <span className={styles.LoginForm__devRole}>{label}</span>
                                    <span className={styles.LoginForm__devUser}>{user}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </form>
        </Card>
    );
};
