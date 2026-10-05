# Thiết lập Zalo OA

Hướng dẫn cho người triển khai: nối ứng dụng với một Zalo Official Account thật để gửi nhắc việc tới Zalo của từng thành viên. Làm một lần; sau đó mọi thứ thao tác trong **Cài đặt → Thông báo → Zalo OA**.

## Cần có trước

- Một Zalo Official Account (bạn là quản trị viên).
- Một ứng dụng trên [developers.zalo.me](https://developers.zalo.me) đã liên kết với OA đó.
- Ứng dụng đã deploy lên một domain HTTPS công khai (ví dụ `https://todolist-indol-phi.vercel.app`).
- Migration `zalo_oa` đã được đẩy lên database (`npm run db:push`).

## Bước 1 — Biến môi trường trên máy chủ (Vercel)

Tất cả đều là biến phía server. **Không** thêm tiền tố `NEXT_PUBLIC_`.

| Biến | Lấy ở đâu |
| --- | --- |
| `ZALO_APP_ID` | developers.zalo.me → ứng dụng → Cài đặt → ID ứng dụng |
| `ZALO_APP_SECRET` | Cùng trang → Khoá bí mật của ứng dụng |
| `ZALO_OA_SECRET_KEY` | Ứng dụng → Webhook → OA Secret Key |
| `APP_URL` | Địa chỉ công khai của ứng dụng, không có `/` ở cuối |
| `CRON_SECRET` | Tự tạo, tối thiểu 16 ký tự: `openssl rand -hex 32` |
| `ZALO_SITE_VERIFICATION` | Chỉ khi Zalo yêu cầu xác thực domain bằng thẻ meta: điền phần `content` của thẻ |

**Xác thực domain:** Zalo đọc thẻ meta trên trang chủ. Khi có `ZALO_SITE_VERIFICATION`, thẻ nằm trong `<head>` của mọi trang; trang chủ `/` trả thẳng màn hình đăng nhập (HTTP 200, không chuyển hướng) cho khách chưa đăng nhập để Zalo đọc được. Kiểm tra bằng cách mở `APP_URL` trong cửa sổ ẩn danh → Xem nguồn trang → tìm `zalo-platform-site-verification`, rồi bấm **Xác thực** ở Zalo.

Deploy lại sau khi thêm biến. Vào **Cài đặt → Thông báo → Zalo OA**: dòng "Cấu hình máy chủ" phải báo đủ; nếu thiếu, trang sẽ liệt kê tên biến còn thiếu.

## Bước 2 — Khai báo ở Zalo for Developers

Trang Zalo OA trong ứng dụng có mục "Giá trị cần khai báo ở Zalo for Developers" với nút sao chép cho hai địa chỉ:

1. **Official Account Callback URL** → dán vào ứng dụng Zalo, mục Official Account → Thiết lập chung.
2. **Webhook URL** → dán vào mục Webhook. Zalo yêu cầu domain đã được xác thực trước khi nhận địa chỉ này (xem `ZALO_SITE_VERIFICATION` ở trên).
3. Ở mục Webhook, bật sự kiện **Người dùng gửi tin nhắn văn bản** (`user_send_text`).

## Bước 3 — Kết nối và bật

1. Bấm **Kết nối Zalo OA**, đăng nhập Zalo và cấp quyền cho ứng dụng.
2. Quay lại, trang hiện tên OA và ba dấu xanh (cấu hình, OA, tự động gửi).
3. Bật công tắc **Gửi thông báo qua Zalo**.

## Bước 4 — Từng thành viên tự liên kết

Mỗi người vào **Tài khoản → Zalo → Kết nối Zalo**, nhận một mã 8 ký tự (hiệu lực 15 phút), rồi:

1. Mở Zalo, **Quan tâm** OA của team.
2. Gửi mã đó cho OA.

OA trả lời xác nhận và màn hình Tài khoản tự chuyển sang "Đã kết nối".

## Bước 5 — Gửi tin thử

Ở trang Zalo OA, chọn một thành viên đã liên kết và bấm **Gửi tin thử**. Tin phải tới đúng Zalo của người đó và xuất hiện trong "Lịch sử gửi".

## Cần biết

- **Giới hạn của Zalo (cần xác nhận lại với chính sách hiện hành của Zalo):** ứng dụng gửi bằng loại "tin tư vấn". Theo hiểu biết của người viết, Zalo chỉ cho gửi loại này tới người đã quan tâm OA và có tương tác với OA trong thời gian gần đây; người lâu không nhắn cho OA sẽ bị Zalo từ chối. Khi đó nhật ký ghi rõ lý do và mã lỗi của Zalo, và thông báo vẫn hiện trong ứng dụng. Nhắn một tin bất kỳ cho OA sẽ mở lại quyền nhận.
- **Kiểm tra chữ ký webhook lần đầu:** ứng dụng xác thực mọi webhook theo công thức `sha256(appId + nội dung + timestamp + OA Secret Key)`. Công thức này chưa được thử với Zalo thật. Nếu thành viên gửi mã mà không liên kết được, hãy xem log máy chủ: dòng `zalo.webhook.rejected` với `reason: "signature"` nghĩa là chữ ký không khớp (sai `ZALO_OA_SECRET_KEY`, hoặc Zalo đã đổi cách ký).
- **Token tự gia hạn.** Access token có thời hạn ngắn và được làm mới tự động mỗi khi cần. Refresh token cũng có thời hạn do Zalo đặt; nếu nó hết hạn (ví dụ sau thời gian dài không gửi gì), trang Zalo OA sẽ báo lỗi kết nối: bấm **Kết nối lại**.
- **Tắt tạm thời:** gạt công tắc. Thông báo vẫn hiện trong ứng dụng; không có tin nào được dồn lại để gửi bù khi bật lại.
- **Ngắt kết nối** xoá token của OA và tắt kênh. Liên kết của từng thành viên được giữ lại cho lần kết nối sau.

## Thử ở máy local (không cần OA thật)

`scripts/mock-zalo.mjs` là một Zalo giả. `npm run test:zalo` chạy toàn bộ luồng với nó; phần đầu file `scripts/test-zalo.mjs` ghi rõ các biến môi trường cần đặt khi chạy ứng dụng.
