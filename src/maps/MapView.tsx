import { useId, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapDocument } from './document';
import { MapFeedback, mapStyles } from './MapFeedback';
import { parseMapMessage, type MapProps } from './types';

export function MapView(props: MapProps) {
  const bridge = useId();
  const { places, center, origin, selected, selectedId, selectable } = props;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const html = useMemo(() => mapDocument({ places, center, origin, selected, selectedId, selectable }, bridge), [places, center, origin, selected, selectedId, selectable, bridge]);
  return (
    <View style={[mapStyles.container, props.style]}>
      <WebView
        key={reload}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        source={{ html }}
        onLoadStart={() => setState('loading')}
        onError={() => setState('error')}
        onShouldStartLoadWithRequest={request => {
          if (request.url === 'about:blank' || request.url.startsWith('data:text/html')) return true;
          if (request.url.startsWith('https://www.openstreetmap.org/')) void Linking.openURL(request.url).catch(() => {});
          return false;
        }}
        onMessage={event => {
          const message = parseMapMessage(event.nativeEvent.data, bridge);
          if (!message) return;
          if (message.type === 'ready' || message.type === 'error') setState(message.type);
          if (message.type === 'place' && message.id) props.onSelectPlace?.(message.id);
          if (message.type === 'coordinate' && message.latitude != null && message.longitude != null) props.onSelectCoordinate?.({ latitude: message.latitude, longitude: message.longitude });
        }}
      />
      <MapFeedback state={state} retry={() => { setState('loading'); setReload(n => n + 1); }} />
    </View>
  );
}
