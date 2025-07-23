/** @type {import('next').NextConfig} */
const nextConfig = {
  // 禁用 ESLint 检查，允许构建即使有 ESLint 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Docker部署配置：使用standalone输出模式
  output: process.env.NODE_ENV === 'production' && !process.env.STATIC_EXPORT ? 'standalone' : 'export',
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
      // {
      //   source: '/ffmpeg-core.:ext(js|wasm)',
      //   headers: [
      //     {
      //       key: 'Access-Control-Allow-Origin',
      //       value: '*', 
      //     },
      //   ],
      // },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
};

module.exports = nextConfig;
