import { StyleSheet } from 'react-native';

export const colors = {
  background: '#090B0C',
  surface: '#15181A',
  ink: '#F1F4F2',
  muted: '#ACB5B1',
  green: '#C5ED95',
  lime: '#C5ED95',
  onAccent: '#142015',
  border: '#303735',
  soft: '#222826',
  error: '#FFACA4',
  errorSurface: '#36211F',
  white: '#FFFFFF',
};

export const type = StyleSheet.create({
  display: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  heading: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  eyebrow: { color: colors.green, fontSize: 10, lineHeight: 16, fontWeight: '700', letterSpacing: 2 },
});

export const layout = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { height: 1, backgroundColor: colors.border },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, gap: 16 },
});
