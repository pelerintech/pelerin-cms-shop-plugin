import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getCartBySession, createCart, linkCartToUser } from './data/cart.ts';

/**
 * Parse a specific cookie from a cookie header string.
 */
function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=');
    if (key === name && rest.length > 0) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export interface CartSession {
  cart: any;
  sessionId: string;
  setCookie: string | null;
}

/**
 * Get or create a cart for the given request.
 * Uses pelerin_shop_cart cookie for session identification.
 * Links cart to authenticated user if available.
 *
 * `db` and `sdk` are injected (no astro:db / pelerin:plugin-sdk import).
 */
export async function getOrCreateCart(
  db: LibSQLDatabase,
  sdk: any,
  request: Request
): Promise<CartSession> {
  const cookieHeader = request.headers.get('cookie');
  const sessionId = parseCookie(cookieHeader, 'pelerin_shop_cart');

  if (sessionId) {
    const cart = await getCartBySession(db, sessionId);
    if (cart) {
      try {
        const user = await sdk.auth.getUser(request);
        if (user && !cart.user_id) {
          await linkCartToUser(db, cart.id, (user as any).id);
          cart.user_id = (user as any).id;
        }
      } catch {
        // Not authenticated — fine for guest carts
      }
      return { cart, sessionId, setCookie: null };
    }
  }

  const newSessionId = crypto.randomUUID();
  const newCart = await createCart(db, { session_id: newSessionId });

  try {
    const user = await sdk.auth.getUser(request);
    if (user) {
      await linkCartToUser(db, newCart.id, (user as any).id);
      newCart.user_id = (user as any).id;
    }
  } catch {
    // Not authenticated — fine
  }

  const setCookie = `pelerin_shop_cart=${newSessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
  return { cart: newCart, sessionId: newSessionId, setCookie };
}
