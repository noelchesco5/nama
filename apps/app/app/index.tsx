import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/lib/auth';
import { homeForRole } from '@nama/shared';
import { colors } from '@/constants/theme';

export default function Index() {
  const { ready, user, role, mustChangePassword } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [hqTaps, setHqTaps] = useState(0);
  const [showHqLink, setShowHqLink] = useState(false);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.deepGreen} size="large" />
      </View>
    );
  }

  if (user && role) {
    if (mustChangePassword) return <Redirect href="/(auth)/change-password" />;
    return <Redirect href={homeForRole(role) as never} />;
  }

  const handleCopyrightTap = () => {
    const next = hqTaps + 1;
    setHqTaps(next);
    if (next >= 5) {
      setShowHqLink(true);
      setTimeout(() => setShowHqLink(false), 8000);
    }
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'sw' ? 'en' : 'sw';
    i18n.changeLanguage(nextLang);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sticky Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>nama</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
            <Text style={styles.langText}>{i18n.language === 'sw' ? 'EN' : 'SW'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signInNavBtn}
            onPress={() => router.push('/(auth)/sign-in')}
          >
            <Text style={styles.signInNavText}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero Section */}
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Trusted home care</Text>
        <Text style={styles.h1}>Care that meets you at home</Text>
        <Text style={styles.body}>
          Professional physiotherapy, nursing, senior care, and therapeutic wellbeing delivered right to your door in Dar es Salaam, verified and safe.
        </Text>
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(auth)/sign-up')}
          >
            <Text style={styles.primaryBtnText}>Find a specialist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => router.push('/(auth)/sign-up')}
          >
            <Text style={styles.outlineBtnText}>Join as a specialist</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* How it works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How Nama works</Text>
        <View style={styles.stepsGrid}>
          <View style={styles.stepCard}>
            <View style={styles.stepCircle}><Text style={styles.stepNum}>1</Text></View>
            <Text style={styles.stepTitle}>Search a service</Text>
            <Text style={styles.stepDesc}>Choose from physiotherapy, nursing, therapy, or older adult care.</Text>
          </View>
          <View style={styles.stepCard}>
            <View style={styles.stepCircle}><Text style={styles.stepNum}>2</Text></View>
            <Text style={styles.stepTitle}>Choose a specialist</Text>
            <Text style={styles.stepDesc}>View verified credentials, ratings, distance, and fair transparent pricing.</Text>
          </View>
          <View style={styles.stepCard}>
            <View style={styles.stepCircle}><Text style={styles.stepNum}>3</Text></View>
            <Text style={styles.stepTitle}>Care at home</Text>
            <Text style={styles.stepDesc}>Secure escrow payments, live tracking, in-app chat, and peace of mind.</Text>
          </View>
        </View>
      </View>

      {/* Services */}
      <View style={[styles.section, styles.mintBg]}>
        <Text style={styles.sectionTitle}>Our Services</Text>
        <View style={styles.servicesGrid}>
          {[
            { title: 'Physiotherapy & therapy', desc: 'Rehabilitation and mobility care at home.' },
            { title: 'Nurses & wound care', desc: 'Professional clinical dressing and post-op care.' },
            { title: 'Older adult home care', desc: 'Compassionate daily living and companionship.' },
            { title: 'Speech therapy', desc: 'Specialised speech and swallowing support.' },
            { title: 'Audiology', desc: 'Hearing care and clinical support.' },
            { title: 'Supportive wellbeing', desc: 'Holistic physical and mental comfort.' },
          ].map((s, idx) => (
            <View key={idx} style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>{s.title}</Text>
              <Text style={styles.serviceDesc}>{s.desc}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.medicalNotice}>Nama connects you to professional care and does not replace formal medical treatment.</Text>
      </View>

      {/* Trust & Safety */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trust and Safety</Text>
        <View style={styles.trustRow}>
          <Text style={styles.trustItem}>✓ Identity, NIDA, and professional board credentials rigorously reviewed.</Text>
          <Text style={styles.trustItem}>✓ Transparent pricing shown before you book — no hidden charges.</Text>
          <Text style={styles.trustItem}>✓ Every payment held securely and verified by Nama operations.</Text>
          <Text style={styles.trustItem}>✓ Emergency support line and safety check-ins always available.</Text>
        </View>
      </View>

      {/* Install / Get the App */}
      <View id="install" style={[styles.section, styles.mintBg]}>
        <Text style={styles.sectionTitle}>Get Nama on your device</Text>
        <Text style={styles.installSub}>
          No app store required. Install instantly on your phone browser for the best experience.
        </Text>
        <View style={styles.installGrid}>
          <View style={styles.installCard}>
            <Text style={styles.installCardTitle}>iPhone & iPad (PWA)</Text>
            <Text style={styles.installSteps}>1. Open in Safari browser.</Text>
            <Text style={styles.installSteps}>2. Tap the Share button at the bottom.</Text>
            <Text style={styles.installSteps}>3. Choose "Add to Home Screen".</Text>
            <Text style={styles.installSteps}>4. Tap Add. (iOS will add the app icon to your home screen).</Text>
          </View>
          <View style={styles.installCard}>
            <Text style={styles.installCardTitle}>Android & Desktop</Text>
            <Text style={styles.installSteps}>• Install directly from browser menu ("Install app" or "Add to Home screen").</Text>
            <Text style={styles.installSteps}>• Full web app performance with offline capabilities and instant updates.</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={() => router.push('/(auth)/sign-up')}
            >
              <Text style={styles.primaryBtnText}>Open Web App Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* FAQ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {[
          { q: 'What is Nama?', a: 'Nama connects clients with verified home care professionals (nurses, physiotherapists, therapists) in Tanzania.' },
          { q: 'Does Nama replace my doctor?', a: 'No. Nama provides supportive care at home and does not replace medical diagnosis or hospital treatment.' },
          { q: 'How does payment work?', a: 'You add money via mobile money (M-Pesa / Airtel Money). Funds are held securely in escrow and released only upon visit completion.' },
          { q: 'How are specialists verified?', a: 'Every specialist undergoes identity verification (NIDA), professional license review, and background credential checks by Nama HQ.' },
          { q: 'What happens if a specialist does not arrive?', a: 'Our operations team steps in immediately, releases holds, and reroutes or refunds your payment according to our guarantee policy.' },
        ].map((faq, i) => (
          <View key={i} style={styles.faqCard}>
            <Text style={styles.faqQ}>{faq.q}</Text>
            <Text style={styles.faqA}>{faq.a}</Text>
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerWordmark}>nama</Text>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={styles.footerLink}>Create account</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleCopyrightTap}>
          <Text style={styles.copyright}>nama 2026. All rights reserved.</Text>
        </TouchableOpacity>
        {showHqLink && (
          <TouchableOpacity
            style={styles.hqSecretBtn}
            onPress={() => router.push('/hq')}
          >
            <Text style={styles.hqSecretText}>→ Open HQ Operations Console</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softWhite },
  container: { flex: 1, backgroundColor: colors.softWhite },
  content: { paddingBottom: 64 },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  wordmark: { fontSize: 24, fontWeight: '800', color: colors.deepGreen, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  langButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, backgroundColor: colors.mint },
  langText: { fontSize: 13, fontWeight: '700', color: colors.deepGreen },
  signInNavBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.deepGreen },
  signInNavText: { fontSize: 14, fontWeight: '600', color: colors.softWhite },
  hero: { padding: 32, alignItems: 'center', textAlign: 'center', maxWidth: 800, alignSelf: 'center', marginTop: 32 },
  eyebrow: { fontSize: 14, fontWeight: '700', color: colors.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  h1: { fontSize: 40, fontWeight: '800', color: colors.charcoal, textAlign: 'center', marginBottom: 16, lineHeight: 48 },
  body: { fontSize: 18, color: colors.charcoal, opacity: 0.8, textAlign: 'center', lineHeight: 28, marginBottom: 32 },
  ctaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: { backgroundColor: colors.deepGreen, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 },
  primaryBtnText: { color: colors.softWhite, fontSize: 16, fontWeight: '700' },
  outlineBtn: { borderWidth: 2, borderColor: colors.deepGreen, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  outlineBtnText: { color: colors.deepGreen, fontSize: 16, fontWeight: '700' },
  section: { padding: 32, maxWidth: 900, alignSelf: 'center', width: '100%', marginVertical: 16 },
  mintBg: { backgroundColor: colors.mint, borderRadius: 24, marginVertical: 24 },
  sectionTitle: { fontSize: 28, fontWeight: '800', color: colors.charcoal, marginBottom: 24, textAlign: 'center' },
  stepsGrid: { flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  stepCard: { flex: 1, minWidth: 240, backgroundColor: colors.softWhite, padding: 24, borderRadius: 16, alignItems: 'center' },
  stepCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stepNum: { fontSize: 20, fontWeight: '800', color: colors.deepGreen },
  stepTitle: { fontSize: 18, fontWeight: '700', color: colors.charcoal, marginBottom: 8, textAlign: 'center' },
  stepDesc: { fontSize: 14, color: colors.charcoal, opacity: 0.8, textAlign: 'center', lineHeight: 20 },
  servicesGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  serviceCard: { width: 260, backgroundColor: colors.softWhite, padding: 20, borderRadius: 16 },
  serviceTitle: { fontSize: 16, fontWeight: '700', color: colors.deepGreen, marginBottom: 6 },
  serviceDesc: { fontSize: 13, color: colors.charcoal, opacity: 0.8, lineHeight: 18 },
  medicalNotice: { textAlign: 'center', fontSize: 13, color: colors.charcoal, opacity: 0.6, marginTop: 24 },
  trustRow: { gap: 16, backgroundColor: colors.softWhite, padding: 24, borderRadius: 16 },
  trustItem: { fontSize: 16, color: colors.charcoal, lineHeight: 24 },
  installSub: { textAlign: 'center', fontSize: 16, color: colors.charcoal, opacity: 0.8, marginBottom: 24 },
  installGrid: { flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  installCard: { flex: 1, minWidth: 280, backgroundColor: colors.softWhite, padding: 24, borderRadius: 16 },
  installCardTitle: { fontSize: 18, fontWeight: '700', color: colors.deepGreen, marginBottom: 12 },
  installSteps: { fontSize: 14, color: colors.charcoal, opacity: 0.8, lineHeight: 22, marginBottom: 6 },
  faqCard: { backgroundColor: colors.softWhite, padding: 20, borderRadius: 12, marginBottom: 12 },
  faqQ: { fontSize: 16, fontWeight: '700', color: colors.charcoal, marginBottom: 6 },
  faqA: { fontSize: 14, color: colors.charcoal, opacity: 0.8, lineHeight: 20 },
  footer: { padding: 48, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 32 },
  footerWordmark: { fontSize: 20, fontWeight: '800', color: colors.deepGreen, marginBottom: 16 },
  footerLinks: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  footerLink: { fontSize: 14, color: colors.teal, fontWeight: '600' },
  copyright: { fontSize: 13, color: colors.charcoal, opacity: 0.5 },
  hqSecretBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.charcoal, borderRadius: 16 },
  hqSecretText: { fontSize: 13, color: colors.softWhite, fontWeight: '700' },
});
