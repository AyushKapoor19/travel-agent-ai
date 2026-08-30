import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // No `remotePatterns`, deliberately. Commons refuses a caller who asks for
    // more than a few photographs at once, and neither a browser nor the
    // optimizer will ask again, so a screen of tiles pointed straight at
    // upload.wikimedia.org comes up part empty. Every photo is served through
    // `/api/photos/file`, which paces and retries; an `<Image>` given a Commons
    // URL directly should fail loudly here rather than quietly go back to
    // dropping half the set.
    //
    // A Commons thumbnail URL names one rendering of one revision and can never
    // come back different, so the optimized copy is worth keeping for a long
    // time: every expiry is another round of bytes against the same limit.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
