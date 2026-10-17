import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

export function Screen({
  children,
  scroll,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.screen, style]}>
      <View style={styles.screenContentCentered}>{children}</View>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  variant = 'default',
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: 'default' | 'mint' | 'green' | 'clay' | 'amber';
}) {
  const bg = {
    default: '#FFFFFF',
    mint: colors.mint,
    green: colors.deepGreen,
    clay: '#F6EBE6',
    amber: '#FEF3C7',
  }[variant];

  const content = (
    <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{({ pressed }) => <View style={{ opacity: pressed ? 0.9 : 1 }}>{content}</View>}</Pressable>;
  }
  return content;
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Subtitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

export function Badge({
  label,
  variant = 'success',
}: {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
}) {
  const bg = {
    success: '#E8F3EF',
    warning: '#FEF3C7',
    danger: '#FEE2E2',
    info: '#E0F2FE',
  }[variant];
  const fg = {
    success: colors.deepGreen,
    warning: '#B7791F',
    danger: '#B3261E',
    info: '#0369A1',
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#7C918B"
        autoCapitalize="none"
        style={styles.input}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const bg = {
    primary: colors.deepGreen,
    secondary: colors.mint,
    danger: '#B3261E',
    outline: 'transparent',
  }[variant];
  const fg = {
    primary: colors.onDark,
    secondary: colors.deepGreen,
    danger: '#FFFFFF',
    outline: colors.deepGreen,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        variant === 'outline' && { borderWidth: 2, borderColor: colors.deepGreen },
        (pressed || isDisabled) && styles.buttonPressed,
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children, message }: { children?: ReactNode; message?: string }) {
  const content = message ?? children;
  if (!content) return null;
  return <Text style={styles.error}>{content}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.softWhite,
  },
  screenContent: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  screenContentCentered: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.charcoal,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: colors.charcoal,
    opacity: 0.8,
    lineHeight: 22,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.charcoal,
  },
  fieldError: { color: colors.danger, fontSize: 13 },
  button: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14 },
});
