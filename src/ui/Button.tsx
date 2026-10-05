import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function Button({ label, onPress, icon, variant = 'primary', loading, disabled, style, accessibilityLabel, testID }: Props) {
  const unavailable = disabled || loading;
  const foreground = variant === 'danger' ? colors.error : variant === 'primary' ? colors.onAccent : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!unavailable, busy: !!loading }}
      disabled={unavailable}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, styles[variant], unavailable && styles.disabled, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Ionicons name={icon} size={19} color={foreground} /> : null}
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, active = false }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, active && styles.active, pressed && styles.pressed]}>
      <Ionicons name={icon} size={21} color={active ? colors.onAccent : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primary: { backgroundColor: colors.lime, borderWidth: 1, borderColor: colors.lime },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.errorSurface, borderWidth: 1, borderColor: colors.errorSurface },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  active: { backgroundColor: colors.lime, borderColor: colors.lime },
});
