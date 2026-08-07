import { BrandIcon } from '@/components/ui/BrandIcon'

const LINK = 'block text-sm mb-2 text-ink-caption hover:text-ink-primary transition-colors'
const HEADING = 'text-2xs label-upper text-ink-disabled mb-3'

export function Footer() {
  return (
    <footer className="glass text-ink-caption py-12 px-6 border-t border-line">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-between gap-10 mb-10">
          <div className="max-w-xs">
            <a
              href="/"
              className="flex items-center gap-2 mb-3 no-underline hover:opacity-80 transition-opacity focus-ring rounded-sm"
            >
              <BrandIcon size={32} />
              <span className="font-brand font-bold text-brand-legible text-lg tracking-[0.05em]">
                Cảm Âm
              </span>
            </a>
            <p className="text-sm text-ink-caption">
              Đọc bản nhạc số (简谱) từ ảnh và chuyển sang cảm âm cho sáo và tiêu.
              Ảnh được xử lý trên máy chủ của chúng tôi và không lưu lại.
            </p>
          </div>

          <div className="flex flex-wrap gap-12">
            <div>
              <h4 className={HEADING}>Công cụ</h4>
              <a href="/" className={LINK}>Chuyển cảm âm</a>
              <a href="/#huong-dan" className={LINK}>Hướng dẫn</a>
            </div>
            <div>
              <h4 className={HEADING}>Hỗ trợ</h4>
              <a href="mailto:hello@camamtieudao.com" className={LINK}>hello@camamtieudao.com</a>
            </div>
            <div>
              <h4 className={HEADING}>Pháp lý</h4>
              <a href="/privacy" className={LINK}>Chính sách riêng tư</a>
              <a href="/terms" className={LINK}>Điều khoản sử dụng</a>
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-6">
          <p className="text-xs text-ink-disabled">
            &copy; {new Date().getFullYear()} Cảm Âm Tiêu Dao. Mọi thương hiệu của bên thứ ba
            thuộc về chủ sở hữu tương ứng.
          </p>
        </div>
      </div>
    </footer>
  )
}
