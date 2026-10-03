import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Category } from '../../domain/models';
import { useApp } from '../../state/AppProvider';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Feedback';
import { Chip, Field } from '../../ui/Forms';
import { LocationPicker } from '../../ui/LocationPicker';
import { Page, PageHeading } from '../../ui/Page';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { categoryIcons, categoryLabels } from '../../ui/PlaceRow';
import { colors, layout, type } from '../../ui/theme';
import { usePublicationForm } from '../../ui/usePublicationForm';

export default function Publish() {
  const app = useApp();
  const form = usePublicationForm();
  const [showCategory, setShowCategory] = useState(false);
  const canPublish = !!form.photo && !!form.coordinate && form.title.trim().length >= 3;
  return <Page keyboard>
    <PageHeading title="Publicar lugar" body={app.session ? app.premium ? 'Elige una foto y un punto en el mapa.' : 'Una foto, un título y tu ubicación actual.' : undefined} />
    {!app.session ? <View style={{ gap: 16 }}>
      <Text style={type.body}>Inicia sesión para compartir un lugar desde tu teléfono.</Text>
      <Button label="Crear cuenta o iniciar sesión" icon="person-outline" onPress={() => router.push('/auth')} />
      <Text style={type.small}>La cuenta gratuita usa la cámara y tu ubicación. La biometría se verifica antes de tomar la foto.</Text>
    </View> : <>
      {form.error && <Notice tone="error">{form.error}</Notice>}
      <Field label="Título" placeholder="¿Cómo se llama este lugar?" value={form.title} onChangeText={form.setTitle} maxLength={80} editable={!form.busy} />
      <PhotoPicker photo={form.photo} premium={app.premium} busy={form.busy} onCamera={() => void form.camera()} onGallery={() => void form.gallery()} />
      <LocationPicker coordinate={form.coordinate} position={form.position} premium={app.premium} busy={form.busy} onLocate={() => void form.locate()} onChange={form.setCoordinate} />
      <Pressable accessibilityRole="button" accessibilityLabel="Elegir categoría" accessibilityState={{ expanded: showCategory }} disabled={!!form.busy} onPress={() => setShowCategory(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={[type.small, { color: colors.green }]}>{showCategory ? 'Ocultar categoría' : `Categoría: ${categoryLabels[form.category]} · Cambiar`}</Text>
      </Pressable>
      {showCategory && <View style={layout.wrap}>{(Object.keys(categoryLabels) as Category[]).map(value => <Chip key={value} label={categoryLabels[value]} icon={categoryIcons[value]} active={form.category === value} onPress={() => { if (!form.busy) form.setCategory(value); }} />)}</View>}
      <Button label="Publicar lugar" icon="arrow-up-outline" onPress={() => void form.publish()} loading={form.busy === 'publish'} disabled={!canPublish || !!form.busy} />
      <Text style={type.small}>Comparte lugares de acceso público. La foto y el punto serán visibles para la comunidad.</Text>
    </>}
  </Page>;
}
