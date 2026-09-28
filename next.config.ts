import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    // Job photos are uploaded through a Server Action (default limit 1MB).
    // Clients shrink photos first; 4MB stays under Vercel's 4.5MB body cap.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    // Allow tenant logos served from the Supabase Storage public bucket.
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
