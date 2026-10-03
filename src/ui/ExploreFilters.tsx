import { ScrollView, Text, View } from 'react-native';
import type { Category } from '../domain/models';
import { Chip, Field } from './Forms';
import { categoryIcons, categoryLabels } from './PlaceRow';
import { layout, type } from './theme';

export function ExploreFilters({ query, setQuery, category, setCategory, radius, setRadius, hasPosition }: {
  query: string; setQuery: (value: string) => void;
  category: Category | null; setCategory: (value: Category | null) => void;
  radius: number; setRadius: (value: number) => void; hasPosition: boolean;
}) {
  return <View style={{ gap: 16 }}>
    <Field label="Buscar un lugar" value={query} onChangeText={setQuery} placeholder="Un título, una pista…" icon="search-outline" autoCorrect={false} />
    <View style={layout.wrap}>
      <Chip label="Todos" active={!category} onPress={() => setCategory(null)} />
      {(Object.keys(categoryLabels) as Category[]).map(value => <Chip key={value} label={categoryLabels[value]} icon={categoryIcons[value]} active={category === value} onPress={() => setCategory(value)} />)}
    </View>
    <View style={{ gap: 7 }}>
      <Text style={type.small}>{hasPosition ? 'Radio desde tu ubicación' : 'Radio al activar tu GPS'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[1, 5, 10, 25, 50].map(value => <Chip key={value} label={`${value} km`} active={radius === value} onPress={() => setRadius(value)} />)}
      </ScrollView>
    </View>
  </View>;
}
