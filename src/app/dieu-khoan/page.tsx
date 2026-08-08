import { LegalPage } from '@/components/layout/LegalPage'
import { adsConfig } from '@/lib/ads.ts'

export const metadata = {
  title: 'Điều khoản sử dụng · Cảm âm Tiêu Dao',
  description: 'Điều kiện sử dụng công cụ dịch giản phổ sang cảm âm của Cảm âm Tiêu Dao.',
}

// The one section that matters more than the rest is 5, on copyright. This service reads sheet
// music, and most sheet music belongs to somebody. Saying so plainly protects the reader as
// much as us: a policy that quietly implies the output is free of rights would be misleading
// about the thing the user is most likely to get wrong.
export default function Page() {
  const contact = adsConfig().contact
  return (
    <LegalPage title="Điều khoản sử dụng" updated="08/08/2026">
      <p className="lede">
        Các điều khoản dưới đây điều chỉnh việc truy cập và sử dụng dịch vụ Cảm âm Tiêu Dao tại
        camamtieudao.com. Bằng việc sử dụng dịch vụ, bạn xác nhận đã đọc, hiểu và đồng ý chịu
        ràng buộc bởi các điều khoản này.
      </p>

      <h2>1. Đơn vị vận hành</h2>
      <p>
        <strong>Lê Sỹ Hậu</strong><br />
        Cá nhân phát triển phần mềm<br />
        237/3 đường Hoà Bình<br />
        Phường Phú Thạnh, Thành phố Hồ Chí Minh<br />
        Việt Nam<br />
        Email: <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      <p>
        Cảm âm Tiêu Dao là dự án cá nhân, không có pháp nhân doanh nghiệp đứng sau. Trong tài
        liệu này, «chúng tôi» được hiểu là cá nhân nêu trên.
      </p>

      <h2>2. Dịch vụ này là gì</h2>
      <p>
        Cảm âm Tiêu Dao nhận ảnh một bản giản phổ (简谱), đọc bằng máy và chuyển thành cảm âm cho
        sáo và tiêu. Dịch vụ <strong>miễn phí</strong> và không yêu cầu đăng ký.
      </p>

      <h2>3. Kết quả chỉ mang tính tham khảo</h2>
      <p>
        Bản nhạc được đọc bằng thị giác máy tính, sau đó được một mô hình ngôn ngữ ngắt câu lại
        cho dễ đọc. Cả hai bước đều có thể sai, và độ chính xác phụ thuộc rất nhiều vào chất
        lượng ảnh bạn tải lên.
      </p>
      <p>
        Hãy xem kết quả như một bản nháp giúp bạn đỡ mất công chép tay, <strong>không phải bản
        thay thế cho bản nhạc gốc</strong>. Trước khi tập hay biểu diễn, bạn nên đối chiếu lại
        với bản gốc.
      </p>

      <h2>4. Trách nhiệm khi tải ảnh lên</h2>
      <p>Bạn cam kết rằng mình có quyền tải lên bản nhạc đó. Vui lòng không tải lên:</p>
      <ul>
        <li>tài liệu mà bạn không có quyền sử dụng hoặc sao chép;</li>
        <li>nội dung không phải bản nhạc, đặc biệt là giấy tờ hay thông tin cá nhân của người
          khác;</li>
        <li>nội dung vi phạm pháp luật Việt Nam.</li>
      </ul>

      <h2>5. Bản quyền bản nhạc</h2>
      <p>
        Phần lớn bản nhạc đều thuộc quyền tác giả của ai đó. Cảm âm Tiêu Dao chỉ là công cụ
        chuyển ký hiệu: <strong>công cụ này không trao cho bạn bất kỳ quyền nào đối với bản nhạc
        gốc</strong>, và bản cảm âm tạo ra vẫn có thể là tác phẩm phái sinh chịu ràng buộc của
        quyền tác giả với bài hát đó.
      </p>
      <p>
        Nói cách khác: dùng để tự học và tự chơi thì thoải mái; muốn xuất bản, phân phối hay
        khai thác thương mại bản cảm âm, bạn cần tự xác định mình có quyền hay chưa. Chúng tôi
        không thẩm định điều đó thay bạn.
      </p>
      <p>
        Nếu bạn là chủ sở hữu quyền và cho rằng dịch vụ đang bị dùng sai, hãy liên hệ với chúng
        tôi. Lưu ý rằng chúng tôi không lưu trữ bản nhạc nào, nên thường sẽ không có nội dung
        nào để gỡ.
      </p>

      <h2>6. Ai sở hữu cái gì</h2>
      <p>
        Ảnh bạn tải lên vẫn là của bạn — chúng tôi không giữ lại và không đòi hỏi quyền gì với
        nó. Bản cảm âm mà máy tạo ra, chúng tôi cũng <strong>không nhận sở hữu</strong>; bạn cứ
        dùng, trong giới hạn quyền tác giả nói ở mục 5. Riêng tên gọi, logo, giao diện và mã
        nguồn của trang thì thuộc về Cảm âm Tiêu Dao.
      </p>

      <h2>7. Sử dụng hợp lý</h2>
      <p>
        Máy chủ nhỏ và dịch vụ miễn phí cho tất cả mọi người, nên có giới hạn số lần gửi trong
        mỗi phút. Vui lòng đừng dùng công cụ hay script để gửi hàng loạt, đừng cố vượt giới hạn,
        và đừng làm gì khiến người khác không dùng được. Chúng tôi có thể chặn truy cập gây hại
        cho dịch vụ.
      </p>

      <h2>8. Ủng hộ</h2>
      <p>
        Ủng hộ qua chuyển khoản là <strong>hoàn toàn tự nguyện</strong>. Đó là món quà giúp duy
        trì máy chủ, không phải khoản thanh toán để mua dịch vụ, và không mở thêm tính năng hay
        mức ưu tiên nào. Vì vậy, các khoản ủng hộ <strong>không hoàn lại</strong>. Giao dịch
        diễn ra trực tiếp với ngân hàng của bạn.
      </p>

      <h2>9. Quảng cáo</h2>
      <p>
        Trang có thể hiển thị quảng cáo để bù chi phí vận hành. Quảng cáo của bên thứ ba không
        phải là sự giới thiệu hay bảo đảm của chúng tôi đối với sản phẩm đó, và chúng tôi không
        chịu trách nhiệm về nội dung hay giao dịch phát sinh với nhà quảng cáo.
      </p>

      <h2>10. Dịch vụ được cung cấp «như hiện có»</h2>
      <p>
        Đây là một dự án cá nhân, miễn phí. Chúng tôi cố gắng giữ cho nó chạy tốt nhưng không
        cam kết dịch vụ luôn sẵn sàng, không lỗi hay luôn chính xác, và có thể thay đổi hoặc
        ngừng dịch vụ bất cứ lúc nào.
      </p>

      <h2>11. Giới hạn trách nhiệm</h2>
      <p>
        Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm với thiệt hại phát
        sinh từ việc sử dụng dịch vụ — bao gồm cả trường hợp bạn tập theo một kết quả có sai
        sót. Mục 3 nói rõ vì sao bạn nên đối chiếu với bản gốc.
      </p>

      <h2>12. Thay đổi điều khoản</h2>
      <p>
        Điều khoản có thể được cập nhật khi dịch vụ thay đổi. Ngày cập nhật luôn nằm ở đầu
        trang; tiếp tục sử dụng sau khi cập nhật nghĩa là bạn đồng ý với bản mới.
      </p>

      <h2>13. Luật áp dụng và liên hệ</h2>
      <p>
        Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi thắc mắc, xin gửi về{' '}
        <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
    </LegalPage>
  )
}
