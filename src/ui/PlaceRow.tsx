import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistance } from '../domain/geo';
import type { Place } from '../domain/models';
import { PlacePhoto } from './PlacePhoto';
import { colors, type } from './theme';


export function PlaceRow({ place, index, distance, onOpen, onRetryPhoto }: { place: Place; index?: number; distance?: number; onOpen: () => void; onRetryPhoto: () => Promise<void> }) {
  return (
    <View style={styles.row}>
      <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} compact style={styles.photoWrap} onOpen={onOpen} onRetry={onRetryPhoto} overlay={index != null ? <View pointerEvents="none" style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View> : undefined} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${place.title}`} onPress={onOpen} style={({ pressed }) => [styles.main, pressed && { opacity: 0.65 }]}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>{place.title}</Text>
          <View style={styles.meta}><Ionicons name="location-outline" color={colors.muted} size={12} /><Text style={[type.small, { fontSize: 11 }]}>{distance == null ? place.authorName : `${formatDistance(distance)} · ${place.authorName}`}</Text></View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, minHeight: 86, justifyContent: 'center' },
  photoWrap: { width: 86, height: 86 },
  index: { position: 'absolute', left: 5, top: 5, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: colors.surface },
  indexText: { color: colors.ink, fontSize: 9, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: -0.3 },
  meta: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
});
