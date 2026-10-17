import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, Card, Button, Badge } from '@/components/ui';
import { formatTzs } from '@nama/shared';
import { useWalletBalance } from '@/lib/wallet';
import { useMyPaymentRequests } from '@/lib/topup';
import { colors } from '@/constants/theme';

export default function ClientHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: balance } = useWalletBalance();
  const { data: requests } = useMyPaymentRequests();
  const [wellbeingMood, setWellbeingMood] = useState<string | null>(null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const pendingRequest = requests?.find((r) => r.status === 'pending');

  return (
    <Screen scroll>
      {/* Greeting Row */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.eyebrow}>Nama Care</Text>
          <Text style={styles.greetingText}>{greeting}, Amina</Text>
        </View>
        <Pressable style={styles.notifBtn} onPress={() => router.push('/(client)/bookings')}>
          <Text style={styles.notifIcon}>🔔</Text>
        </Pressable>
      </View>

      {/* Wallet Card */}
      <Card variant="green" style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <Text style={styles.walletCaption}>Wallet balance (Escrow protected)</Text>
          <Pressable
            style={styles.addMoneyPill}
            onPress={() => router.push('/(client)/add-money')}
          >
            <Text style={styles.addMoneyPillText}>+ Add money</Text>
          </Pressable>
        </View>
        <Text style={styles.walletAmount}>{formatTzs(BigInt(balance ?? 0))}</Text>
        {pendingRequest && (
          <View style={styles.amberStrip}>
            <Text style={styles.amberText}>Payment under review • {formatTzs(BigInt(pendingRequest.amount_tzs))}</Text>
          </View>
        )}
      </Card>

      {/* Next Visit / Find Care CTA */}
      <Card variant="mint" style={styles.nextVisitCard}>
        <View style={styles.visitInfo}>
          <Text style={styles.visitTitle}>Need care at home?</Text>
          <Text style={styles.visitSub}>Physiotherapy, nursing, senior care, and therapy.</Text>
        </View>
        <Button title="Find a specialist" onPress={() => router.push('/(client)/find')} />
      </Card>

      {/* Wellbeing Check-in */}
      {!wellbeingMood ? (
        <Card variant="clay" style={styles.wellbeingCard}>
          <Text style={styles.wellbeingCaption}>Wellbeing check-in</Text>
          <Text style={styles.wellbeingQuestion}>How are you feeling today?</Text>
          <View style={styles.moodRow}>
            {['Low', 'Okay', 'Good'].map((mood) => (
              <Pressable
                key={mood}
                style={styles.moodChip}
                onPress={() => setWellbeingMood(mood)}
              >
                <Text style={styles.moodText}>{mood}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : (
        <Card variant="clay" style={styles.wellbeingCard}>
          <Text style={styles.wellbeingCaption}>Wellbeing check-in</Text>
          <Text style={styles.wellbeingAns}>Thank you for telling us. Take care of yourself today.</Text>
        </Card>
      )}

      {/* Care in numbers */}
      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statNum}>2</Text>
          <Text style={styles.statLabel}>Visits this mo.</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statNum}>4h</Text>
          <Text style={styles.statLabel}>Care hours</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statNum}>TZS 45k</Text>
          <Text style={styles.statLabel}>Total care</Text>
        </View>
      </View>

      {/* Quick Links */}
      <View style={styles.linksSection}>
        <Pressable style={styles.linkRow} onPress={() => router.push('/(client)/bookings')}>
          <Text style={styles.linkText}>📋 Visit History & Reports</Text>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/(client)/add-money')}>
          <Text style={styles.linkText}>💳 Wallet & Top-up Requests</Text>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.emergencyFooter}>
        In an emergency, call emergency services immediately. Nama does not replace medical treatment.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eyebrow: { fontSize: 13, fontWeight: '700', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5 },
  greetingText: { fontSize: 24, fontWeight: '800', color: colors.charcoal },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  notifIcon: { fontSize: 18 },
  walletCard: { backgroundColor: colors.deepGreen, padding: 24, borderRadius: 20 },
  walletHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  walletCaption: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  addMoneyPill: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addMoneyPillText: { color: colors.deepGreen, fontSize: 14, fontWeight: '700' },
  walletAmount: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
  amberStrip: { backgroundColor: 'rgba(254, 243, 199, 0.9)', padding: 10, borderRadius: 10 },
  amberText: { color: '#92400E', fontSize: 13, fontWeight: '700' },
  nextVisitCard: { padding: 24, borderRadius: 20, gap: 16 },
  visitInfo: { gap: 4 },
  visitTitle: { fontSize: 18, fontWeight: '800', color: colors.charcoal },
  visitSub: { fontSize: 14, color: colors.charcoal, opacity: 0.8 },
  wellbeingCard: { padding: 20, borderRadius: 20 },
  wellbeingCaption: { fontSize: 12, fontWeight: '700', color: '#B5654A', textTransform: 'uppercase' },
  wellbeingQuestion: { fontSize: 16, fontWeight: '700', color: colors.charcoal, marginVertical: 6 },
  moodRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  moodChip: { flex: 1, backgroundColor: '#FFFFFF', paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E8D5D0' },
  moodText: { fontSize: 14, fontWeight: '700', color: '#B5654A' },
  wellbeingAns: { fontSize: 15, color: '#B5654A', fontWeight: '600', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statTile: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: colors.deepGreen, marginBottom: 2 },
  statLabel: { fontSize: 11, color: colors.charcoal, opacity: 0.7, textAlign: 'center' },
  linksSection: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  linkChevron: { fontSize: 20, color: colors.teal, fontWeight: '700' },
  emergencyFooter: { textAlign: 'center', fontSize: 12, color: colors.charcoal, opacity: 0.5, marginTop: 12, paddingHorizontal: 16, lineHeight: 18 },
});
