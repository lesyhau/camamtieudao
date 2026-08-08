import { BrandLockup } from '@/components/ui/BrandLogo'
import { SupportDialog, SupportLink } from '@/components/ui/Support'

const LINK =
  'block w-fit text-xs mb-2 text-brand-legible hover:opacity-80 hover:underline underline-offset-[3px] transition-opacity focus-ring rounded-sm'
const HEADING = 'text-xs label-upper text-ink-disabled mb-3'

// A column only appears once the pages behind it exist - a footer link to nothing is worse
// than a shorter footer. Công cụ is still waiting on a guide page; Pháp lý resolves now.
//
// `mt-auto` is what keeps the footer on the bottom edge of a short viewport: the page shell in
// layout.tsx is a min-h-dvh flex column, so this pushes down against whatever slack is left. It
// stays in flow, so on a long page it sits after the content rather than floating over it.
export function Footer() {
  return (
    <footer className="mt-auto glass text-ink-caption py-10 sm:py-12 px-4 sm:px-6 border-t border-line">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-between gap-10 mb-10">
          <div className="max-w-xs">
            {/* The same lockup as the header - the tagline is the block's second line, not a
                paragraph that happens to sit nearby. */}
            <BrandLockup />
          </div>

          <div className="flex flex-wrap gap-12">
            <div>
              <h4 className={HEADING}>Liên kết</h4>
              {/* rel="noopener" on every target=_blank: without it the opened tab gets a live
                  window.opener handle back to this page. */}
              <a href="https://www.youtube.com/@camamtieudao" target="_blank" rel="noopener noreferrer" className={LINK}>
                YouTube · Cảm âm Tiêu Dao
              </a>
              <a href="https://www.youtube.com/@lesyhau" target="_blank" rel="noopener noreferrer" className={LINK}>
                YouTube · Lê Sỹ Hậu
              </a>
              <a href="https://www.facebook.com/le.sy.hau.110994" target="_blank" rel="noopener noreferrer" className={LINK}>
                Facebook · Lê Sỹ Hậu
              </a>
              {/* Opens the dialog rather than navigating - the QR is a panel, not a page. */}
              <SupportLink className={`${LINK} text-left`} />
            </div>
            <div>
              <h4 className={HEADING}>Hỗ trợ</h4>
              <a href="mailto:camamtieudao@outlook.com" className={LINK}>
                camamtieudao@outlook.com
              </a>
            </div>
            <div>
              <h4 className={HEADING}>Pháp lý</h4>
              <a href="/quyen-rieng-tu" className={LINK}>Chính sách quyền riêng tư</a>
              <a href="/dieu-khoan" className={LINK}>Điều khoản sử dụng</a>
            </div>
          </div>
        </div>

        {/* Mounted here so the link works from any page, with or without a conversion on
            screen. It renders nothing until opened. */}
        <SupportDialog />

        <div className="border-t border-line pt-6">
          <p className="text-xs text-ink-disabled">
            &copy; {new Date().getFullYear()} Cảm âm Tiêu Dao. Mọi thương hiệu của bên thứ ba
            thuộc về chủ sở hữu tương ứng.
          </p>
        </div>
      </div>
    </footer>
  )
}
