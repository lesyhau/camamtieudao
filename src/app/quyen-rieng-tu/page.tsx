import { LegalPage } from '@/components/layout/LegalPage'
import { adsConfig } from '@/lib/ads.ts'

export const metadata = {
  title: 'Chính sách quyền riêng tư · Cảm âm Tiêu Dao',
  description: 'Cảm âm Tiêu Dao xử lý ảnh bản nhạc của bạn như thế nào, gửi những gì cho bên thứ ba và giữ lại những gì.',
}

// Written against what the code actually does, not against what a policy template says a
// website usually does. Every claim below was checked in the source before it was written:
//
//   - no upload is written to disk anywhere in src/ (no writeFile, no tmpdir)
//   - WorkQueue drops its entry the moment a conversion settles, so nothing is cached after
//   - the rate limiter keeps IPs in memory for a 60s window and nowhere else
//   - the app sets no cookies at all; the theme preference is localStorage
//   - the polish step sends the LYRIC TEXT to Google, never the image
//   - nginx keeps standard access logs, rotated at 14 days
//
// If any of that changes, this page has to change in the same commit.
export default function Page() {
  const contact = adsConfig().contact
  return (
    <LegalPage title="Chính sách quyền riêng tư" updated="08/08/2026">
      <p className="lede">
        Chính sách này mô tả cách Cảm âm Tiêu Dao thu thập, sử dụng, chia sẻ và lưu trữ dữ liệu
        khi bạn sử dụng dịch vụ tại camamtieudao.com, cùng phạm vi tham gia của các bên thứ ba
        trong quá trình xử lý.
      </p>

      <h2>Tóm tắt</h2>
      <ul>
        <li>Ảnh bản nhạc tải lên <strong>không được lưu trữ</strong>. Ảnh chỉ tồn tại trong bộ
          nhớ máy chủ trong thời gian xử lý và được giải phóng ngay sau khi trả kết quả.</li>
        <li>Dịch vụ <strong>không có tài khoản người dùng</strong>, không sử dụng cơ sở dữ liệu
          và không đặt cookie.</li>
        <li>Phần lời bài hát nhận dạng được từ ảnh được gửi tới Google (Gemini API) để ngắt câu.
          Ảnh gốc không được gửi đi.</li>
        <li>Nhật ký máy chủ ghi nhận địa chỉ IP theo thông lệ vận hành và được xoá sau 14 ngày.</li>
      </ul>

      <h2>Đơn vị vận hành</h2>
      <p>
        <strong>Lê Sỹ Hậu</strong><br />
        Cá nhân phát triển phần mềm<br />
        237/3 đường Hoà Bình<br />
        Phường Phú Thạnh, Thành phố Hồ Chí Minh<br />
        Việt Nam<br />
        Email: <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      <p>
        Cảm âm Tiêu Dao là dự án cá nhân. Không có pháp nhân doanh nghiệp nào đứng sau dịch vụ
        này, và người chịu trách nhiệm xử lý dữ liệu là cá nhân nêu trên.
      </p>

      <h2>1. Ảnh bản nhạc bạn tải lên</h2>
      <p>
        Khi bạn bấm «Dịch», ảnh được gửi lên máy chủ, giải mã trong bộ nhớ, nhận dạng và trả kết
        quả về trình duyệt. Ảnh <strong>không được ghi xuống ổ đĩa</strong>, không được đưa vào
        cơ sở dữ liệu nào và không được dùng để huấn luyện bất cứ mô hình nào.
      </p>
      <p>
        Trong lúc chuyển đổi, máy chủ có giữ một khoá tạm tính từ nội dung ảnh, để hai lần gửi
        cùng một ảnh (bấm hai lần, hoặc nền tảng chat gửi lại) chỉ tốn một lần xử lý. Khoá này
        bị xoá ngay khi lần chuyển đổi đó kết thúc.
      </p>
      <p>
        Nút xoá ảnh trên trang chỉ xoá ảnh khỏi trình duyệt của bạn — vì phía máy chủ vốn đã
        không còn gì để xoá.
      </p>

      <h2>2. Dữ liệu kỹ thuật</h2>
      <ul>
        <li><strong>Giới hạn tần suất.</strong> Địa chỉ IP của bạn được giữ trong bộ nhớ tối đa
          một phút, chỉ để đếm số lần gửi và ngăn một máy chiếm hết máy chủ. Không ghi ra file,
          không đối chiếu với gì khác.</li>
        <li><strong>Nhật ký web server.</strong> Như mọi máy chủ, nginx ghi lại thời điểm, địa
          chỉ IP, đường dẫn và loại trình duyệt của mỗi yêu cầu. Nhật ký được luân chuyển và
          xoá sau 14 ngày, dùng cho vận hành và xử lý sự cố.</li>
        <li><strong>Nhật ký lỗi.</strong> Khi một lần chuyển đổi thất bại, chúng tôi ghi lại
          thông báo lỗi kỹ thuật. Nội dung bản nhạc của bạn không nằm trong đó.</li>
      </ul>

      <h2>3. Cookie và lưu trữ trên trình duyệt</h2>
      <p>
        Trang web <strong>không đặt cookie nào</strong>. Lựa chọn giao diện sáng/tối được lưu
        bằng <code>localStorage</code> ngay trên máy bạn; nó không bao giờ được gửi lên máy chủ
        và bạn có thể xoá bất cứ lúc nào qua phần cài đặt của trình duyệt.
      </p>

      <h2>4. Bên thứ ba</h2>
      <h3>Google (Gemini API)</h3>
      <p>
        Sau khi nhận dạng xong, phần <em>lời bài hát</em> — chỉ chữ, không có nốt và không có
        ảnh — được gửi tới Gemini để chia câu và đặt tên đoạn cho dễ đọc. Nếu bản nhạc không có
        lời, hoặc nếu bước này gặp lỗi, chúng tôi hoàn toàn không gọi tới Google. Việc Google xử
        lý dữ liệu đó tuân theo điều khoản của họ.
      </p>
      <h3>Hạ tầng</h3>
      <p>
        Trang chạy trên một máy chủ ảo do chúng tôi tự quản lý tại Google Cloud. Không có dịch
        vụ phân tích hành vi (analytics) nào được cài đặt.
      </p>
      <h3>Quảng cáo</h3>
      <p>
        Trang có sẵn vị trí dành cho quảng cáo. Ở thời điểm cập nhật này, các vị trí đó
        <strong> chưa chạy quảng cáo</strong> và <strong>không có mã nào của Google được tải
        về</strong>. Khi bắt đầu hiển thị quảng cáo, đơn vị quảng cáo có thể dùng cookie hoặc
        định danh tương tự để đo lường và cá nhân hoá; chúng tôi sẽ cập nhật trang này trước khi
        điều đó xảy ra.
      </p>

      <h2>5. Nếu bạn nhắn qua Messenger hoặc Zalo</h2>
      <p>
        Khi bạn gửi ảnh qua một nền tảng nhắn tin, nền tảng đó chuyển tin nhắn và ảnh cho chúng
        tôi, và chúng tôi xử lý đúng như mục 1. Phần tin nhắn nằm trên nền tảng thì thuộc chính
        sách riêng của nền tảng đó, chúng tôi không kiểm soát được.
      </p>

      <h2>6. Ủng hộ bằng chuyển khoản</h2>
      <p>
        Mã QR ủng hộ là mã chuyển khoản ngân hàng thông thường. Giao dịch diễn ra giữa bạn và
        ngân hàng; trang web không xử lý thanh toán, không nhận và không lưu bất kỳ thông tin
        thẻ hay tài khoản nào của bạn.
      </p>

      <h2>7. Quyền của bạn</h2>
      <p>
        Vì không có tài khoản và không có dữ liệu nào được lưu lại, thường sẽ không có gì để
        truy xuất hay xoá. Nếu bạn cho rằng chúng tôi đang giữ dữ liệu gì đó của bạn — chẳng hạn
        trong nhật ký máy chủ — hãy viết cho chúng tôi, kèm khoảng thời gian, và chúng tôi sẽ
        kiểm tra và xoá phần liên quan.
      </p>

      <h2>8. Trẻ em</h2>
      <p>
        Dịch vụ dành cho mọi người yêu nhạc và không thu thập thông tin cá nhân, nên không có
        phần dữ liệu riêng dành cho trẻ em. Nếu bạn là phụ huynh và có thắc mắc, hãy liên hệ.
      </p>

      <h2>9. Thay đổi chính sách</h2>
      <p>
        Khi cách xử lý dữ liệu thay đổi — ví dụ khi bật quảng cáo hoặc khi có đăng nhập — chúng
        tôi sẽ sửa trang này và đổi ngày cập nhật ở đầu trang.
      </p>

      <h2>10. Liên hệ</h2>
      <p>
        Mọi câu hỏi về quyền riêng tư, xin gửi về <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
    </LegalPage>
  )
}
