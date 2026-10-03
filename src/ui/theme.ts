import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F7F8F5',
  surface: '#FFFFFF',
  ink: '#20332B',
  muted: '#5D6C64',
  green: '#2E674B',
  lime: '#DDEBD7',
  border: '#DDE3DC',
  soft: '#EBF1E8',
  error: '#9C3F32',
  errorSurface: '#F8EBE4',
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
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, gap: 16 },
});
