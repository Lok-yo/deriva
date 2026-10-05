import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { publicationTarget } from '../domain/publication';
import { Button } from '../ui/Button';
import { Notice, errorMessage } from '../ui/Feedback';
import { Chip, Field } from '../ui/Forms';
import { Page } from '../ui/Page';
import { colors, layout, type } from '../ui/theme';

export default function Auth() {
  const app = useApp();
  const params = useLocalSearchParams<{ returnTo?: string; mode?: string; latitude?: string; longitude?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  function continueAfterAuth() {
    if (params.returnTo !== 'publish') { router.replace('/'); return; }
    const target = publicationTarget(params);
    router.replace({ pathname: '/publish', params: { mode: target.mode, ...(target.coordinate ? { latitude: String(target.coordinate.latitude), longitude: String(target.coordinate.longitude) } : {}) } });
  }

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
      continueAfterAuth();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page keyboard>
    <Button label="Volver al mapa" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.navigate('/')} />
      <View style={{ gap: 16 }}>
        {app.session ? <><Text accessibilityRole="header" style={type.title}>Ya estás en el camino.</Text><Text style={type.body}>Tu sesión está activa. Puedes explorar y compartir lugares.</Text><Button label={params.returnTo === 'publish' ? 'Continuar publicación' : 'Empezar a explorar'} icon="arrow-forward-outline" onPress={continueAfterAuth} /></> : confirmation ? <><Ionicons name="mail-open-outline" size={40} color={colors.green} /><Text accessibilityRole="header" style={type.title}>Revisa tu correo.</Text><Text style={type.body}>Enviamos un enlace de confirmación a {email.trim()}. Ábrelo y después inicia sesión para entrar a Deriva.</Text><Button label="Ir a iniciar sesión" onPress={() => { setConfirmation(false); setMode('signin'); }} /><Button label="Volver a explorar" variant="ghost" onPress={() => router.replace('/')} /></> : <>
          <View style={layout.wrap}><Chip label="Crear cuenta" active={mode === 'signup'} onPress={() => { setMode('signup'); setError(null); }} /><Chip label="Iniciar sesión" active={mode === 'signin'} onPress={() => { setMode('signin'); setError(null); }} /></View>
          <Text accessibilityRole="header" style={type.title}>{mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
          <Text style={type.small}>{mode === 'signup' ? 'Crea tu cuenta y publica gratis donde estás.' : 'Vuelve a explorar y compartir lugares.'}</Text>
          {error && <Notice tone="error">{error}</Notice>}
          {mode === 'signup' && <Field label="Tu nombre" value={name} onChangeText={setName} placeholder="¿Cómo te llamamos?" autoComplete="name" textContentType="name" maxLength={60} editable={!busy} />}
          <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="tucorreo@ejemplo.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" editable={!busy} />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder={mode === 'signup' ? 'Al menos 8 caracteres' : 'Tu contraseña'} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} editable={!busy} onSubmitEditing={() => void submit()} returnKeyType="go" />
          <Button label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} icon={showPassword ? 'eye-off-outline' : 'eye-outline'} variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => setShowPassword(value => !value)} />
          <Button label={mode === 'signup' ? 'Crear mi cuenta' : 'Entrar a Deriva'} icon="arrow-forward-outline" onPress={() => void submit()} loading={busy} />
          <Text style={type.small}>La cámara y la biometría se solicitan cuando tomas una foto.</Text>
        </>}
      </View>
  </Page>;
}
