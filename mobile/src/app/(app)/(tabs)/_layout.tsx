import React from 'react';
import { Tabs } from 'expo-router';
import { Text, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/context/AuthContext';
import { isDoctorRole } from '@/types/auth';
import { Colors } from '@/shared/theme/colors';

type TabName = 'procedures' | 'appointments' | 'patients';

interface TabConfig {
    name: TabName;
    title: string;
    icon: string;
}

const ALL_TABS: Record<TabName, TabConfig> = {
    procedures: { name: 'procedures', title: 'Trámites', icon: '📋' },
    appointments: { name: 'appointments', title: 'Turnos', icon: '📅' },
    patients: { name: 'patients', title: 'Pacientes', icon: '👥' },
};

const DOCTOR_TAB_ORDER: TabName[] = ['procedures', 'appointments', 'patients'];
const STAFF_TAB_ORDER: TabName[] = ['appointments', 'patients', 'procedures'];

export default function TabsLayout() {
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 8);

    const tabOrder = isDoctorRole(user?.role) ? DOCTOR_TAB_ORDER : STAFF_TAB_ORDER;

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textSecondary,
                tabBarStyle: {
                    backgroundColor: Colors.cardBackground,
                    borderTopColor: Colors.border,
                    height: 56 + bottomPadding,
                    paddingBottom: bottomPadding,
                    paddingTop: 8,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
            }}
        >
            {tabOrder.map((key) => {
                const tab = ALL_TABS[key];
                return (
                    <Tabs.Screen
                        key={tab.name}
                        name={tab.name}
                        options={{
                            title: tab.title,
                            tabBarIcon: () => (
                                <Text style={styles.tabIcon}>{tab.icon}</Text>
                            ),
                        }}
                    />
                );
            })}
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabIcon: {
        fontSize: 20,
    },
});
