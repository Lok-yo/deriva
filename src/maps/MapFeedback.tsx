import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { colors, type } from '../ui/theme';

export function MapFeedback({ state, retry }: { state: 'loading' | 'ready' | 'error'; retry: () => void }) {
  if (state === 'ready') return null;
  return (
    <View pointerEvents={state === 'loading' ? 'none' : 'auto'} style={styles.overlay}>
      <View style={styles.box}>
        {state === 'loading' && <ActivityIndicator color={colors.green} />}
        <Text style={[type.small, { textAlign: 'center' }]}>{state === 'loading' ? 'Abriendo el mapa…' : 'El mapa necesita conexión a internet. Puedes seguir usando la lista de lugares.'}</Text>
        {state === 'error' && <Button label="Recargar mapa" variant="secondary" onPress={retry} icon="refresh-outline" />}
      </View>
    </View>
  );
}

export const mapStyles = StyleSheet.create({
  container: { flex: 1, minHeight: 240, backgroundColor: colors.soft, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { maxWidth: 300, padding: 20, backgroundColor: colors.surface, borderRadius: 8, gap: 12, alignItems: 'center' },
});
