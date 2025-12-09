// 加载根目录的 .env 文件
require('dotenv').config({ path: '../.env' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 禁用 TypeScript 检查，加快构建速度
  typescript: {
    ignoreBuildErrors: true,
  },
  // Docker部署配置：生产环境使用standalone模式
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),
  // 关闭图像优化，适用于容器化部署
  images: {
    unoptimized: true,
  },
  // 静态资源配置
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  trailingSlash: false,
  
  // 外部包配置 (Moved from experimental.serverComponentsExternalPackages in Next 16)
  serverExternalPackages: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  
  // 实验性功能配置 (Empty now as serverComponentsExternalPackages moved)
  experimental: {},
  
  // Silence Turbopack error for custom webpack config
  turbopack: {},

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
    // 配置 fallback 以支持浏览器环境
    config.resolve.fallback = {
      fs: false,
      path: false,
      crypto: false,
      stream: false,
      buffer: false,
      ...config.resolve.fallback, // Keep existing fallbacks if any
    };

    // 优化构建性能
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    };

    return config;
  },
};

module.exports = nextConfig;
