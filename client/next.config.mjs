/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  sassOptions: {
    silenceDeprecations: ['import', 'legacy-js-api'],
  },
}

export default nextConfig
