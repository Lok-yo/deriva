import type { Session } from '@supabase/supabase-js';
import type { AppNotification, ConnectionState, Place, PlaceVisit, Position, Profile, PublicationInput, VisitResult } from '../domain/models';
import type { MapLocationState } from './mapLocationStore';

export type AppState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  isPreview: boolean;
  places: Place[];
  savedIds: string[];
  notifications: AppNotification[];
  isAdmin: boolean;
  remoteCredits: number;
  /** Server-verified arrivals, including places that were later deleted. */
  visits: PlaceVisit[];
  visitedIds: ReadonlySet<string>;
  visitCount: number;
  requiredVisits: number;
  /** Paying for a point anywhere on the map requires enough visits, unless admin. */
  remoteUnlocked: boolean;
  connection: ConnectionState;
  error: string | null;
  notificationsEnabled: boolean;
  notificationRadius: number;
  mapLocation: MapLocationState;
  startMapLocation(): Promise<MapLocationState>;
  locateMap(): Promise<MapLocationState>;
  followMapLocation(): () => void;
  refresh(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  toggleSaved(id: string): Promise<void>;
  publish(draft: PublicationInput): Promise<string>;
  deletePlace(id: string): Promise<void>;
  recordVisit(placeId: string, reading: Position): Promise<VisitResult>;
  markNotificationRead(id: string): Promise<void>;
  setNotificationPreferences(enabled: boolean, radiusKm: number): Promise<void>;
  openRemoteCheckout(requestId?: string): Promise<void>;
  updateDisplayName(name: string): Promise<void>;
};
