# Zenzy API trong Postman

`zenzy.postman_collection.json` chứa **toàn bộ 85 API đang chạy trên server** (`https://zenzy.dpdns.org`), chia theo
thư mục (Auth, Account, Users, Friends, Events, Shops, Feed, Chat, Notifications, Reports, Admin…). Mỗi request có
sẵn body mẫu, đúng loại xác thực, và tự lưu token / id cho các request sau.

Chỉ cần **một file này**. Tài liệu chi tiết từng trường nằm ở [`../openapi.yaml`](../openapi.yaml) (Swagger).

## Cách dùng

1. Postman → **Import** → chọn `zenzy.postman_collection.json`.
2. Bấm vào tên collection → tab **Variables**, sửa:
   - `username`: một tên chưa ai dùng (3–30 ký tự: a–z, 0–9, `_`, `.`);
   - `email`: hộp thư bạn đọc được, vì mã xác minh gửi về đây;
   - `base_url`: để nguyên nếu thử trên server thật; đổi thành `http://127.0.0.1:3100` nếu chạy server trên máy (địa chỉ gốc ở `src/core/address.ts`).
3. Thư mục **Auth**:
   - gửi **Sign-up step 1** → server gửi mã 6 số về email;
   - dán mã vào biến `code` (tab Variables), gửi **Sign-up step 2** → tài khoản được tạo, token tự lưu.
4. Từ đây mọi request khác dùng token đó. Lần sau chỉ cần gửi **Sign in**.

Access token sống 15 phút. Khi request bắt đầu trả `401`, gửi **Exchange a refresh token** hoặc **Sign in** lại.

## Lưu ý

- **Thư mục cuối xoá tài khoản thử.** "Sign out and delete the test account" đăng xuất rồi xoá tài khoản; chỉ chạy khi
  đã thử xong.
- **Một số request cần người dùng thứ hai.** `GET /users` lưu người đầu tiên tìm thấy vào `other_user_id` (đặt
  `search_username` trước). Chấp nhận lời mời kết bạn, xin tham gia sự kiện, chat trực tiếp chỉ thành công khi có tài
  khoản thứ hai làm phía bên kia; phần mô tả của từng request ghi rõ.
- **Thư mục Admin** cần tài khoản ADMIN trong `admin_username` / `admin_password`. Sai mật khẩu 3 lần thì IP bị chặn
  khỏi khu vực admin 24 giờ.
- **Đăng nhập Google** cần một Google ID token thật trong `google_id_token`.
- **Server giới hạn tần suất** (trả `429` kèm `retry_after`), nên đừng chạy collection lặp liên tục trên server thật.
- Trên server chạy ở máy không có SMTP, server trả luôn mã trong `dev_code` và collection tự điền `code`.

## Cập nhật khi API đổi

File được sinh từ `docs/openapi.yaml`, đừng sửa tay:

```bash
npm run docs:postman
```

`npm test` kiểm tra file này khớp với server (test `postman.e2e-spec.ts` chạy cả collection từ trên xuống dưới), nên
đổi API mà quên chạy lệnh trên thì test báo lỗi.
