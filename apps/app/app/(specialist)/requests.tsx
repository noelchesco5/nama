import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title } from '@/components/ui';
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
      <ErrorText message={(error as Error | null)?.message ?? undefined} />
      {requests && requests.length === 0 && (
        <Text style={styles.none}>{t('sp.noRequests')}</Text>
      )}
      {(requests ?? []).map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.name}>{b.service_name ?? t('book.bookings')}</Text>
          <Subtitle>
            {formatTzs(BigInt(b.price_tzs))} • {t('book.date')}:{' '}
            {b.starts_at?.slice(0, 16).replace('T', ' ')}
          </Subtitle>
          {b.for_name ? <Text style={styles.line}>{t('book.for')} {b.for_name}</Text> : null}
          <Text style={styles.line}>{t('sp.respondWithin')}</Text>
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
        </View>
      ))}

      {repeats && repeats.length > 0 && (
        <>
          <Title>{t('sp.repeats')}</Title>
          {repeats.map((r) => (
            <View key={r.id} style={styles.card}>
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
            </View>
          ))}
        </>
      )}

      <Title>{t('sp.upcoming')}</Title>
      {jobs && jobs.length === 0 && <Text style={styles.none}>{t('sp.noUpcoming')}</Text>}
      {(jobs ?? []).map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.name}>{b.service_name ?? t('book.bookings')}</Text>
          <Subtitle>
            {b.starts_at?.slice(0, 16).replace('T', ' ')} • {t(`status.${b.status}`)}
          </Subtitle>
          {b.for_name ? <Text style={styles.line}>{t('book.for')} {b.for_name}</Text> : null}
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
        </View>
      ))}
      <ErrorText message={runErr ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  none: { opacity: 0.7 },
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  name: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  line: { fontSize: 13, color: colors.charcoal, opacity: 0.8 },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
});
