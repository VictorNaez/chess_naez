import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

// IDs EXACTOS de Play Console. El orden aquí define el orden en el modal.
export const SUPPORT_SKUS = ['support_small', 'support_medium', 'support_large'];

// Carga defensiva: si el módulo nativo no está en la build (dev build viejo,
// Expo Go), no reventamos la app entera: simplemente el botón sale deshabilitado.
let IAP: any = null;
try {
  IAP = require('expo-iap');
} catch {
  IAP = null;
}

const FALLBACK = {
  connected: false,
  products: [] as any[],
  fetchProducts: async (_: any) => {},
  requestPurchase: async (_: any) => {},
  finishTransaction: async (_: any) => {},
};

// Referencia fija en tiempo de módulo: el orden de hooks nunca cambia.
const useIAPImpl: any = IAP?.useIAP ?? (() => FALLBACK);

export type DonationStatus = 'idle' | 'purchasing' | 'thanks' | 'error';

export const useDonations = () => {
  const [status, setStatus] = useState<DonationStatus>('idle');
  const isAvailable = !!IAP && Platform.OS === 'android';

  const { connected, products, fetchProducts, requestPurchase, finishTransaction } = useIAPImpl({
    onPurchaseSuccess: async (purchase: any) => {
      try {
        // OBLIGATORIO: si no finalizas la transacción en 3 días, Google la
        // reembolsa automáticamente. isConsumable: true la "consume" en Play,
        // que es lo que permite volver a apoyar más veces.
        await finishTransaction({ purchase, isConsumable: true });
        setStatus('thanks');
      } catch (e) {
        console.warn('[IAP] Error al finalizar transacción', e);
        setStatus('error');
      }
    },
    onPurchaseError: (error: any) => {
      const code = String(error?.code ?? '').toLowerCase();
      // Cerrar la hoja de pago no es un error: volvemos a idle en silencio.
      if (code.includes('cancel')) {
        setStatus('idle');
        return;
      }
      console.warn('[IAP] Compra fallida', error);
      setStatus('error');
    },
  });

  // Pedimos el catálogo en cuanto la conexión con Play está lista.
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: SUPPORT_SKUS, type: 'in-app' })
      .catch((e: any) => console.warn('[IAP] fetchProducts falló', e));
  }, [connected]);

  // Ordenamos por SUPPORT_SKUS: Play devuelve el array sin orden garantizado.
  const sortedProducts = useMemo(() => {
    return SUPPORT_SKUS
      .map(sku => products.find((p: any) => (p.id ?? p.productId) === sku))
      .filter(Boolean);
  }, [products]);

  const donate = useCallback(async (productId: string) => {
    if (!isAvailable || !connected) {
      setStatus('error');
      return;
    }
    setStatus('purchasing');
    try {
      // API unificada: sin Platform.OS checks. iOS un SKU, Android array.
      await requestPurchase({
        request: {
          google: { skus: [productId] },
          apple: { sku: productId },
        },
      });
    } catch (e) {
      console.warn('[IAP] requestPurchase falló', e);
      setStatus('error');
    }
  }, [isAvailable, connected, requestPurchase]);

  const resetStatus = useCallback(() => setStatus('idle'), []);

  return { isAvailable, connected, products: sortedProducts, status, donate, resetStatus };
};