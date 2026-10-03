import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { mapDocument } from './document';
import { MapFeedback, mapStyles } from './MapFeedback';
import { parseMapMessage, type MapProps } from './types';

export function MapView(props: MapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useId();
  const { places, center, origin, selected, selectedId, selectable } = props;
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; }, [props]);
  const [result, setResult] = useState<{ html: string; reload: number; state: 'loading' | 'ready' | 'error' }>({ html: '', reload: -1, state: 'loading' });
  const [reload, setReload] = useState(0);
  const html = useMemo(() => mapDocument({ places, center, origin, selected, selectedId, selectable }, bridge), [places, center, origin, selected, selectedId, selectable, bridge]);
  const state = result.html === html && result.reload === reload ? result.state : 'loading';
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = parseMapMessage(event.data, bridge);
      if (!message) return;
      if (message.type === 'ready' || message.type === 'error') setResult({ html, reload, state: message.type });
      if (message.type === 'place' && message.id) callbacks.current.onSelectPlace?.(message.id);
      if (message.type === 'coordinate' && message.latitude != null && message.longitude != null) callbacks.current.onSelectCoordinate?.({ latitude: message.latitude, longitude: message.longitude });
    };
    window.addEventListener('message', handleMessage);
    const timeout = window.setTimeout(() => setResult(current => current.html === html && current.reload === reload && current.state === 'ready' ? current : { html, reload, state: 'error' }), 15000);
    return () => { window.removeEventListener('message', handleMessage); window.clearTimeout(timeout); };
  }, [html, bridge, reload]);
  return (
    <View style={[mapStyles.container, props.style]}>
      <iframe key={reload} ref={frame} title="Mapa de lugares de Deriva" srcDoc={html} sandbox="allow-scripts allow-popups" style={{ border: 0, width: '100%', height: '100%', flex: 1, minHeight: 240 }} />
      <MapFeedback state={state} retry={() => setReload(n => n + 1)} />
    </View>
  );
}
