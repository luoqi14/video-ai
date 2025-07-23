/** @type {import('next').NextConfig} */
const nextConfig = {
  // 禁用 ESLint 检查，允许构建即使有 ESLint 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
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
  // 实验性功能配置
  experimental: {
    // 启用服务器组件日志
    serverComponentsExternalPackages: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
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
    // 配置 fallback 以支持浏览器环境
    config.resolve.fallback = {
      fs: false,
      path: false,
      crypto: false,
      stream: false,
      buffer: false,
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
