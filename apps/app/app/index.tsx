import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { homeForRole } from '@nama/shared';
import { colors } from '@/constants/theme';

export default function Index() {
  const { ready, user, role, mustChangePassword } = useAuth();

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.deepGreen} />
      </View>
    );
  }

  if (!user || !role) return <Redirect href="/(auth)/sign-in" />;
  if (mustChangePassword) return <Redirect href="/(auth)/change-password" />;

  return <Redirect href={homeForRole(role) as never} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softWhite },
});
