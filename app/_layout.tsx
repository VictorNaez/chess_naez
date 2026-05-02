import { Slot } from 'expo-router';
import React from 'react';
import 'react-native-gesture-handler'; // Esto debe estar al principio
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}