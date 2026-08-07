import { Logo } from "./Logo.tsx";

const YEAR = new Date().getFullYear();

/** Proxyma's footer shape: brand block, link columns, a rule, then the copyright line. */
export function Footer() {
  return (
    <footer className="site-footer glass">
      <div className="column">
        <div className="cols">
          <div className="about">
            <a className="brand" href="/">
              <Logo size={32} />
              <span className="wordmark">CẢM ÂM</span>
            </a>
            <p>
              Đọc bản nhạc số (简谱) từ ảnh và chuyển sang cảm âm cho sáo và tiêu.
              Ảnh được xử lý trên máy chủ của chúng tôi và không lưu lại.
            </p>
          </div>

          <div className="groups">
            <div>
              <h4>Công cụ</h4>
              <a className="flink" href="/">Chuyển cảm âm</a>
              <a className="flink" href="/#huong-dan">Hướng dẫn</a>
            </div>
            <div>
              <h4>Hỗ trợ</h4>
              <a className="flink" href="mailto:hello@camamtieudao.com">hello@camamtieudao.com</a>
            </div>
            <div>
              <h4>Pháp lý</h4>
              <a className="flink" href="/privacy">Chính sách riêng tư</a>
              <a className="flink" href="/terms">Điều khoản sử dụng</a>
            </div>
          </div>
        </div>

        <div className="legal">
          <p>&copy; {YEAR} Cảm Âm Tiêu Dao. Mọi thương hiệu của bên thứ ba thuộc về chủ sở hữu tương ứng.</p>
        </div>
      </div>
    </footer>
  );
}
