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
  availablePurchases: [] as any[],
  fetchProducts: async (_: any) => {},
  requestPurchase: async (_: any) => {},
  finishTransaction: async (_: any) => {},
  getAvailablePurchases: async (_?: any) => {},
};

// Referencia fija en tiempo de módulo: el orden de hooks nunca cambia.
const useIAPImpl: any = IAP?.useIAP ?? (() => FALLBACK);

export type DonationStatus = 'idle' | 'purchasing' | 'thanks' | 'error';

export const useDonations = () => {
  const [status, setStatus] = useState<DonationStatus>('idle');
  const isAvailable = !!IAP && Platform.OS === 'android';

  const {
    connected, products, availablePurchases,
    fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases,
  } = useIAPImpl({
    onPurchaseSuccess: async (purchase: any) => {
      // Pago pendiente (tarjeta lenta, efectivo...): todavía no hay nada que
      // consumir, y Play rechaza consumir una compra pendiente. Cuando se
      // complete llegará otra vez por aquí (app abierta) o la recoge la
      // recuperación de compras sin terminar del siguiente arranque.
      if (purchase?.purchaseState === 'pending') {
        setStatus('idle');
        return;
      }
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
    // Compras que se quedaron sin terminar: la app se cerró entre pagar y
    // finishTransaction, o el pago estaba pendiente y se completó con la app
    // cerrada. Sin consumir, Google las reembolsa a los 3 días y esa cantidad
    // queda bloqueada ("ya tienes este artículo") para volver a donarla.
    getAvailablePurchases()
      .catch((e: any) => console.warn('[IAP] getAvailablePurchases falló', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Se consumen las de nuestros SKUs ya pagadas. Si alguna ya estaba
  // consumida (carrera con onPurchaseSuccess), Play devuelve error y no pasa
  // nada: por eso el catch solo avisa.
  useEffect(() => {
    for (const purchase of (availablePurchases ?? []) as any[]) {
      if (!SUPPORT_SKUS.includes(purchase?.productId)) continue;
      if (purchase?.purchaseState !== 'purchased') continue;
      finishTransaction({ purchase, isConsumable: true })
        .catch((e: any) => console.warn('[IAP] no se pudo consumir una compra pendiente', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePurchases]);

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