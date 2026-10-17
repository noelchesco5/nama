import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useServices, useSpecialists, type SpecialistListing } from '@/lib/bookings';
import { useWalletBalance } from '@/lib/wallet';
import { formatTzs } from '@nama/shared';

export default function FindCare() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const { data: services } = useServices();
  const { data: specialists, error } = useSpecialists(serviceId);
  const { data: wallet } = useWalletBalance();

  const nameOf = (svc: { name_en: string; name_sw: string }) =>
    i18n.language === 'sw' ? svc.name_sw : svc.name_en;

  const open = (sp: SpecialistListing) => {
    router.push(
      `/(client)/book?specialist_id=${sp.specialist_id}&service_id=${serviceId}&price=${sp.price_tzs}` +
        `&name=${encodeURIComponent(sp.display_name)}`,
    );
  };

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <Title>{t('book.find')}</Title>
        <Pressable style={styles.walletPill} onPress={() => router.push('/(client)/add-money')}>
          <Text style={styles.walletPillText}>{formatTzs(BigInt(wallet ?? 0))}</Text>
        </Pressable>
      </View>
      <Subtitle>Select a professional care service to view available specialists nearby.</Subtitle>

      <View style={styles.grid}>
        {(services ?? []).map((svc) => (
          <Pressable
            key={svc.id}
            onPress={() => setServiceId(svc.id)}
            style={[styles.serviceCard, serviceId === svc.id && styles.serviceCardActive]}
          >
            <Text style={[styles.serviceTitle, serviceId === svc.id && styles.serviceTitleActive]}>
              {nameOf(svc)}
            </Text>
            {svc.description_en ? (
              <Text style={styles.serviceDesc} numberOfLines={2}>{svc.description_en}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <ErrorText message={error?.message} />

      {serviceId && (
        <View style={styles.resultsSection}>
          <Text style={styles.sectionHeader}>{t('book.availableSpecialists')}</Text>
          {specialists && specialists.length === 0 && (
            <Card variant="mint" style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('book.noSpecialists')}</Text>
            </Card>
          )}
          {(specialists ?? []).map((sp) => (
            <Card key={sp.specialist_id} style={styles.specCard}>
              <View style={styles.specHead}>
                <View>
                  <Text style={styles.specName}>{sp.display_name}</Text>
                  <Text style={styles.specBio} numberOfLines={2}>{sp.bio ?? 'Verified professional care specialist.'}</Text>
                </View>
                <Text style={styles.specPrice}>{formatTzs(BigInt(sp.price_tzs))}</Text>
              </View>
              <View style={styles.specFooter}>
                <Text style={styles.specMeta}>
                  {sp.distance_km != null ? `${sp.distance_km} km • ` : ''}
                  ⭐ {sp.rating_avg ? `${sp.rating_avg} (${sp.rating_count})` : 'New'}
                </Text>
                <Button title="Book visit" onPress={() => open(sp)} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletPill: { backgroundColor: colors.mint, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  walletPillText: { fontSize: 14, fontWeight: '700', color: colors.deepGreen },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  serviceCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    gap: 6,
  },
  serviceCardActive: { borderColor: colors.deepGreen, backgroundColor: colors.mint },
  serviceTitle: { fontSize: 15, fontWeight: '800', color: colors.charcoal },
  serviceTitleActive: { color: colors.deepGreen },
  serviceDesc: { fontSize: 12, color: colors.charcoal, opacity: 0.7, lineHeight: 16 },
  resultsSection: { marginTop: 24, gap: 12 },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: colors.charcoal, marginBottom: 4 },
  emptyCard: { padding: 20, alignItems: 'center' },
  emptyText: { color: colors.charcoal, opacity: 0.8, textAlign: 'center' },
  specCard: { padding: 20, borderRadius: 16, gap: 12 },
  specHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  specName: { fontSize: 17, fontWeight: '800', color: colors.charcoal, marginBottom: 4 },
  specBio: { fontSize: 13, color: colors.charcoal, opacity: 0.7, maxWidth: '70%' },
  specPrice: { fontSize: 17, fontWeight: '800', color: colors.deepGreen },
  specFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  specMeta: { fontSize: 13, fontWeight: '600', color: colors.charcoal, opacity: 0.8 },
});
