import { router } from 'expo-router';
import { Text, View, useWindowDimensions } from 'react-native';
import type { Category } from '../domain/models';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Badge, EmptyState, Notice } from '../ui/Feedback';
import { Chip, Field } from '../ui/Forms';
import { LocationPicker } from '../ui/LocationPicker';
import { Page, PageHeading } from '../ui/Page';
import { PhotoPicker } from '../ui/PhotoPicker';
import { categoryIcons, categoryLabels } from '../ui/PlaceRow';
import { SensorGuide } from '../ui/SensorGuide';
import { layout, type } from '../ui/theme';
import { usePublicationForm } from '../ui/usePublicationForm';

export default function Publish() {
  const app = useApp();
  const form = usePublicationForm();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const canPublish = !!form.photo && !!form.coordinate && form.title.trim().length >= 3;
  return <Page keyboard>
    <PageHeading eyebrow="Comparte un descubrimiento" title="Aquí empieza una historia." body="Un título, una foto y ese lugar que merece encontrarse." action={<Badge text={app.premium ? 'PLAN PREMIUM' : 'PLAN GRATUITO'} />} />
    {!app.session || app.isPreview ? <>
      <EmptyState title="Tu primer hallazgo te espera." body="Crea una cuenta para publicar desde tu ubicación, guardar lugares y recibir nuevas historias cerca de ti." icon="add-circle-outline" action="Crear cuenta o iniciar sesión" onAction={() => router.push('/auth')} />
      <SensorGuide />
    </> : <>
      {form.error && <Notice tone="error">{form.error}</Notice>}
      <View style={[layout.section, wide && { flexDirection: 'row', gap: 32 }]}>
        <View style={{ flex: 1, gap: 24 }}>
          <PhotoPicker photo={form.photo} premium={app.premium} busy={form.busy} onCamera={() => void form.camera()} onGallery={() => void form.gallery()} />
          <View style={layout.line} />
          <View style={{ gap: 14 }}><Text accessibilityRole="header" style={type.heading}>03 · Ponle nombre</Text><Field label="Título del lugar" placeholder="¿Qué hace especial a este rincón?" value={form.title} onChangeText={form.setTitle} maxLength={80} hint={`${form.title.length}/80 caracteres · mínimo 3`} editable={!form.busy} /><Text style={type.label}>Categoría</Text><View style={layout.wrap}>{(Object.keys(categoryLabels) as Category[]).map(value => <Chip key={value} label={categoryLabels[value]} icon={categoryIcons[value]} active={form.category === value} onPress={() => { if (!form.busy) form.setCategory(value); }} />)}</View></View>
        </View>
        <View style={{ flex: 1, gap: 24 }}><LocationPicker coordinate={form.coordinate} position={form.position} premium={app.premium} busy={form.busy} onLocate={() => void form.locate()} onChange={form.setCoordinate} /><Notice>Comparte lugares de acceso público y respeta el entorno. Las coordenadas y la fotografía serán visibles para la comunidad.</Notice></View>
      </View>
      <View style={layout.line} />
      <View style={[layout.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}><Text style={[type.small, { maxWidth: 440, flexShrink: 1 }]}>Una nueva pista para alguien que aún no conoces. El lugar aparecerá después de guardarse en el servidor.</Text><Button label="Publicar lugar" icon="arrow-up-outline" onPress={() => void form.publish()} loading={form.busy === 'publish'} disabled={!canPublish || !!form.busy} /></View>
      <SensorGuide />
    </>}
  </Page>;
}
