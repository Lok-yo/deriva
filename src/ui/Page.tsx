import { KeyboardAvoidingView, Platform, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { layout, type } from './theme';

export function Page({ children, style, keyboard = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; keyboard?: boolean }) {
  const scroll = <ScrollView style={layout.page} contentContainerStyle={[layout.content, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
  return keyboard ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{scroll}</KeyboardAvoidingView> : scroll;
}

export function PageHeading({ title, body, action }: { eyebrow?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={[layout.row, { alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }]}>
      <View style={{ gap: 8, flex: 1, minWidth: 220 }}>
        <Text accessibilityRole="header" style={type.title}>{title}</Text>
        {body && <Text style={[type.body, { maxWidth: 550 }]}>{body}</Text>}
      </View>
      {action}
    </View>
  );
}
