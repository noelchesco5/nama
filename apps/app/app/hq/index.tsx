import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { Screen, Card, Button, Title, Subtitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/constants/theme';
import { formatTzs } from '@nama/shared';

export default function HqHome() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <Screen scroll>
      {/* HQ Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Nama HQ Operations Center</Text>
          <Title>{t('home.hqTitle')}</Title>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.greenDot} />
          <Text style={styles.liveText}>Dar es Salaam Live</Text>
        </View>
      </View>
      <Subtitle>Command center for payment verification, dispute resolution, specialist vetting, and platform telemetry.</Subtitle>

      {/* KPI Overview Grid */}
      <View style={styles.kpiGrid}>
        <Card variant="green" style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Platform Revenue</Text>
          <Text style={styles.kpiValue}>{formatTzs(BigInt(1425000))}</Text>
          <Text style={styles.kpiSub}>+14% vs last week</Text>
        </Card>
        <Card variant="mint" style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Active Specialists</Text>
          <Text style={styles.kpiValue}>24 Online</Text>
          <Text style={styles.kpiSub}>Verified & Ready</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Pending Top-ups</Text>
          <Text style={[styles.kpiValue, { color: '#B7791F' }]}>3 Queue</Text>
          <Text style={styles.kpiSub}>Requires review</Text>
        </Card>
        <Card style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Open Cases / Disputes</Text>
          <Text style={[styles.kpiValue, { color: '#B3261E' }]}>1 Case</Text>
          <Text style={styles.kpiSub}>Escalated</Text>
        </Card>
      </View>

      {/* Live Map / Service Zones Widget */}
      <Card style={styles.mapWidget}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>🗺 Dar es Salaam Service Radar</Text>
          <Text style={styles.mapSub}>H3 Spatial Indexing • 4 Zones Active</Text>
        </View>
        <View style={styles.mapContainer}>
          <View style={styles.mapPin1}><Text style={styles.pinText}>📍 Kinondoni (8)</Text></View>
          <View style={styles.mapPin2}><Text style={styles.pinText}>📍 Ilala (6)</Text></View>
          <View style={styles.mapPin3}><Text style={styles.pinText}>📍 Temeke (5)</Text></View>
          <View style={styles.mapPin4}><Text style={styles.pinText}>📍 Ubungo (5)</Text></View>
        </View>
      </Card>

      {/* HQ Navigation Command Grid */}
      <Text style={styles.sectionHeader}>Operations Management</Text>
      <View style={styles.navGrid}>
        <Pressable style={styles.navCard} onPress={() => router.push('/hq/payments')}>
          <Text style={styles.navIcon}>💳</Text>
          <Text style={styles.navTitle}>{t('wallet.topupRequests')}</Text>
          <Text style={styles.navDesc}>Approve or reject M-Pesa / Airtel money top-ups.</Text>
        </Pressable>

        <Pressable style={styles.navCard} onPress={() => router.push('/hq/cases')}>
          <Text style={styles.navIcon}>⚖️</Text>
          <Text style={styles.navTitle}>{t('hq.cases')}</Text>
          <Text style={styles.navDesc}>Resolve booking disputes & refund percentage sliders.</Text>
        </Pressable>

        <Pressable style={styles.navCard} onPress={() => router.push('/hq/onboarding')}>
          <Text style={styles.navIcon}>📋</Text>
          <Text style={styles.navTitle}>{t('hq.onboarding')}</Text>
          <Text style={styles.navDesc}>Review NIDA IDs, professional boards & licenses.</Text>
        </Pressable>

        <Pressable style={styles.navCard} onPress={() => router.push('/hq/audit')}>
          <Text style={styles.navIcon}>🔒</Text>
          <Text style={styles.navTitle}>{t('hq.audit')}</Text>
          <Text style={styles.navDesc}>Immutable ledger logs & administrative audit trail.</Text>
        </Pressable>
      </View>

      <View style={styles.signOutWrap}>
        <Button title={t('common.signOut')} onPress={() => void signOut()} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 13, fontWeight: '700', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.mint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.deepGreen },
  liveText: { fontSize: 12, fontWeight: '700', color: colors.deepGreen },
  kpiGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 12 },
  kpiCard: { flex: 1, minWidth: 150, padding: 18, borderRadius: 16 },
  kpiLabel: { fontSize: 13, fontWeight: '600', color: colors.charcoal, opacity: 0.7, marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '800', color: colors.charcoal, marginBottom: 2 },
  kpiSub: { fontSize: 11, color: colors.charcoal, opacity: 0.6 },
  mapWidget: { padding: 20, borderRadius: 20, gap: 12, backgroundColor: '#EBF4F1' },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mapTitle: { fontSize: 16, fontWeight: '800', color: colors.deepGreen },
  mapSub: { fontSize: 12, color: colors.charcoal, opacity: 0.7 },
  mapContainer: { height: 160, backgroundColor: '#D3E6DF', borderRadius: 14, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  pinText: { fontSize: 12, fontWeight: '700', color: colors.deepGreen, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  mapPin1: { position: 'absolute', top: 30, left: 40 },
  mapPin2: { position: 'absolute', top: 50, right: 60 },
  mapPin3: { position: 'absolute', bottom: 30, left: 80 },
  mapPin4: { position: 'absolute', bottom: 40, right: 90 },
  sectionHeader: { fontSize: 20, fontWeight: '800', color: colors.charcoal, marginTop: 12, marginBottom: 4 },
  navGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  navCard: { width: '48%', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  navIcon: { fontSize: 28, marginBottom: 4 },
  navTitle: { fontSize: 16, fontWeight: '800', color: colors.charcoal },
  navDesc: { fontSize: 12, color: colors.charcoal, opacity: 0.7, lineHeight: 16 },
  signOutWrap: { marginTop: 24, marginBottom: 12 },
});
