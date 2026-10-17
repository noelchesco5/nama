import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function SpecialistLayout() {
  const { user, role } = useAuth();
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (role && role !== 'specialist') return <Redirect href={'/' as never} />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="requests" options={{ headerShown: true, title: 'Requests' }} />
      <Stack.Screen name="earnings" options={{ headerShown: true, title: 'Earnings' }} />
    </Stack>
  );
}
