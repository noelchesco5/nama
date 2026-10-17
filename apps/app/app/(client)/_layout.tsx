import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function ClientLayout() {
  const { user, role } = useAuth();
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (role && role !== 'client') return <Redirect href={'/' as never} />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-money" options={{ headerShown: true, title: 'Add money' }} />
      <Stack.Screen name="find" options={{ headerShown: true, title: 'Find care' }} />
      <Stack.Screen name="book" options={{ headerShown: true, title: 'Book a visit' }} />
      <Stack.Screen name="bookings" options={{ headerShown: true, title: 'My visits' }} />
      <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Visit' }} />
    </Stack>
  );
}
