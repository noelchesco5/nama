import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title } from '@/components/ui';
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
      <Title>{t('book.find')}</Title>
      <Subtitle>{t('wallet.balance')}: {formatTzs(BigInt(wallet ?? 0))}</Subtitle>
      <View style={styles.grid}>
        {(services ?? []).map((svc) => (
          <Pressable
            key={svc.id}
            onPress={() => setServiceId(svc.id)}
            style={[styles.card, serviceId === svc.id && styles.cardActive]}
          >
            <Text style={styles.cardTitle}>{nameOf(svc)}</Text>
            {svc.description_en ? (
              <Text style={styles.cardSub}>{svc.description_en}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
      <ErrorText message={error?.message} />
      {serviceId && (
        <>
          <Text style={styles.section}>{t('book.availableSpecialists')}</Text>
          {specialists && specialists.length === 0 && (
            <Text style={styles.none}>{t('book.noSpecialists')}</Text>
          )}
          {(specialists ?? []).map((sp) => (
            <Pressable key={sp.specialist_id} style={styles.spec} onPress={() => open(sp)}>
              <View style={styles.specHead}>
                <Text style={styles.specName}>{sp.display_name}</Text>
                <Text style={styles.specPrice}>{formatTzs(BigInt(sp.price_tzs))}</Text>
              </View>
              {sp.bio ? <Text style={styles.specBio}>{sp.bio}</Text> : null}
              <Text style={styles.specMeta}>
                {sp.distance_km != null ? `${sp.distance_km} km • ` : ''}
                {sp.rating_count
                  ? `${t('book.rating')}: ${sp.rating_avg} (${sp.rating_count})`
                  : t('book.newSpecialist')}
              </Text>
            </Pressable>
          ))}
        </>
      )}
      {!serviceId && (
        <Link href="/(client)/bookings" asChild>
          <Button variant="secondary" title={t('book.myVisits')} />
        </Link>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardActive: { borderColor: colors.deepGreen },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.charcoal },
  cardSub: { fontSize: 12, color: colors.charcoal, opacity: 0.7, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  none: { opacity: 0.7 },
  spec: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  specHead: { flexDirection: 'row', justifyContent: 'space-between' },
  specName: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  specPrice: { fontSize: 16, fontWeight: '700', color: colors.deepGreen },
  specBio: { fontSize: 13, color: colors.charcoal, opacity: 0.8 },
  specMeta: { fontSize: 12, color: colors.charcoal, opacity: 0.6 },
});
