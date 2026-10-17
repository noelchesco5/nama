import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import {
  useBooking,
  useCancelBooking,
  useCompleteBooking,
  useDisputeBooking,
  useMessages,
  useSendMessage,
  useSubmitReview,
  type ChatMessage,
} from '@/lib/bookings';

export default function BookingDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, error, isLoading } = useBooking(id as string | '') as any;

  const cancel = useCancelBooking();
  const complete = useCompleteBooking();
  const dispute = useDisputeBooking();
  const review = useSubmitReview();
  const send = useSendMessage();
  const { data: messages } = useMessages(id as string);

  const [msg, setMsg] = useState('');
  const [rating, setRating] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [reason, setReason] = useState('');
  const [actionError, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Screen>
        <Title>{t('common.loading')}</Title>
      </Screen>
    );
  }
  if (error || !b) {
    return (
      <Screen>
        <ErrorText message={t('common.error')} />
      </Screen>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const active = ['requested', 'accepted', 'in_progress'].includes(b.status);

  return (
    <Screen scroll>
      <Title>{t('book.bookings')}</Title>
      <View style={styles.card}>
        <Text style={styles.h}>{t(`status.${b.status}`)}</Text>
        <Text style={styles.line}>
          {t('book.pricePerVisit')}: TZS {b.price_tzs.toLocaleString()}
        </Text>
        {b.starts_at ? (
          <Text style={styles.line}>
            {t('book.date')}: {b.starts_at.slice(0, 16).replace('T', ' ')}
          </Text>
        ) : null}
        {b.for_name ? (
          <Text style={styles.line}>
            {t('book.for')}: {b.for_name}
          </Text>
        ) : null}
        {b.address_text ? (
          <Text style={styles.line}>
            {t('book.address')}: {b.address_text}
          </Text>
        ) : null}
        {b.refund_case_id ? <Text style={styles.line}>{t('case.pendingReview')}</Text> : null}
      </View>

      {active && (
        <View style={styles.actions}>
          <Button
            title={t('book.completeConfirm')}
            loading={complete.isPending}
            onPress={() => run(() => complete.mutateAsync({ booking_id: b.id }))}
          />
          <Button
            variant="secondary"
            title={t('book.cancelBooking')}
            loading={cancel.isPending}
            onPress={() => run(() => cancel.mutateAsync({ booking_id: b.id, reason: reason || undefined }))}
          />
          <Field label={t('book.reason')} value={reason} onChangeText={setReason} />
          {b.status !== 'requested' && (
            <Button
              variant="secondary"
              title={t('book.dispute')}
              loading={dispute.isPending}
              onPress={() => run(() => dispute.mutateAsync({ booking_id: b.id, reason: reason || undefined }))}
            />
          )}
        </View>
      )}

      {b.status === 'completed' && (
        <View style={styles.actions}>
          <Field label={t('review.rating1to5')} value={rating} onChangeText={setRating} />
          <Field
            label={t('review.comment')}
            value={reviewNote}
            onChangeText={setReviewNote}
            multiline
          />
          <Button
            title={t('review.submit')}
            loading={review.isPending}
            onPress={() =>
              run(async () => {
                await review.mutateAsync({
                  booking_id: b.id,
                  rating: Number(rating),
                  comment: reviewNote || undefined,
                });
              })
            }
          />
        </View>
      )}

      {/* Chat lives only across a non-cancelled booking */}
      <View style={styles.chat}>
        <Text style={styles.h}>{t('chat.title')}</Text>
        <FlatList
          data={messages ?? []}
          keyExtractor={(m: ChatMessage) => m.id}
          scrollEnabled={false}
          renderItem={({ item }: { item: ChatMessage }) => (
            <View style={styles.msg}>
              <Text style={styles.msgBody}>{item.body}</Text>
              <Text style={styles.msgTime}>{item.created_at.slice(11, 16)}</Text>
            </View>
          )}
        />
        {['requested', 'accepted', 'in_progress'].includes(b.status) && (
          <View style={styles.chatInput}>
            <Field label="" value={msg} onChangeText={setMsg} multiline />
            <Button
              title={t('chat.send')}
              loading={send.isPending}
              onPress={() =>
                run(async () => {
                  if (!msg.trim()) return;
                  await send.mutateAsync({ booking_id: b.id, body: msg.trim() });
                  setMsg('');
                })
              }
            />
          </View>
        )}
      </View>
      <ErrorText message={actionError ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  h: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  line: { fontSize: 14, color: colors.charcoal },
  actions: { gap: spacing.sm },
  chat: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  msg: { alignSelf: 'flex-start', backgroundColor: colors.mint, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, maxWidth: '85%' },
  msgBody: { fontSize: 14, color: colors.charcoal },
  msgTime: { fontSize: 10, opacity: 0.5 },
  chatInput: { gap: spacing.sm },
});
