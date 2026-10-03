import { useEffect, useId, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../ui/theme';
import { mapDocument, mapNativeUpdate } from './document';
import { MapFeedback, mapStyles } from './MapFeedback';
import { parseMapMessage, type MapProps } from './types';

function openAttribution(url: string) {
  if (/^https:\/\/(?:www\.)?(?:openstreetmap\.org|leafletjs\.com)\//.test(url)) void Linking.openURL(url).catch(() => {});
}

/** Android Expo Go bypasses Google's renderer; only the map is embedded. */
export function EmbeddedMapView(props: MapProps) {
  const webView = useRef<WebView>(null);
  const bridge = useId();
  const callbacks = useRef(props);
  const initialized = useRef(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  // The HTML source never changes when markers, GPS or selection change.
  const [source] = useState(() => ({ html: mapDocument(props, bridge, 'native') }));

  useEffect(() => {
    callbacks.current = props;
    if (initialized.current) webView.current?.injectJavaScript(mapNativeUpdate(props, bridge));
  }, [props, bridge]);
  useEffect(() => {
    const timeout = setTimeout(() => setState(current => current === 'ready' ? current : 'error'), 15000);
    return () => clearTimeout(timeout);
  }, [reload]);

  return <View style={[mapStyles.container, props.edgeToEdge && styles.edgeToEdge, props.style]}>
    <WebView
      key={reload}
      ref={webView}
      testID="embedded-map"
      style={styles.webView}
      source={source}
      originWhitelist={['*']}
      applicationNameForUserAgent="Deriva/1.0"
      scrollEnabled={false}
      mixedContentMode="never"
      onMessage={event => {
        const message = parseMapMessage(event.nativeEvent.data, bridge);
        if (!message) return;
        if (message.type === 'initialized') {
          initialized.current = true;
          webView.current?.injectJavaScript(mapNativeUpdate(callbacks.current, bridge));
        }
        if (message.type === 'ready' || message.type === 'error') setState(message.type);
        if (message.type === 'place' && message.id) callbacks.current.onSelectPlace?.(message.id);
        if (message.type === 'coordinate' && message.latitude != null && message.longitude != null) callbacks.current.onSelectCoordinate?.({ latitude: message.latitude, longitude: message.longitude });
      }}
      onError={() => setState('error')}
      onRenderProcessGone={() => { initialized.current = false; setState('error'); }}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'about:blank') return true;
        openAttribution(request.url);
        return false;
      }}
      onOpenWindow={event => openAttribution(event.nativeEvent.targetUrl)}
    />
    <MapFeedback state={state} retry={() => { initialized.current = false; setState('loading'); setReload(value => value + 1); }} />
  </View>;
}

const styles = StyleSheet.create({
  edgeToEdge: { borderRadius: 0, borderWidth: 0, minHeight: 0 },
  webView: { flex: 1, backgroundColor: colors.soft },
});
