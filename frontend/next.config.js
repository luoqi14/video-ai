/** @type {import('next').NextConfig} */
const nextConfig = {
  // 禁用 ESLint 检查，允许构建即使有 ESLint 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 配置静态导出
  output: 'export',
  // 关闭图像优化，适用于静态导出
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
      {
        source: '/ffmpeg-core.:ext(js|wasm)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', 
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
};

module.exports = nextConfig;
