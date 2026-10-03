import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Notice, errorMessage } from '../ui/Feedback';
import { Chip, Field } from '../ui/Forms';
import { Page } from '../ui/Page';
import { colors, layout, serif, type } from '../ui/theme';

export default function Auth() {
  const app = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);
    if (mode === 'signup' && name.trim().length < 2) { setError('Escribe tu nombre, con al menos 2 caracteres.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Escribe un correo electrónico válido.'); return; }
    if (password.length < (mode === 'signup' ? 8 : 1)) { setError('Tu contraseña debe tener al menos 8 caracteres.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await app.signUp(name.trim(), email.trim().toLowerCase(), password);
        if (result.needsEmailConfirmation) { setConfirmation(true); setPassword(''); return; }
      } else { await app.signIn(email.trim().toLowerCase(), password); }
      router.replace('/');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page keyboard style={{ maxWidth: 1050 }}>
    <Button label="Volver a explorar" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.navigate('/')} />
    <View style={[styles.columns, wide && { flexDirection: 'row' }]}>
      <View style={[styles.story, wide && { flex: 1 }]}><Text style={styles.eyebrow}>PARA PERSONAS CURIOSAS</Text><Text accessibilityRole="header" style={styles.storyTitle}>Hay historias que{wide ? '\n' : ' '}solo encuentras{wide ? '\n' : ' '}cuando sales.</Text><Text style={styles.storyBody}>Comparte un rincón. Sigue una pista. Mira tu ciudad con otros ojos.</Text><View style={styles.storyFooter}><Ionicons name="compass-outline" size={44} color={colors.lime} /><Text style={styles.storyCaption}>Menos rutina.{`\n`}Más mundo.</Text></View></View>
      <View style={[styles.form, wide && { flex: 1 }]}>
        {app.session ? <><Text accessibilityRole="header" style={type.title}>Ya estás en el camino.</Text><Text style={type.body}>Tu sesión está activa. Puedes explorar, publicar y guardar lugares.</Text><Button label="Empezar a explorar" icon="arrow-forward-outline" onPress={() => router.replace('/')} /></> : confirmation ? <><Ionicons name="mail-open-outline" size={40} color={colors.green} /><Text accessibilityRole="header" style={type.title}>Revisa tu correo.</Text><Text style={type.body}>Enviamos un enlace de confirmación a {email.trim()}. Ábrelo y después inicia sesión para entrar a Deriva.</Text><Button label="Ir a iniciar sesión" onPress={() => { setConfirmation(false); setMode('signin'); }} /><Button label="Volver a explorar" variant="ghost" onPress={() => router.replace('/')} /></> : <>
          <View style={layout.wrap}><Chip label="Crear cuenta" active={mode === 'signup'} onPress={() => { setMode('signup'); setError(null); }} /><Chip label="Iniciar sesión" active={mode === 'signin'} onPress={() => { setMode('signin'); setError(null); }} /></View>
          <Text accessibilityRole="header" style={type.title}>{mode === 'signup' ? 'Encuentra tu rumbo.' : 'Bienvenido al camino.'}</Text>
          <Text style={type.small}>{mode === 'signup' ? 'Tu cuenta es gratuita. Premium es opcional.' : 'Tus lugares guardados te están esperando.'}</Text>
          {error && <Notice tone="error">{error}</Notice>}
          {mode === 'signup' && <Field label="Tu nombre" value={name} onChangeText={setName} placeholder="¿Cómo te llamamos?" autoComplete="name" textContentType="name" maxLength={60} editable={!busy} />}
          <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="tucorreo@ejemplo.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" editable={!busy} />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder={mode === 'signup' ? 'Al menos 8 caracteres' : 'Tu contraseña'} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} editable={!busy} onSubmitEditing={() => void submit()} returnKeyType="go" />
          <Button label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} icon={showPassword ? 'eye-off-outline' : 'eye-outline'} variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => setShowPassword(value => !value)} />
          <Button label={mode === 'signup' ? 'Crear mi cuenta' : 'Entrar a Deriva'} icon="arrow-forward-outline" onPress={() => void submit()} loading={busy} />
          <Text style={[type.small, { fontSize: 11 }]}>Los permisos de cámara, ubicación y biometría se solicitan al usar cada función.</Text>
        </>}
      </View>
    </View>
  </Page>;
}

const styles = StyleSheet.create({
  columns: { gap: 32 },
  story: { backgroundColor: colors.ink, borderRadius: 12, padding: 28, gap: 24 },
  eyebrow: { color: colors.lime, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, lineHeight: 16 },
  storyTitle: { color: colors.surface, fontFamily: serif, fontSize: 37, lineHeight: 44, letterSpacing: -1 },
  storyBody: { color: '#CDDACC', fontSize: 15, lineHeight: 25, maxWidth: 310 },
  storyFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 32, paddingTop: 24, borderTopWidth: 1, borderColor: '#456056' },
  storyCaption: { color: colors.lime, fontFamily: serif, fontSize: 21, lineHeight: 27 },
  form: { gap: 16, justifyContent: 'center', paddingVertical: 8 },
});
