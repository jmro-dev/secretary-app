import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/shared/context/AuthContext';
import { getDefaultAppRoute } from '@/types/auth';

export default function IndexRoute() {
    const { user } = useAuth();
    return <Redirect href={getDefaultAppRoute(user?.role)} />;
}
