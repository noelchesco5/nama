import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Link href="/" style={styles.link}>
        Home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.softWhite,
  },
  title: { fontSize: 32, fontWeight: '700', color: colors.charcoal },
  link: { color: colors.deepGreen, fontWeight: '700' },
});
