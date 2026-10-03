import { SLRC_CENTER } from '../data/preview';
import type { Coordinate } from '../domain/models';
import type { MapProps } from './types';

export function isMapCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

export function mapCamera(props: Pick<MapProps, 'cameraRequest' | 'center' | 'selected' | 'origin'>) {
  const request = props.cameraRequest;
  const center = [request?.center, props.center, props.selected, props.origin].find(isMapCoordinate) ?? SLRC_CENTER;
  const requestedZoom = request?.zoom ?? 14;
  const zoom = Number.isFinite(requestedZoom) ? Math.min(19, Math.max(3, requestedZoom)) : 14;
  return { center, zoom, key: `${request?.id ?? 'center'}:${center.latitude}:${center.longitude}:${zoom}` };
}

export function cameraRegion(center: Coordinate, zoom: number) {
  const latitudeDelta = 360 / 2 ** zoom;
  return { ...center, latitudeDelta, longitudeDelta: latitudeDelta };
}
