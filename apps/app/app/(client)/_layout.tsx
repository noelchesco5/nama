import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function ClientLayout() {
  const { user, role } = useAuth();
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (role && role !== 'client') return <Redirect href={'/' as never} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
