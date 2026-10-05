import type { MetadataRoute } from "next";

/**
 * A real robots.txt (it used to fall through to the login redirect). The home page must stay
 * crawlable: Zalo verifies the domain by fetching it. Everything else is behind sign-in anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}
