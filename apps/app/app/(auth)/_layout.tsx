import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { homeForRole } from '@nama/shared';

export default function AuthLayout() {
  const { user, role, mustChangePassword } = useAuth();

  if (user && role && !mustChangePassword) {
    return <Redirect href={homeForRole(role) as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
