import { Suspense } from "react";
import WishlistBoard from "@/components/admin/wishlist/WishlistBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Wishlist and bugs" };

/** Open to everyone signed in to the admin: what their car park has asked for or reported. */
export default function WishlistPage() {
  return (
    <Suspense>
      <WishlistBoard />
    </Suspense>
  );
}
