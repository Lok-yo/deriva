import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { mapDocument, mapUpdate } from './document';
import { MapFeedback, mapStyles } from './MapFeedback';
import { parseMapMessage, type MapProps } from './types';

export function MapView(props: MapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useId();
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; }, [props]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  // Marker and selection updates use the bridge, preserving the user's pan/zoom.
  const html = useMemo(() => mapDocument({}, bridge), [bridge]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = parseMapMessage(event.data, bridge);
      if (!message) return;
      if (message.type === 'ready' || message.type === 'error') {
        setState(message.type);
        if (message.type === 'ready') frame.current?.contentWindow?.postMessage({ derivaMap: bridge, type: 'update', payload: mapUpdate(callbacks.current) }, '*');
      }
      if (message.type === 'place' && message.id) callbacks.current.onSelectPlace?.(message.id);
      if (message.type === 'coordinate' && message.latitude != null && message.longitude != null) callbacks.current.onSelectCoordinate?.({ latitude: message.latitude, longitude: message.longitude });
    };
    window.addEventListener('message', handleMessage);
    const timeout = window.setTimeout(() => setState(current => current === 'ready' ? current : 'error'), 15000);
    return () => { window.removeEventListener('message', handleMessage); window.clearTimeout(timeout); };
  }, [bridge, reload]);
  useEffect(() => {
    if (state === 'ready') frame.current?.contentWindow?.postMessage({ derivaMap: bridge, type: 'update', payload: mapUpdate(props) }, '*');
  }, [props, bridge, state, reload]);
  return <View style={[mapStyles.container, props.edgeToEdge && { borderRadius: 0, borderWidth: 0, minHeight: 0 }, props.style]}>
    <iframe key={reload} ref={frame} title="Mapa de lugares de Deriva" srcDoc={html} sandbox="allow-scripts allow-popups" style={{ border: 0, width: '100%', height: '100%', flex: 1, minHeight: 0 }} />
    <MapFeedback state={state} retry={() => { setState('loading'); setReload(value => value + 1); }} />
  </View>;
}
