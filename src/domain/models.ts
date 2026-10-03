export type Coordinate = { latitude: number; longitude: number };
export type Category = 'naturaleza' | 'urbano' | 'misterio';
export type PhotoSource = 'camera' | 'gallery';
export type Photo = {
  uri: string;
  source: PhotoSource;
  capturedAt: string;
  biometricVerified: boolean;
};
export type Position = Coordinate & { accuracy: number; timestamp: string; mocked: boolean };
export type MapPosition = Coordinate & { accuracy: number | null; timestamp: string };
export type Place = Coordinate & {
  id: string;
  owner_id: string;
  title: string;
  category: Category;
  photo_path: string;
  photo_source: PhotoSource;
  created_at: string;
  photoUrl: string;
  authorName: string;
};
export type Profile = { user_id: string; display_name: string; created_at: string };
export type AppNotification = {
  id: string;
  user_id: string;
  place_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type PublishDraft = Coordinate & {
  requestId: string;
  title: string;
  category: Category;
  photo: Photo;
};
export type PurchaseOption = { identifier: string; title: string; price: string; period: string };
export type ConnectionState = 'preview' | 'connecting' | 'live' | 'offline';
