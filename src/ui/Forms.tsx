import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { IconName } from './Button';
import { colors, type } from './theme';

export function Field({ label, hint, error, icon, ...props }: TextInputProps & { label: string; hint?: string; error?: string; icon?: IconName }) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View style={[styles.inputWrap, error && styles.invalid]}>
        {icon && <Ionicons name={icon} color={colors.muted} size={18} />}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          keyboardAppearance="dark"
          selectionColor={colors.green}
          style={[styles.input, props.multiline && styles.multiline]}
          {...props}
        />
      </View>
      {(error || hint) && <Text style={[type.small, error && { color: colors.error }]}>{error || hint}</Text>}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.active, pressed && { opacity: 0.7 }]}>
      {icon && <Ionicons name={icon} size={16} color={active ? colors.onAccent : colors.ink} />}
      <Text style={[styles.chipLabel, active && { fontWeight: '600', color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  inputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, paddingVertical: 13, color: colors.ink, fontSize: 15, lineHeight: 22 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  invalid: { borderColor: colors.error },
  chip: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { backgroundColor: colors.lime, borderColor: colors.lime },
  chipLabel: { fontSize: 12, color: colors.ink, lineHeight: 18 },
});
