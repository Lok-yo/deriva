import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { Photo } from '../domain/models';
import { Button } from './Button';
import { Badge } from './Feedback';
import { PlacePhoto } from './PlacePhoto';
import { colors, layout, type } from './theme';

export function PhotoPicker({ photo, allowGallery, busy, onCamera, onGallery }: { photo: Photo | null; allowGallery: boolean; busy: string | null; onCamera: () => void; onGallery: () => void }) {
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={type.label}>Foto</Text>
    {photo ? <PlacePhoto uri={photo.uri} label="Fotografía elegida para el lugar" style={styles.preview} overlay={<View pointerEvents="none" style={styles.badge}><Badge text={photo.source === 'gallery' ? 'Galería' : 'Cámara'} dark /></View>} /> : <View style={styles.empty}><Ionicons name="camera-outline" size={30} color={colors.green} /><Text style={[type.small, { textAlign: 'center', maxWidth: 260 }]}>Huella o Face ID antes de abrir la cámara.</Text></View>}
    <View style={layout.wrap}>
      <Button label={photo ? 'Cambiar foto' : 'Tomar foto'} icon="camera-outline" variant="secondary" onPress={onCamera} loading={busy === 'camera'} disabled={!!busy} />
      {allowGallery && <Button label="Elegir de galería" icon="images-outline" variant="ghost" onPress={onGallery} loading={busy === 'gallery'} disabled={!!busy} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 220, position: 'relative', borderRadius: 12, overflow: 'hidden' },
  badge: { position: 'absolute', bottom: 14, left: 14 },
  empty: { height: 150, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
});
