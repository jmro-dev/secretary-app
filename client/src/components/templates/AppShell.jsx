import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/features/layout/components/Navbar';
import { PendingApprovalProvider } from '@/context/PendingApprovalContext';
import { PendingApprovalQueue } from '@/features/communication/components/PendingApprovalQueue';
import styles from './AppShell.module.css';

/**
 * AppShell Template.
 * Persistent chrome for every authenticated route.
 *
 * It lives in the router (not inside each page) on purpose: when each page
 * mounted MainLayout, every navigation remounted the Navbar, restarted the
 * pending-approval polling and refetched /users/doctors.
 */
export const AppShell = () => (
    <PendingApprovalProvider>
        <div className={styles.AppShell__appLayout}>
            <Navbar />
            <main className={styles.AppShell__main}>
                <Outlet />
            </main>
        </div>
        <PendingApprovalQueue />
    </PendingApprovalProvider>
);
