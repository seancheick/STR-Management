import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;

const nextConfig: NextConfig = {
  typedRoutes: true,
  // A stray lockfile in $HOME makes Turbopack infer the home folder as the
  // workspace root; it then loops failing to resolve tailwindcss and pins the CPU.
  turbopack: { root: __dirname },
  experimental: {
    // Job photos are uploaded through a Server Action (default limit 1MB).
    // Clients shrink photos first; 4MB stays under Vercel's 4.5MB body cap.
    serverActions: { bodySizeLimit: "4mb" },
    // A dev cache left half-written by a hard crash made Turbopack respawn
    // workers until the machine froze. Rebuilding from scratch costs seconds.
    turbopackFileSystemCacheForDev: false,
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
