import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useApp } from '../../state/AppProvider';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Feedback';
import { Field } from '../../ui/Forms';
import { LocationPicker } from '../../ui/LocationPicker';
import { Page, PageHeading } from '../../ui/Page';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { type } from '../../ui/theme';
import { usePublicationForm } from '../../ui/usePublicationForm';

export default function Publish() {
  const app = useApp();
  const params = useLocalSearchParams<{ mode?: string; latitude?: string; longitude?: string }>();
  const key = JSON.stringify([app.session?.user.id, params.mode, params.latitude, params.longitude]);
  return <PublicationForm key={key} />;
}

function PublicationForm() {
  const app = useApp();
  const form = usePublicationForm();
  return <Page keyboard>
    <PageHeading title="Publicar lugar" body={form.isRemote ? app.isAdmin ? 'Elige una foto. Publicas gratis como administrador.' : 'Una foto, un título y el punto que elegiste.' : 'Una foto, un título y tu ubicación actual.'} />
    {!app.session ? <View style={{ gap: 16 }}>
      <Text style={type.body}>Inicia sesión para compartir un lugar.</Text>
      {form.isRemote && <Text style={type.small}>Conservaremos el punto que elegiste. Agregar una ubicación en otro lugar cuesta 1 USD.</Text>}
      <Button label="Crear cuenta o iniciar sesión" icon="person-outline" onPress={form.signIn} />
    </View> : <>
      <Field label="Título" placeholder="¿Cómo se llama este lugar?" value={form.title} onChangeText={form.setTitle} maxLength={80} editable={!form.busy} />
      <PhotoPicker photo={form.photo} allowGallery={form.isRemote} busy={form.busy} onCamera={() => void form.camera()} onGallery={() => void form.gallery()} />
      <LocationPicker coordinate={form.coordinate} position={form.position} remote={form.isRemote} busy={form.busy} onLocate={() => void form.locate()} onChange={form.setCoordinate} />
      {form.isRemote && <View style={{ gap: 12 }}>
        <Text style={type.small}>{app.isAdmin ? 'Administrador · Este punto es gratis.' : app.remoteCredits > 0 ? 'Pago confirmado · Este punto ya está cubierto.' : 'Para agregar una ubicación nueva en este punto debes pagar 1 USD.'}</Text>
        {form.needsPayment && <>
          <Button label={form.checkoutStarted ? 'Volver al pago de prueba · 1 USD' : 'Pagar 1 USD · Prueba'} icon="card-outline" onPress={() => void form.checkout()} loading={form.busy === 'checkout'} disabled={!!form.busy} />
          <Text style={type.small}>Stripe en modo de prueba. No se cobran importes reales.</Text>
          {form.checkoutStarted && <><Text style={type.small}>Al terminar, vuelve a Deriva. El punto se habilita cuando Stripe confirma el pago.</Text><Button label="Verificar pago" variant="secondary" icon="refresh-outline" onPress={() => void form.refreshPayment()} loading={form.busy === 'refresh'} disabled={!!form.busy} /></>}
        </>}
        <Button label="Publicar gratis desde donde estoy" variant="ghost" icon="locate-outline" onPress={form.useLocalMode} disabled={!!form.busy} />
      </View>}
      {form.error && <Notice tone="error">{form.error}</Notice>}
      {!form.needsPayment && <Button label={form.busy === 'publish' && !form.isRemote ? 'Obteniendo GPS y publicando…' : 'Publicar lugar'} icon="arrow-up-outline" onPress={() => void form.publish()} loading={form.busy === 'publish'} disabled={!!form.busy} />}
      <Text style={type.small}>{form.isRemote ? 'La foto y el punto serán visibles para la comunidad.' : 'Usaremos una lectura nueva del GPS al publicar. La foto debe tomarse con la cámara y biometría.'}</Text>
    </>}
  </Page>;
}
