import { useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from './Button';
import { Notice, errorMessage } from './Feedback';
import { Field } from './Forms';
import { layout, type } from './theme';

export function ProfileEditor({ name, onSaved }: { name: string; onSaved: () => void }) {
  const app = useApp();
  const [displayName, setDisplayName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    if (displayName.trim().length < 2) { setError('Escribe un nombre de al menos 2 caracteres.'); return; }
    setBusy(true);
    try { await app.updateDisplayName(displayName.trim()); onSaved(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <View style={layout.card}>
    <Text accessibilityRole="header" style={type.heading}>Cómo te conoce la comunidad</Text>
    <Field label="Nombre visible" value={displayName} onChangeText={setDisplayName} maxLength={60} editable={!busy} autoComplete="name" hint="Aparece junto a los lugares que compartes." />
    {error && <Notice tone="error">{error}</Notice>}
    <Button label="Guardar nombre" icon="checkmark-outline" variant="secondary" onPress={() => void save()} loading={busy} disabled={displayName.trim() === name} style={{ alignSelf: 'flex-start' }} />
  </View>;
}
