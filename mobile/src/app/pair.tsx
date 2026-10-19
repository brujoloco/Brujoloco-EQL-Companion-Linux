// app/pair.tsx — the Pair route. The screen body is `src/screens/pair.tsx`.

import { Redirect } from 'expo-router'
import { PairScreen } from '@/screens/pair'
import { useSession } from '@/state/session'

export default function Pair(): React.ReactNode {
  const { pairing } = useSession()
  // Pairing succeeded while this screen was open: leave for the tabs rather than sitting on a
  // scanner that has nothing left to scan.
  if (pairing !== null) return <Redirect href="/(tabs)/live" />
  return <PairScreen />
}
