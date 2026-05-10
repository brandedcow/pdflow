import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LibraryProvider } from '../src/context/LibraryContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
