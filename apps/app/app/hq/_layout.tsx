import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function HqLayout() {
  const { user, role } = useAuth();
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (role && role !== 'hq') return <Redirect href={'/' as never} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
