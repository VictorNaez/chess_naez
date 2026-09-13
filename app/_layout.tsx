import { Slot } from 'expo-router';
import React from 'react';
import 'react-native-gesture-handler'; // Esto debe estar al principio
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '../src/components/ErrorScreen';

export default function App() {
  return (
    // El boundary va DENTRO del GestureHandlerRootView: la pantalla de error
    // tiene Pressables y necesita que el root de gestos ya exista. Y va por
    // encima del Slot, que es todo lo que puede petar en render.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
