import { router } from 'expo-router';
import { EmptyState } from '../ui/Feedback';
import { Page } from '../ui/Page';

export default function NotFound() {
  return <Page><EmptyState title="Este camino no existe." body="El enlace no corresponde a una pantalla de Deriva." action="Volver a explorar" onAction={() => router.replace('/')} /></Page>;
}
