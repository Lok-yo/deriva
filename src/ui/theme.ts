import { Platform, StyleSheet } from 'react-native';

export const colors = {
  background: '#F5F3EC',
  surface: '#FFFDF7',
  ink: '#183B32',
  muted: '#66786D',
  green: '#386B50',
  lime: '#DFFB72',
  border: '#DCDDD2',
  soft: '#E9EDE2',
  error: '#9C3F32',
  errorSurface: '#F8EBE4',
  white: '#FFFFFF',
};

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export const type = StyleSheet.create({
  display: { fontFamily: serif, color: colors.ink, fontSize: 44, lineHeight: 50, letterSpacing: -1.5 },
  title: { fontFamily: serif, color: colors.ink, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  heading: { color: colors.ink, fontSize: 20, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  eyebrow: { color: colors.green, fontSize: 10, lineHeight: 16, fontWeight: '700', letterSpacing: 2 },
});

export const layout = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 24, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  section: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { height: 1, backgroundColor: colors.border },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, gap: 16 },
});
