import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LibraryProvider } from '../src/context/LibraryContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LibraryProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </LibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
