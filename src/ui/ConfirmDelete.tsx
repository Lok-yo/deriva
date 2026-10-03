import { Text, View } from 'react-native';
import { Button } from './Button';
import { colors, layout, type } from './theme';

export function ConfirmDelete({ title, busy, onCancel, onConfirm }: { title: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <View style={[layout.card, { backgroundColor: colors.errorSurface, borderColor: colors.errorSurface }]}>
    <Text accessibilityRole="header" style={[type.heading, { color: colors.error }]}>¿Eliminar este lugar?</Text>
    <Text style={type.body}>«{title}» dejará de estar disponible para la comunidad y se quitará de los guardados. Esta acción no se puede deshacer.</Text>
    <View style={layout.wrap}><Button label="Sí, eliminar lugar" icon="trash-outline" variant="danger" onPress={onConfirm} loading={busy} /><Button label="Conservar lugar" variant="secondary" onPress={onCancel} disabled={busy} /></View>
  </View>;
}
