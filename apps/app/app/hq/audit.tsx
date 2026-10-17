import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ErrorText, Screen, Subtitle, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type AuditRow = {
  id: number;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

// The append-only trail: who did what, to what, when. Never editable by
// anyone; HQ reads it, supervisors quote it, disputes resolve with it.
function useAuditLog() {
  return useQuery({
    queryKey: ['hq-audit-log'],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, actor_role, action, entity, entity_id, created_at')
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function HqAudit() {
  const { t } = useTranslation();
  const { data: rows, error } = useAuditLog();

  return (
    <Screen scroll>
      <Title>{t('hq.audit')}</Title>
      <Subtitle>{t('hq.auditNote')}</Subtitle>
      <ErrorText message={(error as Error | null)?.message} />
      {(rows ?? []).slice(0, 80).map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={styles.rowHead}>
            <Text style={styles.entity}>{r.entity}</Text>
            <Text style={styles.ago}>{r.created_at.slice(5, 16).replace('T', ' ')}</Text>
          </View>
          <Text style={styles.action}>
            {r.action} {r.entity_id ? `• ${r.entity_id.slice(0, 8)}` : ''}
            {r.actor_role ? ` • ${r.actor_role}` : ''}
          </Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.md, gap: 2 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  entity: { fontSize: 13, fontWeight: '700', color: colors.charcoal },
  ago: { fontSize: 11, opacity: 0.5 },
  action: { fontSize: 12, color: colors.charcoal, opacity: 0.8 },
});
