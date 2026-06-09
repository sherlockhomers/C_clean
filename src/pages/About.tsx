import { Info, Heart, Github, Globe } from 'lucide-react'

export default function About() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Info size={24} style={{ color: 'var(--color-primary)' }} /> 关于
        </h1>
      </div>

      <div className="card-base p-8 text-center">
        <div className="w-20 h-20 rounded-2xl gradient-primary mx-auto mb-4 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
          C
        </div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>CleanC</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>C盘清理助手</p>
        <div className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>版本 1.0.0</div>

        <div className="max-w-md mx-auto text-sm space-y-2 mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          <p>CleanC = 技术驱动 + 纯公益 + 零门槛</p>
          <p>完全免费、无广告、无捆绑、不收集用户隐私数据</p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <a href="https://github.com/sherlockhomers/C_clean" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--color-primary)' }}>
            <Github size={16} /> GitHub
          </a>
          <a href="#" className="flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--color-primary)' }}>
            <Globe size={16} /> 官网
          </a>
        </div>
      </div>

      <div className="card-base p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>技术栈</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['前端框架', 'React 18 + TypeScript'],
            ['样式方案', 'Tailwind CSS 3'],
            ['状态管理', 'Zustand'],
            ['图表', '轻量 SVG'],
            ['动画', 'CSS Transitions'],
            ['图标', 'Lucide React'],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded" style={{ backgroundColor: 'var(--color-bg)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
              <span className="ml-auto font-medium" style={{ color: 'var(--color-text)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        Made with <Heart size={12} className="inline text-red-500" /> by CleanC Team
      </div>
    </div>
  )
}
