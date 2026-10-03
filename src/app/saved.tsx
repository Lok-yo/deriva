import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { EmptyState, Notice, errorMessage } from '../ui/Feedback';
import { Page, PageHeading } from '../ui/Page';
import { PlaceRow } from '../ui/PlaceRow';

export default function Saved() {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const saved = app.places.filter(place => app.savedIds.includes(place.id));
  async function remove(id: string) {
    setError(null);
    try { await app.toggleSaved(id); } catch (e) { setError(errorMessage(e)); }
  }
  return <Page>
    <Button label="Volver al perfil" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
    <PageHeading title="Guardados" />
    {error && <Notice tone="error">{error}</Notice>}
    {!app.session || app.isPreview ? <EmptyState title="Haz espacio para tus próximos destinos." body="Inicia sesión para guardar lugares y llevar tu colección contigo." icon="bookmark-outline" action="Crear cuenta o iniciar sesión" onAction={() => router.push('/auth')} /> : saved.length ? <View>{saved.map(place => <PlaceRow key={place.id} place={place} saved onSave={() => void remove(place.id)} onOpen={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} onRetryPhoto={app.refresh} />)}</View> : <EmptyState title="Tu mapa personal empieza con un lugar." body="Toca el marcador de guardado en cualquier hallazgo. Lo encontrarás aquí cuando quieras volver." icon="bookmark-outline" action="Encontrar un lugar" onAction={() => router.navigate('/')} />}
  </Page>;
}
