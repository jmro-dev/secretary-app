import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { Platform } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { AuthProvider } from '@/shared/context/AuthContext';

export default function RootLayout() {
    return (
        <AuthProvider>
            <StatusBar style="dark" />
            {Platform.OS === 'android' && <NavigationBar hidden={true} />}
            <Slot />
        </AuthProvider>
    );
}
