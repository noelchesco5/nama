import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useIncomingRequests, useMyJobs, useSpecialistBookingDetail, useRepeatRequests } from '@/lib/specialist';
import { formatTzs } from '@nama/shared';

export default function SpecialistRequests() {
  const { t } = useTranslation();
  const { data: requests, error } = useIncomingRequests();
  const { data: jobs } = useMyJobs(['accepted', 'in_progress']);
  const { data: repeats } = useRepeatRequests();
  const actions = useSpecialistBookingDetail();
  let runErr: string | null = null;

  const confirm = (label: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      runErr = e instanceof Error ? e.message : String(e);
    }
  };

  return (
    <Screen scroll>
      <Title>{t('sp.requests')}</Title>
      <Subtitle>Review incoming care requests and manage active visits.</Subtitle>
      <ErrorText message={(error as Error | null)?.message ?? undefined} />

      {requests && requests.length === 0 && (
        <Card variant="mint" style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('sp.noRequests')}</Text>
        </Card>
      )}

      {(requests ?? []).map((b) => (
        <Card key={b.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.name}>{b.service_name ?? t('book.bookings')}</Text>
            <Text style={styles.price}>{formatTzs(BigInt(b.price_tzs))}</Text>
          </View>
          <Subtitle>
            📅 {b.starts_at?.slice(0, 16).replace('T', ' ')}
          </Subtitle>
          {b.for_name ? <Text style={styles.line}>👤 Client for: {b.for_name}</Text> : null}
          <Text style={styles.warningLine}>⏱ {t('sp.respondWithin')}</Text>
          <View style={styles.row}>
            <Button
              title={t('sp.accept')}
              loading={actions.accept.isPending}
              onPress={confirm('accept', () => actions.accept.mutateAsync(b.id))}
            />
            <Button
              variant="secondary"
              title={t('sp.decline')}
              loading={actions.decline.isPending}
              onPress={confirm('decline', () => actions.decline.mutateAsync(b.id))}
            />
          </View>
        </Card>
      ))}

      {repeats && repeats.length > 0 && (
        <>
          <Title style={styles.subHeading}>{t('sp.repeats')}</Title>
          {repeats.map((r) => (
            <Card key={r.id} style={styles.card} variant="mint">
              <Subtitle>{t('sp.repeatAsk')}</Subtitle>
              <View style={styles.row}>
                <Button
                  title={t('sp.accept')}
                  loading={actions.acceptRepeat.isPending}
                  onPress={confirm('repeat', () => actions.acceptRepeat.mutateAsync(r.id))}
                />
                <Button
                  variant="secondary"
                  title={t('sp.decline')}
                  loading={actions.declineRepeat.isPending}
                  onPress={confirm('norepeat', () => actions.declineRepeat.mutateAsync(r.id))}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      <Title style={styles.subHeading}>{t('sp.upcoming')}</Title>
      {jobs && jobs.length === 0 && (
        <Card variant="mint" style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('sp.noUpcoming')}</Text>
        </Card>
      )}

      {(jobs ?? []).map((b) => (
        <Card key={b.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.name}>{b.service_name ?? t('book.bookings')}</Text>
            <Text style={styles.badge}>{t(`status.${b.status}`)}</Text>
          </View>
          <Subtitle>📅 {b.starts_at?.slice(0, 16).replace('T', ' ')}</Subtitle>
          {b.for_name ? <Text style={styles.line}>👤 Client for: {b.for_name}</Text> : null}
          <View style={styles.row}>
            {b.status === 'accepted' && (
              <Button
                title={t('sp.start')}
                loading={actions.start.isPending}
                onPress={confirm('start', () => actions.start.mutateAsync(b.id))}
              />
            )}
            <Button
              title={t('sp.complete')}
              loading={actions.complete.isPending}
              onPress={confirm('complete', () => actions.complete.mutateAsync(b.id))}
            />
            {b.status === 'accepted' && (
              <Button
                variant="secondary"
                title={t('sp.noShow')}
                loading={actions.noShow.isPending}
                onPress={confirm('noshow', () => actions.noShow.mutateAsync(b.id))}
              />
            )}
          </View>
        </Card>
      ))}
      <ErrorText message={runErr ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyCard: { padding: 24, alignItems: 'center' },
  emptyText: { color: colors.charcoal, opacity: 0.8, textAlign: 'center' },
  card: { padding: 20, borderRadius: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: colors.charcoal },
  price: { fontSize: 17, fontWeight: '800', color: colors.deepGreen },
  line: { fontSize: 14, color: colors.charcoal, opacity: 0.8 },
  warningLine: { fontSize: 13, fontWeight: '600', color: '#B7791F' },
  subHeading: { marginTop: 16 },
  badge: { fontSize: 13, fontWeight: '700', color: colors.deepGreen, backgroundColor: colors.mint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
});
