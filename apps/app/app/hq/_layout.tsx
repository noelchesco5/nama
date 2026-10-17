import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function HqLayout() {
  const { user, role } = useAuth();
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (role && role !== 'hq') return <Redirect href={'/' as never} />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="payments" options={{ headerShown: true, title: 'Payments' }} />
      <Stack.Screen name="cases" options={{ headerShown: true, title: 'Refund cases' }} />
    </Stack>
  );
}
