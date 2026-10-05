import { Redirect } from 'expo-router';

// Previous links lead to the map; remote points now use a single payment.
export default function LegacyPremiumRoute() { return <Redirect href="/" />; }
