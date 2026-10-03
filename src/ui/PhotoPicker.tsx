import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { Photo } from '../domain/models';
import { Button } from './Button';
import { Badge } from './Feedback';
import { PlacePhoto } from './PlacePhoto';
import { colors, layout, type } from './theme';

export function PhotoPicker({ photo, premium, busy, onCamera, onGallery }: { photo: Photo | null; premium: boolean; busy: string | null; onCamera: () => void; onGallery: () => void }) {
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={type.heading}>01 · Tu mirada</Text>
    {photo ? <PlacePhoto uri={photo.uri} label="Fotografía elegida para el lugar" style={styles.preview} overlay={<View pointerEvents="none" style={styles.badge}><Badge text={photo.source === 'gallery' ? 'DESDE TU GALERÍA' : photo.biometricVerified ? 'BIOMETRÍA VERIFICADA' : 'FOTO DE CÁMARA'} dark /></View>} /> : <View style={styles.empty}><Ionicons name="camera-outline" size={32} color={colors.green} /><Text style={type.label}>Dale una imagen a tu historia.</Text><Text style={[type.small, { textAlign: 'center', maxWidth: 260 }]}>Al tomar una foto, primero verificaremos tu huella o Face ID.</Text></View>}
    <View style={layout.wrap}>
      <Button label={photo ? 'Tomar otra foto' : 'Tomar una foto'} icon="camera-outline" variant="secondary" onPress={onCamera} loading={busy === 'camera'} disabled={!!busy} />
      <Button label={premium ? 'Elegir de galería' : 'Galería · Premium'} icon={premium ? 'images-outline' : 'lock-closed-outline'} variant="ghost" onPress={onGallery} loading={busy === 'gallery'} disabled={!!busy} />
    </View>
    <Text style={type.small}>{premium ? 'Elige una foto de tu galería o captura el momento.' : 'Tu plan gratuito usa una foto tomada ahora y la ubicación actual del GPS.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 260, position: 'relative', borderRadius: 10, overflow: 'hidden' },
  badge: { position: 'absolute', bottom: 14, left: 14 },
  empty: { height: 230, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
});
