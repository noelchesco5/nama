import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
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
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        (pressed || isDisabled) && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onDark : colors.deepGreen} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'secondary' && styles.buttonTextSecondary,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.softWhite,
    padding: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.charcoal,
  } as TextStyle,
  subtitle: {
    fontSize: 16,
    color: colors.charcoal,
    opacity: 0.8,
  },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.charcoal,
  },
  fieldError: { color: colors.danger, fontSize: 13 },
  button: {
    backgroundColor: colors.deepGreen,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonSecondary: {
    backgroundColor: colors.mint,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.onDark, fontSize: 16, fontWeight: '700' },
  buttonTextSecondary: { color: colors.deepGreen },
  error: { color: colors.danger, fontSize: 14 },
});
