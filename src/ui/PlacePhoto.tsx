import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { colors, type } from './theme';

type Props = {
  uri?: string | null;
  label: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  overlay?: React.ReactNode;
  onOpen?: () => void;
  onRetry?: () => Promise<void>;
};

export function PlacePhoto(props: Props) {
  const uri = props.uri?.trim() ?? '';
  // A newly signed URL gets fresh loading state without an automatic retry loop.
  return <PhotoFrame key={uri} {...props} uri={uri} />;
}

function PhotoFrame({ uri, label, compact, style, overlay, onOpen, onRetry }: Props & { uri: string }) {
  const [failed, setFailed] = useState(!uri);
  const [loading, setLoading] = useState(!!uri);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry?.();
      if (uri) { setFailed(false); setLoading(true); setAttempt(value => value + 1); }
    } catch {
      // Keep the local fallback; retry must never remove the rest of the feed.
      setFailed(true);
    } finally { setRetrying(false); }
  }
  const image = <Image key={attempt} source={{ uri, cache: attempt ? 'reload' : 'default' }} alt={label} style={styles.image} onLoad={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false); }} />;
  return <View accessibilityState={{ busy: loading && !failed || retrying }} style={[styles.frame, style]}>
    {failed ? <View accessibilityLiveRegion="polite" style={[styles.fallback, compact && styles.compactFallback]}>
      {compact ? <Text style={styles.compactLabel}><Ionicons name="image-outline" size={12} color={colors.muted} />{' Fotografía\nno disponible'}</Text> : <><Ionicons name="image-outline" size={32} color={colors.muted} /><Text style={[type.small, { textAlign: 'center' }]}>Fotografía no disponible</Text></>}
      {compact ? <Pressable accessibilityRole="button" accessibilityLabel={`Reintentar ${label.toLowerCase()}`} accessibilityState={{ busy: retrying, disabled: retrying }} disabled={retrying} onPress={() => void retry()} style={({ pressed }) => [styles.compactRetry, pressed && { opacity: 0.7 }]}>{retrying ? <ActivityIndicator size="small" color={colors.green} /> : <Text style={styles.retryLabel}>Reintentar</Text>}</Pressable> : <Button label="Reintentar" accessibilityLabel={`Reintentar ${label.toLowerCase()}`} variant="ghost" onPress={() => void retry()} loading={retrying} />}
    </View> : <>
      {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${label.toLowerCase()}`} onPress={onOpen} style={styles.imagePressable}>{image}</Pressable> : image}
      {loading ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator size="small" color={colors.green} accessibilityLabel={`Cargando ${label.toLowerCase()}`} />{!compact && <Text style={type.small}>Cargando fotografía…</Text>}</View> : overlay}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.soft, overflow: 'hidden', borderRadius: 8 },
  image: { width: '100%', height: '100%' },
  imagePressable: { flex: 1 },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft, gap: 10 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  compactFallback: { gap: 2, padding: 4 },
  compactLabel: { fontSize: 10, lineHeight: 13, color: colors.muted, textAlign: 'center' },
  compactRetry: { minHeight: 44, width: '100%', alignItems: 'center', justifyContent: 'center' },
  retryLabel: { color: colors.ink, fontSize: 11, lineHeight: 16, fontWeight: '600' },
});
