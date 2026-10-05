import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { canRegisterPush } from '../services/notifications';
import { Button } from './Button';
import { Notice, errorMessage } from './Feedback';
import { Chip } from './Forms';
import { colors, layout, type } from './theme';

export function NotificationPreferences({ initialEnabled, initialRadius, onSaved }: { initialEnabled: boolean; initialRadius: number; onSaved: (message: string) => void }) {
  const app = useApp();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [radius, setRadius] = useState(initialRadius);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await app.setNotificationPreferences(enabled, radius); onSaved(enabled ? (canRegisterPush() ? 'Tu zona de alertas quedó guardada.' : 'Tu zona quedó guardada. Los avisos aparecen en Actividad; esta versión no recibe push remoto.') : 'Las alertas están desactivadas.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <View style={layout.card}>
    <View style={[layout.row, { justifyContent: 'space-between' }]}><View style={{ gap: 4, flex: 1 }}><Text accessibilityRole="header" style={type.heading}>Una pista cerca de ti</Text><Text style={type.small}>Recibe avisos de nuevos lugares de otras personas.</Text></View><Switch accessibilityLabel="Recibir notificaciones de nuevos lugares" value={enabled} onValueChange={setEnabled} disabled={busy} trackColor={{ false: colors.border, true: colors.green }} thumbColor={colors.surface} /></View>
    <Text style={type.label}>Radio de tus alertas</Text>
    <View style={layout.wrap}>{[1, 5, 10, 25, 50].map(value => <Chip key={value} label={`${value} km`} active={radius === value} onPress={() => { if (!busy) setRadius(value); }} />)}</View>
    <Text style={type.small}>Al guardar, tu ubicación actual será el centro de esta zona. Para cambiar de zona, guarda de nuevo. Tu ubicación no se sigue en segundo plano.</Text>
    {error && <Notice tone="error">{error}</Notice>}
    <Button label={enabled ? 'Guardar zona y activar alertas' : 'Guardar preferencias'} icon={enabled ? 'notifications-outline' : 'checkmark-outline'} onPress={() => void save()} loading={busy} style={{ alignSelf: 'flex-start' }} />
  </View>;
}
