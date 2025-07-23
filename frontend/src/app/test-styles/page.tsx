export default function TestStyles() {
  return (
    <div className="min-h-screen bg-dark-bg text-text-light p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-accent-green">
          Tailwind CSS v4 样式测试
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 颜色测试 */}
          <div className="bg-dark-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold mb-4 text-text-light">自定义颜色</h2>
            <div className="space-y-3">
              <div className="bg-accent-green text-dark-bg p-3 rounded-lg">
                accent-green
              </div>
              <div className="bg-accent-green-darker text-dark-bg p-3 rounded-lg">
                accent-green-darker
              </div>
              <div className="bg-input-bg text-text-light p-3 rounded-lg">
                input-bg
              </div>
              <div className="bg-dropzone-bg text-text-muted p-3 rounded-lg">
                dropzone-bg
              </div>
            </div>
          </div>
          
          {/* 文字颜色测试 */}
          <div className="bg-light-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">文字颜色</h2>
            <div className="space-y-2">
              <p className="text-text-light">text-light</p>
              <p className="text-text-muted">text-muted</p>
              <p className="text-accent-green">text-accent-green</p>
              <p className="text-theme-green-light">text-theme-green-light</p>
            </div>
          </div>
          
          {/* 玻璃态效果测试 */}
          <div className="bg-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/25">
            <h2 className="text-xl font-semibold mb-4">玻璃态效果</h2>
            <p className="text-sm">这是一个玻璃态背景效果的示例</p>
          </div>
          
          {/* 按钮测试 */}
          <div className="bg-dark-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold mb-4 text-text-light">按钮样式</h2>
            <div className="space-y-3">
              <button className="bg-accent-green hover:bg-accent-green-darker text-dark-bg font-bold py-2 px-4 rounded-xl transition-colors w-full">
                主要按钮
              </button>
              <button className="bg-input-bg hover:bg-gray-600 text-text-light font-medium py-2 px-4 rounded-xl transition-colors w-full">
                次要按钮
              </button>
            </div>
          </div>
        </div>
        
        {/* 动画测试 */}
        <div className="bg-dark-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 text-text-light">动画效果</h2>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-accent-green rounded-full animate-aurora"></div>
            <p className="text-text-muted">Aurora 旋转动画</p>
          </div>
        </div>
        
        {/* 阴影测试 */}
        <div className="bg-dark-glass-bg backdrop-blur-glass rounded-xl p-6 border border-white/10 shadow-3d">
          <h2 className="text-xl font-semibold mb-4 text-text-light">3D 阴影效果</h2>
          <div className="bg-accent-green text-dark-bg p-4 rounded-lg shadow-3d-light">
            这个卡片有 3D 阴影效果
          </div>
        </div>
      </div>
    </div>
  );
}
