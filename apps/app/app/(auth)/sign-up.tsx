import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Modal, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/constants/theme';
import { signUpSchema } from '@nama/shared';

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [intendedRole, setIntendedRole] = useState<'client' | 'specialist'>('client');
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    const parsed = signUpSchema.safeParse({
      email: email.trim().toLowerCase(),
      password,
      fullName,
      phone: phone.trim() ? phone.trim() : undefined,
      intendedRole,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('common.error'));
      return;
    }
    setBusy(true);
    try {
      await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        intendedRole,
        locale: i18n.language === 'sw' ? 'sw' : 'en',
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen scroll>
        <Card variant="mint" style={styles.successCard}>
          <Title>Account created successfully!</Title>
          <Text style={styles.successText}>
            Welcome to Nama. You can now sign in with your email and password to access your dashboard.
          </Text>
          <Button title={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Title>{t('auth.signUpTitle')}</Title>
        <Text style={styles.subTitle}>Create your secure account to book or provide care.</Text>
      </View>

      <Card style={styles.formCard}>
        <View style={styles.roleRow}>
          <Text style={styles.roleLabel}>I want to:</Text>
          <View style={styles.roleChips}>
            {(['client', 'specialist'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setIntendedRole(r)}
                style={[styles.chip, intendedRole === r && styles.chipActive]}
              >
                <Text style={[styles.chipText, intendedRole === r && styles.chipTextActive]}>
                  {r === 'client' ? 'Find & Book Care' : 'Provide Care Services'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Field label={t('auth.fullName')} value={fullName} onChangeText={setFullName} placeholder="e.g. Amina Juma" />
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          placeholder="name@example.com"
        />
        <Field
          label={t('auth.phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="2557XXXXXXXX"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />

        {/* Terms agreement checkbox & clickable link */}
        <View style={styles.termsRow}>
          <Pressable
            style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
          <View style={styles.termsTextView}>
            <Text style={styles.termsText}>I agree to the Nama </Text>
            <Pressable onPress={() => setShowTermsModal(true)}>
              <Text style={styles.termsLink}>Terms of Service & Privacy Policy</Text>
            </Pressable>
          </View>
        </View>

        {error ? <ErrorText message={error} /> : null}

        <Button title={t('auth.signUp')} onPress={onSubmit} loading={busy} />
      </Card>

      <View style={styles.row}>
        <Text style={styles.footerPrompt}>{t('auth.haveAccount')} </Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          {t('auth.signIn')}
        </Link>
      </View>

      {/* Terms & Conditions Modal */}
      <Modal visible={showTermsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nama Terms & Privacy Policy</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalBody}>
                1. Overview{'\n'}
                Nama connects clients with verified home care professionals (physiotherapists, nurses, senior caregivers) in Tanzania. Nama is a technology platform and does not replace formal hospital diagnosis or emergency medical treatment.{'\n\n'}
                2. Escrow & Payments{'\n'}
                All payments made for care visits are held securely in escrow and released to specialists only upon verified visit completion or according to our fair cancellation policy.{'\n\n'}
                3. Data Privacy & Verification{'\n'}
                We respect your privacy. NIDA identification numbers, phone numbers, and location data are collected solely for safety, identity verification, and dispatch coordination, stored securely and never sold to third parties.
              </Text>
            </ScrollView>
            <Button title="Close & Accept" onPress={() => setShowTermsModal(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 8 },
  subTitle: { fontSize: 15, color: colors.charcoal, opacity: 0.7 },
  formCard: { padding: 24, borderRadius: 20, gap: 16 },
  roleRow: { gap: 8 },
  roleLabel: { fontSize: 14, fontWeight: '700', color: colors.charcoal },
  roleChips: { gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.mint, borderColor: colors.deepGreen },
  chipText: { color: colors.charcoal, fontWeight: '600' },
  chipTextActive: { color: colors.deepGreen, fontWeight: '800' },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.deepGreen, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.deepGreen },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  termsTextView: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  termsText: { fontSize: 13, color: colors.charcoal, opacity: 0.8 },
  termsLink: { fontSize: 13, color: colors.deepGreen, fontWeight: '700', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  footerPrompt: { color: colors.charcoal, opacity: 0.8 },
  link: { color: colors.deepGreen, fontWeight: '800' },
  successCard: { padding: 32, alignItems: 'center', gap: 16, marginTop: 40 },
  successText: { fontSize: 16, textAlign: 'center', color: colors.charcoal, opacity: 0.8, lineHeight: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(32,49,45,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%', gap: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.charcoal },
  modalScroll: { maxHeight: 300 },
  modalBody: { fontSize: 14, color: colors.charcoal, opacity: 0.8, lineHeight: 22 },
});
