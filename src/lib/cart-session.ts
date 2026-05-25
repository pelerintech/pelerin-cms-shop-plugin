import { db, carts, sql as dbSql } from 'astro:db';
import { createPluginContext } from 'pelerin:plugin-sdk';

/**
 * Parse a specific cookie from a cookie header string.
 */
function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
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
  setCookie: string | null; // Set-Cookie header value, or null if cookie already set
}

/**
 * Get or create a cart for the given request.
 * Uses pelerin_shop_cart cookie for session identification.
 * Links cart to authenticated user if available.
 */
export async function getOrCreateCart(request: Request): Promise<CartSession> {
  const cookieHeader = request.headers.get('cookie');
  const sessionId = parseCookie(cookieHeader, 'pelerin_shop_cart');

  if (sessionId) {
    // Look for an existing, non-expired cart
    const existingResult = await db.run(
      dbSql`SELECT * FROM ${carts} WHERE ${carts.session_id} = ${sessionId} AND ${carts.expires_at} > ${new Date()} LIMIT 1`
    );
    if (existingResult.rows.length > 0) {
      const cart = existingResult.rows[0] as any;
      // Optionally link cart to authenticated user
      try {
        const sdk = createPluginContext();
        const user = await sdk.auth.getUser(request);
        if (user && !cart.user_id) {
          await db.run(
            dbSql`UPDATE ${carts} SET ${carts.user_id} = ${(user as any).id} WHERE ${carts.id} = ${cart.id}`
          );
          cart.user_id = (user as any).id;
        }
      } catch {
        // Not authenticated — that's fine for guest carts
      }
      return { cart, sessionId, setCookie: null };
    }
  }

  // Create a new cart
  const newSessionId = crypto.randomUUID();
  const cartId = crypto.randomUUID();
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const newCart = {
    id: cartId,
    session_id: newSessionId,
    user_id: null,
    expires_at: thirtyDaysFromNow,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await db.insert(carts).values(newCart);

  // Try to link to authenticated user
  try {
    const sdk = createPluginContext();
    const user = await sdk.auth.getUser(request);
    if (user) {
      await db.run(
        dbSql`UPDATE ${carts} SET ${carts.user_id} = ${(user as any).id} WHERE ${carts.id} = ${cartId}`
      );
      newCart.user_id = (user as any).id;
    }
  } catch {
    // Not authenticated — that's fine
  }

  const setCookie = `pelerin_shop_cart=${newSessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;

  return { cart: newCart, sessionId: newSessionId, setCookie };
}
